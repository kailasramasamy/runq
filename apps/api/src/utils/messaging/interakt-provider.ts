import type { MessageProvider, SendWhatsAppParams, SendSmsParams, MessageResult } from './messaging.interface';

const DEFAULT_URL = 'https://api.interakt.ai/v1';

// WhatsApp template sender for Interakt (api.interakt.ai). Template body params
// are positional — `templateParams` is sent as `bodyValues` in insertion order,
// so callers must build the object in template-variable order ({{1}}, {{2}}…).
export class InteraktProvider implements MessageProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.INTERAKT_API_KEY ?? '';
    this.baseUrl = (process.env.INTERAKT_API_URL ?? DEFAULT_URL).replace(/\/+$/, '');
  }

  async sendWhatsApp(params: SendWhatsAppParams): Promise<MessageResult> {
    if (!this.apiKey) return { success: false, error: 'Interakt not configured' };

    const payload = {
      countryCode: '+91',
      phoneNumber: this.normalizePhone(params.to),
      callbackData: params.templateName,
      type: 'Template',
      template: {
        name: params.templateName,
        languageCode: 'en',
        headerValues: [],
        bodyValues: Object.values(params.templateParams),
        buttonValues: {},
      },
    };

    const response = await fetch(`${this.baseUrl}/public/message/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const json = await response.json() as { result?: boolean; id?: string; message?: string };
    if (!response.ok || json.result === false) {
      return { success: false, error: json.message ?? `Interakt HTTP ${response.status}` };
    }
    return { success: true, messageId: json.id };
  }

  // Interakt is used for WhatsApp only in this integration.
  async sendSms(_params: SendSmsParams): Promise<MessageResult> {
    return { success: false, error: 'SMS not supported by Interakt provider' };
  }

  // → bare 10-digit national number; Interakt takes the country code separately.
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits.slice(-10);
  }
}
