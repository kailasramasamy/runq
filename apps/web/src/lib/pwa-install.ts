// Captures the browser's beforeinstallprompt event so the inbox page can
// surface a manual "Install runq" prompt at a useful moment instead of the
// browser's default prompt timing (which is often too early or never fires).
//
// The captured event is stored on a module-level global; the PwaInstallNudge
// component subscribes to it via a tiny custom-event bus.

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let captured: BeforeInstallPromptEvent | null = null;

const EVENT_AVAILABLE = 'runq:install-prompt-available';
const EVENT_USED = 'runq:install-prompt-used';

export function initInstallPromptCapture(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Stash, don't auto-show
    captured = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent(EVENT_AVAILABLE));
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
    window.dispatchEvent(new CustomEvent(EVENT_USED));
  });
}

export function isInstallPromptAvailable(): boolean {
  return captured !== null;
}

export async function triggerInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!captured) return 'unavailable';
  await captured.prompt();
  const choice = await captured.userChoice;
  captured = null;
  window.dispatchEvent(new CustomEvent(EVENT_USED));
  return choice.outcome;
}

/** Subscribe to install-prompt availability changes. Returns an unsubscribe. */
export function onInstallPromptChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT_AVAILABLE, handler);
  window.addEventListener(EVENT_USED, handler);
  return () => {
    window.removeEventListener(EVENT_AVAILABLE, handler);
    window.removeEventListener(EVENT_USED, handler);
  };
}

/** True if the app is running in standalone (installed) display mode. */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari quirk
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Rough iOS Safari detection — used to surface the Save-to-Files tip. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPhone, iPad, iPod, plus iPadOS 13+ which masquerades as Mac with touch
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}
