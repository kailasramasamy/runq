import { useState } from 'react';
import {
  Sparkles, Search, ArrowRight, ArrowUpRight, Play, Flame,
  TrendingUp, Send, CheckCircle2, Settings2, FileOutput,
  MessageCircle, Mail, FileMinus, AlertTriangle, Scissors, Repeat,
  Upload, Landmark,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
  JOBS, RECIPES, QUICK_LINKS, WHATS_NEW, TOTAL_RECIPES, TONE_CLASSES,
  type Job,
} from '@/lib/help-recipes';
import { useHelpProgress } from '@/hooks/queries/use-help';
import { useAuth } from '@/providers/auth-provider';
import { ProgressRing } from './progress-ring';

const JOB_ICONS: Record<Job['icon'], LucideIcon> = {
  'trending-up': TrendingUp,
  send: Send,
  'check-circle-2': CheckCircle2,
  'settings-2': Settings2,
  'file-output': FileOutput,
  sparkles: Sparkles,
};

const QUICK_ICONS: Record<string, LucideIcon> = {
  'file-minus': FileMinus,
  'alert-triangle': AlertTriangle,
  scissors: Scissors,
  repeat: Repeat,
  upload: Upload,
  landmark: Landmark,
};

function askSupport(question: string) {
  window.dispatchEvent(new CustomEvent('runq:open-support', { detail: { message: question } }));
}

export function HelpHome() {
  const { user } = useAuth();
  const progress = useHelpProgress();
  const completedIds = new Set(
    progress.data?.data.progress.filter((p) => p.completedAt).map((p) => p.recipeId) ?? [],
  );
  const completedCount = progress.data?.data.completedCount ?? 0;
  const streak = progress.data?.data.streak ?? 0;
  const inProg = progress.data?.data.inProgress;
  const inProgRecipe = inProg ? RECIPES.find((r) => r.id === inProg.recipeId) : undefined;
  const firstName = (user?.name ?? 'there').split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <AskHero firstName={firstName} />
        <div className="flex flex-col gap-3">
          <ProgressStrip completed={completedCount} total={TOTAL_RECIPES} streak={streak} />
          {inProgRecipe && inProg && (
            <ContinueCard
              title={inProgRecipe.title}
              stepIndex={inProg.stepIndex}
              stepTitle={inProgRecipe.steps[inProg.stepIndex]?.title ?? ''}
              total={inProgRecipe.steps.length}
              recipeId={inProgRecipe.id}
            />
          )}
        </div>
      </div>

      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            What do you want to do?
          </h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Pick a goal — we'll walk you through every step.
          </p>
        </div>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {JOBS.map((job) => (
          <JobCard key={job.id} job={job} completedIds={completedIds} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <QuickLinks />
        <WhatsNew />
      </div>

      <SupportCard />
    </div>
  );
}

function AskHero({ firstName }: { firstName: string }) {
  const [q, setQ] = useState('');
  const suggestions = [
    'How do I file GSTR-3B?',
    'Why is my pay run failing?',
    'Set up recurring invoices',
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-violet-500/[0.04] p-6 lg:p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-[12px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Ask runQ AI
          </span>
        </div>
        <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-zinc-900 lg:text-[28px] dark:text-zinc-100">
          Hey {firstName}, what would you like to learn today?
        </h1>
        <p className="mb-5 text-[13.5px] text-zinc-500 dark:text-zinc-400">
          Ask in plain English. I'll search the guide, your data, and show steps to follow.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = q.trim();
            if (trimmed) {
              askSupport(trimmed);
              setQ('');
            }
          }}
          className="relative"
        >
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g., How do I refund a customer for a returned order?"
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-28 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 px-3 text-[12.5px] font-medium text-white hover:opacity-90"
          >
            Ask <kbd className="rounded bg-white/20 px-1 text-[10px]">↵</kbd>
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400">Try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => askSupport(s)}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11.5px] text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgressStrip({
  completed, total, streak,
}: { completed: number; total: number; streak: number }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <ProgressRing value={completed} total={total} size={48} stroke={4} toneClass="stroke-indigo-500" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400">
          You've completed{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {completed} of {total}
          </span>{' '}
          recipes
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Keep going
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Streak</div>
        <div className="flex items-center justify-end gap-1 text-[18px] font-semibold text-zinc-900 dark:text-zinc-100">
          <Flame size={16} className="text-orange-500" /> {streak} {streak === 1 ? 'day' : 'days'}
        </div>
      </div>
    </div>
  );
}

function ContinueCard({
  title, stepIndex, stepTitle, total, recipeId,
}: { title: string; stepIndex: number; stepTitle: string; total: number; recipeId: string }) {
  const navigate = useNavigate();
  const pct = (stepIndex / total) * 100;
  return (
    <button
      onClick={() => navigate({ to: '/help/$recipeId', params: { recipeId } })}
      className="w-full rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-violet-500/[0.04] p-4 text-left transition-all hover:from-indigo-500/[0.12] hover:to-violet-500/[0.08]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
          <Play size={16} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Continue where you left off
          </div>
          <div className="truncate text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
          <div className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Step {stepIndex + 1} of {total} · {stepTitle}
          </div>
        </div>
        <ArrowRight size={16} className="shrink-0 text-zinc-400" />
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

function JobCard({
  job, completedIds,
}: { job: Job; completedIds: Set<string> }) {
  const navigate = useNavigate();
  const tone = TONE_CLASSES[job.accent];
  const Icon = JOB_ICONS[job.icon];
  const completed = job.recipes.filter((r) => completedIds.has(r)).length;
  const total = job.recipes.length;
  const firstRecipe = job.recipes[0];

  return (
    <button
      onClick={() => firstRecipe && navigate({ to: '/help/$recipeId', params: { recipeId: firstRecipe } })}
      className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full ${tone.bgGlow} opacity-70 blur-xl`} />
      <div className="relative">
        <div className="mb-3 flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone.bg}`}>
            <Icon size={20} className={tone.icon} />
          </div>
          <ProgressRing value={completed} total={total} toneClass={tone.ring} />
        </div>
        <div className="mb-1 text-[15px] font-semibold text-zinc-900 decoration-2 underline-offset-4 group-hover:underline dark:text-zinc-100">
          {job.title}
        </div>
        <div className="mb-4 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {job.description}
        </div>
        <div className="flex items-center justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
          <span>{completed}/{total} recipes</span>
          <span className="flex items-center gap-1 text-zinc-700 group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-zinc-100">
            Start <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </button>
  );
}

function QuickLinks() {
  return (
    <div>
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Popular questions
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {QUICK_LINKS.map((q) => {
          const Icon = QUICK_ICONS[q.icon] ?? Search;
          return (
            <button
              key={q.label}
              onClick={() => askSupport(q.label)}
              className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <Icon size={14} className="shrink-0 text-zinc-400" />
              <span className="flex-1 truncate text-[13px] text-zinc-700 dark:text-zinc-300">{q.label}</span>
              <ArrowUpRight size={12} className="shrink-0 text-zinc-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WhatsNew() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          What's new
        </div>
      </div>
      <div className="space-y-2.5">
        {WHATS_NEW.map((n) => (
          <div
            key={n.title}
            className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10.5px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{n.date}</span>
            </div>
            <div className="mb-0.5 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{n.title}</div>
            <div className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{n.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupportCard() {
  return (
    <div className="mt-10 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
        <MessageCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Stuck on something specific?</div>
        <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400">
          Our team replies within 2 business hours, Mon–Fri 9am–7pm IST.
        </div>
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('runq:open-support'))}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <MessageCircle size={14} /> Chat with us
      </button>
      <a
        href="mailto:support@runq.in"
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Mail size={14} /> Email
      </a>
    </div>
  );
}
