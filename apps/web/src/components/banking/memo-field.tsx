import { useState, useEffect } from 'react';
import { useSetTransactionMemo } from '@/hooks/queries/use-transactions';
import type { BankTransaction } from '@runq/types';

/**
 * Editable "paid to X for Y" note on a bank transaction. Persists on blur and
 * flows into the linked journal entry's description, so the GL ledger reads the
 * memo rather than the bank's raw narration. The narration itself is untouched.
 */
export function MemoField({ txn }: { txn: BankTransaction }) {
  const setMemo = useSetTransactionMemo();
  const [value, setValue] = useState(txn.memo ?? '');
  useEffect(() => { setValue(txn.memo ?? ''); }, [txn.memo]);

  function save() {
    const next = value.trim();
    if (next === (txn.memo ?? '')) return;
    setMemo.mutate({ transactionId: txn.id, memo: next || null });
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">Memo: </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        maxLength={500}
        placeholder="Paid to … for … (optional)"
        className="w-full max-w-xl rounded border border-transparent bg-transparent px-1 py-0.5 text-zinc-900 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-indigo-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:hover:border-zinc-600"
      />
    </div>
  );
}
