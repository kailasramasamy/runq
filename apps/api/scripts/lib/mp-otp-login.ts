import type { buildApp } from '../../src/app';

type App = Awaited<ReturnType<typeof buildApp>>;

// Test/provisioning helper: run the Dhenu phone-OTP login end to end. Requests
// an OTP (non-production returns the code inline as `devCode`), then logs in
// with it. Returns the raw login inject response so callers keep asserting on
// statusCode / json() exactly as they did with the old phone+DOB endpoint.
export async function mpOtpLogin(app: App, phone: string) {
  const req = await app.inject({
    method: 'POST', url: '/api/v1/auth/mp/otp/request', payload: { phone },
  });
  const devCode = (req.json() as any)?.data?.devCode as string | undefined;
  if (!devCode) throw new Error(`OTP request failed ${req.statusCode}: ${req.body}`);
  return app.inject({
    method: 'POST', url: '/api/v1/auth/mp/phone/login', payload: { phone, otp: devCode },
  });
}
