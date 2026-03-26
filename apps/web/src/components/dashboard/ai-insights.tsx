import { Sparkles, RefreshCw, Settings } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { api } from '@/lib/api-client';

interface AISummary {
  summary: string;
  generatedAt: string;
}

const AI_SUMMARY_KEY = ['dashboard', 'ai-summary'] as const;

function useAISummary() {
  return useQuery({
    queryKey: AI_SUMMARY_KEY,
    queryFn: () => api.get<{ data: AISummary }>('/dashboard/ai-summary'),
    staleTime: 300_000,
    retry: false,
  });
}

function SummaryContent({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  return (
    <ul className="space-y-2">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
          <span>{line.replace(/^[-•*]\s*/, '')}</span>
        </li>
      ))}
    </ul>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

export function AIInsightsWidget() {
  const { data, isLoading, isError, error } = useAISummary();
  const queryClient = useQueryClient();
  const summary = data?.data;

  const isNotConfigured = isError && (error as { statusCode?: number })?.statusCode === 500;

  const handleRefresh = () => {
    queryClient.fetchQuery({
      queryKey: AI_SUMMARY_KEY,
      queryFn: () => api.get<{ data: AISummary }>('/dashboard/ai-summary?refresh=true'),
    });
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50/30 dark:border-indigo-900/50 dark:bg-indigo-950/10">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Insights</h3>
        </div>
        {summary && (
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="text-xs">
            <RefreshCw size={14} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : isNotConfigured ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Settings size={24} className="text-zinc-400" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Configure ANTHROPIC_API_KEY to enable AI insights
            </p>
          </div>
        ) : summary ? (
          <>
            <SummaryContent text={summary.summary} />
            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              Generated {new Date(summary.generatedAt).toLocaleString('en-IN')}
            </p>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-zinc-500">Unable to load AI insights</p>
        )}
      </CardContent>
    </Card>
  );
}
