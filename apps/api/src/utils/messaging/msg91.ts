import { loadEnv } from '../../config/env';

const MSG91_OTP_URL = 'https://api.msg91.com/api/v5/otp';

export interface OtpSendResult {
  success: boolean;
  // True when MSG91 is not configured — the caller treats this as a no-op
  // (dev/test) rather than a hard failure.
  skipped?: boolean;
  error?: string;
}

// MSG91 expects the destination with the country code. Rows are stored as bare
// 10-digit numbers, so prefix 91 when it's missing.
function withCountryCode(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// Send a pre-generated OTP over SMS via MSG91's v5/otp endpoint. We generate and
// verify the code ourselves (Redis); MSG91 is only the delivery channel, so the
// code is passed explicitly. Returns `skipped` when unconfigured so local dev
// works without SMS credentials.
export async function sendOtpSms(phone: string, otp: string): Promise<OtpSendResult> {
  const env = loadEnv();
  if (!env.MSG91_AUTH_KEY) return { success: false, skipped: true };

  const url = new URL(MSG91_OTP_URL);
  url.searchParams.set('mobile', withCountryCode(phone));
  url.searchParams.set('otp', otp);
  url.searchParams.set('authkey', env.MSG91_AUTH_KEY);
  if (env.MSG91_SENDER_ID) url.searchParams.set('sender', env.MSG91_SENDER_ID);
  if (env.MSG91_ROUTE) url.searchParams.set('route', env.MSG91_ROUTE);
  if (env.MSG91_OTP_TEMPLATE_ID) url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID);

  try {
    const response = await fetch(url.toString(), { method: 'POST', signal: AbortSignal.timeout(10000) });
    const json = (await response.json()) as { type?: string; message?: string };
    if (json.type === 'success') return { success: true };
    return { success: false, error: json.message ?? 'OTP send failed' };
  } catch {
    return { success: false, error: 'OTP send failed' };
  }
}
