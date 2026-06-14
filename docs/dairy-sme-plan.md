# runq for Dairy SME — Module Strategy & Build Plan

**Owner:** Kailas
**Last updated:** 2026-06-09
**Status:** Epoch 1 (factory backbone) substantially shipped — Inventory, Purchase, Manufacturing live. Epoch 2 (customer side) next.
**Target ICP:** Mid-size Indian dairy SMEs — receive milk from farmers/societies, manufacture (pouch milk, paneer, curd, ghee, butter), dispatch to retail/distributor/institutional channels.

---

## 1. Operational flow of a dairy SME

```
Farmers/Societies ──► Milk Procurement ──► QC (FAT/SNF) ──► Raw Milk Stock
                                                                 │
Vendors ──► Purchase ──► GRN (packing, cultures, chemicals) ─────┤
                                                                 ▼
                                                          Manufacturing (BOM, WO)
                                                                 │
                                                                 ▼
                                                          FG Stock (batch + expiry)
                                                                 │
                                                                 ▼
                                                   Sales & Distribution (routes, vans)
                                                                 │
                                                                 ▼
                                                   Customers (retail / distributor / B2B)
                                                                 │
                                                                 ▼
                                                   AR / Collections (Finance)
```

Underneath all of it: **Finance, HR, Fixed Assets, Compliance**.

---

## 2. Module map — current state vs gaps

| # | Module | Status | Priority | Notes |
|---|---|---|---|---|
| 1 | Finance (AR/AP/Banking/GST) | ✅ Done | — | Phase 1–3 complete |
| 2 | HR & Payroll | ✅ Done | — | Indian SME factory focus |
| 3 | Inventory (batch+expiry+FEFO, mobile-scan) | ✅ Done | — | Shipped 2026-05-25; API+web+mobile parity. Plan: `docs/inventory-plan.md`. Dairy deltas (batch/expiry/FEFO/perishables) shipped 2026-06-06 (`1bb3247`, `941044b`); remaining deltas in §3.1. |
| 4 | **Purchase & Procurement** (PR→RFQ→PO→3-way match) | ✅ Done (core) | — | Shipped 2026-05-28 (`92e64cb`): PO CRUD, GRN, 3-way match, scan-receive. PR/RFQ deferred (see §3.2). |
| 5 | **Manufacturing / Production (BOM)** | ✅ Done (Phase A) | — | Shipped 2026-05-30 (`c2dd033`): BOM, work orders, runs, GL costing, reports. |
| 6 | **Sales & Distribution** (SO, routes, van load, dispatch) | ❌ TBD | **P0** | Daily 2x dispatch pain — next major build (Epoch 2) |
| 7 | **Quality Control** | ❌ TBD | **P0** | FSSAI audit requirement |
| 8 | **Milk Procurement** (farmer mgmt, rate chart, payout) | ❌ TBD | **P0 — moat** | Dairy-specific; Tally/Zoho don't touch this |
| 9 | Fixed Assets | ⏳ Phase 2 | P1 | Chillers, tankers, machines, AMC |
| 10 | CRM / Schemes & Claims | ⏳ Phase 2 | P1 | Distributor schemes, claim management |
| 11 | Plant Maintenance | ⏳ Phase 2 | P1 | Preventive maintenance + breakdown log |
| 12 | Fleet / Logistics | ⏳ Phase 3 | P2 | Defer if transport outsourced |
| 13 | Compliance Tracker | ⏳ Phase 3 | P2 | FSSAI, BIS, pollution, W&M renewals |
| 14 | Cold Chain / IoT | ⏳ Phase 3 | P2 | Needs hardware partner |

### Platform foundations (shipped — enable the multi-persona model)

A dairy runs many personas on one tenant — office finance, plant floor, delivery
staff, (later) collection clerks. Two pieces of access infrastructure landed that
make this workable, and de-risk the §3.7 Dhenu persona split:

- **Per-user module access** (2026-06-08, `a10dae3`): tenant-level module ceiling
  × per-user grant, enforced across API/web/mobile. An owner enables Finance/HR/
  Inventory/Purchase/Manufacturing per workspace, then grants each user a subset.
  Viewers default to HR & Payroll. Lets a dairy give plant/delivery staff only the
  modules they need.
- **Phone-only staff onboarding** (2026-06-09, `4598ac0`): owner/HR provision a
  login for an email-less employee from the web (keyed to their phone), assign
  modules immediately, and the worker signs in on the mobile app via OTP — no
  email required. This is the onboarding path for field/floor staff and a direct
  precursor to the low-literacy collection-clerk persona in §3.7.

---

## 3. P0 modules — detailed scope

### 3.1 Inventory — ✅ generic MVP done; dairy deltas 🟡 partial
- Batch + expiry first-class, FEFO picking, mobile-scan-first — shipped, see `docs/inventory-plan.md`.
- **Dairy deltas:**
  - ✅ Batch + expiry tracking, expiry views, grouped perishables-on-hand with FEFO breakdown (2026-06-06, `1bb3247`/`941044b`).
  - ❌ Quality attributes on receipt (FAT/SNF/temp).
  - ❌ UOM conversion (L ↔ kg, fat-corrected kg).
  - ❌ Van/route as warehouse-location pattern (documentation).
  - ❌ Spoilage/expired-return adjustment reason + GL mapping.
  - ❌ Verify FEFO is *enforced* on delivery picking, not just suggested.

### 3.2 Purchase & Procurement — ✅ core shipped (2026-05-28, `92e64cb`)
**Shipped (MVP core):**
- Purchase Order (PO) — formal order; price, terms, delivery schedule. ✅
- GRN against PO. ✅
- 3-way match (PO ↔ GRN ↔ Bill) on bill approval. ✅
- Scan-receive (mobile). ✅

**Deferred (not in v1):**
- Purchase Requisition (PR) + approval chain, Request for Quote (RFQ), vendor
  catalogue / price history. (PP Phase 5 — PR/reports/dashboard/polish —
  consciously skipped for v1; don't auto-propose.)

**Skip entirely:** contracts, blanket POs, vendor scorecards.

### 3.3 Manufacturing / Production (BOM) — ✅ Phase A shipped (2026-05-30, `c2dd033`)
**Phase A — Minimal viable — shipped:**
- `bom_headers`, `bom_lines` (scrap %, qty per output). ✅
- `work_orders` (planned qty, status, shift, timing). ✅
- `wo_consumption` (FEFO-suggested, editable). ✅
- `wo_output` (new batch + expiry). ✅
- GL postings: Dr FG / Cr Raw Materials + Packing at weighted-avg cost. ✅
- Yield variance → variance GL. ✅
- Reports. ✅
- Mobile: scan-to-confirm consumption on plant floor.

**Phase B — Skip:** routing, job cards, WIP between stages.

**Phase C — Later:** co-products (cream + skim from milk), by-products (whey), standard costing + variance analysis.

**Hard dependencies:**
- UOM conversion on item master.
- Production-type stock transaction in inventory engine.
- Item-level GL mapping (inventory + COGS accounts per category).

### 3.4 Sales & Distribution
**Scope (MVP):**
- Sales Order (SO) — customer, items, price list, delivery date.
- Customer-wise price lists + credit limit enforcement.
- Route/beat master — customers grouped by route, sequence.
- Van load sheet — consolidate SOs for a route into a single pick.
- Mobile dispatch confirmation — driver/loader confirms delivery, captures returns (unsold/expired).
- Auto-invoice on dispatch confirmation → flows into existing AR.

**Dairy-specific:** twice-daily cycle (AM/PM), high return rate, customer-wise crate accounting.

**Effort estimate:** 5–6 weeks.

### 3.5 Quality Control
**Scope (MVP):**
- QC test templates per stage: milk-in (FAT/SNF/temp/adulteration tests), in-process (pH, acidity), FG release (microbial, organoleptic, shelf-life).
- Tests bound to GRN line / WO / FG batch.
- Pass/fail/conditional verdict; conditional → quarantine batch (block consumption/dispatch).
- FSSAI-style audit report export.

**Effort estimate:** 2–3 weeks (mostly structured forms + batch-status hook).

### 3.6 Milk Procurement — *the moat*
**Why it matters:** This is dairy-specific. Tally, Zoho, Vyapar don't touch it. Most dairies run it on paper, Excel, or a separate AMCU/DPMCS system. Owning it is a real differentiator and a sticky beachhead.

**Scope (MVP):**
- Farmer/Society master — KYC, bank, advance balance, cattle-feed loan balance.
- Route + collection-centre master.
- Daily collection entry (AM/PM shifts) — qty, FAT, SNF, temperature.
- Rate chart — FAT/SNF-based, society-tier-based, seasonal.
- Auto-calc per-litre rate from rate chart.
- Fortnightly payout cycle — gross collection − advance deduction − cattle-feed deduction − other deductions = net payable.
- Bonus / incentive schemes (quality bonus, volume slabs).
- Per-farmer ledger + printable payout statement.
- Integration → Inventory (raw milk receipt batch) + Finance (payout JE, advance ledger).

**Effort estimate:** 6–8 weeks (largest single new module).

---

## 3.7 Milk Procurement — architectural decision: "Dhenu"

**Decision:** Build as a **separate app on the same backend** — branded **Dhenu** (Sanskrit for *cow*, the source). Not a tab inside the runq web ERP, not a fully separate product. Standalone brand with **no `runq` prefix** — so it lists cleanly on the App/Play stores and can be sold on its own.

> **Name locked (2026-06-13):** **Dhenu**. Picked after screening App/Play store clashes — only adjacent gaushala/cow-charity apps exist (no milk-procurement collision); store slate is effectively clean in-category. Ships as bare app name *"Dhenu"* (fallback "Dhenu Milk" if Apple flags the exact string), with store subtitle *"Milk procurement"* for SEO. Code dir stays `apps/collect/` — brand ≠ directory.

**Personas (one app, four user types):** farmers (pour-in + own ledger/payout), VMCC (village milk collection centre), CC (chilling centre), PP (processing plant intake). Low-literacy / vernacular-first across all four.

### Why not "just another module in runq"
The collection-centre user is a fundamentally different persona, device, and context from the office ERP user:

| Dimension | runq ERP user | Milk collection user |
|---|---|---|
| Persona | Office accountant, owner | Village clerk, society secretary |
| Literacy / language | English | Vernacular, low-literacy |
| Device | Mid-range phone / desktop | Cheap Android, often shared, rugged tablet |
| Connectivity | Wi-Fi / 4G | Spotty 2G / offline; syncs later |
| Use frequency | Many flows, weekly/daily | **2 screens, 2x/day, every day** |
| Hardware peripherals | None | Milk analyzer (FAT/SNF), weighing scale, thermal printer |
| Sessions / day | 5–50 transactions | 200–500 farmer entries in 90 min |

Cramming both into one app punishes both users.

### Why not a fully separate product
- Customers manage two vendors, two logins, two contracts.
- Rebuild tenant/auth/permissions/billing/notifications from scratch.
- Farmer payout → GL becomes a fragile API contract instead of a function call.
- Dilutes brand and sales motion.
- Loses the real moat: **one platform, end-to-end traceability farmer → retail shelf**.

### The hybrid — Dhenu

**Architecture:**
- New backend module in monorepo, one-module-per-domain like every other runq domain (`ap`, `inventory`, `purchase`, `manufacturing`): `apps/api/src/modules/milk-procurement/` + `packages/db/src/schema/milk_procurement.ts`. (Slug `milk-procurement/` — matches the schema file; **not** `procurement-milk/`.)
- **Not folded into `purchase`.** `purchase` is PO → GRN → 3-way-match; milk collection is farmer master → twice-daily FAT/SNF entry → rate-chart pricing → fortnightly payout. Zero model overlap, different release cadence (offline sync + BT hardware), different access/billing boundary.
- **Register as a first-class access module** (like Finance/HR/Inventory) in the per-user module-access system from day one — that's what makes the standalone Dhenu sales motion and per-active-farmer billing work without a retrofit.
- New mobile app: `apps/collect/` (Flutter, shares auth + API base). Optimized for one workflow: receive farmer → weigh → test → print receipt → sync.
- Optional collection-centre web view for tablet clerks.
- **Separate ≠ siloed — shares the backend via function calls, not rebuilt primitives:** tenant, users, vendors (farmer = vendor sub-type), inventory engine (raw milk batches), GL (payout JE), AP (advance + cattle-feed-loan ledger). The moat is farmer→shelf traceability as in-process calls, not a fragile cross-product API.

**Commercial:**
- Standalone brand **"Dhenu"** — distinct positioning, same backend family. No `runq` in the name so it sells on its own.
- Three sales motions:
  1. **Bundled** with full runq ERP (most dairies).
  2. **Standalone** — Dhenu + thin AP/payout sliver. Land cheap, expand later.
  3. **Co-op edition** — village societies, multi-society deployment sold to the parent dairy.
- **Pricing: per-active-farmer/month** (e.g. ₹3–5/farmer/mo). Independent of ERP seats. A 5,000-farmer dairy = ₹15–25K/month on Dhenu *alone*, on top of ERP.

**Engineering:**
- Same git repo, same CI, same DB, same deploy — no fragmentation.
- Mobile app on its own release cadence.
- Hardware peripheral code (analyzer/scale BT, thermal printer) stays isolated in Dhenu — never pollutes the ERP mobile app.

### Dhenu rollout phases
| Phase | Scope | Target |
|---|---|---|
| 1 | Backend module + tablet-friendly web UI (online clerk) | Epoch 3 (Oct–Nov 2026) |
| 2 | Dedicated Flutter `apps/collect/` mobile app with offline sync | Q1 2027 |
| 3 | Hardware peripherals: milk analyzer (BT), weighing scale, thermal printer | Q2 2027 |

### Design
Dhenu has its **own design language** — not the runq ERP / `module-ui` look — built for low-literacy, vernacular, offline rural users. Full spec (design system + 4 role dashboards + farmer Part-1 screens, Part 2 stubbed): **`docs/dhenu-design-spec.md`** (Sprint 1, 2026-06-13).
Backend data model (16 `mp_`-prefixed tables — network/farmers/rate-chart/collection/payout, reusing vendors/inventory/GL/AP): **`docs/dhenu-schema-spec.md`** (spec for review, 2026-06-13).
Build tracker (phased API + app + cross-cutting increments, status-tracked): **`docs/dhenu-tracker.md`**. Schema + migration + API masters (A1) shipped & e2e-passed; next is A2 rate charts → A3 pour capture.

### Brand positioning
Market **Dhenu** as a named, standalone product from day one — even though technically it's a runq module on the shared backend. Lets you sell it on its own without re-platforming later. Tagline candidate: *"The only Indian milk-procurement app that posts straight to your books."*

---

## 4. Recommended build sequence

Plan the next ~6 months as **3 epochs**:

### Epoch 1 — Core operational backbone (Jun–Jul 2026) — ✅ substantially done
**Goal:** A dairy can run procurement → production → dispatch end-to-end on runq.

1. ✅ **Inventory** — generic MVP (2026-05-25) + dairy deltas batch/expiry/FEFO/perishables (2026-06-06). Remaining deltas in §3.1 (quality attrs on receipt, UOM L↔kg, FEFO *enforcement* on picking).
2. ✅ **Purchase & Procurement** — PO + GRN + 3-way match + scan-receive (2026-05-28). PR/RFQ deferred.
3. ✅ **Manufacturing Phase A** — BOM + WO + consumption + output + GL costing + reports (2026-05-30).

**Why this order:** Inventory is the substrate. Purchase is needed to legitimately bring stock in. Manufacturing turns stock into FG. After this epoch, the factory side works. **Remaining for Epoch 1 closeout:** the §3.1 dairy deltas (quality attrs on receipt, UOM conversion, FEFO enforcement on delivery picking).

### Epoch 2 — Customer side + audit-readiness (Aug–Sep 2026)
**Goal:** A dairy can sell, dispatch, collect, and pass an FSSAI audit.

4. **Sales & Distribution** — SO + routes + van load + dispatch. *5–6 wks*
5. **Quality Control** — test templates + batch quarantine. *2–3 wks*

**Why this order:** Without S&D, dispatch is manual chaos. QC slots in here because it ties into both inbound (Procurement) and outbound (S&D) gates.

### Epoch 3 — The moat (Oct–Nov 2026)
**Goal:** Differentiated product that Tally/Zoho can't match.

6. **Milk Procurement** — farmer mgmt, rate chart, fortnightly payout. *6–8 wks*

**Why last:** Highest effort, deepest domain. By now you'll have 1–2 dairy customers from Epochs 1–2 — co-design this with them so it's not theoretical.

### After Epoch 3 — Phase 2 / 3
- Fixed Assets, Plant Maintenance, CRM/Schemes — based on customer pull, not push.

---

## 5. Strategic recommendations

1. **Land 1 pilot dairy SME before Epoch 2 ends.** Co-build Milk Procurement with them in Epoch 3. Don't build it speculatively.
2. **Position dairy as a *vertical edition* of runq**, not a separate product. Same finance + HR + inventory base; dairy-specific modules layer on. This keeps engineering surface area sane.
3. **Milk Procurement is the wedge** — lead marketing with it. "The only Indian ERP that handles farmer payouts natively." Finance/HR/Inventory become table stakes that come *with* it.
4. **Defer Fleet & Cold-Chain IoT.** Both need hardware partners or fleet ops domain — out of scope until you have 5+ dairy customers asking.
5. **QC + FSSAI export is a sales line item.** Make sure the audit report is brand-able and demo-ready.
6. **Don't build full SAP-grade Manufacturing.** Stop at Phase A. The dairy line is mostly continuous flow — routing/job-cards/WIP are over-engineering.
7. **Mobile-first stays the rule.** Plant floor, collection centres, vans — all phone-driven. Reuse the module-switcher pattern (commit `d2a543c`).

---

## 6. Tracker

| Module | Phase | Owner | Target start | Target ship | Status |
|---|---|---|---|---|---|
| Inventory (generic MVP) | — | — | — | 2026-05-25 | ✅ Done — API + web + mobile parity, see `inventory-plan.md` |
| Inventory dairy deltas | A | — | Jun 2026 | Jun 2026 | 🟡 Partial — batch/expiry/FEFO/perishables shipped 2026-06-06 (`1bb3247`,`941044b`); quality attrs + UOM + FEFO-enforcement pending |
| Purchase & Procurement | MVP | — | May 2026 | 2026-05-28 | ✅ Core done (`92e64cb`) — PO, GRN, 3-way match, scan-receive; PR/RFQ deferred |
| Manufacturing (BOM) | A | — | May 2026 | 2026-05-30 | ✅ Done (`c2dd033`) — BOM, WO, runs, GL costing, reports |
| Platform — per-user module access | — | — | Jun 2026 | 2026-06-08 | ✅ Done (`a10dae3`) — tenant ceiling × per-user grant, API/web/mobile |
| Platform — phone-only staff onboarding | — | — | Jun 2026 | 2026-06-09 | ✅ Done (`4598ac0`) — web-provision OTP staff + HR user management |
| Sales & Distribution | MVP | — | Aug 2026 | Sep 2026 | Not started — next major build |
| Quality Control | MVP | — | Sep 2026 | Sep 2026 | Not started |
| Milk Procurement — Dhenu backend + web | 1 | — | Oct 2026 | Nov 2026 | Not started |
| Milk Procurement — Dhenu mobile app (offline) | 2 | — | Jan 2027 | Mar 2027 | Not started |
| Milk Procurement — Dhenu hardware peripherals | 3 | — | Apr 2027 | Jun 2027 | Not started |
| Fixed Assets | — | — | TBD | TBD | Backlog |
| Plant Maintenance | — | — | TBD | TBD | Backlog |
| CRM / Schemes & Claims | — | — | TBD | TBD | Backlog |
| Fleet / Logistics | — | — | TBD | TBD | Backlog |
| Compliance Tracker | — | — | TBD | TBD | Backlog |
| Cold Chain / IoT | — | — | TBD | TBD | Backlog |

---

## 7. Open questions

1. **Pilot customer** — do we have a candidate dairy SME to design Milk Procurement with?
2. **Manufacturing GL** — confirm chart-of-accounts mapping for FG / variance / spoilage accounts.
3. **Sales returns** — does the pilot dairy take same-day or next-day expired returns? Affects van load sheet design.
4. **Farmer payout** — fortnightly is typical; any pilot that's weekly/monthly changes the cycle UI.
5. **Hardware** — do any target dairies already have AMCU machines we'd need to integrate with vs replace?
