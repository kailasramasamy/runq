# Handoff: Help & Docs Redesign

## Overview

This is a redesigned **/help** module for runQ that replaces a dense, wall-of-text markdown layout with a **friendly learning hub**. The new design prioritizes user engagement and task-based discovery over exhaustive documentation.

**Key improvements:**
- **Job-to-be-done cards** organizing content by user intent (Get paid faster, Pay vendors, Close the month, etc.)
- **AI-powered search** ("Ask runQ") to find help in natural English
- **Progress tracking** with badges and streak gamification
- **Recipe stepper** — step-by-step walkthroughs one at a time, with progress bars and completion celebration
- **Contextual help drawer** — slide-in panel triggered from any page showing relevant recipe inline
- **What's new** changelog snippets and quick-link chips

**Design fidelity:** High-fidelity prototype. Recreate these designs pixel-perfectly using your codebase's existing design tokens, typography, and component library. The bundled HTML files are **design references only** — do not ship them directly.

---

## Architecture & Files

The help module is split into three JSX files under `src/help/`:

```
src/help/
├── data.jsx           ← Mock data: help topics, recipes, user progress, JTBD cards
├── home.jsx           ← Help home page (hero, cards, quick links, what's new)
└── recipe.jsx         ← Recipe stepper + contextual help drawer
```

**Integration points:**
- `src/shell/app.jsx` — Add help route to `ROUTES` object and `RouterView` switch statement
- `src/shell/sidebar.jsx` — Footer button wired to `onNavigate("help")`
- `src/shell/topbar.jsx` — "Help & docs" menu item in the user menu (already present)

---

## Screens & Views

### 1. Help Home Page (`HelpHome`)

**Purpose:** Discovery hub. Users learn what they can do via job cards, resume in-progress recipes, or search.

**Layout:**
- **Top section (2-column on lg+):**
  - Left: "Ask runQ AI" hero card (large, full width on mobile)
    - Greeting with user's first name
    - Search input with left icon (search), right button (Ask + kbd shortcut)
    - 3 suggestion chips below
  - Right: Progress strip + Continue card (stacked, sticky on lg)
    - Circular progress ring (56px) showing recipes completed / total
    - Badges (achievement pills) below
    - Streak counter (flame icon + days)
    - Continue card: play icon, recipe title, current step, progress bar, click to resume

- **JTBD section:**
  - Heading + "Browse all recipes →" link
  - 6-column grid (responsive: 1 mobile, 2 md, 3 lg)
  - Each card is 100% width of column
  - See JobCard spec below

- **Bottom section (2-column on lg):**
  - Left: Popular Questions (2-column grid on md+, each a chip-button)
  - Right: What's New (vertical stack of 3 items)
  - Support card spanning full width at very bottom

**Typography:**
- Hero heading: 22px–28px (responsive), semibold, tight tracking
- Hero subtitle: 13.5px, text-3
- JTBD card title: 15px, semibold, text-1, underline on hover
- JTBD card desc: 13px, text-3, leading-relaxed
- Progress strip: "7 of 14" is semibold text-1
- All caps labels: 11–12px, tracking-wide, uppercase, text-3

**Colors:**
- Hero bg: gradient surface (indigo-500/8 → violet-500/4)
- Hero border: indigo-500/20
- JTBD cards: each has a unique tone (emerald, blue, violet, amber, rose, indigo)
  - Tone includes: ring color (stroke), bg tint (500/8), icon color, chip bg/text
- Progress ring: indigo-500 (stroke)
- Continue card progress: indigo-500 → violet-500 (gradient)
- Badges: amber-500/10 bg, amber-700 dark:amber-300 text
- Support card: emerald-500/10 bg, emerald-600 dark:emerald-400 text/icon

**Spacing:**
- Hero + right column: gap-5, grid layout
- JTBD grid: gap-4
- Bottom section: gap-6
- Internal card padding: p-4 to p-8 (responsive)
- All section spacing: mb-6 to mb-8

**Interactions:**
- Hero form: Enter key submits, calls `onAsk(q)`
- Suggestion chips: click → `onAsk(chipText)`
- JTBD card: click → opens recipe stepper, calls `onPickRecipe(recipeId)`
- Continue card: click → opens recipe at `stepIndex`, calls `onResume(recipeId, stepIndex)`
- Popular question chips: click → `onAsk(question)`
- "Browse all recipes" link: navigates to recipes list (future feature)
- "Changelog" link: opens changelog modal/page (future)

**Mobile responsiveness:**
- Hero card stacks on mobile (Ask hero full width, right column moves below)
- JTBD grid: 1 column mobile, 2 md, 3 lg
- Bottom section: 1 column mobile, 2 lg
- Support card remains full width

---

### 2. Recipe Stepper (`RecipeStepper`)

**Purpose:** Step-by-step walkthrough of a task. One step visible at a time, with progress tracking.

**Layout (desktop, 2-column on lg):**
- **Left sidebar (260px, sticky on lg):**
  - Recipe info card (p-4):
    - Difficulty pill (Easy / Medium / Hard, color-coded)
    - Duration (clock icon + minutes)
    - Title (15px, semibold)
    - Summary (12.5px, text-3, leading-relaxed)
  - Step nav card (p-3):
    - "Steps" label (11px, uppercase, tracking-wide, text-3)
    - Ordered list of step titles with circular step numbers (5px, semibold)
    - Done steps: emerald-500 circle, white check, line-through text, opacity-70
    - Current step: indigo-500 circle, white number, bold text, light indigo bg
    - Future steps: surface-2 circle, text-3 number, border border-soft
    - All clickable to jump to that step

- **Right content area:**
  - Rounded card with rounded-2xl
  - **Top: progress bar (h-1, full width)**
    - Dark background (surface-2)
    - Colored fill: `from-indigo-500 to-violet-500`, width animated to % complete
  - **Body (p-6 lg:p-8):**
    - Step counter: "Step 3 of 5" (11.5px, uppercase, accent-text, font-semibold)
    - % complete: "60% complete" (11.5px, text-3, right-aligned)
    - Step title: h2, 22px, semibold, text-1, tracking-tight, mb-3
    - Step body: markdown-rendered text with **bold** support
    - Screenshot slot (if step has screenshot):
      - Rounded-lg, surface-2 border (dashed), border-soft, p-10
      - Centered flex, image icon (28px, opacity-50), label "Screenshot — {name}"
  - **Bottom: nav bar (border-t, px-6 py-4)**
    - Left: Previous button (disabled if step 0)
    - Center: Step progress dots (h-1.5, current = w-6 indigo, done = emerald, future = zinc)
    - Right: Next / Mark complete button

**Typography:**
- Step counter: 11.5px, uppercase, tracking-wider, accent-text, semibold
- Step title: 22px, semibold, text-1, tracking-tight
- Step body: 15px, text-2, leading-relaxed
- Difficulty pill: 10.5px (Easy: emerald, Medium: amber, Hard: rose)
- Duration: 11.5px, text-3, flex with clock icon

**Colors:**
- Difficulty pills: Easy (emerald-500/10, emerald-700), Medium (amber-500/10, amber-700), Hard (rose-500/10, rose-700)
- Progress bar: gradient from-indigo-500 to-violet-500
- Step nav numbers: Done (emerald-500, white text), Current (indigo-500, white text), Future (surface-2, text-3, border border-soft)
- Current step row: bg-indigo-500/10

**Spacing:**
- Left sidebar: lg:sticky lg:top-4 self-start
- Grid gap: gap-6
- Card padding: p-4 recipe info, p-3 nav
- Body: p-6 mobile, p-8 lg
- Nav bar: px-6 py-4
- Step title mb: mb-3

**Interactions:**
- Step nav: click a step number → `setIdx(i)` (jump to that step)
- Previous button: click → `setIdx(idx - 1)` (disabled if idx === 0)
- Next button: click → `setIdx(idx + 1)`
- Mark complete button (final step): click → `setDone(true)`, shows completion screen
- Nav dots: visual only, show progress
- Back link (top left): click → `onBackHome()`

**States:**
- Loading: not shown in this version; can be added to buttons with `loading` prop
- Completion: when `done === true`, entire stepper is replaced with `CompletionCard`

---

### 3. Completion Card (`CompletionCard`)

**Purpose:** Celebration screen after finishing a recipe.

**Layout:**
- Centered, full-height view
- **Vertical stack:**
  - Large green check icon (40px, white, in emerald circle 80px, shadow-lg)
  - Label: "Recipe complete" (11px, uppercase, tracking-wider, emerald-600 dark:emerald-400)
  - Heading: "Nicely done!" (24px, semibold, text-1, tracking-tight)
  - Body: "You've finished {recipe.title} in about {minutes} minutes. Your streak is still going strong." (14px, text-3, max-w-md)
  - Button group: Back to help (outline) | Next recipe (primary) — center-aligned
  - Badge earned: inline-flex, gap-1.5, px-3 py-1.5, rounded-full, amber-500/10 bg, amber-700 text, border amber-500/20, "+1 badge: {topic} pro"

**Colors:**
- Check icon: white
- Circle bg: emerald-500/to-emerald-600 gradient
- Label: emerald-600 dark:emerald-400
- Heading: text-1
- Body: text-3
- Badge: amber-500/10, amber-700 dark:amber-300, border amber-500/20

**Interactions:**
- Back to help: click → `onBackHome()` (navigate to help home)
- Next recipe: click → load next recipe in same job, call `window.__helpSetRecipe?.(nextRecipe.id, 0)`

---

### 4. Job-to-be-Done Card (`JobCard`)

**Purpose:** Entry point to a thematic group of recipes. Shows progress via circular ring.

**Layout:**
- Text left, progress ring right
- **Header (flex items-start justify-between):**
  - Left: Icon in rounded square (h-10 w-10, tone-colored bg, tone-colored icon)
  - Right: Progress ring (SVG, size=56, stroke=4)
- **Title:** 15px, semibold, text-1, group-hover:underline decoration-2 underline-offset-4, mb-1
- **Description:** 13px, text-3, leading-relaxed, mb-4
- **Footer (flex items-center justify-between):**
  - Left: "{completed}/{total} recipes" (12px, text-3)
  - Right: "Start →" (12px, text-2 group-hover:text-1, flex gap-1 items-center, arrow-right icon 12px)

**Colors (6 tones, one per job):**
- Emerald: ring stroke-emerald-500, bg emerald-500/8, icon text-emerald-600 dark:emerald-400, glow bg-emerald-500/8
- Blue: ring stroke-blue-500, bg blue-500/8, icon text-blue-600 dark:blue-400, glow bg-blue-500/8
- Violet: ring stroke-violet-500, bg violet-500/8, icon text-violet-600 dark:violet-400, glow bg-violet-500/8
- Amber: ring stroke-amber-500, bg amber-500/8, icon text-amber-600 dark:amber-400, glow bg-amber-500/8
- Rose: ring stroke-rose-500, bg rose-500/8, icon text-rose-600 dark:rose-400, glow bg-rose-500/8
- Indigo: ring stroke-indigo-500, bg indigo-500/8, icon text-indigo-600 dark:indigo-400, glow bg-indigo-500/8

**Progress ring (SVG):**
- Circular progress indicator
- Background ring: stroke-current text-zinc-200 dark:text-zinc-800
- Foreground ring: tone-colored, stroked with `stroke-linecap="round"`, `stroke-dasharray` animated
- Center text: 12px, semibold, text-1, shows "{pct}%"
- Size: 56px, stroke: 4px (customizable)

**Spacing:**
- Card padding: p-5
- Icon+ring mb: mb-3
- Title mb: mb-1
- Description mb: mb-4
- Footer spacing: justify-between

**Interactions:**
- Card click: navigate to first recipe in this job, call `onPickRecipe(recipes[0].id)`
- Hover: slight shadow lift, -translate-y-0.5 (visual feedback)

---

### 5. Contextual Help Drawer (`HelpDrawer`)

**Purpose:** Slide-in panel from right edge, shows one recipe inline without leaving the current page. Triggered by `window.__openHelpDrawer(recipeId)`.

**Layout (fixed right sidebar):**
- Position: fixed inset-0 z-60
- Backdrop: black/40, backdrop-blur-sm, click to close
- Panel: absolute right-0 top-0 bottom-0, max-w-md, surface-1 border-l border-soft, shadow-2xl, flex flex-col

- **Header (flex items-center gap-2, px-5 py-4, border-b):**
  - Icon: book-open (16px, accent-text)
  - Label: "Quick help" (11.5px, uppercase, tracking-wide, accent-text, semibold)
  - Spacer: flex-1
  - Close button: 8px circle, hover:surface-2, X icon (16px, text-3 hover:text-1)

- **Recipe info (px-5 py-4, border-b):**
  - Difficulty pill + duration (same styling as stepper sidebar)
  - Title: 16px, semibold, text-1, leading-snug
  - Summary: 12.5px, text-3
  - Progress bar: h-1, rounded-full, surface-2 bg, animated fill

- **Step body (flex-1 overflow-y-auto, px-5 py-5):**
  - Step counter: 11px, uppercase, tracking-wider, accent-text, mb-2
  - Step title: 18px, semibold, text-1, tracking-tight, mb-3
  - StepBody component (same as stepper)

- **Nav bar (border-t, px-5 py-3, flex gap-2):**
  - Back button (sm, outline, disabled if stepIdx === 0)
  - Spacer: flex-1
  - Next button (if not final step) or Got it button (if final step)

- **Footer (border-t, px-5 py-3, flex items-center justify-between, text-12px):**
  - Left: "Close" link (text-3 hover:text-1)
  - Right: "Open full guide →" link (accent-text, hover:underline, arrow-up-right icon 11px)

**Spacing:**
- Max width: max-w-md (480px)
- Gap between buttons: gap-2
- All sections px-5 (20px horizontal padding)

**Interactions:**
- Backdrop click: `setOpen(false)`
- Escape key: `setOpen(false)`
- Close button: `setOpen(false)`
- Back/Next buttons: step navigation
- Got it button (final step): `setOpen(false)`
- Open full guide: navigate to full recipe stepper (future)

**State management:**
- `open` (bool): drawer visibility
- `recipeId` (string): current recipe being shown
- `stepIdx` (number): current step index
- Window hooks: `window.__openHelpDrawer = (id) => setOpen(true), setRecipeId(id), setStepIdx(0)`

---

## Interactions & Behavior

### Navigation Flow

```
Help Home
├─→ Click JTBD card → Recipe Stepper (step 0)
├─→ Click Continue card → Recipe Stepper (saved stepIdx)
├─→ Click Next recipe (on completion) → Recipe Stepper (next recipe, step 0)
└─→ Anywhere: window.__openHelpDrawer(recipeId) → Contextual drawer

Recipe Stepper
├─→ Back to help → Help Home
├─→ Next step → increment idx
├─→ Previous step → decrement idx (disabled at step 0)
├─→ Jump to step (click nav) → set idx
└─→ Mark complete (final step) → Completion Card

Completion Card
├─→ Back to help → Help Home
└─→ Next recipe → Recipe Stepper (next recipe, step 0)

Contextual Drawer
├─→ Back step / Next step → step navigation
├─→ Got it (final step) → close drawer
└─→ Open full guide → navigate to Recipe Stepper (full page)
```

### Animations & Transitions

- **Progress bar:** smooth fill, `transition-all duration-500`
- **Card hover:** slight shadow + lift, `hover:shadow-md hover:-translate-y-0.5 transition-all`
- **Step nav:** highlight current, `bg-indigo-500/10 transition-colors`
- **Drawer:** backdrop blur + slide from right (position fixed, natural slide)
- **Completion screen:** fade in check icon (no explicit animation coded, but use scale-in or fade-in in implementation)

### State Transitions

- Help Home → Recipe Stepper: trigger `onPickRecipe(recipeId, stepIdx?)` or `window.__helpSetRecipe(recipeId, stepIdx)`
- Recipe Stepper → Help Home: click back link, calls `onBackHome()`
- Recipe Stepper → Completion: click "Mark complete" on final step, sets `done = true`, stepper re-renders with CompletionCard
- Completion → Help Home: click "Back to help"
- Completion → Next Recipe: click "Next recipe", calls `window.__helpSetRecipe(nextRecipeId, 0)`
- Any page → Contextual Drawer: call `window.__openHelpDrawer(recipeId)`, drawer opens at step 0

---

## Data Model

### Help User (progress tracking)

```javascript
{
  name: "Vaidehi",
  recipesCompleted: 7,       // out of recipesTotal
  recipesTotal: 14,
  badges: ["First invoice", "First reconciliation", "GST-ready"],
  streak: 4,                 // days
  inProgress: {
    recipeId: "rec_pay_vendor",
    stepIndex: 1             // resume here
  }
}
```

### JTBD Job Card

```javascript
{
  id: "get_paid",
  title: "Get paid faster",
  description: "Send invoices, chase overdue customers, and reconcile receipts.",
  icon: "trending-up",
  accent: "emerald",         // one of: emerald, blue, violet, amber, rose, indigo
  recipes: ["rec_create_invoice", "rec_record_payment", "rec_view_aging", "rec_dunning"]
}
```

### Recipe (step-by-step task)

```javascript
{
  id: "rec_create_invoice",
  jobId: "get_paid",         // which JTBD card this belongs to
  title: "Create your first invoice",
  summary: "Issue a tax invoice from a sales order or scratch.",
  minutes: 4,
  difficulty: "Easy",        // Easy, Medium, Hard
  completed: false,          // user's progress
  steps: [
    {
      title: "Open the Invoices module",
      body: "From the sidebar, go to **Money in → Invoices**. Click **New invoice** in the top right.",
      screenshot: "invoice_new"  // optional; correlates to a screenshot asset
    },
    // ... more steps
  ]
}
```

### Help Topic / Quick Link

```javascript
{
  label: "How do I issue a credit note?",
  icon: "file-minus"
}
```

### What's New (changelog)

```javascript
{
  date: "May 4, 2026",
  title: "Pay runs are 3x faster",
  body: "Bulk approval and parallel posting cut a 50-bill run from 4 minutes to under 90 seconds."
}
```

---

## Design Tokens

### Colors

**Neutral:**
- text-1: oklch(0.13 0 0) [dark text on light bg]
- text-2: oklch(0.3 0 0) [secondary text]
- text-3: oklch(0.55 0 0) [tertiary text, muted]
- surface-1: oklch(0.98 0 0) [primary bg, light]
- surface-2: oklch(0.93 0 0) [secondary bg, hover state]
- surface-3: oklch(0.88 0 0) [tertiary bg, pressed state]
- border-soft: oklch(0.88 0 0) / 0.5 alpha

**Dark mode (same tokens, inverted):**
- text-1: oklch(0.95 0 0) [light text on dark bg]
- text-2: oklch(0.75 0 0)
- text-3: oklch(0.5 0 0)
- surface-1: oklch(0.15 0 0)
- surface-2: oklch(0.22 0 0)
- surface-3: oklch(0.28 0 0)

**Accent tones (6 jobs):**
- Emerald: oklch(0.55 0.15 160) light, oklch(0.7 0.16 160) dark
- Blue: oklch(0.55 0.2 240) light, oklch(0.72 0.18 240) dark
- Violet: oklch(0.55 0.22 305) light, oklch(0.72 0.18 305) dark
- Amber: oklch(0.6 0.18 50) light, oklch(0.75 0.16 50) dark
- Rose: oklch(0.6 0.2 12) light, oklch(0.72 0.18 12) dark
- Indigo: oklch(0.55 0.2 268) light, oklch(0.72 0.18 268) dark

### Typography

- **Hero heading:** 28px on lg, 22px mobile, semibold, letter-spacing: -0.02em
- **Section heading:** 18px, semibold, tracking-tight
- **Card title:** 15px, semibold
- **Body text:** 14–15px, text-2, leading-relaxed
- **Secondary text:** 13px, text-3
- **Labels / small caps:** 11–12px, uppercase, tracking-wide, text-3
- **Font family:** system-ui, -apple-system, sans-serif (inherit from codebase)

### Spacing Scale

```
2px = 0.125rem
4px = 0.25rem
6px = 0.375rem
8px = 0.5rem
12px = 0.75rem
16px = 1rem
20px = 1.25rem
24px = 1.5rem
32px = 2rem
40px = 2.5rem
48px = 3rem
64px = 4rem
```

- **Padding inside cards:** p-3 to p-8 (depends on card size)
- **Gap between sections:** gap-4 to gap-6
- **Margin below headings:** mb-1 to mb-4

### Border Radius

- **Cards:** rounded-lg (0.5rem), rounded-xl (0.75rem), rounded-2xl (1rem)
- **Icons in cards:** rounded-md (0.375rem)
- **Buttons:** rounded-md (0.375rem)
- **Progress bars:** rounded-full (9999px)

### Shadows

- **Card default:** no shadow
- **Card hover:** shadow-md (0 4px 6px rgba(0,0,0,0.1))
- **Drawer:** shadow-2xl (0 25px 50px rgba(0,0,0,0.25))
- **Completion icon:** shadow-lg (0 10px 15px rgba(0,0,0,0.1))

---

## Assets

### Icons (Lucide)

Used throughout:
- `sparkles` — AI / magic (Ask runQ)
- `search` — search input
- `trending-up` — Get paid faster
- `send` — Pay vendors
- `check-circle-2` — Close the month
- `settings-2` — Set up runQ
- `file-output` — Hand off to CA
- `repeat` — Automate
- `life-buoy` — Help & docs
- `book-open` — Quick help drawer
- `play` — Continue/resume
- `arrow-right`, `arrow-left`, `arrow-up-right` — Navigation
- `check` — Done, completion
- `flame` — Streak
- `award` — Badges
- `clock` — Duration
- `bell` — Notifications
- `image` — Screenshot placeholder
- `users`, `mail`, `message-circle` — Support
- All others used in sidebars, menus, etc.

**Note:** Ensure your codebase's icon library is configured similarly. If using a different icon set, map these names accordingly.

### Screenshots

Each recipe step can have an optional `screenshot` field (e.g., `"invoice_new"`). These are **placeholder** in the current design; implement by:
1. **Option A:** Generate/capture actual screenshots of your final UI implementation and link them
2. **Option B:** Create simple placeholder SVGs (icon + label) as shown in the prototype
3. **Option C:** Store in a screenshots folder and reference by slug

For now, the prototype shows a placeholder slot (rounded box with image icon).

---

## Implementation Guide

### Step 1: Set up routing

In `src/routes/help/` (or equivalent in your codebase), add:
- **GET /help** → `HelpHome` component
- **GET /help/{recipeId}** → `RecipeStepper` component (parse URL param)

Or, if using a single-page app structure (like runQ), implement routing via state management as shown in the prototype (`active === "help"`, `window.__helpSetRecipe`, etc.).

### Step 2: Create data layer

Move `HELP` data from `src/help/data.jsx` to your backend API or CMS:
- Fetch `HELP.JOBS`, `HELP.RECIPES`, `HELP.WHATS_NEW` from an endpoint
- Consider: should recipes be markdown, rich text, or structured data?
- Store user progress (`HELP.USER`) in your user service / auth context

### Step 3: Implement components

Build each component in your codebase, reusing your existing:
- Button component (ensure it supports `variant`, `size`, `icon`, `disabled`, `loading`)
- Input component
- Icon wrapper (these designs assume a Lucide-like interface; `<Icon name="..." />`)
- Modal / drawer container (if not already present)

**Key considerations:**
- Use your codebase's existing typography system, not hardcoded pixel sizes
- Reference design tokens (colors, spacing) via CSS variables or theme tokens
- Ensure responsive behavior matches your breakpoints (mobile / sm / md / lg / xl)

### Step 4: Wire interactions

- **Help Home:** Handle clicks on JTBD cards, Continue card, popular questions → navigation
- **Recipe Stepper:** Implement step navigation, progress calculation, completion detection
- **Contextual Drawer:** Set up `window.__openHelpDrawer` hook so any page can trigger it
- **Progress tracking:** Save user progress (completed recipes, streak, badges) to your user service

### Step 5: Polish & test

- Test on mobile, tablet, desktop
- Test light & dark themes
- Test accessibility: keyboard navigation (Tab, Enter, Escape), screen reader labels
- Add loading states (skeleton or spinner while fetching data)
- Add error states (no recipes found, offline, etc.)

---

## Future Enhancements (Out of Scope)

- **AI Ask integration:** Currently shows a search input; hook it up to an actual LLM endpoint
- **Screenshot generation:** Auto-generate recipe screenshots from your UI via Playwright or similar
- **Video walkthroughs:** Embed videos alongside step text
- **Quiz / validation:** After finishing a recipe, quiz the user to confirm they learned
- **Offline support:** Cache recipes locally for offline browsing
- **Localization:** Translate recipes and UI to other languages
- **Analytics:** Track which recipes are most useful, which steps users skip, etc.
- **Contextual help from app:** Auto-launch relevant recipe drawer when user gets stuck (via heuristics or explicit "help" buttons)
- **Recipe authoring interface:** Let content team edit recipes in-app without code changes

---

## Files in This Bundle

```
design_handoff_help_docs/
├── README.md                           ← You are here
├── runQ Admin.html                     ← Full prototype (open in browser)
├── tweaks-panel.jsx                    ← Tweaks panel component (for styling/theme switching)
├── src/
│   ├── help/
│   │   ├── data.jsx                    ← Mock data: HELP object, recipes, user progress
│   │   ├── home.jsx                    ← Help home page component
│   │   └── recipe.jsx                  ← Recipe stepper + contextual drawer
│   ├── shared/
│   │   ├── icons.jsx                   ← Icon wrapper
│   │   ├── primitives.jsx              ← Card, Avatar, Sparkline, etc.
│   │   ├── ar-primitives.jsx           ← Button, Input, Badge, PageHeader (reusable)
│   │   └── data.jsx                    ← Dashboard mock data (referenced by shell)
│   ├── shell/
│   │   ├── app.jsx                     ← Main app, routing logic
│   │   ├── sidebar.jsx                 ← Sidebar navigation (Help button in footer)
│   │   └── topbar.jsx                  ← Top bar (Help & docs menu item)
│   └── dashboard/
│       └── *.jsx                       ← Dashboard components (not needed for help, but bundled)
└── assets/
    └── runq-*.png                      ← runQ logos
```

**To view the prototype:**
```bash
# Open in browser
open runQ Admin.html
# or
python3 -m http.server 8000  # then visit localhost:8000/runQ\ Admin.html
```

**To integrate:**
1. Copy `src/help/` into your project
2. Adapt `data.jsx` to your API / data structure
3. Rewrite components using your design system
4. Wire up routing and state management
5. Test, iterate, launch!

---

## Questions & Support

- **Design questions:** Refer to the Screens & Views section above for detailed specs
- **Component API:** See `src/help/home.jsx` and `src/help/recipe.jsx` for how components are composed
- **Styling:** All classes are Tailwind CSS; adapt to your utility library or CSS-in-JS approach
- **Icons:** Lucide v0.544; map to your icon set if different

Good luck! 🚀
