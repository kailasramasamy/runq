import { Sparkles, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui';
import { api } from '@/lib/api-client';

interface AISummary {
  summary: string;
  generatedAt: string;
}

const AI_SUMMARY_KEY = ['dashboard', 'ai-summary'] as const;

type Severity = 'critical' | 'warning' | 'ok';

interface ParsedLine {
  severity: Severity;
  text: string;
}

function useAISummary() {
  return useQuery({
    queryKey: AI_SUMMARY_KEY,
    queryFn: () => api.get<{ data: AISummary }>('/dashboard/ai-summary'),
    staleTime: 300_000,
    retry: false,
  });
}

function parseLine(raw: string): ParsedLine {
  const text = raw.replace(/^[✅⚠️🔴•\-*]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  if (raw.includes('🔴')) return { severity: 'critical', text };
  if (raw.includes('⚠️')) return { severity: 'warning', text };
  return { severity: 'ok', text };
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  ok: 'bg-emerald-500',
};

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-red-700 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
  ok: 'text-zinc-600 dark:text-zinc-400',
};

function SummaryContent({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map(parseLine);

  const critical = lines.filter((l) => l.severity === 'critical');
  const warnings = lines.filter((l) => l.severity === 'warning');
  const ok = lines.filter((l) => l.severity === 'ok');

  const groups: { items: ParsedLine[] }[] = [
    { items: critical },
    { items: warnings },
    { items: ok },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:divide-x sm:divide-zinc-200 sm:dark:divide-zinc-700 sm:gap-0">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
          {group.items.map((line, li) => (
            <span key={li} className="flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[line.severity]}`} />
              <span className={`text-[13px] leading-5 ${SEVERITY_TEXT[line.severity]}`}>
                {line.text}
              </span>
            </span>
          ))}
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
    <Card className="border-zinc-200/80 dark:border-zinc-800">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles size={14} className="text-indigo-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            AI Snapshot
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700 shrink-0 hidden sm:block" />

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-3.5 w-28 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : isNotConfigured ? (
            <span className="text-xs text-zinc-400">Set ANTHROPIC_API_KEY to enable</span>
          ) : summary ? (
            <SummaryContent text={summary.summary} />
          ) : (
            <span className="text-xs text-zinc-400">Unable to load</span>
          )}
        </div>

        {summary && (
          <button
            onClick={handleRefresh}
            className="shrink-0 rounded p-1 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
            title="Regenerate"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </Card>
  );
}
