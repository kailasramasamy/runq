import { z } from 'zod';

// /social/login takes a single Firebase ID token (Google/Apple). The server
// verifies it and looks up the bound user — we don't trust the client to send
// the uid separately.
export const socialLoginSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

// /social/bind is the one-time first-login step: the Google/Apple token proves
// the credential, while phone + DOB prove which employee record it belongs to.
// `dob` is the employee's date of birth as DDMMYY (no SMS OTP — DOB is the
// zero-cost ownership check). The server matches the employee by phone, then
// verifies DOB against the record.
export const socialBindSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
  phone: z.string().min(8).max(20),
  dob: z.string().length(6).regex(/^\d{6}$/, 'Date of birth must be 6 digits (DDMMYY)'),
});

// Standalone phone + DOB login (iOS, where not every user has a Google
// account). No Firebase token — the employee's DOB (DDMMYY) is the credential,
// matched against the record and throttled the same way as the bind.
export const phoneDobLoginSchema = z.object({
  phone: z.string().min(8).max(20),
  dob: z.string().length(6).regex(/^\d{6}$/, 'Date of birth must be 6 digits (DDMMYY)'),
});

export type SocialLoginInput = z.infer<typeof socialLoginSchema>;
export type SocialBindInput = z.infer<typeof socialBindSchema>;
export type PhoneDobLoginInput = z.infer<typeof phoneDobLoginSchema>;
