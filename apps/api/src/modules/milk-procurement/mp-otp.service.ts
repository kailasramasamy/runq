import type { FastifyInstance } from 'fastify';
import { sendPhoneOtp, verifyPhoneOtp } from '../../utils/otp/phone-otp.service';

// Dhenu phone OTP. Thin wrapper over the shared, namespace-keyed OTP service
// (Redis store + MSG91 SMS) — the 'mp' namespace preserves the original
// `mp:otp:*` Redis keys and behaviour. See utils/otp/phone-otp.service.ts.

const MP_OTP = { namespace: 'mp', label: 'Dhenu' } as const;

// Generate, store and SMS a fresh OTP. Returns the code in non-production (so
// headless provisioning/e2e scripts complete without SMS); null in production.
export function sendMpOtp(app: FastifyInstance, phone: string): Promise<string | null> {
  return sendPhoneOtp(app, phone, MP_OTP);
}

// Verify a submitted code, consuming it on success. Throws on mismatch/expiry.
export function verifyMpOtp(app: FastifyInstance, phone: string, code: string): Promise<void> {
  return verifyPhoneOtp(app, phone, code, MP_OTP);
}
