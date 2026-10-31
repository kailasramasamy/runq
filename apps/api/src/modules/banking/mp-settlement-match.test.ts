import { describe, it, expect } from 'vitest';
import type { Db } from '@runq/db';
import { MpSettlementMatchService, type MpSettlement } from './mp-settlement-match.service';

const svc = new MpSettlementMatchService({} as Db, 't');

function settlement(id: string, amount: number, date: string, vendorId: string | null = null): MpSettlement {
  return { kind: 'bill', id, amount, date, journalEntryId: `je-${id}`, paymentId: null, vendorId };
}

describe('MpSettlementMatchService.pick', () => {
  it('matches a rupee-rounded NEFT to a bill carrying paise', () => {
    const pool = [settlement('a', 58119.35, '2026-09-04')];
    expect(svc.pick({ id: 'x', amount: '58119.00', transactionDate: '2026-09-04' }, pool, new Set())?.id).toBe('a');
  });

  it('ignores candidates outside ±₹1 or ±5 days', () => {
    const pool = [settlement('a', 58121, '2026-09-04'), settlement('b', 58119, '2026-09-12')];
    expect(svc.pick({ id: 'x', amount: '58119.00', transactionDate: '2026-09-04' }, pool, new Set())).toBeNull();
  });

  it('prefers the same vendor when amounts collide', () => {
    const pool = [settlement('a', 5000, '2026-09-04', 'v1'), settlement('b', 5000, '2026-09-04', 'v2')];
    const txn = { id: 'x', amount: '5000', transactionDate: '2026-09-04', vendorId: 'v2' };
    expect(svc.pick(txn, pool, new Set())?.id).toBe('b');
  });

  it('refuses an ambiguous match with no vendor to break the tie', () => {
    const pool = [settlement('a', 5000, '2026-09-04', 'v1'), settlement('b', 5000, '2026-09-05', 'v2')];
    expect(svc.pick({ id: 'x', amount: '5000', transactionDate: '2026-09-04' }, pool, new Set())).toBeNull();
  });

  it('takes a lone candidate even when bank import tagged another vendor', () => {
    const pool = [settlement('a', 51518, '2026-09-04', 'naveen')];
    const txn = { id: 'x', amount: '51518', transactionDate: '2026-09-04', vendorId: 'manjula' };
    expect(svc.pick(txn, pool, new Set())?.id).toBe('a');
  });

  it('skips settlements already used', () => {
    const pool = [settlement('a', 5000, '2026-09-04')];
    expect(svc.pick({ id: 'x', amount: '5000', transactionDate: '2026-09-04' }, pool, new Set(['a']))).toBeNull();
  });
});
