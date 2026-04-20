import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ChatDrawer } from './chat-drawer';
import { useAgentChat } from '@/hooks/use-agent-chat';

export function FinanceAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isStreaming, sendMessage, clearChat, stopStreaming } = useAgentChat();

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-indigo-700 active:scale-95 md:bottom-6 md:right-6"
          aria-label="Open Finance Agent"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {/* Chat Drawer */}
      <ChatDrawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        messages={messages}
        isStreaming={isStreaming}
        onSend={sendMessage}
        onStop={stopStreaming}
        onClear={clearChat}
      />
    </>
  );
}
