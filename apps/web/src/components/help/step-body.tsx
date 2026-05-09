import type { RecipeStep } from '@/lib/help-recipes';
import { RecipeScreenshot } from './recipe-screenshot';

export function StepBody({ step }: { step: RecipeStep }) {
  // Tiny markdown — only **bold** is supported. Splits on **…** runs.
  const parts = step.body.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div>
      <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {parts.map((p, i) =>
          p.startsWith('**') ? (
            <strong key={i} className="font-semibold text-zinc-900 dark:text-zinc-100">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
      </p>
      {step.screenshot && (
        <div className="mt-5">
          <RecipeScreenshot spec={step.screenshot} />
        </div>
      )}
    </div>
  );
}
