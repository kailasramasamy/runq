// ─── Help home page ─────────────────────────────────────────────────────────
// Friendly learning hub: hero with AI ask + Continue learning, JTBD cards
// with progress rings, quick links, what's new, contextual help drawer.

const { useState: useStateHelp, useMemo: useMemoHelp, useEffect: useEffectHelp } = React;

// ── Tones for JTBD cards (subtle accent + ring color) ────────────────────────
const JOB_TONES = {
  emerald: { ring: "stroke-emerald-500", bg: "bg-emerald-500/8", icon: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  blue:    { ring: "stroke-blue-500",    bg: "bg-blue-500/8",    icon: "text-blue-600 dark:text-blue-400",       chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  violet:  { ring: "stroke-violet-500",  bg: "bg-violet-500/8",  icon: "text-violet-600 dark:text-violet-400",   chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  amber:   { ring: "stroke-amber-500",   bg: "bg-amber-500/8",   icon: "text-amber-600 dark:text-amber-400",     chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  rose:    { ring: "stroke-rose-500",    bg: "bg-rose-500/8",    icon: "text-rose-600 dark:text-rose-400",       chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  indigo:  { ring: "stroke-indigo-500",  bg: "bg-indigo-500/8",  icon: "text-indigo-600 dark:text-indigo-400",   chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
};

// ── Progress ring (SVG) ──────────────────────────────────────────────────────
function ProgressRing({ value, total, size = 56, stroke = 4, toneClass = "stroke-indigo-500" }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} className="fill-none stroke-current text-zinc-200 dark:text-zinc-800" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r}
        className={`fill-none ${toneClass}`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-current text-1 text-[12px] font-semibold">
        {`${Math.round(pct * 100)}%`}
      </text>
    </svg>
  );
}

// ── JTBD Card ────────────────────────────────────────────────────────────────
function JobCard({ job, onPickRecipe }) {
  const tone = JOB_TONES[job.accent] || JOB_TONES.indigo;
  const recipes = job.recipes.map(id => HELP.RECIPES.find(r => r.id === id)).filter(Boolean);
  const completed = recipes.filter(r => r.completed).length;
  return (
    <button
      onClick={() => recipes[0] && onPickRecipe(recipes[0].id)}
      className="group text-left surface-1 border border-soft rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
    >
      <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full ${tone.bg} blur-xl opacity-70`} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tone.bg}`}>
            <Icon name={job.icon} size={20} className={tone.icon} />
          </div>
          <ProgressRing value={completed} total={recipes.length} toneClass={tone.ring} />
        </div>
        <div className="text-[15px] font-semibold text-1 mb-1 group-hover:underline decoration-2 underline-offset-4">{job.title}</div>
        <div className="text-[13px] text-3 leading-relaxed mb-4">{job.description}</div>
        <div className="flex items-center justify-between text-[12px] text-3">
          <span>{completed}/{recipes.length} recipes</span>
          <span className="flex items-center gap-1 text-2 group-hover:text-1">
            Start <Icon name="arrow-right" size={12} />
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Continue learning hero card ──────────────────────────────────────────────
function ContinueCard({ recipe, stepIndex, onResume }) {
  if (!recipe) return null;
  const total = recipe.steps.length;
  const pct = (stepIndex / total) * 100;
  return (
    <button
      onClick={() => onResume(recipe.id, stepIndex)}
      className="text-left w-full bg-gradient-to-br from-indigo-500/8 to-violet-500/4 border border-indigo-500/20 rounded-xl p-4 hover:from-indigo-500/12 hover:to-violet-500/8 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
          <Icon name="play" size={16} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-0.5">Continue where you left off</div>
          <div className="text-[14px] font-semibold text-1 truncate">{recipe.title}</div>
          <div className="text-[12px] text-3">Step {stepIndex + 1} of {total} · {recipe.steps[stepIndex]?.title}</div>
        </div>
        <Icon name="arrow-right" size={16} className="text-2 shrink-0" />
      </div>
      <div className="mt-3 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}

// ── AI Ask hero ──────────────────────────────────────────────────────────────
function AskHero({ onAsk }) {
  const [q, setQ] = useStateHelp("");
  const suggestions = ["How do I file GSTR-3B?", "Why is my pay run failing?", "Set up recurring invoices"];
  return (
    <div className="surface-1 border border-soft rounded-2xl p-6 lg:p-8 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "20px 20px" }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
            <Icon name="sparkles" size={16} className="text-white" />
          </div>
          <span className="text-[12px] font-semibold uppercase tracking-wide accent-text">Ask runQ AI</span>
        </div>
        <h1 className="text-[22px] lg:text-[28px] font-semibold text-1 mb-1 tracking-tight">Hey {HELP.USER.name.split(" ")[0]}, what would you like to learn today?</h1>
        <p className="text-[13.5px] text-3 mb-5">Ask in plain English. I'll search the guide, your data, and show steps to follow.</p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q.trim()); }}
          className="relative"
        >
          <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g., How do I refund a customer for a returned order?"
            className="w-full h-12 pl-11 pr-28 rounded-xl surface-2 border border-soft text-[14px] text-1 placeholder:text-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50"
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-3 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[12.5px] font-medium flex items-center gap-1.5 hover:opacity-90">
            Ask <Kbd>↵</Kbd>
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[11.5px] text-3">Try:</span>
          {suggestions.map((s) => (
            <button key={s} onClick={() => onAsk(s)} className="text-[11.5px] px-2.5 py-1 rounded-full surface-2 hover:surface-3 border border-soft text-2 hover:text-1 transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── User progress strip ──────────────────────────────────────────────────────
function ProgressStrip() {
  const u = HELP.USER;
  const pct = (u.recipesCompleted / u.recipesTotal) * 100;
  return (
    <div className="surface-1 border border-soft rounded-xl p-4 flex items-center gap-4">
      <ProgressRing value={u.recipesCompleted} total={u.recipesTotal} size={48} stroke={4} toneClass="stroke-indigo-500" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-3">You've completed <span className="text-1 font-semibold">{u.recipesCompleted} of {u.recipesTotal}</span> recipes — nice work!</div>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {u.badges.map((b) => (
            <span key={b} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
              <Icon name="award" size={10} />{b}
            </span>
          ))}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[11px] text-3 uppercase tracking-wide">Streak</div>
        <div className="text-[18px] font-semibold text-1 flex items-center gap-1 justify-end">
          <Icon name="flame" size={16} className="text-orange-500" /> {u.streak} days
        </div>
      </div>
    </div>
  );
}

// ── Quick links ──────────────────────────────────────────────────────────────
function QuickLinks({ onAsk }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-3 mb-3">Popular questions</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {HELP.QUICK_LINKS.map((q) => (
          <button
            key={q.label}
            onClick={() => onAsk(q.label)}
            className="flex items-center gap-2.5 p-3 rounded-lg surface-1 border border-soft hover:surface-2 transition-colors text-left"
          >
            <Icon name={q.icon} size={14} className="text-3 shrink-0" />
            <span className="text-[13px] text-2 flex-1 truncate">{q.label}</span>
            <Icon name="arrow-up-right" size={12} className="text-3 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── What's new ───────────────────────────────────────────────────────────────
function WhatsNew() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-3">What's new</div>
        <button className="text-[11.5px] accent-text hover:underline">Changelog →</button>
      </div>
      <div className="space-y-2.5">
        {HELP.WHATS_NEW.map((n) => (
          <div key={n.title} className="surface-1 border border-soft rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10.5px] uppercase tracking-wide text-3">{n.date}</span>
            </div>
            <div className="text-[13px] font-semibold text-1 mb-0.5">{n.title}</div>
            <div className="text-[12px] text-3 leading-relaxed">{n.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Help home ────────────────────────────────────────────────────────────────
function HelpHome({ onPickRecipe }) {
  const inProg = HELP.RECIPES.find(r => r.id === HELP.USER.inProgress.recipeId);
  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mb-6">
        <AskHero onAsk={(q) => alert(`AI ask: ${q}`)} />
        <div className="flex flex-col gap-3">
          <ProgressStrip />
          <ContinueCard recipe={inProg} stepIndex={HELP.USER.inProgress.stepIndex} onResume={onPickRecipe} />
        </div>
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[18px] font-semibold text-1 tracking-tight">What do you want to do?</h2>
          <p className="text-[13px] text-3">Pick a goal — we'll walk you through every step.</p>
        </div>
        <button className="text-[12px] accent-text hover:underline">Browse all recipes →</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {HELP.JOBS.map((job) => <JobCard key={job.id} job={job} onPickRecipe={onPickRecipe} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <QuickLinks onAsk={(q) => alert(`AI ask: ${q}`)} />
        <WhatsNew />
      </div>

      <div className="mt-10 surface-1 border border-soft rounded-xl p-5 flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Icon name="message-circle" size={20} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-1">Stuck on something specific?</div>
          <div className="text-[12.5px] text-3">Our team replies within 2 business hours, Mon–Fri 9am–7pm IST.</div>
        </div>
        <Button variant="outline" icon="message-circle">Chat with us</Button>
        <Button variant="ghost" icon="mail">Email</Button>
      </div>
    </div>
  );
}
