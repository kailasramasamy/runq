import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { loadEnv } from '../../config/env';
import { sendOtpSms } from '../messaging/msg91';
import { UnauthorizedError, TooManyRequestsError, BadGatewayError } from '../errors';

// Redis-backed phone OTP, shared by every phone-login flow (Dhenu, HR). The
// code is generated, stored and verified here; MSG91 is only the SMS channel.
// Callers pass a `namespace` so each flow keeps its own Redis keys and never
// shares OTP state with another (e.g. 'mp' for Dhenu, 'hr' for the runq app).

const OTP_TTL = 300; // code lives 5 minutes
const RATE_TTL = 3600; // send window: 1 hour
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

export interface PhoneOtpOptions {
  // Redis key namespace, e.g. 'mp' or 'hr'. Keeps flows isolated.
  namespace: string;
  // Short human label for the dev log line ("<label> OTP generated").
  label?: string;
}

const codeKey = (ns: string, phone: string) => `${ns}:otp:code:${phone}`;
const rateKey = (ns: string, phone: string) => `${ns}:otp:rate:${phone}`;
const attemptsKey = (ns: string, phone: string) => `${ns}:otp:attempts:${phone}`;

// Generate, store and SMS a fresh OTP. Returns the code only in non-production
// (so headless provisioning/e2e scripts can complete the flow without SMS);
// production always returns null.
export async function sendPhoneOtp(
  app: FastifyInstance,
  phone: string,
  { namespace, label = 'phone' }: PhoneOtpOptions,
): Promise<string | null> {
  const rk = rateKey(namespace, phone);
  const sends = await app.redis.incr(rk);
  if (sends === 1) await app.redis.expire(rk, RATE_TTL);
  if (sends > MAX_SENDS_PER_HOUR) {
    // This blocked attempt must not inflate the window beyond the cap.
    await app.redis.decr(rk);
    throw new TooManyRequestsError('Too many OTP requests. Try again in an hour.');
  }

  const code = String(crypto.randomInt(100000, 999999));
  await app.redis.set(codeKey(namespace, phone), code, 'EX', OTP_TTL);
  await app.redis.del(attemptsKey(namespace, phone));

  const result = await sendOtpSms(phone, code);
  const isProd = loadEnv().NODE_ENV === 'production';
  if (!result.success) {
    // The SMS never left MSG91, so refund this send: a delivery failure or
    // missing config must not consume the user's hourly budget — otherwise a
    // user who never receives a code retries and locks themselves out for an hour.
    await app.redis.decr(rk);
    if (result.skipped) {
      app.log.warn({ phone }, 'MSG91 not configured — OTP not sent over SMS');
    } else {
      app.log.error({ phone, error: result.error }, 'MSG91 OTP send failed');
      // Only fatal in production — dev returns the code below so testing (incl.
      // e2e against fake numbers MSG91 rejects) still works.
      if (isProd) throw new BadGatewayError("Couldn't send the OTP. Please try again.");
    }
  }

  if (!isProd) {
    app.log.info({ phone, code }, `[dev] ${label} OTP generated`);
    return code;
  }
  return null;
}

// Verify a submitted code, enforcing the attempt cap. Consumes the code on
// success. Throws UnauthorizedError on any mismatch/expiry.
export async function verifyPhoneOtp(
  app: FastifyInstance,
  phone: string,
  code: string,
  { namespace }: PhoneOtpOptions,
): Promise<void> {
  const ak = attemptsKey(namespace, phone);
  const attempts = await app.redis.incr(ak);
  if (attempts === 1) await app.redis.expire(ak, OTP_TTL);
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    throw new UnauthorizedError('Too many attempts — request a new code');
  }

  const stored = await app.redis.get(codeKey(namespace, phone));
  if (!stored || stored !== code) {
    throw new UnauthorizedError('Invalid or expired code');
  }

  await app.redis.del(codeKey(namespace, phone));
  await app.redis.del(ak);
}
