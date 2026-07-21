import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from './toast';

/**
 * An amount with an inline copy-to-clipboard button. `display` is what's shown
 * (already formatted, e.g. "₹17,691"); `copyValue` is the bare value written to
 * the clipboard (e.g. "17691") so it pastes cleanly into a bank/UPI app.
 */
export function CopyableAmount({ display, copyValue, className = '' }: {
  display: string; copyValue: string; className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      toast('Amount copied', 'success');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Could not copy amount', 'error');
    }
  };

  return (
    <span className={`inline-flex items-center justify-end gap-1.5 ${className}`}>
      <span className="tabular-nums">{display}</span>
      <button
        type="button"
        onClick={copy}
        title="Copy amount"
        className="text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
      >
        {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
