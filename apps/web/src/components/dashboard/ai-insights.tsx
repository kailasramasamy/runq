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

function getLineStyle(line: string) {
  if (line.startsWith('🔴') || line.includes('🔴'))
    return { bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-900/40', icon: '🔴' };
  if (line.startsWith('⚠️') || line.includes('⚠️'))
    return { bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-900/40', icon: '⚠️' };
  if (line.startsWith('✅') || line.includes('✅'))
    return { bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-900/40', icon: '✅' };
  return { bg: 'bg-zinc-50 dark:bg-zinc-800/50', border: 'border-zinc-200 dark:border-zinc-700', icon: '•' };
}

function cleanLine(line: string): string {
  return line.replace(/^[✅⚠️🔴•\-*]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
}

function SummaryContent({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-1.5">
      {lines.map((line, i) => {
        const style = getLineStyle(line);
        return (
          <span key={i} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="shrink-0 text-sm">{style.icon}</span>
            {cleanLine(line)}
          </span>
        );
      })}
    </div>
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
    <Card className="overflow-hidden border-indigo-200/60 dark:border-indigo-900/40">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between sm:justify-start gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 shadow-sm">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">AI Snapshot</span>
          </div>
          {summary && (
            <button
              onClick={handleRefresh}
              className="sm:hidden shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
              title="Regenerate"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              {[0,1,2].map((i) => <div key={i} className="h-4 w-full sm:w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />)}
            </div>
          ) : isNotConfigured ? (
            <span className="text-xs text-zinc-400">Set ANTHROPIC_API_KEY to enable</span>
          ) : summary ? (
            <SummaryContent text={summary.summary} />
          ) : (
            <span className="text-sm text-zinc-500">Unable to load</span>
          )}
        </div>
        {summary && (
          <button
            onClick={handleRefresh}
            className="hidden sm:block shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
            title="Regenerate"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    </Card>
  );
}
