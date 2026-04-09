import { useState } from 'react';
import { Send, Bot, Loader2, X } from 'lucide-react';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

// Curated quick-start prompts spanning the main angles a SME owner cares
// about: cash, receivables, payables, spending, profitability, customer mix.
// Wrapped into 2-3 rows in the side-by-side dashboard layout to fill the
// chat column without scrolling.
const EXAMPLES = [
  // Cash & runway
  "What's our cash position?",
  'Bills due this week?',
  // Receivables / collections
  'Top 5 overdue invoices?',
  'Which customers are most overdue?',
  // Spending
  'How much did we spend last month?',
  'Top 3 expense categories?',
  // Performance
  'Profit this month vs last?',
  'Revenue trend last 6 months?',
  // Customer mix
  'Top 5 customers by revenue?',
];

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    parts.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function MarkdownResponse({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 dark:bg-indigo-500" />
              <p className="text-sm leading-relaxed">{renderInline(trimmed.slice(2))}</p>
            </div>
          );
        }

        // Heading-like (all bold)
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          const inner = trimmed.slice(2, -2).replace(/:$/, '');
          return (
            <p key={i} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 pt-1">
              {inner}
            </p>
          );
        }

        // Normal paragraph
        return (
          <p key={i} className="text-sm leading-relaxed">{renderInline(trimmed)}</p>
        );
      })}
    </div>
  );
}

export function AIChatWidget() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const ask = useMutation({
    mutationFn: (q: string) =>
      api.post<{ data: { answer: string } }>('/dashboard/ai-chat', { question: q }),
    onSuccess: (res) => setAnswer(res.data.answer),
    onError: () => setAnswer('Sorry, something went wrong. Please try again.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;
    setAnswer('');
    ask.mutate(trimmed);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold">AI Finance Assistant</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your finances..."
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            {(question || answer) && (
              <button
                type="button"
                onClick={() => { setQuestion(''); setAnswer(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                aria-label="Clear"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button type="submit" disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        {!answer && !ask.isPending && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuestion(ex)}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {ask.isPending && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing your data...
          </div>
        )}

        {answer && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-zinc-800 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-zinc-200">
            <MarkdownResponse text={answer} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
