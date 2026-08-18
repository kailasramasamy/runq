import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailAttachment } from './email-provider';

let transporter: Transporter | null = null;
let useResend = false;

export function initEmailTransport(): void {
  if (process.env.RESEND_API_KEY) {
    useResend = true;
    console.log('Email: Resend HTTP API configured');
    return;
  }

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log('Email: not configured, emails will be logged only');
    return;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log(`Email: SMTP configured (${host}:${process.env.SMTP_PORT})`);
}

async function sendViaResend(params: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  from: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
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
      console.error(`Resend send failed: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send failed:', err);
    return false;
  }
}

/** Splits a stored "a@x.com, b@y.com" field into individual addresses. */
export function parseEmails(csv: string | null | undefined): string[] {
  return (csv ?? '').split(',').map((e) => e.trim()).filter(Boolean);
}

export async function sendEmail(params: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  fromName?: string;
  /** Override the From address (otherwise uses MAIL_FROM). */
  fromAddress?: string;
}): Promise<boolean> {
  const senderName = params.fromName || process.env.SMTP_FROM_NAME || 'runQ';
  const fromAddr = params.fromAddress || process.env.MAIL_FROM || 'noreply@runq.in';
  const from = `${senderName} <${fromAddr}>`;

  if (useResend) {
    return sendViaResend({ ...params, from });
  }

  if (!transporter) {
    if (process.env.EMAIL_DEBUG === 'true') {
      console.log(`[EMAIL DEBUG] To: ${params.to} | Subject: ${params.subject}`);
      console.log(`[EMAIL DEBUG] Body: ${params.text || params.html.slice(0, 200)}`);
    }
    return false;
  }

  try {
    await transporter.sendMail({
      from,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments,
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
}
