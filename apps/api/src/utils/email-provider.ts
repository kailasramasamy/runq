import nodemailer from 'nodemailer';
import type { TenantSettings } from '@runq/types';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailParams {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
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
      // Without these, a blocked SMTP port (Railway blocks 25/465/587 below the
      // Pro plan) leaves the connection hanging forever instead of erroring.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    this.from = `${cfg.fromName || 'runQ'} <${cfg.fromEmail || 'noreply@example.com'}>`;
  }

  async send(params: EmailParams): Promise<boolean> {
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
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
      body: JSON.stringify({
        from: this.from,
        to: [params.to],
        ...(params.cc?.length ? { cc: params.cc } : {}),
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.attachments?.length
          ? {
              attachments: params.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
              })),
            }
          : {}),
      }),
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
        personalizations: [{
          to: [{ email: params.to }],
          ...(params.cc?.length ? { cc: params.cc.map((email) => ({ email })) } : {}),
        }],
        from: this.from,
        subject: params.subject,
        content: [
          { type: 'text/html', value: params.html },
          ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
        ],
        ...(params.attachments?.length
          ? {
              attachments: params.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
                type: a.contentType ?? 'application/octet-stream',
                disposition: 'attachment',
              })),
            }
          : {}),
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
