/**
 * WebSocket-backed realtime updates for support conversations. Replaces
 * polling — opens a WS for the active conversation, refetches the cache on
 * every push, auto-reconnects with exponential backoff.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const TOKEN_KEY = 'runq-token';

function buildWsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

/**
 * Subscribe to per-conversation push events. While the conversation is
 * mounted, the user/conversation cache is refetched on every server push.
 */
export function useSupportRealtime(conversationId: string | null) {
  const qc = useQueryClient();
  const reconnectAttemptsRef = useRef(0);
  const closedByCallerRef = useRef(false);

  useEffect(() => {
    if (!conversationId) return;
    closedByCallerRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const url = buildWsUrl(
        `/api/v1/support/ws?conversationId=${encodeURIComponent(conversationId!)}&token=${encodeURIComponent(token)}`,
      );
      socket = new WebSocket(url);

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message_added' || data.type === 'status_changed') {
            qc.invalidateQueries({ queryKey: ['support', 'conversation', conversationId] });
            qc.invalidateQueries({ queryKey: ['support', 'conversations'] });
          }
        } catch {
          /* ignore malformed */
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
  }, [conversationId, qc]);
}

/**
 * Admin firehose — refetches inbox + active conversation when ANY support
 * activity occurs across all tenants.
 */
export function useAdminSupportRealtime(activeConversationId: string | null) {
  const qc = useQueryClient();
  const reconnectAttemptsRef = useRef(0);
  const closedByCallerRef = useRef(false);

  useEffect(() => {
    closedByCallerRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const url = buildWsUrl(`/api/v1/support/ws/admin?token=${encodeURIComponent(token)}`);
      socket = new WebSocket(url);

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message_added' || data.type === 'status_changed') {
            qc.invalidateQueries({ queryKey: ['support', 'admin', 'inbox'] });
            qc.invalidateQueries({ queryKey: ['support', 'admin', 'stats'] });
            if (data.conversationId) {
              qc.invalidateQueries({
                queryKey: ['support', 'admin', 'conversation', data.conversationId],
              });
            }
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
    // We don't include activeConversationId — the admin subscribes to all events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  // Reference activeConversationId so it shows in deps if you ever want
  // per-conversation logic; currently the firehose handles everything.
  void activeConversationId;
}
