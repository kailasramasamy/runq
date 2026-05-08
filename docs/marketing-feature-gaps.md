# Marketing Feature Gaps — Financial Features To Build

Audit date: 2026-05-08

These 8 features are advertised on the runQ marketing site but are **not yet implemented (or only partial)**. All are in scope for runQ as a financial tool. Non-financial marketing claims (inventory, BoM, shop-floor app, batch/serial/expiry, item-wise margins, time tracking) have been removed from the marketing site as part of this same change.

---

## Priority 1 — Pure GST compliance gaps

These have data already sitting in the ledgers; they're report/return generators. Highest ROI, lowest risk.

### 1. GSTR-9 / 9C (annual return)
- **Marketing source:** `apps/www/src/routes/gst-filing.tsx` (annual return prep with ledger-level drilldown, CA-friendly export)
- **Current state:** Not implemented.
- **Scope:** Annual aggregation of GSTR-1 / 3B already filed during the year, reconciled against books. Generate JSON for GSTN upload + Excel/PDF for CA review. 9C reconciliation statement (turnover and ITC reconciled to audited financials) for taxpayers > ₹5cr.
- **Acceptance:**
  - Generate GSTR-9 from filed GSTR-1/3B + books for a selected FY.
  - Show cell-level drilldown (which invoices / bills feed each row).
  - Export GSTN-format JSON + a human-readable PDF/Excel.
  - GSTR-9C: turnover reconciliation, ITC reconciliation, expense-head breakdown.

### 2. GSTR-4 (composition, annual)
- **Marketing source:** `apps/www/src/routes/gst-filing.tsx` ("composition scheme returns supported end-to-end")
- **Current state:** Not implemented.
- **Scope:** Annual return for composition dealers. Outward supplies, inward supplies under RCM, tax payable summary.
- **Acceptance:** Auto-populate from books, GSTN JSON + filing flow, drilldown to source documents.

### 3. CMP-08 (composition, quarterly)
- **Marketing source:** `apps/www/src/routes/gst-compliance.tsx`, `for-service.tsx` (eligible service businesses on the 6% scheme)
- **Current state:** Mentioned in code, no generator.
- **Scope:** Quarterly self-assessed tax payment statement for composition dealers. Outward supply value, tax payable, interest if late.
- **Acceptance:** Auto-fill from quarterly books, GSTN JSON + filing flow.

### 4. ITC-04 (job-work return)
- **Marketing source:** `apps/www/src/routes/for-manufacturers.tsx` ("auto-prepared from your job-work challans")
- **Current state:** Partial — delivery-challan reference exists in GST module, no full return generator.
- **Scope:** Half-yearly return for principal manufacturers showing goods sent to / received from job workers. Built from delivery challans (financial document — does *not* require physical inventory tracking).
- **Acceptance:**
  - Track delivery challans tagged as "for job work" with vendor + date.
  - Track return challans against original challans.
  - Aggregate into ITC-04 form, generate GSTN JSON.

### 5. DSC-based direct GSTN filing
- **Marketing source:** `apps/www/src/routes/for-cas.tsx` ("plug in DSC, saved sessions, no re-OTPs")
- **Current state:** Not implemented. Current filing path is OTP/EVC via GSP.
- **Scope:** Allow CAs to file with their Class-3 DSC instead of OTP. Removes friction for CAs filing for many clients.
- **Acceptance:**
  - DSC dongle/USB integration (browser bridge — emSigner or equivalent).
  - Sign GSTR JSON with DSC, submit via GSP.
  - Saved session for batch filings within a window.
- **Risk:** DSC integration is browser-tech-heavy (native host required). Validate feasibility before scoping.

---

## Priority 2 — Banking & AR

### 6. Bank live-feed coverage (60+ banks)
- **Marketing source:** `apps/www/src/routes/bank-reconciliation.tsx` ("live bank feeds from 60+ Indian banks")
- **Current state:** Generic bank-account integration; ICICI API only. Statement-upload path works for all banks.
- **Scope:** Either (a) actually integrate a feed aggregator covering 60+ banks (e.g., Setu / Decentro / Finvu AA), or (b) soften marketing copy to match reality.
- **Recommendation:** Integrate one AA partner that covers the long tail. Keep ICICI direct. Re-word marketing as "Live feeds via Account Aggregator + direct integrations."
- **Acceptance:** AA consent flow, statement pull on schedule, mapping into existing reconciliation.

### 7. Milestone billing → invoice
- **Marketing source:** `apps/www/src/routes/for-service.tsx` (line 22, now removed from marketing)
- **Current state:** Not implemented.
- **Scope:** On a sales order or project, define milestones with amounts and dates. On milestone sign-off, one click converts to invoice. **Note:** removed from marketing in this round; rebuild marketing claim only after this ships.
- **Acceptance:**
  - Milestone schedule attached to a Sales Order / Quote.
  - Mark milestone "achieved" → generate draft invoice.
  - AR aging respects milestone-based revenue recognition.

### 8. White-label client portal
- **Marketing source:** `apps/www/src/routes/for-service.tsx` (line 23, now softened in marketing)
- **Current state:** Partial — `/portal` exists with read-only invoices/statements. No branding customization.
- **Scope:** Tenant-level branding on the portal: logo, color, custom domain (CNAME), custom email-from address.
- **Acceptance:**
  - Tenant settings: upload logo, set primary color, set portal subdomain or CNAME.
  - Portal renders with tenant brand for that tenant's clients.
  - Outbound emails (statements, reminders) use tenant brand + from-address.

---

## Out of scope (removed from marketing)

For reference — these were on the marketing site and have been removed in this same change:

- Multi-warehouse stock / inventory by location
- Stock transfer notes, reorder levels
- Bill of Materials (BoM)
- Shop-floor QR scanning app
- Batch / serial / expiry tracking
- Item-wise margins (raw + labour + overhead)
- Time tracking → invoice

These are inventory / WMS / MRP / PSA features. runQ stays a financial tool; integrate with WMS/PSA tools rather than build them.

---

## Suggested build order

1. **GSTR-9 / 9C** — biggest CA-facing gap, annual deadline pressure makes it sellable.
2. **CMP-08 + GSTR-4** — small composition cohort but trivial to build once GSTR-9 patterns exist.
3. **ITC-04** — manufacturer credibility; data already in delivery-challan flow.
4. **White-label client portal** — small lift, big perception win for service firms.
5. **AA bank feed integration** — closes the "60+ banks" claim and unlocks a lot of recon volume.
6. **Milestone billing** — service-business AR feature; rebuild marketing copy only after ship.
7. **DSC filing** — last because of native-host complexity. Validate spike first.
