# Claude Managed Agents for runq

Based on [Anthropic's Managed Agents](https://aiblewmymind.substack.com/p/claude-managed-agents-explained-demo) — cloud-hosted, per-tenant AI agents that run continuously in isolated sandboxes at $0.08/session-hour.

---

## 1. AP Bill Processing Agent

> **Note:** AR invoice creation is already well-automated via PO Inbox (customer POs → draft invoices), Invoice Import (batch XLSX/CSV/PDF), and manual creation. The real gap is on the AP side — vendor bills still require human-initiated uploads and manual step-through of extract → match → approve.

**The problem today:**
- AP bill processing has good building blocks (scan/extract, 3-way match, CSV import) but each step is user-initiated
- Vendor portal is read-only — vendors can't self-submit bills
- AP has no alias/mapping persistence (unlike AR import which saves customer+item aliases)
- Someone has to upload the file, click extract, link the PO, run the match, approve

**What the agent does — end-to-end AP autopilot:**

### Continuous intake (no human trigger)
- Watches a dedicated email inbox (e.g. bills@company.runq.in) for incoming vendor invoices
- Accepts WhatsApp-forwarded bills via Gupshup webhook
- Polls a shared folder/Drive where accountant dumps scans
- Processes immediately — no one needs to click "upload"

### Orchestrated pipeline (extract → match → approve)
- Extracts using existing 2-tier cascade (local heuristic → Claude Vision)
- Auto-resolves vendor (fuzzy match + learned aliases)
- Links to open PO, runs 3-way match (PO + GRN + Invoice)
- If clean (within 2% qty tolerance, price match): auto-approve → queue for payment
- If exception: surfaces specific issue to accountant for review

### Vendor pattern learning (missing from AP today)
- Remembers that "GCMMF" = "Gujarat Cooperative Milk Marketing Federation" = vendor ID 47
- Learns invoice layouts per vendor (Amul HSN in col 3, rate in col 5)
- Builds alias persistence like AR import already has — gets faster per tenant over time

### Proactive exception handling
- "Vendor X sent invoice #4521 but GRN shows 480 units vs 500 invoiced — 4% exceeds 2% tolerance"
- "Duplicate invoice detected — same number from same vendor, 3 days apart"
- "TDS section on this bill is 194C but vendor is registered as 194J — verify"
- "3 bills from new vendors this week with no PO — manual review needed"

**Existing foundation:** 2-tier extraction (local + Claude Vision), 3-way matching service, CSV import with category templates, vendor master, TDS handling

**Why:** AR intake is already agent-like (PO inbox auto-parses, stages, bulk-approves). AP is still "someone uploads, someone clicks match, someone approves." This agent closes that gap.

---

## 2. Bank Reconciliation Agent

**What it does:**
- Processes new bank feed entries as they arrive
- Learns from corrections over time (per-tenant narration patterns)
- Executes two-path flow automatically:
  - Vendor match → auto-create bill + payment + JEs
  - No vendor → direct JE with GL categorization
- Surfaces anomalies proactively ("3 debits to unknown vendors totalling ₹2.4L today")
- Reduces manual review to exceptions only

**Existing foundation:** Rule-based + AI categorization, smart recon suggestions, narration pattern learning

**Why:** Reconciliation is daily, repetitive, high-volume — ideal for a background agent.

---

## 3. GST Compliance Agent

**What it does:**
- Monthly: Pulls GSTR-2B via GSP API, compares against books
- Flags ITC mismatches (missing in 2B, present in books and vice versa)
- Pre-filing: Validates all invoices have correct HSN, GSTIN, tax rates
- Generates GSTR-1/3B-ready data for Tally export
- Highlights ITC at risk before filing deadline

**Existing foundation:** GST-aware invoicing, GSTIN validation, White Books GSP integration (code-complete)

**Why:** Bridges the "runq for ops, Tally for CA compliance" positioning — agent does prep work so the CA just reviews in Tally.

---

## 4. Collections Agent

**What it does:**
- Monitors overdue invoices continuously
- Sends WhatsApp reminders (via Gupshup) on escalating schedules
- Adjusts tone based on customer history and credit score
- Logs all follow-ups with timestamps
- Flags non-responsive accounts to the owner
- Respects business hours and regional holidays

**Existing foundation:** Advanced dunning, credit scoring, interest on overdue, WhatsApp delivery via Gupshup

**Why:** SME owners chase payments manually. This runs 24/7 per tenant.

---

## 5. Financial Insights Agent

**What it does:**
- Weekly digest: cash position, burn rate, receivables aging
- Compares against prior period (WoW, MoM)
- Flags unusual patterns: margin compression, expense spikes, cash flow gaps
- Delivers summary via WhatsApp/email to the owner
- Answers follow-up questions conversationally

**Existing foundation:** AI financial summaries (Phase 2)

**Dependency:** Requires P&L, Balance Sheet, Cash Flow reports (Phase 4)

**Why:** SME owners don't open dashboards. Push insights to them.

---

## Prioritization

| Priority | Agent | Phase | Reason |
|----------|-------|-------|--------|
| **Now** | AP Bill Processing | Current | AP pipeline is manual, AR already automated |
| **Next** | Bank Reconciliation | Current | Natural extension of existing infra, high volume |
| **Later** | GST Compliance | Phase 4 | Needs GSTR-2B integration, aligns with GSP work |
| **Later** | Collections | Phase 4 | Dunning infra exists, add agent intelligence |
| **Future** | Financial Insights | Phase 5 | Needs P&L/BS reports first |

---

## Cost Estimate (per tenant)

| Agent | Runtime | Est. Monthly Cost |
|-------|---------|-------------------|
| AP Bill Processing | On-demand (per batch) | ₹200–500 |
| Bank Reconciliation | Daily runs | ₹300–600 |
| GST Compliance | Monthly | ₹50–100 |
| Collections | Continuous | ₹500–1000 |
| Financial Insights | Weekly | ₹100–200 |

At $0.08/session-hour + token costs, even a small SME paying ₹2–3K/month for runq can afford continuous agent operation.

---

## Competitive Differentiator

"Your finance ops run themselves while you focus on your business."

No Indian ERP competitor (Zoho Books, Vyapar, Khatabook) offers tenant-level managed agents. This positions runq as the first AI-native operations finance platform for Indian SMEs.
