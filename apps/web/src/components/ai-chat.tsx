import { useState } from 'react';
import { Send, Bot, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

const EXAMPLES = [
  'How much did we spend last month?',
  "What's our cash position?",
  'Top 5 overdue invoices?',
];

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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your finances..."
            className="flex-1 resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" disabled={ask.isPending || !question.trim()} className="self-end">
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

        {answer && (
          <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm text-zinc-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-zinc-200">
            {answer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
