import { z } from 'zod';

// Dhenu (milk-procurement) app login — **independent of HR `employees` auth**.
// The server resolves identity against `mp_credentials` (farmers + field
// operators), never `employees`. Ownership is proved by a phone OTP (MSG91).

// Google/Apple sign-in: a single Firebase ID token. The server verifies it and
// looks up the bound mp_credentials row by firebase_uid.
export const mpSocialLoginSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

// Request an OTP for a phone. The number must belong to an active Dhenu
// credential; the server SMSes a 6-digit code via MSG91.
export const mpOtpRequestSchema = z.object({
  phone: z.string().min(8).max(20),
});

const otpCode = z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits');

// One-time first-login bind: the Google/Apple token proves the social identity,
// phone + OTP prove which mp_credentials row it belongs to.
export const mpSocialBindSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
  phone: z.string().min(8).max(20),
  otp: otpCode,
});

// Standalone phone + OTP login (no Firebase) — for users without a Google
// account and for provisioning/e2e scripts.
export const mpPhoneLoginSchema = z.object({
  phone: z.string().min(8).max(20),
  otp: otpCode,
});

export type MpSocialLoginInput = z.infer<typeof mpSocialLoginSchema>;
export type MpOtpRequestInput = z.infer<typeof mpOtpRequestSchema>;
export type MpSocialBindInput = z.infer<typeof mpSocialBindSchema>;
export type MpPhoneLoginInput = z.infer<typeof mpPhoneLoginSchema>;
