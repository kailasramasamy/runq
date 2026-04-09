import { MousePointerClick, Share2, ClipboardPaste, Inbox } from 'lucide-react';

/**
 * First-run empty state for the PO Inbox. Shown only the very first time
 * the inbox loads with zero rows AND the user has never uploaded a PO
 * before. After the first successful upload, the inbox flips to the plain
 * "no POs in the inbox" empty state on subsequent empty loads.
 *
 * The 3-card walkthrough is the entire onboarding for the feature — there's
 * no separate guided tour. Each card is also a real action surface: clicking
 * "Drop" jumps focus to the upload zone above; the share card just shows
 * the install nudge (which is rendered separately above this empty state);
 * the paste card shows the keyboard hint plus the Type-a-PO button.
 */
export function FirstRunEmpty({ onTypeClick }: { onTypeClick: () => void }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <Inbox className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
      <h2 className="mt-3 text-base font-semibold text-zinc-800 dark:text-zinc-100">
        Welcome to the PO Inbox
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        Drop a customer purchase order, share it from WhatsApp, or paste a chat
        message — runq parses it and drafts the invoice for you.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
        <Card
          icon={MousePointerClick}
          title="Drop a file"
          body="Drag a PDF, image, CSV, or Excel from anywhere on your desktop into the upload zone above. Up to 10 MB."
        />
        <Card
          icon={Share2}
          title="Share from WhatsApp"
          body="On Android, install runq from the prompt above. Then tap any PO in WhatsApp → Share → runq."
        />
        <Card
          icon={ClipboardPaste}
          title="Paste or type"
          body="Cmd+V works for images, screenshots, and chat text. Or click 'Type a PO' to enter one manually."
          actionLabel="Type a PO"
          onAction={onTypeClick}
        />
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <Icon className="h-5 w-5 text-indigo-500" />
      <p className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{body}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}
