# Mobile follow-ups — 2026-04-30

Deferred items from the dark-mode + pay-runs session. None of these block current functionality. Tier 1 work (chart crash, FAB/pill contrast, dark-mode chip refresh, payment-queue dedup, pay-run detail action gating) shipped in the same session.

## Tier 2 — functional gaps

### 1. Reject-whole-run action on pay run detail screen
**File:** `apps/mobile/lib/screens/pay_run_detail_screen.dart`

When the queue endpoint was buggy, multiple duplicate pending runs were created with the same overdue bills. The detail screen currently only supports approve/reject **per line**. Add a destructive "Reject run" button surfaced when `run.status` is `pending_approval` or `partially_approved`.

- New repo method: `payRunRepo.rejectRun(runId)` calling a new backend route that marks the run + all `pending` lines as `rejected`.
- After the run is rejected, those bills automatically reappear in the overdue queue — `getPaymentQueue` already excludes `executed`/`rejected` runs.
- Style as destructive (red, with confirmation sheet) — releasing payment for the wrong vendors is far worse than the inconvenience of one extra tap.

### 2. Clean up duplicate pending pay runs in dev DB
Before the queue dedup fix in `apps/api/src/modules/ap/payment-run.service.ts:getPaymentQueue` landed, each tap of "Pay N overdue bills" created another run holding the same set of `purchase_invoice_id`s. The dev DB now has ~4 stale `pending_approval` runs covering the same 29 bills.

Options:
- Build #1 above and reject them through the UI.
- Or one-shot SQL on local dev only:
  ```sql
  DELETE FROM payment_run_lines WHERE run_id IN (
    SELECT id FROM payment_runs WHERE status = 'pending_approval' AND tenant_id = '<dev-tenant>'
  );
  DELETE FROM payment_runs WHERE status = 'pending_approval' AND tenant_id = '<dev-tenant>';
  ```
  Do **not** run on prod.

## Tier 3 — cosmetic

### 3. Cash flow statement: empty account names on mobile
**Files:** `apps/api/src/modules/reports/reports.service.ts` (shape source), `apps/mobile/lib/api/reports_models.dart:45` (parser)

Backend `getCashFlowStatement` returns operating/investing/financing rows shaped as `{description, amount}` (see `classifyCashEntries`). The Flutter `ReportLineItem.fromJson` reads `accountName` instead, so the labels render blank — only amounts show.

Fix on the Flutter side, not the backend (the web app at `apps/web/src/routes/reports/cash-flow-forecast.tsx` may depend on the existing shape). Map `description` first, fall back to `accountName`:

```dart
accountName: strAt(j['description']) ?? strAt(j['accountName']) ?? '',
```
