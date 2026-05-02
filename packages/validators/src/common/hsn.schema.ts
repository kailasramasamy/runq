import { z } from 'zod';

// GSTN accepts HSN/SAC codes of length 2, 4, 6, or 8 only. 7-digit codes are
// rejected during GSTR-1 filing (typical bug: leading zero stripped from
// chapter-04 dairy codes). 8-digit is the most specific and audit-friendly.
export const hsnSacCodeSchema = z
  .string()
  .regex(/^(\d{2}|\d{4}|\d{6}|\d{8})$/, 'HSN/SAC must be 2, 4, 6, or 8 digits (no letters; preserve leading zeros)');
