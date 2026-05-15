import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, Clock, Award } from 'lucide-react';
import {
  getRecipe,
  getNextRecipeInJob,
  helpBasePath,
  type Recipe,
  type Difficulty,
  type ModuleKey,
} from '@/lib/help-recipes';
import { useHelpProgress, useUpsertRecipeProgress } from '@/hooks/queries/use-help';
import { StepBody } from './step-body';

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  Easy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Hard: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

interface Props {
  recipeId: string;
  /** Module namespace from the route — fallback for the not-found case;
   *  a found recipe carries its own module. */
  module: ModuleKey;
}

export function RecipeStepperPage({ recipeId, module }: Props) {
  const navigate = useNavigate();
  const recipe = getRecipe(recipeId);
  const helpModule = recipe?.module ?? module;
  const progressQuery = useHelpProgress();
  const upsert = useUpsertRecipeProgress();

  const savedProgress = progressQuery.data?.data.progress.find((p) => p.recipeId === recipeId);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server progress once it arrives
  useEffect(() => {
    if (!progressQuery.data || hydrated) return;
    if (savedProgress?.completedAt) {
      setDone(true);
      setIdx(0);
    } else if (savedProgress) {
      setIdx(Math.min(savedProgress.currentStep, (recipe?.steps.length ?? 1) - 1));
    }
    setHydrated(true);
  }, [progressQuery.data, savedProgress, recipe, hydrated]);

  // Reset when recipe changes
  useEffect(() => {
    setIdx(0);
    setDone(false);
    setHydrated(false);
  }, [recipeId]);

  if (!recipe) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <div className="text-zinc-500">Recipe not found.</div>
        <button
          onClick={() => navigate({ to: helpBasePath(helpModule) as '/' })}
          className="mt-4 text-sm text-indigo-600 hover:underline"
        >
          Back to help
        </button>
      </div>
    );
  }

  const total = recipe.steps.length;
  const pct = done ? 100 : (idx / total) * 100;
  const step = recipe.steps[idx];
  const nextRecipe = getNextRecipeInJob(recipeId);

  function goTo(newIdx: number) {
    setIdx(newIdx);
    upsert.mutate({ recipeId, currentStep: newIdx });
  }

  function complete() {
    setDone(true);
    upsert.mutate({ recipeId, currentStep: total - 1, completed: true });
  }

  function backHome() {
    navigate({ to: helpBasePath(helpModule) as '/' });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink onClick={backHome} />
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="h-1 rounded-t-2xl bg-emerald-500" />
          <CompletionCard
            recipe={recipe}
            onBackHome={backHome}
            onNextRecipe={
              nextRecipe
                ? () => navigate({
                    to: `${helpBasePath(helpModule)}/$recipeId` as '/finance/help/$recipeId',
                    params: { recipeId: nextRecipe.id },
                  })
                : null
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink onClick={backHome} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="self-start lg:sticky lg:top-4">
          <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wide ${DIFFICULTY_TONE[recipe.difficulty]}`}
              >
                {recipe.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                <Clock size={11} /> {recipe.minutes} min
              </span>
            </div>
            <div className="mb-1 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
              {recipe.title}
            </div>
            <div className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {recipe.summary}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Steps
            </div>
            <StepNav steps={recipe.steps} currentIndex={idx} onJump={goTo} />
          </div>
        </aside>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="p-6 lg:p-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Step {idx + 1} of {total}
              </div>
              <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
                {Math.round(pct)}% complete
              </div>
            </div>
            <h2 className="mb-3 text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {step.title}
            </h2>
            <StepBody step={step} />
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <button
              disabled={idx === 0}
              onClick={() => goTo(Math.max(0, idx - 1))}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <div className="flex items-center gap-1.5">
              {recipe.steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx
                      ? 'w-6 bg-indigo-500'
                      : i < idx
                      ? 'w-1.5 bg-emerald-500'
                      : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'
                  }`}
                />
              ))}
            </div>
            {idx < total - 1 ? (
              <button
                onClick={() => goTo(idx + 1)}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-700"
              >
                Next step <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={complete}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700"
              >
                <Check size={14} /> Mark complete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <ArrowLeft size={13} /> All recipes
    </button>
  );
}

function StepNav({
  steps, currentIndex, onJump,
}: {
  steps: Recipe['steps'];
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={i}>
            <button
              onClick={() => onJump(i)}
              className={`flex w-full items-start gap-2.5 rounded-md p-2 text-left transition-colors ${
                active ? 'bg-indigo-500/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-indigo-500 text-white'
                    : 'border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {done ? <Check size={11} /> : i + 1}
              </span>
              <span
                className={`text-[12.5px] leading-tight ${
                  active
                    ? 'font-medium text-zinc-900 dark:text-zinc-100'
                    : done
                    ? 'text-zinc-500 line-through opacity-70 dark:text-zinc-400'
                    : 'text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {s.title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CompletionCard({
  recipe, onBackHome, onNextRecipe,
}: { recipe: Recipe; onBackHome: () => void; onNextRecipe: (() => void) | null }) {
  return (
    <div className="py-10 text-center">
      <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg">
        <Check size={40} strokeWidth={3} />
      </div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        Recipe complete
      </div>
      <h2 className="mb-1 text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Nicely done!
      </h2>
      <p className="mx-auto mb-6 max-w-md text-[14px] text-zinc-500 dark:text-zinc-400">
        You've finished{' '}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{recipe.title}</span>{' '}
        in about {recipe.minutes} minutes. Your streak is still going strong.
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowLeft size={14} /> Back to help
        </button>
        {onNextRecipe && (
          <button
            onClick={onNextRecipe}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-700"
          >
            Next recipe <ArrowRight size={14} />
          </button>
        )}
      </div>
      <div className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-700 dark:text-amber-300">
        <Award size={12} /> +1 badge: {recipe.title.split(' ')[0]} pro
      </div>
    </div>
  );
}
