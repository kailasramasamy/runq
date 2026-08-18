import { useEffect, useState } from 'react';
import { Mail, Paperclip, AlertTriangle } from 'lucide-react';
import { Modal, Input } from '@/components/ui';
import { Button } from '@/components/ar/primitives';

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerCcEmail: string | null;
  sending: boolean;
  onSend: (opts: { emailTo: string; emailCc: string; attachPdf: boolean }) => void;
}

/**
 * Confirms who an invoice is about to reach before it leaves. The addresses are
 * pre-filled from the customer master but stay editable, because the billing
 * contact for one invoice is often not the one stored on the account.
 */
export function SendInvoiceDialog({
  open, onClose, invoiceNumber, customerName, customerEmail, customerCcEmail, sending, onSend,
}: Props) {
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);

  // Re-seed each time the dialog opens so a previous edit never leaks into the
  // next invoice, and so the fields fill in once the customer query resolves.
  useEffect(() => {
    if (!open) return;
    setEmailTo(customerEmail ?? '');
    setEmailCc(customerCcEmail ?? '');
  }, [open, customerEmail, customerCcEmail]);

  const recipients = emailTo.split(',').map((e) => e.trim()).filter(Boolean);
  const canSend = recipients.length > 0 && !sending;

  return (
    <Modal open={open} onClose={onClose} title={`Send ${invoiceNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Issues the invoice and emails it to {customerName}.
        </p>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">To</label>
          <Input
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="billing@customer.com"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Separate multiple addresses with commas.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">CC</label>
          <Input
            value={emailCc}
            onChange={(e) => setEmailCc(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={attachPdf}
            onChange={(e) => setAttachPdf(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          <Paperclip size={14} /> Attach invoice PDF
        </label>

        {recipients.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>
              No email address on file for {customerName}. Enter one above, or add it to the customer
              record so future invoices go out automatically.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button
            onClick={() => onSend({ emailTo, emailCc, attachPdf })}
            disabled={!canSend}
            loading={sending}
            icon={<Mail size={14} />}
          >
            Send invoice
          </Button>
        </div>
      </div>
    </Modal>
  );
}
