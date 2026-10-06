import { describe, it, expect } from 'vitest';
import type { MpConsignmentRow } from '@runq/db';
import { isReportableShortage, shortageParams } from './mp-variance-notify';

const load = (o: Partial<MpConsignmentRow>) => ({
  kind: 'cc_to_pp', consignmentNo: 'CON-2610-0042', collectionDate: '2026-10-06', shift: 'am',
  dispatchQty: '1250.000', receiptQty: '1212.500', varianceQty: '-37.500', variancePct: '-3.000',
  varianceValue: '-1612.40', ...o,
}) as MpConsignmentRow;

describe('shortage alert', () => {
  it('fills the template in order with grouped, unsigned figures', () => {
    expect(Object.values(shortageParams('Ravi', load({}), 'Indus CC', 'Vrindavan Plant'))).toEqual([
      'Ravi', 'CON-2610-0042', 'Indus CC', '06 Oct 2026, Morning', 'Vrindavan Plant',
      '1,250', '1,212.5', '37.5', '3.0', '1,612',
    ]);
  });

  it('shows "-" for an unpriced loss', () => {
    expect(shortageParams('Ravi', load({ varianceValue: null }), 'A', 'B').loss).toBe('-');
  });

  it('fires for any CC→PP shortfall, however small', () => {
    expect(isReportableShortage(load({}))).toBe(true);
    expect(isReportableShortage(load({ varianceQty: '-0.500' }))).toBe(true);
    expect(isReportableShortage(load({ varianceQty: '0.000' }))).toBe(false);
    expect(isReportableShortage(load({ varianceQty: '2.000' }))).toBe(false);
    expect(isReportableShortage(load({ kind: 'vmcc_to_cc' }))).toBe(false);
  });
});
