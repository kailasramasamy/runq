import { useState } from 'react';
import { Modal, Button, Textarea, useToast } from '@/components/ui';
import { useUploadPoText } from '@/hooks/queries/use-po-inbox';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Explicit "type or paste a PO" modal — surfaces the same paste-text path
 * that's already accessible via Cmd+V on the upload zone, but discoverable
 * for accountants who don't know about the keyboard shortcut. Common use:
 * a customer says the order on a phone call, and the accountant types it
 * out as free text.
 */
export function TypePoModal({ open, onClose }: Props) {
  const [text, setText] = useState('');
  const upload = useUploadPoText();
  const { toast } = useToast();

  const reset = () => setText('');
  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast('Enter the PO content', 'error');
      return;
    }
    try {
      await upload.mutateAsync({ text: trimmed, sourceMetadata: { typedManually: true } });
      toast('PO captured', 'success');
      handleClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Type or paste a PO">
      <div className="space-y-3">
        <Textarea
          label="PO content"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Examples:\n• 50 x Full Cream Milk 1L, 25 kg paneer — delivery tomorrow 7am\n• Paste a WhatsApp chat message here`}
          autoFocus
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          We'll parse customer name, line items, dates, and quantities. Don't
          worry about formatting — chat exports and informal notes both work.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={upload.isPending || text.trim().length < 3}
          >
            {upload.isPending ? 'Uploading…' : 'Capture PO'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
