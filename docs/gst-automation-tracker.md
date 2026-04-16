# GST Filing Automation — Tracker

> Goal: minimize accountant effort, prevent late filings, surface gaps continuously.
> Constraint: OTP/EVC must come from human (regulatory). Everything else can be automated.

---

## Phase A — Foundation (high value, low effort) ✅

- [x] A1. Auto-generate GSTR-1 and 3B drafts on 1st of each month at 02:00 IST (per-tenant cron)
- [x] A2. Auto-pull GSTR-2B + run reconciliation on 14th (requires cached auth token)
- [x] A3. GST Readiness widget on dashboard (real-time score: invoices ready, gaps, missing GSTINs)
- [x] A4. Email notifications on draft generation + reminders at T-6, T-1, due date
- [x] A5. Owner escalation if return is overdue (separate alert with late-fee estimate, every 3 days)

**Files delivered in Phase A:**
- `apps/api/src/scheduler/gst-scheduler.ts` — IST-aware cron (1st @ 02:00, 14th @ 02:00, daily @ 09:00)
- `apps/api/src/utils/gst-email-templates.ts` — draft ready, due reminder, overdue escalation
- `apps/api/src/modules/gst/gst-readiness.service.ts` — readiness score + 9 signals
- `apps/api/src/modules/gst/routes.ts` — `GET /gst/readiness` endpoint
- `apps/web/src/components/dashboard/gst-readiness.tsx` — widget UI
- `apps/web/src/routes/dashboard.tsx` — widget placement

## Phase B — Intelligence

- [ ] B1. Pre-month-end checklist: bank reconciliation status, unposted JEs, missing HSN, unvalidated GSTINs
- [ ] B2. AI anomaly detection on drafts (sales drop, ITC spike, customer-without-GSTIN spike) using Claude
- [ ] B3. Auto-fix common issues during generation: derive missing POS from buyer GSTIN, suggest HSN from item master, auto-correct intra/inter tax mix
- [ ] B4. GSTIN background validation: ping GSTN to verify each customer GSTIN is registered (cache result)

## Phase C — Workflow & Polish

- [ ] C1. Approval workflow — junior accountant prepares, owner approves before filing
- [ ] C2. Late-fee tracker on each return (running late fee + interest on outstanding tax)
- [ ] C3. One-click filing day UI — single screen, single button, OTP input, file
- [ ] C4. Pre-file sandbox simulation the night before due date

---

## Progress Notes

- Started: 2026-04-16
- Phase A target: complete in this session
- Cron infra reuse: `recurringSchedulerPlugin` pattern from `apps/api/src/scheduler/`
- Notifications reuse: existing email + in-app notification stack
