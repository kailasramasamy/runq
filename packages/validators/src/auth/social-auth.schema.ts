import { z } from 'zod';

// Both /social/login and /social/bind take a single Firebase ID token. The
// server verifies the token and pulls the phone + provider identities off the
// decoded payload — we don't trust the client to send those separately.
export const socialLoginSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

export const socialBindSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

export type SocialLoginInput = z.infer<typeof socialLoginSchema>;
export type SocialBindInput = z.infer<typeof socialBindSchema>;
