import { useState } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface AISummary {
  summary: string;
  generatedAt: string;
}

const AI_SUMMARY_KEY = ['dashboard', 'ai-summary'] as const;

type Severity = 'critical' | 'warning' | 'ok';

interface InsightItem {
  label: string;
  amount: string;
  note: string;
  severity: Severity;
}

function useAISummary() {
  return useQuery({
    queryKey: AI_SUMMARY_KEY,
    queryFn: () => api.get<{ data: AISummary }>('/dashboard/ai-summary'),
    staleTime: 300_000,
    retry: false,
  });
}

function isInsightItem(v: unknown): v is InsightItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.label === 'string' && typeof o.note === 'string';
}

function tryJsonInsights(raw: string): InsightItem[] | null {
  // Try whole string first, then any embedded [...] block (covers
  // markdown fences like ```json\n[...]\n``` or extra prose).
  const candidates = [raw];
  const m = raw.match(/\[[\s\S]*\]/);
  if (m && m[0] !== raw) candidates.push(m[0]);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (!Array.isArray(parsed)) continue;
      return parsed.filter(isInsightItem).map((p) => ({
        label: p.label,
        amount: typeof (p as { amount?: unknown }).amount === 'string' ? (p as { amount: string }).amount : '',
        note: p.note,
        severity:
          (p as { severity?: unknown }).severity === 'critical' ||
          (p as { severity?: unknown }).severity === 'warning'
            ? ((p as { severity: 'critical' | 'warning' }).severity)
            : 'ok',
      }));
    } catch {
      // try next candidate
    }
  }
  return null;
}

function parseInsights(text: string): InsightItem[] {
  if (!text) return [];
  const json = tryJsonInsights(text);
  if (json) return json;

  // Legacy plain-text fallback. Only runs when no JSON array is present.
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((raw) => {
        const severity: Severity = raw.includes('🔴') ? 'critical' : raw.includes('⚠️') ? 'warning' : 'ok';
        const cleaned = raw.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d✅⚠️🔴•\-*\s]+/u, '').trim();
        const amountMatch = cleaned.match(/(₹[\d,.]+[LCr]*)/);
        const amount = amountMatch ? amountMatch[1] : '';
        const rest = cleaned.replace(amount, '').replace(/^\s*[:\-—]\s*/, '').trim();
      const dashMatch = rest.match(/^(.+?)\s[—–-]\s(.+)$/);
      return {
        label: dashMatch ? dashMatch[1] : rest.slice(0, 20),
        amount,
        note: dashMatch ? dashMatch[2] : rest,
        severity,
      };
    });
}

const SEVERITY_BAR: Record<Severity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  ok: 'bg-emerald-500',
};

const SEVERITY_AMOUNT: Record<Severity, string> = {
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  ok: 'text-zinc-900 dark:text-zinc-100',
};

function InsightCard({ item }: { item: InsightItem }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className={cn('absolute left-0 top-0 h-full w-1', SEVERITY_BAR[item.severity])} />
      <p className={cn('font-mono text-2xl font-semibold tabular-nums', SEVERITY_AMOUNT[item.severity])}>
        {item.amount || '₹0'}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {item.label}
      </p>
      {item.note && (
        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{item.note}</p>
      )}
    </div>
  );
}

const COLLAPSED_KEY = 'dashboard:ai-snapshot-collapsed';

export function AIInsightsWidget() {
  const { data, isLoading, isError, error } = useAISummary();
  const queryClient = useQueryClient();
  const summary = data?.data;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      }
      return next;
    });
  };

  const isNotConfigured = isError && (error as { statusCode?: number })?.statusCode === 500;

  const handleRefresh = () => {
    queryClient.fetchQuery({
      queryKey: AI_SUMMARY_KEY,
      queryFn: () => api.get<{ data: AISummary }>('/dashboard/ai-summary?refresh=true'),
    });
  };

  const insights = summary ? parseInsights(summary.summary) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-2 rounded text-left hover:opacity-80"
            aria-expanded={!collapsed}
          >
            <Sparkles size={14} className="text-indigo-500" />
            <span className="text-sm font-semibold">AI Snapshot</span>
            {summary && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {new Date(summary.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {collapsed ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronUp size={14} className="text-zinc-400" />}
          </button>
          {summary && !collapsed && (
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
      {!collapsed && (
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : isNotConfigured ? (
          <p className="text-sm text-zinc-400">Set ANTHROPIC_API_KEY to enable AI insights</p>
        ) : insights.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {insights.map((item, i) => (
              <InsightCard key={i} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Unable to load insights</p>
        )}
      </CardContent>
      )}
    </Card>
  );
}
