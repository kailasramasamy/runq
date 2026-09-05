import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Shared enums for the milk-procurement (Dhenu) module. Defined once here and
 * imported by the table files so each `pgEnum` is created exactly once.
 */
export const mpNodeType = pgEnum('mp_node_type', ['vmcc', 'cc', 'pp']);
export const mpPayoutMode = pgEnum('mp_payout_mode', ['direct_to_farmer', 'via_vmcc']);
// `cow` is retained as legacy (pre-A1/A2 data); new entries use cow_a1
// (crossbred/regular cow) or cow_a2 (indigenous/desi cow).
export const mpMilkType = pgEnum('mp_milk_type', ['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);
// `clr` = lactometer-only pricing: a 1-D CLR→₹/L breakpoint table, for VMCCs
// without a fat/SNF milk analyzer. See mpMeasurementMode on the node.
export const mpPricingMode = pgEnum('mp_pricing_mode', ['matrix', 'flat', 'clr']);
// Which reading a chart prices from — the axis a rate assignment is keyed on.
// `matrix` and `flat` both read fat/SNF, so they compete for the same slot;
// `clr` is a separate slot because a lactometer node supplies CLR instead. One
// scope can therefore need two charts for the same milk type (an analyzer VMCC
// and a lactometer VMCC under the same CC).
export const mpPricingFamily = pgEnum('mp_pricing_family', ['fat_snf', 'clr']);
// Who a rate chart is assigned to. `tenant` is the per-milk-type default that
// everything inherits; node/farmer are overrides. Most specific wins.
export const mpRateScope = pgEnum('mp_rate_scope', ['tenant', 'node', 'farmer']);
// A node's milk-testing capability. `analyzer` → fat/SNF (matrix/flat charts);
// `lactometer` → CLR-only (clr charts). VMCC-level toggle; CC/PP are analyzer.
export const mpMeasurementMode = pgEnum('mp_measurement_mode', ['analyzer', 'lactometer']);
export const mpGrade = pgEnum('mp_grade', ['a', 'b', 'c']);
// Which milk-quality metric a configurable good/watch/low band applies to.
export const mpQualityMetric = pgEnum('mp_quality_metric', ['fat', 'snf', 'clr']);
export const mpRateRule = pgEnum('mp_rate_rule', ['quality_bonus', 'volume_slab', 'quarterly_fat_bonus']);
export const mpShift = pgEnum('mp_shift', ['am', 'pm']);
// Which shifts a VMCC collects in. `both` (default) | `am` | `pm` — drives the
// receive-screen VMCC list (only sources for the current shift are shown).
export const mpCollectionShifts = pgEnum('mp_collection_shifts', ['both', 'am', 'pm']);
/**
 * How a node closes collection and dispatches what it holds.
 *  - `per_shift` — AM and PM close and dispatch independently, each consignment
 *    shift-tagged. Traceability per shift survives all the way downstream.
 *  - `day`       — today AM + PM pool into one dispatch (shift null). Needs
 *    somewhere to hold the AM milk until the PM tanker.
 *  - `overnight` — previous-day PM + today AM pool into one dispatch, the
 *    chilled-overnight pattern. Today's PM belongs to the NEXT pool.
 *
 * Replaces inferring the behaviour from `has_bmc` / `overnight_pooling`: those
 * describe the equipment, this describes the operating pattern, and a node can
 * have a BMC and still want per-shift traceability.
 */
export const mpDispatchMode = pgEnum('mp_dispatch_mode', ['per_shift', 'day', 'overnight']);
export const mpCaptureSrc = pgEnum('mp_capture_src', ['manual', 'device']);
export const mpPourStatus = pgEnum('mp_pour_status', ['recorded', 'reversed']);
export const mpConsignmentKind = pgEnum('mp_consignment_kind', ['vmcc_to_cc', 'cc_to_pp']);
export const mpConsignmentStatus = pgEnum('mp_consignment_status', ['in_transit', 'received', 'reversed']);
export const mpQcVerdict = pgEnum('mp_qc_verdict', ['pass', 'fail', 'conditional']);
export const mpCycleStatus = pgEnum('mp_cycle_status', ['open', 'locked', 'paid', 'reversed']);
// Per-VMCC settlement bill for a locked cycle. `generated` on creation (amounts
// already final), `paid` once the VMCC is settled + txn recorded, `reversed` to unwind.
export const mpBillStatus = pgEnum('mp_bill_status', ['generated', 'paid', 'reversed']);
// `farmer_sale` — goods the farmer BOUGHT from us: bulk milk a trader resells,
// or ghee/curd/paneer off the counter. Recovered before advances — it is the
// freshest receivable and, unlike a loan, was never meant to sit on the books.
// `quality_rejection` — milk that failed QC and went back. Recovered alongside
// `farmer_sale`, ahead of advances: it is not a debt the farmer took on, it is
// milk we never got, so it comes off the top of what we owe for the milk we did.
export const mpDeduction = pgEnum('mp_deduction', [
  'advance', 'cattle_feed_loan', 'farmer_sale', 'quality_rejection', 'other',
]);
// Where a rejection was made. Attribution does NOT follow this — milk caught at
// the plant can still trace to one farmer's pour (see MpRejectionService).
export const mpRejectionStage = pgEnum('mp_rejection_stage', ['gate', 'cc_receipt', 'pp_receipt']);
export const mpRejectionReason = pgEnum('mp_rejection_reason', [
  'sour', 'adulterated', 'temperature', 'cob_positive', 'antibiotic', 'foreign_matter', 'other',
]);
// Where the milk physically went. `returned` is the norm; `destroyed` matters
// to anyone later asking what happened to the litres.
export const mpRejectionDisposition = pgEnum('mp_rejection_disposition', ['returned', 'destroyed']);
// Who is out of pocket. Quality-rejected milk is not paid for, and the supplier
// who sent it carries it: a farmer when the milk traces to their pour, the VMCC
// when it arrived as a direct receipt with no pours behind it. `company` is an
// owner override for milk that traces to neither, never a default.
export const mpRejectionBearer = pgEnum('mp_rejection_bearer', ['farmer', 'vmcc', 'company']);
// What the farmer bought: bulk milk off the centre's pool, or a finished
// product (ghee, curd, paneer) from the item master. Only `raw_milk` draws
// down what the centre can still dispatch.
export const mpSaleKind = pgEnum('mp_sale_kind', ['raw_milk', 'product']);
export const mpLedgerEntry = pgEnum('mp_ledger_entry', [
  'advance_given', 'feed_loan_given', 'farmer_sale', 'quality_rejection', 'repayment', 'adjustment',
]);
export const mpOperatorRole = pgEnum('mp_operator_role', ['operator', 'owner']);
export const mpCompType = pgEnum('mp_comp_type', ['per_litre_commission', 'fixed_salary']);
// Dhenu app login personas (independent of HR `employees` auth). Each maps 1:1
// to the matching `user_role` value minted on first login.
export const mpCredentialRole = pgEnum('mp_credential_role', ['farmer', 'field_operator', 'admin']);
