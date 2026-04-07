import { Sparkles, RefreshCw, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { api } from '@/lib/api-client';

interface AISummary {
  summary: string;
  generatedAt: string;
}

const AI_SUMMARY_KEY = ['dashboard', 'ai-summary'] as const;

type Severity = 'critical' | 'warning' | 'ok';

interface ParsedLine {
  severity: Severity;
  headline: string;
  detail: string;
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
  const text = raw.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d✅⚠️🔴•\-*\s]+/u, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  const severity: Severity = raw.includes('🔴') ? 'critical' : raw.includes('⚠️') ? 'warning' : 'ok';

  // Split on " — " or " - " to get headline vs detail
  const dashMatch = text.match(/^(.+?)\s[—–-]\s(.+)$/);
  if (dashMatch) return { severity, headline: dashMatch[1], detail: dashMatch[2] };

  // Split on first comma if long enough
  const commaIdx = text.indexOf(', ');
  if (commaIdx > 10) return { severity, headline: text.slice(0, commaIdx), detail: text.slice(commaIdx + 2) };

  return { severity, headline: text, detail: '' };
}

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; text: string; icon: typeof AlertTriangle }> = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-900/50',
    text: 'text-red-700 dark:text-red-300',
    icon: AlertTriangle,
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-900/50',
    text: 'text-amber-700 dark:text-amber-300',
    icon: AlertCircle,
  },
  ok: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-900/50',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle,
  },
};

function InsightCard({ line }: { line: ParsedLine }) {
  const style = SEVERITY_STYLES[line.severity];
  const Icon = style.icon;

  return (
    <div className={`rounded-lg border p-3 ${style.bg} ${style.border}`}>
      <div className="flex gap-2.5">
        <Icon size={15} className={`${style.text} mt-0.5 shrink-0`} />
        <div>
          <p className={`text-sm font-semibold leading-snug ${style.text}`}>{line.headline}</p>
          {line.detail && (
            <p className={`mt-0.5 text-xs leading-relaxed ${style.text} opacity-75`}>{line.detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryContent({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map(parseLine);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lines.map((line, i) => (
        <InsightCard key={i} line={line} />
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-indigo-500" />
            <span className="text-sm font-semibold">AI Snapshot</span>
            {summary && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {new Date(summary.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {summary && (
            <button
              onClick={handleRefresh}
              className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
              title="Regenerate"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : isNotConfigured ? (
          <p className="text-sm text-zinc-400">Set ANTHROPIC_API_KEY to enable AI insights</p>
        ) : summary ? (
          <SummaryContent text={summary.summary} />
        ) : (
          <p className="text-sm text-zinc-400">Unable to load insights</p>
        )}
      </CardContent>
    </Card>
  );
}
