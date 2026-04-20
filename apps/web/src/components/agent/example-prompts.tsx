const EXAMPLES = [
  "What's our cash position?",
  'Show overdue receivables',
  'Top 5 vendors by outstanding',
  'Bills due this week',
  'Bank balances',
  'Receivables aging breakdown',
  'How do I create a credit note?',
  'Any unusual transactions today?',
];

interface ExamplePromptsProps {
  onSelect: (prompt: string) => void;
}

export function ExamplePrompts({ onSelect }: ExamplePromptsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Ask me anything about your finances
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          I can look up invoices, bills, bank transactions, and more
        </p>
      </div>
      <div className="flex max-w-sm flex-wrap justify-center gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onSelect(ex)}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
