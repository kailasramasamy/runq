import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

let messaging: Messaging | null | undefined;

/**
 * Returns the FCM messaging client, or null when FIREBASE_SERVICE_ACCOUNT is
 * unset (local dev without push configured). Initialised lazily on first use.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account JSON — either raw JSON
 * or base64-encoded (base64 avoids newline mangling in some env-var UIs).
 */
export function getFcm(): Messaging | null {
  if (messaging !== undefined) return messaging;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    messaging = null;
    return null;
  }

  const json = raw.trimStart().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');

  const app: App = getApps().length > 0
    ? getApps()[0]!
    : initializeApp({ credential: cert(JSON.parse(json)) });

  messaging = getMessaging(app);
  return messaging;
}
