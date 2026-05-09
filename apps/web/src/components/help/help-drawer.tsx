/**
 * Contextual help drawer — slide-in panel from the right edge that shows
 * a single recipe inline. Triggered from anywhere via:
 *   window.dispatchEvent(new CustomEvent('runq:open-help', { detail: { recipeId } }))
 *
 * One instance is mounted at the root (see __root.tsx).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  BookOpen, X, ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock,
} from 'lucide-react';
import { getRecipe, type Difficulty } from '@/lib/help-recipes';
import { StepBody } from './step-body';

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  Easy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Hard: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export function HelpDrawer() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ recipeId: string }>).detail;
      if (!detail?.recipeId) return;
      setRecipeId(detail.recipeId);
      setStepIdx(0);
      setOpen(true);
    }
    window.addEventListener('runq:open-help', onOpen);
    return () => window.removeEventListener('runq:open-help', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !recipeId) return null;
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;

  const total = recipe.steps.length;
  const step = recipe.steps[stepIdx];
  const pct = ((stepIdx + 1) / total) * 100;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="absolute right-0 top-0 bottom-0 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <BookOpen size={16} className="text-indigo-600 dark:text-indigo-400" />
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Quick help
          </div>
          <span className="flex-1" />
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close help"
          >
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wide ${DIFFICULTY_TONE[recipe.difficulty]}`}
            >
              {recipe.difficulty}
            </span>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
              <Clock size={11} /> {recipe.minutes} min
            </span>
          </div>
          <div className="text-[16px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {recipe.title}
          </div>
          <div className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{recipe.summary}</div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Step {stepIdx + 1} of {total}
          </div>
          <div className="mb-3 text-[18px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {step.title}
          </div>
          <StepBody step={step} />
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            disabled={stepIdx === 0}
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft size={13} /> Back
          </button>
          <span className="flex-1" />
          {stepIdx < total - 1 ? (
            <button
              onClick={() => setStepIdx(stepIdx + 1)}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-indigo-700"
            >
              Next <ArrowRight size={13} />
            </button>
          ) : (
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-emerald-700"
            >
              <Check size={13} /> Got it
            </button>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-[12px] dark:border-zinc-800">
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Close
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: '/help/$recipeId', params: { recipeId: recipe.id } });
            }}
            className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Open full guide <ArrowUpRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
