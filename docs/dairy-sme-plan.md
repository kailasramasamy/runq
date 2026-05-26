# runq for Dairy SME — Module Strategy & Build Plan

**Owner:** Kailas
**Last updated:** 2026-05-24
**Status:** Strategy doc, pre-build for dairy-specific modules
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
| 3 | Inventory (batch+expiry+FEFO, mobile-scan) | ✅ Done | — | Shipped 2026-05-25; API+web+mobile parity. Plan: `docs/inventory-plan.md`. Dairy deltas tracked separately in §6. |
| 4 | **Purchase & Procurement** (PR→RFQ→PO→3-way match) | ❌ TBD | **P0** | Upstream of GRN; gates payment discipline |
| 5 | **Manufacturing / Production (BOM)** | ❌ TBD | **P0** | Non-negotiable for dairy costing & traceability |
| 6 | **Sales & Distribution** (SO, routes, van load, dispatch) | ❌ TBD | **P0** | Daily 2x dispatch pain |
| 7 | **Quality Control** | ❌ TBD | **P0** | FSSAI audit requirement |
| 8 | **Milk Procurement** (farmer mgmt, rate chart, payout) | ❌ TBD | **P0 — moat** | Dairy-specific; Tally/Zoho don't touch this |
| 9 | Fixed Assets | ⏳ Phase 2 | P1 | Chillers, tankers, machines, AMC |
| 10 | CRM / Schemes & Claims | ⏳ Phase 2 | P1 | Distributor schemes, claim management |
| 11 | Plant Maintenance | ⏳ Phase 2 | P1 | Preventive maintenance + breakdown log |
| 12 | Fleet / Logistics | ⏳ Phase 3 | P2 | Defer if transport outsourced |
| 13 | Compliance Tracker | ⏳ Phase 3 | P2 | FSSAI, BIS, pollution, W&M renewals |
| 14 | Cold Chain / IoT | ⏳ Phase 3 | P2 | Needs hardware partner |

---

## 3. P0 modules — detailed scope

### 3.1 Inventory (WIP)
- Batch + expiry first-class, FEFO picking, mobile-scan-first.
- Already covered in `docs/inventory-plan.md`.
- **Dairy deltas needed** (track as inventory extension):
  - Quality attributes on receipt (FAT/SNF/temp).
  - UOM conversion (L ↔ kg, fat-corrected kg).
  - Van/route as warehouse-location pattern (documentation).
  - Spoilage/expired-return adjustment reason + GL mapping.
  - Verify FEFO is *enforced* on delivery picking, not just suggested.

### 3.2 Purchase & Procurement
**Scope (MVP):**
- Purchase Requisition (PR) — internal request, approval chain.
- Request for Quote (RFQ) — multi-vendor comparison.
- Purchase Order (PO) — formal order; price, terms, delivery schedule.
- GRN against PO (already built — wire it up).
- 3-way match (PO ↔ GRN ↔ Bill) as a validation rule on bill approval.
- Vendor catalogue / price history.

**Skip in MVP:** contracts, blanket POs, vendor scorecards.

**Effort estimate:** 4–5 weeks.

### 3.3 Manufacturing / Production (BOM)
**Phase A — Minimal viable (2–3 weeks):**
- `bom_headers`, `bom_lines` (scrap %, qty per output).
- `work_orders` (planned qty, status, shift, timing).
- `wo_consumption` (FEFO-suggested, editable).
- `wo_output` (new batch + expiry).
- GL postings: Dr FG / Cr Raw Materials + Packing at weighted-avg cost.
- Yield variance → variance GL.
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

## 3.7 Milk Procurement — architectural decision: "runq Collect"

**Decision:** Build as a **separate app on the same backend** — branded **runq Collect**. Not a tab inside the runq web ERP, not a fully separate product.

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

### The hybrid — runq Collect

**Architecture:**
- New backend module in monorepo: `apps/api/src/modules/procurement-milk/` + `packages/db/src/schema/milk_procurement.ts`.
- New mobile app: `apps/collect/` (Flutter, shares auth + API base). Optimized for one workflow: receive farmer → weigh → test → print receipt → sync.
- Optional collection-centre web view for tablet clerks.
- **Shared backend:** tenant, users, vendors (farmer = vendor sub-type), inventory engine (raw milk batches), GL, AP.

**Commercial:**
- Sub-brand **"runq Collect"** — distinct positioning, same family.
- Three sales motions:
  1. **Bundled** with full runq ERP (most dairies).
  2. **Standalone** — Collect + thin AP/payout sliver. Land cheap, expand later.
  3. **Co-op edition** — village societies, multi-society deployment sold to the parent dairy.
- **Pricing: per-active-farmer/month** (e.g. ₹3–5/farmer/mo). Independent of ERP seats. A 5,000-farmer dairy = ₹15–25K/month on Collect *alone*, on top of ERP.

**Engineering:**
- Same git repo, same CI, same DB, same deploy — no fragmentation.
- Mobile app on its own release cadence.
- Hardware peripheral code (analyzer/scale BT, thermal printer) stays isolated in Collect — never pollutes the ERP mobile app.

### Collect rollout phases
| Phase | Scope | Target |
|---|---|---|
| 1 | Backend module + tablet-friendly web UI (online clerk) | Epoch 3 (Oct–Nov 2026) |
| 2 | Dedicated Flutter `apps/collect/` mobile app with offline sync | Q1 2027 |
| 3 | Hardware peripherals: milk analyzer (BT), weighing scale, thermal printer | Q2 2027 |

### Brand positioning
Market **runq Collect** as a named product from day one — even though technically it's a runq module. Lets you sell it standalone without re-platforming later. Tagline candidate: *"The only Indian milk-procurement app that posts straight to your books."*

---

## 4. Recommended build sequence

Plan the next ~6 months as **3 epochs**:

### Epoch 1 — Finish core operational backbone (Jun–Jul 2026)
**Goal:** A dairy can run procurement → production → dispatch end-to-end on runq.

1. **Inventory (WIP)** — close out current phases + dairy deltas (quality attrs, UOM, FEFO enforcement). *2–3 wks*
2. **Purchase & Procurement** — PR/RFQ/PO + 3-way match. *4–5 wks*
3. **Manufacturing Phase A** — BOM + WO + consumption + output. *2–3 wks*

**Why this order:** Inventory is the substrate. Purchase is needed to legitimately bring stock in. Manufacturing turns stock into FG. After this epoch, the factory side works.

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
| Inventory dairy deltas | A | — | Jun 2026 | Jun 2026 | Not started |
| Purchase & Procurement | MVP | — | Jun 2026 | Jul 2026 | Not started |
| Manufacturing (BOM) | A | — | Jul 2026 | Jul 2026 | Not started |
| Sales & Distribution | MVP | — | Aug 2026 | Sep 2026 | Not started |
| Quality Control | MVP | — | Sep 2026 | Sep 2026 | Not started |
| Milk Procurement — Collect backend + web | 1 | — | Oct 2026 | Nov 2026 | Not started |
| Milk Procurement — Collect mobile app (offline) | 2 | — | Jan 2027 | Mar 2027 | Not started |
| Milk Procurement — Collect hardware peripherals | 3 | — | Apr 2027 | Jun 2027 | Not started |
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
