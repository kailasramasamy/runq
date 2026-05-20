/**
 * WebSocket-backed realtime updates for HR helpdesk tickets. Opens a WS for
 * the active ticket, refetches the cache on every server push, auto-reconnects
 * with exponential backoff.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const TOKEN_KEY = 'runq-token';

function buildWsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export function useHrHelpdeskRealtime(ticketId: string | null) {
  const qc = useQueryClient();
  const reconnectAttemptsRef = useRef(0);
  const closedByCallerRef = useRef(false);

  useEffect(() => {
    if (!ticketId) return;
    closedByCallerRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const url = buildWsUrl(
        `/api/v1/hr/helpdesk/ws?ticketId=${encodeURIComponent(ticketId!)}&token=${encodeURIComponent(token)}`,
      );
      socket = new WebSocket(url);

      socket.onopen = () => { reconnectAttemptsRef.current = 0; };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'comment_added' || data.type === 'status_changed') {
            qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
            qc.invalidateQueries({ queryKey: ['tickets'] });
          }
        } catch {
          /* ignore */
        }
      };

      socket.onclose = () => {
        if (closedByCallerRef.current) return;
        const attempt = Math.min(reconnectAttemptsRef.current, 6);
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        reconnectAttemptsRef.current = attempt + 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        try { socket?.close(); } catch {/* ignore */}
      };
    }

    connect();

    return () => {
      closedByCallerRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { socket?.close(); } catch {/* ignore */}
    };
  }, [ticketId, qc]);
}
