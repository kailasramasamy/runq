import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

export function initEmailTransport(): void {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log('Email: SMTP not configured, emails will be logged only');
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

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
}): Promise<boolean> {
  const senderName = params.fromName || process.env.SMTP_FROM_NAME || 'runQ';
  const from = `${senderName} <${process.env.MAIL_FROM || 'noreply@example.com'}>`;

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
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
}
