import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { loadEnv } from '../../config/env';
import { sendOtpSms } from '../../utils/messaging/msg91';
import { UnauthorizedError, TooManyRequestsError, BadGatewayError } from '../../utils/errors';

// Redis-backed phone OTP for Dhenu login (replaces the old DOB secret code).
// Mirrors the email-OTP flow in public/otp.routes.ts: short-lived code, a
// per-phone send rate limit, and a per-code verify-attempt cap.

const OTP_TTL = 300; // code lives 5 minutes
const RATE_TTL = 3600; // send window: 1 hour
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const codeKey = (phone: string) => `mp:otp:code:${phone}`;
const rateKey = (phone: string) => `mp:otp:rate:${phone}`;
const attemptsKey = (phone: string) => `mp:otp:attempts:${phone}`;

// Generate, store and SMS a fresh OTP. Returns the code only in non-production
// (so headless provisioning/e2e scripts can complete the flow without SMS);
// production always returns null. The App/Play review demo account bypasses
// this entirely — it signs in with its seeded DOB code (see mp-auth.routes.ts).
export async function sendMpOtp(app: FastifyInstance, phone: string): Promise<string | null> {
  const rk = rateKey(phone);
  const sends = await app.redis.incr(rk);
  if (sends === 1) await app.redis.expire(rk, RATE_TTL);
  if (sends > MAX_SENDS_PER_HOUR) {
    throw new TooManyRequestsError('Too many OTP requests. Try again in an hour.');
  }

  const code = String(crypto.randomInt(100000, 999999));
  await app.redis.set(codeKey(phone), code, 'EX', OTP_TTL);
  await app.redis.del(attemptsKey(phone));

  const result = await sendOtpSms(phone, code);
  const isProd = loadEnv().NODE_ENV === 'production';
  if (result.skipped) {
    app.log.warn({ phone }, 'MSG91 not configured — OTP not sent over SMS');
  } else if (!result.success) {
    app.log.error({ phone, error: result.error }, 'MSG91 OTP send failed');
    // Only fatal in production — dev returns the code below so testing (incl.
    // e2e against fake numbers MSG91 rejects) still works.
    if (isProd) throw new BadGatewayError("Couldn't send the OTP. Please try again.");
  }

  if (!isProd) {
    app.log.info({ phone, code }, '[dev] Dhenu OTP generated');
    return code;
  }
  return null;
}

// Verify a submitted code, enforcing the attempt cap. Consumes the code on
// success. Throws UnauthorizedError on any mismatch/expiry.
export async function verifyMpOtp(app: FastifyInstance, phone: string, code: string): Promise<void> {
  const ak = attemptsKey(phone);
  const attempts = await app.redis.incr(ak);
  if (attempts === 1) await app.redis.expire(ak, OTP_TTL);
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    throw new UnauthorizedError('Too many attempts — request a new code');
  }

  const stored = await app.redis.get(codeKey(phone));
  if (!stored || stored !== code) {
    throw new UnauthorizedError('Invalid or expired code');
  }

  await app.redis.del(codeKey(phone));
  await app.redis.del(ak);
}
