# Handoff: runQ Marketing Site (Homepage)

## Overview
Marketing homepage for **runQ** — a mobile-first finance & accounting SaaS for Indian SMEs (made by Quartex Technologies, Bangalore). Domain: `runq.in`. The page is the front door for two audiences: Indian SME owners considering a switch from Tally/Zoho/Vyapar, and Chartered Accountants who manage 10–100 client books.

The visual identity is **light page, dark product mockups** (à la Linear / Vercel / Stripe). The hero, pillars, mobile band, CA section, and comparison table are light; the product showcase, AI band, final CTA, and footer are dark — that contrast is the brand's primary visual move.

## About the Design Files
The files in this bundle (`runQ Landing.html` + `parts/*.jsx`) are **design references created in HTML** — a high-fidelity prototype showing intended look and behavior. They are **not production code to copy directly.**

The task is to **recreate this design in the runQ web codebase** (React 19 + TanStack Router + Tailwind 4 — see `web/package.json` from the source repo). The site is currently a logged-in product app; the marketing pages should live alongside it (e.g. `web/src/routes/(marketing)/index.tsx` or as a separate Vite app under `apps/marketing/`). Reuse the existing brand tokens already defined in `web/src/app.css` (`--color-primary-*` oklch ramp). The prototype's inline Tailwind config mirrors those tokens 1:1.

## Fidelity
**High-fidelity (hifi).** Pixel-perfect mockups with final colors, typography, spacing, copy, mockup data, and interactions. The developer should recreate the UI pixel-perfectly using:

- The existing `--color-primary-*` ramp from `web/src/app.css` (mapped here as `brand-50` … `brand-950`)
- Inter (already in the codebase) + Instrument Serif (new — load via Google Fonts)
- The same lucide-react icon set the product uses (the prototype inlines lucide-style SVGs because lucide-react isn't loaded; in the real app, just import from `lucide-react`)

## Page Structure (top → bottom)

### 1. Sticky Nav (`Nav` in `parts/sections.jsx`)
- Light, transparent at top, becomes white-blurred with bottom border once `scrollY > 8`
- Left: `runq-dark.png` logo (h-6) + "Finance" badge (border `brand-500/40`, uppercase 10px, tracking-wider)
- Center: links — Features · Mobile · For CAs · Pricing · About (anchor links to section IDs)
- Right: "Sign in" ghost link + "Get started free" pill button (zinc-900 bg, white text, arrow icon)
- Mobile: hamburger that opens a vertical drawer
- Height: 56px (`h-14`)
- Container: `max-w-[1200px]` with `px-5 lg:px-8`

### 2. Hero (`Hero`)
- Background: white, with a soft aurora gradient (two oklch radial blurs, top-left blue-violet, top-right magenta) and a faded grid overlay masked into a center radial fade
- **Eyebrow pill:** "Now in early access — free forever plan · No credit card" with a pulsing emerald dot (CSS `pulse-dot` keyframes)
- **H1:** Two lines, `clamp(2.4rem, 6.4vw, 5.2rem)`, tracking-tight, balanced
  - Line 1: "Modern books for" — Inter semibold, zinc-900
  - Line 2: "modern Indian businesses." — Instrument Serif italic, gradient text (`grad-text`: blue → violet → magenta oklch stops)
- **Subhead:** "GST invoicing, bank reconciliation, AI bill capture — all in one mobile-first platform that owners actually open and CAs love at month-end." — zinc-600, max-w-2xl, text-pretty
- **CTAs:** "Get started free" (zinc-900 bg, shadow) + "See how it works" (white/80 bg, border, play-icon)
- **Trust strip:** 4 items with brand-500 lucide icons — GST-ready · 100% mobile · AI-first · CA-friendly
- **Hero mockup:** full dashboard, see §10. Wrapped in a 2px white-zinc bezel, soft brand-tint glow underneath
- **Logo strip below:** "Built for Indian SMEs from" + city names (Bengaluru, Mumbai, Delhi NCR, Chennai, Pune, Ahmedabad, Hyderabad) — uppercase 11px tracking-[0.18em] zinc-400/500

### 3. Why runQ — Four Pillars (`Pillars`)
- Section eyebrow "Why runQ", H2 "Four things we got *obsessively* right." (italic display word in gradient)
- **Bento grid 12-col:** 7-5 / 5-7 layout (stacks to 12-col on mobile)
- Each card: `rounded-2xl border border-zinc-200 bg-white p-7`, hover-lift (-2px translate)
- Per-card accent (label dot + uppercase tag in tracking-wider semibold):
  1. **Owner-friendly** — blue-600 — "Your books in *plain English*. Decisions in two taps." Visual: mini cash card showing ₹84,62,418 cash, +12.4% delta pill, in/out split (₹2.34Cr in, ₹62.8L out), AI insight callout in brand-50 background
  2. **CA-friendly** — emerald-600 — "*Loved* at month-end." Visual: multi-client switcher dropdown — active client (Bharat Polymers) shown above, list below (Sundar Steels / Kirti Enterprises / Reliance Foam) each with status pill in respective accent color
  3. **AI automation** — violet-600 — "Snap a bill. Get the *extracted entry*." Visual: 2-col split — left is a faux thermal receipt (font-mono, amber/orange gradient bg), right is the EXTRACTED card (violet-50 bg, 8 fields with green checks, "2.4s · 99.2% conf" badge)
  4. **Mobile-first** — amber-600 — "Real native apps. *Built for thumbs*, not laptops." Visual: tilted phone (rotate -6deg) bottom-right showing the cash dashboard screen, plus 4 tag chips (Offline drafts, Biometric unlock, Voice → invoice, Push approvals)

### 4. Product Showcase — Tabbed (`Showcase`)
- **Dark, full-bleed.** zinc-950 bg, dot-grid overlay (1px circles, 26px spacing, 7% white), aurora gradient
- Eyebrow "The product", H2 "One platform. / *Every finance moment.*"
- **Pill tabs** (4): GST Invoice · Bank Recon · GSTR-2B Match · AI Assistant — active state has brand-500/40 border, brand-500/10 bg, brand-100 text, oklch-shadowed glow `shadow-[0_0_30px_-5px_oklch(0.59_0.20_264_/_0.4)]`
- Tab swap is React `useState`-driven, instant remount of the mockup (key on `active`); the bar-rise animations on charts re-fire on each switch
- Below the tabs is a 1-line description that swaps with the tab
- Mockup wrapped in `WindowChrome` (traffic lights + URL bar `app.runq.in/{tab}` + a square right-cap), `mockup-shadow` (deep purple-tinged), height 580px

### 5. Mobile Band (`MobileBand`)
- Light, white bg
- 12-col split — 7 cols phones, 5 cols copy
- **Phones:** three iPhone-style frames with notch (88×20px black rounded pill), status bar (9:41, signal, wifi, battery), `phone-bezel` gradient outer, `rounded-[42px]` outer + `rounded-[34px]` inner, deep mockup-shadow
  - Left phone (rotate -8deg): cash dashboard — gradient `from-zinc-900 to-brand-900` cash card, 4 quick-action tiles, today's events list
  - Center phone (z-2, no rotate): quick invoice — 3-step flow on item 3 of 4, customer card (Bharat Polymers, GSTIN), 3 line items, totals, "Generate IRN & Send" CTA
  - Right phone (rotate +8deg): scan bill — camera viewfinder with corner brackets, AI-extracting badge, faux receipt overlay (rotate +3deg), then a results sheet sliding up showing the extracted fields
- **Right column:** eyebrow "Mobile-first, not mobile-also" (amber-600), H2 "Real apps for *owners on the move.*", 6 wins in 2-col grid (Plus, Camera, CheckCircle, Bell, Cloud, Fingerprint icons in amber-50/600), App Store + Google Play badges (zinc-900 pills with logo + small/large copy stack)

### 6. AI Band (`AIBand`)
- **Dark, full-bleed.** Aurora + dot-grid + a giant "₹" watermark in Instrument Serif at 28rem, opacity 2.5%, top-right
- Eyebrow "AI automation" (brand-300), H2 "The accountant / *that never sleeps.*" (italic in light gradient)
- **4 cards:** OCR bill capture · Auto bank matching · Smart categorization · Payment reminders — zinc-900/40 backdrop-blur, brand-tinted icon (brand-300 in a brand-400/20 → brand-700/20 gradient square ring brand-400/20), copy in zinc-400, "0N / 04" mono counter at bottom, top edge gradient line
- **Big stat callout below:** rounded-3xl, brand-950/40 → zinc gradient, "Average finance team / saves 6+ hours/week / on bookkeeping, recon, and bill entry." with 3 secondary stats on right (90%+ auto-matched, 2.4s avg OCR, 22s fastest invoice)

### 7. For CAs (`ForCAs`)
- **Light grey** (`ca-bg`: radial brand-tint + #fafafa)
- 12-col, 5/7 split. Left col **sticky** (`lg:sticky lg:top-24`)
- **Left:** eyebrow "For Chartered Accountants" (emerald-700), H2 "Built *with* CAs, / not *around* them.", paragraph about "80+ interviews with practising CAs in Bengaluru, Mumbai and Coimbatore", testimonial card (white, rounded-2xl, brand-500 sparkle, large brand-700 italic display quote marks, "CA Priya Subramanian, Partner, Subramanian & Co · Bengaluru · 14 years practice")
- **Right:** 2×2 grid of feature cards (Multi-client switcher, Tally-compatible export, Read-only CA portal, GSTR-ready bundles) + a workflow strip below showing 5 numbered steps with dashed connectors (Pull all 2B → Reconcile bills → Approve 1B/3B → Tally export → Done 🎉)

### 8. Comparison Table (`CompareTable`)
- Light. Eyebrow "vs the rest", H2 "We're *honest* about the tradeoffs." (italic gradient on "honest")
- Subhead: "Tally has 30 years and an army of CAs. Zoho has reach. Vyapar is cheap. Here's where we win, lose, and tie."
- Table inside a rounded-2xl bordered card, shadow-sm
- Column header for runQ: brand-50/60 bg, brand-700 text, has the brand-500 "Q" badge inline
- runQ column highlighted with `bg-brand-50/60` on every cell; checks are brand-600 in that column, emerald-500 elsewhere
- 10 rows: Pricing, Native mobile apps, AI bill OCR, AI bank matching, GSTR-2B reconciliation, e-Invoice & e-Way bill, CA read-only portal, Tally-compatible export, Setup time, Multi-device sync
- Cells render as: `<CheckCircle>` for `true`, dim `<X>` for `false`, plain text for strings ("partial" cells in amber-600)
- Footnote: "Pricing as published by competitors at the time of writing."

### 9. Final CTA (`FinalCTA`)
- **Dark, full-bleed.** Aurora + dot-grid
- H2 "Run your business, / *not your books.*" — `clamp` to 7xl, italic gradient on second line
- Subhead about free forever + Pro at ₹599/mo
- Two CTAs: "Get started free" (white bg, zinc-900 text, brand-tinted shadow) + "See pricing" (zinc-700 border outline)
- Trust pill row: Free forever plan · Setup in 10 minutes · Cancel anytime · India-based support — brand-400 lucide icons

### 10. Footer (`Footer`)
- Dark, top edge has a `via-brand-500/40` gradient hairline
- 12-col grid: 4 cols brand block (logo light + Finance badge + tagline + 3 social icons), 8 cols of 4 link columns (Product / For / Company / Legal)
- Bottom row: "© 2026 Quartex Technologies Pvt Ltd · runq.in" left, "Made with ♥ in Bangalore, India" right (rose-400 heart)

## Mockups (in `parts/mockups.jsx`)

All mockups are dark UI screenshots-as-HTML, sharing a common visual language:
- `MockSidebar` — zinc-950 bg with thin zinc-800 right border, 8 nav items, brand-500 Q logo at top + Finance badge. Has a `dense` (collapsed) variant for the showcase tabs that aren't dashboard
- `WindowChrome` — traffic-light dots (red/amber/emerald, 2.5px), centered URL bar with lock icon and font-mono URL, square right-cap
- All charts use **bar-rise** keyframe (scaleY 0.05 → 1, 1.1s cubic-bezier(.2,.8,.2,1)), staggered by index
- Indian rupee throughout (lakhs/crores compact via `inr()`), real GSTINs (29ABCDE1234F1Z5 etc.), HSN codes (39012000 HDPE, 39201019 LDPE, etc.), Indian customer names (Bharat Polymers, Sundar Steels & Alloys, Kirti Enterprises, Reliance Foam Industries, Prime Textile Coimbatore, Mahindra Logistics)

### DashboardMockup (hero)
Layout: sidebar + topbar (date "Saturday, 4 May 2026 · FY 2026–27", greeting "Good morning, Ananya", search ⌘K, +new invoice, AS avatar) + 12-col body grid:
- 4 stat tiles (col-span-3 each): Cash Position ₹84.6L, Receivable ₹2.34Cr, Payable ₹62.8L, GST Output ₹14.2L. Each has label + big tabular value + delta + tiny SVG sparkline
- Recent activity (col-span-7): 5 rows with type-colored icon square (emerald/amber/blue/violet bg-tint), invoice number in mono, customer subtitle, amount right-aligned, "Live · HDFC + ICICI" header
- AR Aging (col-span-5): 5 bars (Current ₹142L / 1–30 ₹58L / 31–60 ₹22L / 61–90 ₹9L / 90+ ₹3L), each with its own oklch hue (emerald → blue → brand → amber → rose)

### InvoiceMockup
Sidebar dense + breadcrumb (Receivable / Invoices / New invoice) + 7/5 split:
- Left: customer card (Bharat Polymers + GSTIN + VERIFIED pill), then 12-col line-item table (5 Item/HSN, 2 Qty, 2 Rate, 1 GST, 2 Amount), 3 items, "Add line" footer
- Right: totals card (Subtotal ₹2,70,650 → CGST 9% ₹24,358.50 → SGST 9% ₹24,358.50 → Total ₹3,19,367.00 → spelled out), green "e-Invoice ready" with IRN + Ack No, brand "Auto-suggested" panel, "Drafted in 22 seconds · ⌘↵"

### BankReconMockup
HDFC Current ····4521. 4 stat tiles (Auto-matched 142/156, Suggested 8 92% avg conf, Needs review 6 ~3 min, Closing balance ₹84.6L). Match progress bar (91%, gradient emerald → brand). 8 transactions — date, narration in mono, signed amount, status badge with confidence % (emerald >=95, brand >=85, amber otherwise), unmatched ones get a "REVIEW" amber pill.

### GSTR2BMockup
April 2026 reconciliation. 4 stats (184 total, 161 matched 87.5%, 14 mismatches avg ₹612 diff, 9 missing). 7 vendor rows: GSTIN + name, invoice no., date, taxable, IGST, status pill (MATCHED green / MISMATCH amber + diff note / MISSING IN BOOKS rose / PENDING IN 2B grey).

### AIAssistantMockup
Header: brand sparkle gradient avatar + "runQ Assistant" + language list "English · हिंदी · தமிழ் · తెలుగు · ಕನ್ನಡ" + "Reading your books" status. Chat:
- User msg (right, brand-tinted bubble): Hindi question about top vendor spend
- Assistant response (left, multiple parts):
  1. Text: "अप्रैल 2026 में आपका सबसे बड़ा vendor spend था **Reliance Foam Industries** पर — कुल ₹4,28,420 (5 bills)"
  2. Inline data card: vendor avatar + GSTIN + total + "↑ 14% vs Mar" + 3-stat row (Bills 5 / Avg days 28 / YTD ₹38.4L)
  3. Mini bar chart: 12-month spend, last bar in brand-500, others zinc-darkened
  4. Follow-up question
  5. 4 suggested action chips
- Composer: brand sparkle, placeholder "Ask anything…", ↵ key hint, brand send button

### Phone screens (3)
- **MobileCashScreen** (cash dashboard) — used in pillar 4 + mobile band left
- **MobileInvoiceScreen** (3-of-4 invoice flow) — center
- **MobileScanScreen** (camera viewfinder with AI extraction overlay + bottom-sheet results) — right

## Interactions & Behavior

- **Scroll reveal:** all top-level blocks have `.reveal` class and use an `IntersectionObserver` (threshold 0.12) that adds `.in` class. Transitions: opacity 0→1 + translateY(20px → 0) over 0.8s ease. Hook: `useReveal()` in `parts/sections.jsx`.
- **Sticky nav:** transparent → blurred white-75 with hairline border once `scrollY > 8`
- **Showcase tabs:** React `useState`, instant swap, charts re-animate on remount via `key={active}` on the mockup component
- **Hover lift:** `.lift` class — translateY(-2px) over 0.25s on bento and feature cards
- **Pulsing dot:** in eyebrow pill, scale 1→1.6, opacity 1→0, 1.8s ease-out infinite
- **Bar rise:** in all charts, scaleY 0.05→1 on mount with per-bar animation-delay (i × 30–80ms)
- **AI typing dots:** keyframes defined but not currently used (`dot-bounce`); reserve for a future loading state
- **Smooth scroll** on anchor nav (`scroll-behavior: smooth` on html)
- **Responsive:** all section grids collapse to single column at `lg` breakpoint (1024px). Phones re-stack vertically on mobile band; comparison table is horizontally scrollable below 760px (`min-w-[760px]`).

## Design Tokens

### Colors (oklch — already in `web/src/app.css`)
```css
--color-primary-50:  oklch(0.97 0.01 264);
--color-primary-100: oklch(0.94 0.03 264);
--color-primary-200: oklch(0.87 0.06 264);
--color-primary-300: oklch(0.79 0.10 264);
--color-primary-400: oklch(0.68 0.16 264);
--color-primary-500: oklch(0.59 0.20 264);  /* brand */
--color-primary-600: oklch(0.51 0.22 264);
--color-primary-700: oklch(0.46 0.20 264);
--color-primary-800: oklch(0.40 0.17 264);
--color-primary-900: oklch(0.36 0.13 264);
--color-primary-950: oklch(0.26 0.10 264);
```

### Per-pillar accent colors
- Owner-friendly: blue (Tailwind `blue-500/600/50`)
- CA-friendly: emerald (`emerald-500/600/700/50`)
- AI automation: violet (`violet-500/600/700/50`)
- Mobile-first: amber (`amber-500/600/50`)

### Neutrals
Zinc throughout (50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950). Body text zinc-600, headings zinc-900, dim zinc-500/400. Dark sections: bg zinc-950, surface zinc-900/40-60, border zinc-800/80, text zinc-100/200/300/400/500.

### Gradients
- **Text gradient (`grad-text`)** for italic display words on light bg:
  `linear-gradient(100deg, oklch(0.59 0.20 264) 0%, oklch(0.62 0.23 295) 55%, oklch(0.66 0.18 330) 100%)` — clipped to text
- **Text gradient light (`grad-text-light`)** for the dark sections (bumped lightness):
  `linear-gradient(100deg, oklch(0.78 0.16 264) 0%, oklch(0.78 0.18 295) 55%, oklch(0.82 0.14 330) 100%)`
- **Aurora glow** behind hero/dark sections: two oklch radial blurs (`0.78/0.18/264` and `0.78/0.18/320`), blur 80px, opacity .55. Dark variant uses `0.59/0.22/264` and `0.55/0.22/320` at .35/.3 opacity.

### Typography
- **Inter** — UI/body. weights 400/500/600/700/800. `font-feature-settings: "cv02","cv03","cv04","cv11"`, `font-variant-numeric: tabular-nums` on body.
- **Instrument Serif** — display only, italic. Used for `.font-display` class on the second line of every H1/H2 and on the testimonial quote marks. `font-weight: 400`, `letter-spacing: -0.01em`.
- **JetBrains Mono** — for invoice numbers, GSTINs, HSN codes, URL bars, kbd hints.

### Type scale (effective)
- H1 hero: `clamp(2.4rem, 6.4vw, 5.2rem)`, leading 1, tracking-tight
- H2 section: `text-4xl lg:text-5xl` (2.25 → 3rem), `tracking-tight`
- H2 final CTA: `lg:text-7xl` (4.5rem)
- H3 card title: `text-2xl` (1.5rem)
- Body: `text-sm` (0.875rem) and `text-base`, leading-relaxed where dense
- Labels/eyebrows: `text-xs uppercase tracking-[0.18em] font-semibold`
- Mockup text: tight (10–12px) — these are simulating UIs where 12px is normal

### Spacing
- Container: `max-w-[1200px] px-5 lg:px-8`
- Section padding: `py-24` (96px) standard, `py-28` for final CTA
- Card padding: `p-6` (1.5rem) feature, `p-7` (1.75rem) bento
- Gap between cards: `gap-3` to `gap-4` (12–16px)

### Border radius
- Cards bento: `rounded-2xl` (16px)
- Stat cards: `rounded-lg` (8px)
- Pills/badges: `rounded-full`, `rounded-md` (6px)
- Phone outer/inner: `rounded-[42px]` / `rounded-[34px]`
- Window chrome: `rounded-xl` (12px)

### Shadows
- **`mockup-shadow`** (dark mockups): `0 1px 0 0 rgba(255,255,255,0.06) inset, 0 30px 60px -20px rgba(15,15,30,0.55), 0 80px 120px -40px rgba(60,40,140,0.35)` — note the brand-tinted ambient
- **`mockup-shadow-light`**: lighter version with 70-50-180 tint
- **`phone-bezel`**: a gradient bg + multi-layer shadow with brand tint

### Backgrounds
- **`dot-grid`**: `radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)` 26×26px — used on dark sections
- **`line-grid-light`**: orthogonal lines at 4.5% zinc, 56×56px — used on hero with center-radial mask
- **`ca-bg`**: brand-tinted top-right radial + zinc-50 base

## Assets
- `assets/runq-dark.png` — black "runQ" wordmark with violet Q-arrow mark. Used in nav.
- `assets/runq-light.png` — white "runQ" wordmark with violet Q-arrow mark. Used in footer.
- `assets/runq-favicon.png` — favicon.
- `assets/logo.svg` — vector logo source.

All sourced from `web/public/` in the runQ web codebase.

The "Q" in the wordmark has a distinctive **arrow tail at the bottom-right** — that arrow shape is the brand mark, and is what's used as the standalone Q badge in the comparison table header and the mockup sidebars.

## Implementation Notes for Claude Code

1. **Where to put it.** Either: (a) add a marketing route group in the existing TanStack Router app (e.g. `web/src/routes/(marketing)/index.tsx` with its own root layout that drops the sidebar + auth provider), or (b) spin up a separate `apps/marketing` Vite app sharing the workspace's `@runq/types` and Tailwind config. Option (b) is recommended — it lets the marketing site be statically deployed (Vercel/Netlify) and indexed by Google without dragging the auth bundle.

2. **Tailwind 4 config.** The brand colors are already in `web/src/app.css` via `@theme`. Add the missing `font-display` and gradient utilities to that file (or to a marketing-specific css file) — see the `<style>` block in `runQ Landing.html` for the source of truth.

3. **Fonts.** Inter is already wired. Add Instrument Serif via Google Fonts (italic) and JetBrains Mono (regular + medium). Self-host for production.

4. **Icons.** The prototype inlines lucide-style SVGs (because lucide-react can't be loaded inline easily). In the real app, **use `lucide-react` directly** (already a dep) — every icon name in `parts/icons.jsx` corresponds 1:1 to a lucide name (Arrow → ArrowRight, Sparkle → Sparkles, etc.).

5. **Mockup data.** Treat the strings in `parts/mockups.jsx` as final marketing copy — they were written intentionally with real Indian SME context (rupee compact format, GSTINs, HSN codes, plausible vendor names from manufacturing/textile/logistics). Do not lorem-ipsum them.

6. **Per-component split.** The prototype splits along `parts/icons.jsx`, `parts/mockups.jsx`, `parts/sections.jsx`, `parts/app.jsx`. In production, mirror that as `marketing/components/{icons,mockups,sections}/*` — each section as its own file makes them easy to A/B and SEO-test independently.

7. **Reveal-on-scroll.** Replace the inline `IntersectionObserver` hook with `framer-motion` `whileInView` (or stay with the current hook — it's 8 lines and works).

8. **Showcase tab transitions.** Currently instant. If you want a fade/slide between tabs, wrap the active mockup in `framer-motion`'s `AnimatePresence` with a `mode="wait"` swap — but the bar-rise animations on the charts already give it visual life.

9. **SEO / OG.** Not in the prototype. Add `<meta>` tags for Open Graph (title, description, image), Twitter Card, JSON-LD `Organization` schema, and a `sitemap.xml` covering /, /pricing, /for-cas, /about, /privacy, /terms.

10. **What's NOT in the prototype** (out of scope here, but you'll need them):
    - Mobile drawer (the hamburger toggles it but it's a basic vertical list — production should slide in from the right with backdrop)
    - Pricing page
    - Sign-in / Get-started flows (they're empty hrefs)
    - Cookie banner / privacy compliance
    - Analytics
    - Localization (the AI assistant mockup shows multi-language support but the marketing copy is English-only — when localizing, the gradient italic display headlines will need careful attention since Instrument Serif's italic only works for Latin)

## Files in This Bundle
- `runQ Landing.html` — entry point. Tailwind CDN config, font imports, all `<style>` rules, React + Babel script tags, and the 4 part imports.
- `parts/icons.jsx` — inline lucide-style SVG icon set, exports `window.I`. Replace with `lucide-react` imports in production.
- `parts/mockups.jsx` — `WindowChrome`, `MockSidebar`, and the 5 product mockups (Dashboard, Invoice, BankRecon, GSTR2B, AIAssistant). Plus `inr()` Indian rupee formatter.
- `parts/sections.jsx` — all marketing sections (Nav, Hero, Pillars, Showcase, MobileBand, AIBand, ForCAs, CompareTable, FinalCTA, Footer) + phone screens (MobileCashScreen, MobileInvoiceScreen, MobileScanScreen) + `useReveal()` hook.
- `parts/app.jsx` — composes everything in order, mounts to `#app`.
- `assets/` — runq-dark.png, runq-light.png, runq-favicon.png, logo.svg.

## Sub-pages (`pages/`)

The footer + nav link to **19 sub-pages**, all included in this bundle. Each is a standalone HTML entry that reuses the homepage's `parts/icons.jsx` (via `../parts/`) and adds three local helpers:

- `pages/_shell.jsx` — shared `<Shell>` wrapper rendering the same Nav + Footer used on the homepage, plus the page hero/eyebrow primitives. Every sub-page mounts inside this so chrome stays consistent.
- `pages/_blocks.jsx` — reusable content blocks: feature grids, FAQ accordion, stat strip, CTA band, pricing tier card, testimonial, content prose wrapper for legal copy.
- `pages/_audience.jsx` — extra blocks specific to the four "For X" pages (persona hero, problem→solution row, workflow strip).
- `pages/_legal.jsx` — long-form legal prose layout (TOC sidebar + numbered sections) used by privacy / terms / security / gst-compliance.
- `pages/_template.html` — bare HTML scaffold to copy when adding a new page.

### Page inventory

**Pricing (1)** — `pricing.html` (linked from nav + final CTA)
- Three-tier card grid (Free · Pro ₹599/mo · Scale ₹1,499/mo), feature comparison matrix, FAQ.

**Product (6)** — linked from footer "Product" column
- `invoicing.html` — GST invoice creation, IRN/e-Way bill, recurring, customer portal
- `bank-reconciliation.html` — auto-match feed, suggested matches, exception queue
- `gst-filing.html` — GSTR-1, GSTR-3B, annual returns, ITC tracker
- `bills-expenses.html` — bill capture (OCR), approvals, vendor ledger, payments
- `reports.html` — P&L, balance sheet, cashflow, AR/AP aging, custom views
- `mobile-apps.html` — iOS/Android tour with phone mockups (reuses `MobileCashScreen` etc.)

**For X (4)** — linked from footer "For" column. Each is persona-tuned (different problem framing, different feature emphasis, different testimonial)
- `for-sme-owners.html` — owner-on-the-move framing, mobile-heavy
- `for-cas.html` — multi-client switcher, GSTR bundles, Tally export — extends the homepage's CA section into a full pitch
- `for-manufacturers.html` — HSN tracking, e-Way bill, multi-warehouse
- `for-service.html` — recurring invoices, time-based billing, retainer tracking

**Company (4)** — linked from footer "Company" column
- `about.html` — Quartex story, team photos placeholder, values, India-first stance
- `careers.html` — open roles list (with placeholder JD links), benefits, culture
- `press.html` — media kit, press releases, brand assets download
- `contact.html` — sales / support / partnerships split, Bangalore office, form placeholder

**Legal (4)** — linked from footer "Legal" column
- `privacy.html` — DPDP Act 2023 + GDPR-aligned privacy policy (long-form)
- `terms.html` — terms of service for runq.in
- `security.html` — encryption, hosting (AWS Mumbai), audit posture, ISO/SOC roadmap
- `gst-compliance.html` — GSP/ASP integration disclosure, e-Invoice/e-Way bill compliance

### Recreating sub-pages in production
Each sub-page is intentionally lightweight — they reuse the same nav/footer/typography as the homepage. In the React codebase, build them as routes under the same marketing route group (`web/src/routes/(marketing)/`), all wrapped by a single layout that renders `<Nav />` and `<Footer />`. The per-page `_*.jsx` blocks here map cleanly to a small `marketing/components/blocks/` library — `<FeatureGrid>`, `<FAQ>`, `<PricingTier>`, `<LegalProse>`, `<PersonaHero>`, etc.

For SEO, every sub-page should get its own `<title>`, meta description, OG image, and JSON-LD (Article for legal, Product for product pages, Organization for about). The current prototype only sets `<title>` — the rest is on you.
