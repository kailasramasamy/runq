import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Shared enums for the milk-procurement (Dhenu) module. Defined once here and
 * imported by the table files so each `pgEnum` is created exactly once.
 */
export const mpNodeType = pgEnum('mp_node_type', ['vmcc', 'cc', 'pp']);
export const mpPayoutMode = pgEnum('mp_payout_mode', ['direct_to_farmer', 'via_vmcc']);
export const mpMilkType = pgEnum('mp_milk_type', ['cow', 'buffalo', 'mixed']);
export const mpPricingMode = pgEnum('mp_pricing_mode', ['matrix', 'flat']);
export const mpGrade = pgEnum('mp_grade', ['a', 'b', 'c']);
export const mpRateRule = pgEnum('mp_rate_rule', ['quality_bonus', 'volume_slab']);
export const mpShift = pgEnum('mp_shift', ['am', 'pm']);
export const mpCaptureSrc = pgEnum('mp_capture_src', ['manual', 'device']);
export const mpPourStatus = pgEnum('mp_pour_status', ['recorded', 'reversed']);
export const mpConsignmentKind = pgEnum('mp_consignment_kind', ['vmcc_to_cc', 'cc_to_pp']);
export const mpConsignmentStatus = pgEnum('mp_consignment_status', ['in_transit', 'received', 'reversed']);
export const mpQcVerdict = pgEnum('mp_qc_verdict', ['pass', 'fail', 'conditional']);
export const mpCycleStatus = pgEnum('mp_cycle_status', ['open', 'locked', 'paid', 'reversed']);
export const mpDeduction = pgEnum('mp_deduction', ['advance', 'cattle_feed_loan', 'other']);
export const mpLedgerEntry = pgEnum('mp_ledger_entry', [
  'advance_given', 'feed_loan_given', 'repayment', 'adjustment',
]);
export const mpOperatorRole = pgEnum('mp_operator_role', ['operator', 'owner']);
export const mpCompType = pgEnum('mp_comp_type', ['per_litre_commission', 'fixed_salary']);
// Dhenu app login personas (independent of HR `employees` auth). Each maps 1:1
// to the matching `user_role` value minted on first login.
export const mpCredentialRole = pgEnum('mp_credential_role', ['farmer', 'field_operator']);
