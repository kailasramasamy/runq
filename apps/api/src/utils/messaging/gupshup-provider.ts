import type { MessageProvider, SendWhatsAppParams, SendSmsParams, MessageResult } from './messaging.interface';

const GUPSHUP_WA_URL = 'https://api.gupshup.io/wa/api/v1/template/msg';
const GUPSHUP_SMS_URL = 'https://enterprise.smsgupshup.com/GatewayAPI/rest';

export class GupshupProvider implements MessageProvider {
  private readonly apiKey: string;
  private readonly appName: string;
  private readonly sourceNumber: string;

  constructor() {
    this.apiKey = process.env.GUPSHUP_API_KEY ?? '';
    this.appName = process.env.GUPSHUP_APP_NAME ?? '';
    this.sourceNumber = process.env.GUPSHUP_SOURCE_NUMBER ?? '';
  }

  async sendWhatsApp(params: SendWhatsAppParams): Promise<MessageResult> {
    if (!this.apiKey || !this.appName) {
      return { success: false, error: 'Gupshup WhatsApp not configured' };
    }

    const body = new URLSearchParams({
      channel: 'whatsapp',
      source: this.sourceNumber,
      destination: this.normalizePhone(params.to),
      'src.name': this.appName,
      template: JSON.stringify({
        id: params.templateName,
        params: Object.values(params.templateParams),
      }),
    });

    if (params.mediaUrl) {
      body.set('message', JSON.stringify({
        type: 'document',
        url: params.mediaUrl,
        filename: 'invoice.pdf',
      }));
    }

    const response = await fetch(GUPSHUP_WA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': this.apiKey,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const json = await response.json() as { status: string; messageId?: string; message?: string };

    if (json.status === 'submitted') {
      return { success: true, messageId: json.messageId };
    }
    return { success: false, error: json.message ?? 'WhatsApp send failed' };
  }

  async sendSms(params: SendSmsParams): Promise<MessageResult> {
    if (!this.apiKey) {
      return { success: false, error: 'Gupshup SMS not configured' };
    }

    const url = new URL(GUPSHUP_SMS_URL);
    url.searchParams.set('method', 'SendMessage');
    url.searchParams.set('send_to', this.normalizePhone(params.to));
    url.searchParams.set('msg', params.message);
    url.searchParams.set('msg_type', 'TEXT');
    url.searchParams.set('userid', this.appName);
    url.searchParams.set('auth_scheme', 'plain');
    url.searchParams.set('password', this.apiKey);
    url.searchParams.set('v', '1.1');
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    const json = await response.json() as { response: { status: string; id?: string } };

    if (json.response?.status === 'success') {
      return { success: true, messageId: json.response.id };
    }
    return { success: false, error: 'SMS send failed' };
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) return digits;
    if (digits.length === 10) return `91${digits}`;
    return digits;
  }
}
