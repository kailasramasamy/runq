import { z } from 'zod';

// z.coerce.boolean() is a footgun for query strings: it's literally
// Boolean(value), so "false" / "0" / "no" all coerce to true. Use this
// instead for any ?flag=... param that should be a real boolean.
//
// Accepts actual booleans (in case the value arrives via JSON), and the
// strings "true"/"1"/"yes"/"on" (truthy) or "false"/"0"/"no"/"off"/""
// (falsy). Anything else is a validation error so a typo doesn't silently
// flip behaviour.
export const queryBool = z
  .union([z.boolean(), z.string()])
  .transform((v, ctx) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off', ''].includes(s)) return false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid boolean: ${v}` });
    return z.NEVER;
  });
