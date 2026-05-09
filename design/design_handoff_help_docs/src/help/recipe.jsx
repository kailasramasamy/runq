// ─── Recipe stepper — one step at a time, progress, completion celebration ──

const { useState: useStateRcp, useEffect: useEffectRcp } = React;

function StepNav({ steps, currentIndex, onJump }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={i}>
            <button
              onClick={() => onJump(i)}
              className={`w-full flex items-start gap-2.5 p-2 rounded-md text-left transition-colors ${
                active ? "bg-indigo-500/10" : "hover:surface-2"
              }`}
            >
              <span className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                done ? "bg-emerald-500 text-white"
                  : active ? "bg-indigo-500 text-white"
                  : "surface-2 text-3 border border-soft"
              }`}>
                {done ? <Icon name="check" size={11} /> : i + 1}
              </span>
              <span className={`text-[12.5px] leading-tight ${active ? "text-1 font-medium" : done ? "text-2 line-through opacity-70" : "text-2"}`}>
                {s.title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepBody({ step }) {
  // tiny markdown: **bold**
  const parts = step.body.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div>
      <p className="text-[15px] text-2 leading-relaxed">
        {parts.map((p, i) =>
          p.startsWith("**") ? <strong key={i} className="text-1 font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
        )}
      </p>
      {step.screenshot && (
        <div className="mt-5 rounded-lg surface-2 border border-soft border-dashed p-10 flex flex-col items-center justify-center text-3">
          <Icon name="image" size={28} className="mb-2 opacity-50" />
          <div className="text-[12px]">Screenshot — {step.screenshot}</div>
        </div>
      )}
    </div>
  );
}

function CompletionCard({ recipe, onBackHome, onNextRecipe }) {
  return (
    <div className="text-center py-10">
      <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white mb-5 shadow-lg">
        <Icon name="check" size={40} strokeWidth={3} />
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Recipe complete</div>
      <h2 className="text-[24px] font-semibold text-1 mb-1 tracking-tight">Nicely done!</h2>
      <p className="text-[14px] text-3 mb-6 max-w-md mx-auto">You've finished <span className="text-1 font-medium">{recipe.title}</span> in about {recipe.minutes} minutes. Your streak is still going strong.</p>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" icon="arrow-left" onClick={onBackHome}>Back to help</Button>
        {onNextRecipe && <Button icon="arrow-right" onClick={onNextRecipe}>Next recipe</Button>}
      </div>
      <div className="mt-8 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[12px]">
        <Icon name="award" size={12} /> +1 badge: {recipe.title.split(" ")[0]} pro
      </div>
    </div>
  );
}

function RecipeStepper({ recipeId, startStep = 0, onBackHome }) {
  const recipe = HELP.RECIPES.find(r => r.id === recipeId);
  const [idx, setIdx] = useStateRcp(startStep);
  const [done, setDone] = useStateRcp(false);

  useEffectRcp(() => {
    setIdx(startStep);
    setDone(false);
  }, [recipeId, startStep]);

  if (!recipe) return null;
  const total = recipe.steps.length;
  const pct = done ? 100 : (idx / total) * 100;
  const step = recipe.steps[idx];

  // Find next recipe in same job
  const sameJob = HELP.RECIPES.filter(r => r.jobId === recipe.jobId);
  const myPos = sameJob.findIndex(r => r.id === recipe.id);
  const nextRecipe = sameJob[myPos + 1];

  if (done) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={onBackHome} className="inline-flex items-center gap-1.5 text-[12.5px] text-3 hover:text-1 mb-4">
          <Icon name="arrow-left" size={13} /> All recipes
        </button>
        <div className="surface-1 border border-soft rounded-2xl">
          <div className="h-1 rounded-t-2xl bg-emerald-500" />
          <CompletionCard
            recipe={recipe}
            onBackHome={onBackHome}
            onNextRecipe={nextRecipe ? () => { window.__helpSetRecipe?.(nextRecipe.id, 0); } : null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <button onClick={onBackHome} className="inline-flex items-center gap-1.5 text-[12.5px] text-3 hover:text-1 mb-4">
        <Icon name="arrow-left" size={13} /> All recipes
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Left: recipe info + step nav */}
        <aside className="lg:sticky lg:top-4 self-start">
          <div className="surface-1 border border-soft rounded-xl p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10.5px] px-2 py-0.5 rounded-full uppercase tracking-wide ${
                recipe.difficulty === "Easy" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : recipe.difficulty === "Medium" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              }`}>{recipe.difficulty}</span>
              <span className="text-[11.5px] text-3 inline-flex items-center gap-1"><Icon name="clock" size={11} />{recipe.minutes} min</span>
            </div>
            <div className="text-[15px] font-semibold text-1 leading-snug mb-1">{recipe.title}</div>
            <div className="text-[12.5px] text-3 leading-relaxed">{recipe.summary}</div>
          </div>
          <div className="surface-1 border border-soft rounded-xl p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-3 px-1 mb-2">Steps</div>
            <StepNav steps={recipe.steps} currentIndex={idx} onJump={(i) => setIdx(i)} />
          </div>
        </aside>

        {/* Right: current step */}
        <div className="surface-1 border border-soft rounded-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 surface-2">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="p-6 lg:p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider accent-text">Step {idx + 1} of {total}</div>
              <div className="text-[11.5px] text-3">{Math.round(pct)}% complete</div>
            </div>
            <h2 className="text-[22px] font-semibold text-1 tracking-tight mb-3">{step.title}</h2>
            <StepBody step={step} />
          </div>
          <div className="border-t border-soft px-6 py-4 flex items-center justify-between">
            <Button variant="ghost" icon="arrow-left" disabled={idx === 0} onClick={() => setIdx(Math.max(0, idx - 1))}>Previous</Button>
            <div className="flex items-center gap-1.5">
              {recipe.steps.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-indigo-500" : i < idx ? "w-1.5 bg-emerald-500" : "w-1.5 bg-zinc-300 dark:bg-zinc-700"}`} />
              ))}
            </div>
            {idx < total - 1 ? (
              <Button icon="arrow-right" onClick={() => setIdx(idx + 1)}>Next step</Button>
            ) : (
              <Button icon="check" onClick={() => setDone(true)}>Mark complete</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Contextual help drawer ──────────────────────────────────────────────────
// Slides in from the right; shows a single recipe inline. Can be triggered
// from anywhere via window.__openHelpDrawer(recipeId).

function HelpDrawer() {
  const [open, setOpen] = useStateRcp(false);
  const [recipeId, setRecipeId] = useStateRcp(null);
  const [stepIdx, setStepIdx] = useStateRcp(0);

  useEffectRcp(() => {
    window.__openHelpDrawer = (id) => {
      setRecipeId(id);
      setStepIdx(0);
      setOpen(true);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  const recipe = HELP.RECIPES.find(r => r.id === recipeId);
  if (!recipe) return null;
  const total = recipe.steps.length;
  const step = recipe.steps[stepIdx];
  const pct = ((stepIdx + 1) / total) * 100;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md surface-1 border-l border-soft shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-soft">
          <Icon name="book-open" size={16} className="accent-text" />
          <div className="text-[11.5px] font-semibold uppercase tracking-wide accent-text">Quick help</div>
          <span className="flex-1" />
          <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-md hover:surface-2 flex items-center justify-center text-3 hover:text-1">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-5 py-4 border-b border-soft">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10.5px] px-2 py-0.5 rounded-full uppercase tracking-wide bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{recipe.difficulty}</span>
            <span className="text-[11.5px] text-3 inline-flex items-center gap-1"><Icon name="clock" size={11} />{recipe.minutes} min</span>
          </div>
          <div className="text-[16px] font-semibold text-1 leading-snug">{recipe.title}</div>
          <div className="text-[12.5px] text-3 mt-0.5">{recipe.summary}</div>
          <div className="mt-3 h-1 rounded-full surface-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider accent-text mb-2">Step {stepIdx + 1} of {total}</div>
          <div className="text-[18px] font-semibold text-1 mb-3 tracking-tight">{step.title}</div>
          <StepBody step={step} />
        </div>
        <div className="border-t border-soft px-5 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" icon="arrow-left" disabled={stepIdx === 0} onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}>Back</Button>
          <span className="flex-1" />
          {stepIdx < total - 1 ? (
            <Button size="sm" icon="arrow-right" onClick={() => setStepIdx(stepIdx + 1)}>Next</Button>
          ) : (
            <Button size="sm" icon="check" onClick={() => setOpen(false)}>Got it</Button>
          )}
        </div>
        <div className="border-t border-soft px-5 py-3 flex items-center justify-between text-[12px]">
          <button onClick={() => setOpen(false)} className="text-3 hover:text-1">Close</button>
          <button className="accent-text hover:underline inline-flex items-center gap-1">Open full guide <Icon name="arrow-up-right" size={11} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Top-level help router ───────────────────────────────────────────────────

function HelpRoot() {
  const [recipeId, setRecipeId] = useStateRcp(null);
  const [startStep, setStartStep] = useStateRcp(0);

  useEffectRcp(() => {
    window.__helpSetRecipe = (id, step = 0) => { setRecipeId(id); setStartStep(step); };
  }, []);

  if (recipeId) {
    return (
      <RecipeStepper
        recipeId={recipeId}
        startStep={startStep}
        onBackHome={() => setRecipeId(null)}
      />
    );
  }
  return <HelpHome onPickRecipe={(id, step = 0) => { setRecipeId(id); setStartStep(step); }} />;
}
