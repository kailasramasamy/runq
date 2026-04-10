import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import {
  isInstallPromptAvailable,
  triggerInstallPrompt,
  onInstallPromptChange,
  isStandaloneMode,
  isIos,
} from '@/lib/pwa-install';

const DISMISSED_KEY = 'runq:install-nudge-dismissed';

/**
 * Inline card on the PO Inbox page that prompts the accountant to install
 * the PWA. Two modes:
 *
 *   1. Android (or any browser supporting beforeinstallprompt): one-tap
 *      install via the captured event. Card disappears once accepted.
 *   2. iOS Safari (no beforeinstallprompt): a static "how to add to home
 *      screen" tip with the Share-button instruction.
 *
 * Hidden if:
 *   - The app is already running in standalone mode
 *   - The user has dismissed it (sticky in localStorage)
 *   - On Android: the browser hasn't fired beforeinstallprompt yet
 */
export function InstallNudge() {
  const [available, setAvailable] = useState(isInstallPromptAvailable());
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  });

  useEffect(() => {
    return onInstallPromptChange(() => setAvailable(isInstallPromptAvailable()));
  }, []);

  if (dismissed) return null;
  if (isStandaloneMode()) return null;

  const ios = isIos();
  // Show iOS tip even without beforeinstallprompt; show Android card only when
  // the browser has captured a prompt for us.
  if (!ios && !available) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    const outcome = await triggerInstallPrompt();
    if (outcome !== 'unavailable') {
      // Whether accepted or dismissed by the OS, we shouldn't show the card again
      window.localStorage.setItem(DISMISSED_KEY, '1');
      setDismissed(true);
    }
  };

  return (
    <div className="mb-3 hidden items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 max-md:flex dark:border-indigo-900 dark:bg-indigo-950/30">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
      <div className="min-w-0 flex-1">
        {ios ? <IosBody /> : <AndroidBody onInstall={install} />}
      </div>
      <button
        onClick={dismiss}
        className="rounded p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function AndroidBody({ onInstall }: { onInstall: () => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
        Install runq on this phone
      </p>
      <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">
        After install, you can share POs straight from WhatsApp → runq in one tap.
      </p>
      <button
        onClick={onInstall}
        className="mt-2 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
      >
        Install
      </button>
    </div>
  );
}

function IosBody() {
  return (
    <div>
      <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
        Add runq to your iPhone home screen
      </p>
      <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">
        In Safari: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.
        Then to send a PO from WhatsApp: tap the PDF → <strong>Save to Files</strong> → open runq → drop here.
      </p>
    </div>
  );
}
