import { z } from 'zod';

// Dhenu (milk-procurement) app login — **independent of HR `employees` auth**.
// Same protocol shape as social-auth, but the server resolves identity against
// `mp_credentials` (farmers + field operators), never `employees`.

// Google/Apple sign-in: a single Firebase ID token. The server verifies it and
// looks up the bound mp_credentials row by firebase_uid.
export const mpSocialLoginSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

// One-time first-login bind: the Google/Apple token proves the credential,
// phone + DOB (DDMMYY) prove which mp_credentials row it belongs to. No SMS —
// DOB is the zero-cost ownership check, throttled to 5 tries.
export const mpSocialBindSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
  phone: z.string().min(8).max(20),
  dob: z.string().length(6).regex(/^\d{6}$/, 'Date of birth must be 6 digits (DDMMYY)'),
});

// Standalone phone + DOB login (no Firebase) — for users without a Google
// account and for tests. The credential's DOB (DDMMYY) is matched against the
// record and throttled the same way as the bind.
export const mpPhoneDobLoginSchema = z.object({
  phone: z.string().min(8).max(20),
  dob: z.string().length(6).regex(/^\d{6}$/, 'Date of birth must be 6 digits (DDMMYY)'),
});

export type MpSocialLoginInput = z.infer<typeof mpSocialLoginSchema>;
export type MpSocialBindInput = z.infer<typeof mpSocialBindSchema>;
export type MpPhoneDobLoginInput = z.infer<typeof mpPhoneDobLoginSchema>;
