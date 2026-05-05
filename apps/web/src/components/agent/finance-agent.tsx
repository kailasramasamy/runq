import { useEffect, useState } from 'react';
import { ChatDrawer } from './chat-drawer';
import { useAgentChat } from '@/hooks/use-agent-chat';

export function FinanceAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isStreaming, sendMessage, clearChat, stopStreaming } = useAgentChat();

  // Opened via the topbar "Ask runQ" menu (or any other code dispatching this event)
  useEffect(() => {
    function onOpen() { setIsOpen(true); }
    window.addEventListener('runq:open-finance-agent', onOpen);
    return () => window.removeEventListener('runq:open-finance-agent', onOpen);
  }, []);

  return (
    <ChatDrawer
      open={isOpen}
      onClose={() => setIsOpen(false)}
      messages={messages}
      isStreaming={isStreaming}
      onSend={sendMessage}
      onStop={stopStreaming}
      onClear={clearChat}
    />
  );
}
