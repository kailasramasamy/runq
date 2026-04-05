import nodemailer from 'nodemailer';
import type { TenantSettings } from '@runq/types';

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(params: EmailParams): Promise<boolean>;
}

class SmtpProvider implements EmailProvider {
  private from: string;
  private transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(cfg: NonNullable<TenantSettings['emailConfig']>) {
    this.transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort || 587,
      secure: cfg.smtpSecure ?? false,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
    });
    this.from = `${cfg.fromName || 'runQ'} <${cfg.fromEmail || 'noreply@example.com'}>`;
  }

  async send(params: EmailParams): Promise<boolean> {
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return true;
  }
}

class ResendProvider implements EmailProvider {
  private apiKey: string;
  private from: string;

  constructor(cfg: NonNullable<TenantSettings['emailConfig']>) {
    this.apiKey = cfg.apiKey!;
    this.from = `${cfg.fromName || 'runQ'} <${cfg.fromEmail || 'noreply@example.com'}>`;
  }

  async send(params: EmailParams): Promise<boolean> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [params.to], subject: params.subject, html: params.html, text: params.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
    return true;
  }
}

class SendGridProvider implements EmailProvider {
  private apiKey: string;
  private from: { email: string; name: string };

  constructor(cfg: NonNullable<TenantSettings['emailConfig']>) {
    this.apiKey = cfg.apiKey!;
    this.from = { email: cfg.fromEmail || 'noreply@example.com', name: cfg.fromName || 'runQ' };
  }

  async send(params: EmailParams): Promise<boolean> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: this.from,
        subject: params.subject,
        content: [
          { type: 'text/html', value: params.html },
          ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SendGrid API error ${res.status}: ${body}`);
    }
    return true;
  }
}

export function createEmailProvider(settings: TenantSettings): EmailProvider | null {
  if (!settings.emailProvider || !settings.emailConfig) return null;
  switch (settings.emailProvider) {
    case 'smtp': return new SmtpProvider(settings.emailConfig);
    case 'resend': return new ResendProvider(settings.emailConfig);
    case 'sendgrid': return new SendGridProvider(settings.emailConfig);
    default: return null;
  }
}
