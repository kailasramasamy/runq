import { z } from 'zod';

// Mobile sign-in is phone-OTP via MSG91. The server generates, stores (Redis)
// and verifies the code itself — there is no Firebase and no client-asserted
// identity. Two steps: request an SMS code, then submit it with the phone.
export const otpRequestSchema = z.object({
  phone: z.string().min(8).max(20),
});

export const phoneLoginSchema = z.object({
  phone: z.string().min(8).max(20),
  otp: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;
