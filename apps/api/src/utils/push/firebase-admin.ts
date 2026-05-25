import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getAuth, type Auth } from 'firebase-admin/auth';

let messaging: Messaging | null | undefined;
let auth: Auth | null | undefined;

// Lazily initialise the shared Firebase app from FIREBASE_SERVICE_ACCOUNT
// (raw JSON or base64). Returns null when the env var is unset so callers can
// gracefully degrade in local dev.
function getFirebaseApp(): App | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (getApps().length > 0) return getApps()[0]!;
  const json = raw.trimStart().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

/**
 * Returns the FCM messaging client, or null when FIREBASE_SERVICE_ACCOUNT is
 * unset (local dev without push configured). Initialised lazily on first use.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account JSON — either raw JSON
 * or base64-encoded (base64 avoids newline mangling in some env-var UIs).
 */
export function getFcm(): Messaging | null {
  if (messaging !== undefined) return messaging;
  const app = getFirebaseApp();
  messaging = app ? getMessaging(app) : null;
  return messaging;
}

/**
 * Returns the Firebase Auth client for verifying ID tokens, or null when
 * FIREBASE_SERVICE_ACCOUNT is unset. Used by the mobile social-auth flow.
 */
export function getFirebaseAuth(): Auth | null {
  if (auth !== undefined) return auth;
  const app = getFirebaseApp();
  auth = app ? getAuth(app) : null;
  return auth;
}
