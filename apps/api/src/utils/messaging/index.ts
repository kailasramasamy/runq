import type { MessageProvider } from './messaging.interface';
import { GupshupProvider } from './gupshup-provider';

let provider: MessageProvider | null = null;

export function getMessageProvider(): MessageProvider | null {
  if (provider) return provider;

  const whatsappProvider = process.env.WHATSAPP_PROVIDER;

  if (whatsappProvider === 'gupshup') {
    provider = new GupshupProvider();
    return provider;
  }

  return null;
}

export type { MessageProvider, SendWhatsAppParams, MessageResult } from './messaging.interface';
