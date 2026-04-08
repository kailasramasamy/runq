import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { sendEmail } from '../../utils/email';

const OTP_TTL = 300; // 5 minutes
const OTP_RATE_KEY = (email: string) => `otp:rate:${email}`;
const OTP_CODE_KEY = (email: string) => `otp:code:${email}`;
const OTP_VERIFIED_KEY = (email: string) => `otp:verified:${email}`;
const MAX_SENDS_PER_HOUR = 3;

const sendOtpSchema = z.object({
  email: z.string().email().max(255),
});

const verifyOtpSchema = z.object({
  email: z.string().email().max(255),
  code: z.string().length(6),
});

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function otpEmailHtml(code: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#18181b;margin:0 0 8px">Verify your email</h2>
      <p style="color:#71717a;margin:0 0 24px">Enter this code to continue setting up your runQ account:</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#18181b;font-family:monospace">${code}</span>
      </div>
      <p style="color:#a1a1aa;font-size:13px;margin:0">This code expires in 5 minutes. If you didn't request this, ignore this email.</p>
    </div>
  `;
}

export const otpRoutes: FastifyPluginAsync = async (app) => {
  app.post('/send-otp', async (request, reply) => {
    const { email } = sendOtpSchema.parse(request.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 3 per email per hour
    const rateKey = OTP_RATE_KEY(normalizedEmail);
    const sendCount = await app.redis.incr(rateKey);
    if (sendCount === 1) await app.redis.expire(rateKey, 3600);
    if (sendCount > MAX_SENDS_PER_HOUR) {
      return reply.status(429).send({ message: 'Too many OTP requests. Try again in an hour.' });
    }

    const code = generateOtp();
    await app.redis.set(OTP_CODE_KEY(normalizedEmail), code, 'EX', OTP_TTL);

    const sent = await sendEmail({
      to: normalizedEmail,
      subject: `${code} — your runQ verification code`,
      html: otpEmailHtml(code),
      text: `Your runQ verification code is: ${code}\n\nThis code expires in 5 minutes.`,
      fromName: 'runQ',
    });

    if (!sent) {
      app.log.warn({ email: normalizedEmail }, 'OTP email not sent (SMTP not configured)');
    }

    return { ok: true };
  });

  app.post('/verify-otp', async (request, reply) => {
    const { email, code } = verifyOtpSchema.parse(request.body);
    const normalizedEmail = email.toLowerCase().trim();

    const stored = await app.redis.get(OTP_CODE_KEY(normalizedEmail));
    if (!stored || stored !== code) {
      return reply.status(400).send({ message: 'Invalid or expired code' });
    }

    // Mark email as verified (valid for 30 minutes — enough to complete onboarding)
    await app.redis.set(OTP_VERIFIED_KEY(normalizedEmail), '1', 'EX', 1800);
    await app.redis.del(OTP_CODE_KEY(normalizedEmail));

    return { ok: true, verified: true };
  });
};
