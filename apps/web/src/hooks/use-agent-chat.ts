import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { postSSE } from '@/lib/sse-client';

const STORAGE_KEY = 'runq-agent-chat';

export interface ToolCall {
  name: string;
  status: 'running' | 'done';
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  followUps?: string[];
}

/** Extract "follow_up: A | B | C" from the end of content, return cleaned content + suggestions */
function extractFollowUps(content: string): { cleaned: string; followUps: string[] } {
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(/^follow_up:\s*(.+)$/i);
    if (match) {
      const followUps = match[1].split('|').map((s) => s.trim()).filter(Boolean);
      const cleaned = lines.slice(0, i).join('\n').trimEnd();
      return { cleaned, followUps };
    }
    break; // only check the last non-empty line
  }
  return { cleaned: content, followUps: [] };
}

interface AgentStreamEvent {
  type: 'text_delta' | 'tool_use_start' | 'tool_result' | 'done' | 'error';
  text?: string;
  toolName?: string;
  summary?: string;
  message?: string;
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // Strip any stale streaming state
    return parsed.map((m) => ({ ...m, isStreaming: false }));
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    // Only save completed messages (not mid-stream)
    const toSave = messages.filter((m) => !m.isStreaming);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [isStreaming, setIsStreaming] = useState(false);
  const { token } = useAuth();
  const abortRef = useRef<AbortController | null>(null);

  // Persist to localStorage whenever messages change (and not streaming)
  useEffect(() => {
    if (!isStreaming) saveHistory(messages);
  }, [messages, isStreaming]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!token || isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        isStreaming: true,
        toolCalls: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Build messages array for API (simple role + content pairs)
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of postSSE<AgentStreamEvent>(
          '/api/v1/agent/chat',
          { messages: apiMessages },
          token,
          controller.signal,
        )) {
          if (event.type === 'text_delta' && event.text) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + event.text };
              }
              return updated;
            });
          } else if (event.type === 'tool_use_start' && event.toolName) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                const toolCalls = [...(last.toolCalls ?? []), { name: event.toolName!, status: 'running' as const }];
                updated[updated.length - 1] = { ...last, toolCalls };
              }
              return updated;
            });
          } else if (event.type === 'tool_result' && event.toolName) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant' && last.toolCalls) {
                const toolCalls = last.toolCalls.map((tc) =>
                  tc.name === event.toolName && tc.status === 'running'
                    ? { ...tc, status: 'done' as const, summary: event.summary }
                    : tc,
                );
                updated[updated.length - 1] = { ...last, toolCalls };
              }
              return updated;
            });
          } else if (event.type === 'error' && event.message) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  content: event.message ?? 'Something went wrong.',
                  isStreaming: false,
                };
              }
              return updated;
            });
          } else if (event.type === 'done') {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                const { cleaned, followUps } = extractFollowUps(last.content);
                updated[updated.length - 1] = { ...last, content: cleaned, isStreaming: false, followUps };
              }
              return updated;
            });
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: 'Sorry, something went wrong. Please try again.',
                isStreaming: false,
              };
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [token, isStreaming, messages],
  );

  const clearChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = { ...last, isStreaming: false };
      }
      return updated;
    });
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, sendMessage, clearChat, stopStreaming };
}
