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
export const mpRateRule = pgEnum('mp_rate_rule', ['quality_bonus', 'volume_slab']);
export const mpShift = pgEnum('mp_shift', ['am', 'pm']);
// Which shifts a VMCC collects in. `both` (default) | `am` | `pm` — drives the
// receive-screen VMCC list (only sources for the current shift are shown).
export const mpCollectionShifts = pgEnum('mp_collection_shifts', ['both', 'am', 'pm']);
export const mpCaptureSrc = pgEnum('mp_capture_src', ['manual', 'device']);
export const mpPourStatus = pgEnum('mp_pour_status', ['recorded', 'reversed']);
export const mpConsignmentKind = pgEnum('mp_consignment_kind', ['vmcc_to_cc', 'cc_to_pp']);
export const mpConsignmentStatus = pgEnum('mp_consignment_status', ['in_transit', 'received', 'reversed']);
export const mpQcVerdict = pgEnum('mp_qc_verdict', ['pass', 'fail', 'conditional']);
export const mpCycleStatus = pgEnum('mp_cycle_status', ['open', 'locked', 'paid', 'reversed']);
// Per-VMCC settlement bill for a locked cycle. `generated` on creation (amounts
// already final), `paid` once the VMCC is settled + txn recorded, `reversed` to unwind.
export const mpBillStatus = pgEnum('mp_bill_status', ['generated', 'paid', 'reversed']);
export const mpDeduction = pgEnum('mp_deduction', ['advance', 'cattle_feed_loan', 'other']);
export const mpLedgerEntry = pgEnum('mp_ledger_entry', [
  'advance_given', 'feed_loan_given', 'repayment', 'adjustment',
]);
export const mpOperatorRole = pgEnum('mp_operator_role', ['operator', 'owner']);
export const mpCompType = pgEnum('mp_comp_type', ['per_litre_commission', 'fixed_salary']);
// Dhenu app login personas (independent of HR `employees` auth). Each maps 1:1
// to the matching `user_role` value minted on first login.
export const mpCredentialRole = pgEnum('mp_credential_role', ['farmer', 'field_operator']);
