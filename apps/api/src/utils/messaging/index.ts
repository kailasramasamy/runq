import type { MessageProvider } from './messaging.interface';
import { GupshupProvider } from './gupshup-provider';
import { InteraktProvider } from './interakt-provider';

let provider: MessageProvider | null = null;
let interakt: MessageProvider | null = null;

export function getMessageProvider(): MessageProvider | null {
  if (provider) return provider;

  const whatsappProvider = process.env.WHATSAPP_PROVIDER;

  if (whatsappProvider === 'gupshup') {
    provider = new GupshupProvider();
    return provider;
  }

  return null;
}

// WhatsApp via Interakt — used for Dhenu farmer notifications. Kept separate
// from getMessageProvider()/WHATSAPP_PROVIDER so enabling it never reroutes the
// existing Gupshup invoice flow. Enabled purely by INTERAKT_API_KEY presence.
export function getInteraktProvider(): MessageProvider | null {
  if (interakt) return interakt;
  if (!process.env.INTERAKT_API_KEY) return null;
  interakt = new InteraktProvider();
  return interakt;
}

export type { MessageProvider, SendWhatsAppParams, MessageResult } from './messaging.interface';
