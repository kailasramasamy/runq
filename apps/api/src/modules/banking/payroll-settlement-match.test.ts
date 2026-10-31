import { describe, it, expect } from 'vitest';
import type { Db } from '@runq/db';
import { PayrollSettlementMatchService, type SalaryTransfer } from './payroll-settlement-match.service';

const svc = new PayrollSettlementMatchService({} as Db, 't');
const BANK = 'bank-1';

function transfer(id: string, over: Partial<SalaryTransfer>): SalaryTransfer {
  return {
    id, status: 'paid', amount: 17000, date: '2026-10-10', payableFrom: '2026-09-30',
    reference: null, bankAccountId: BANK, names: ['KISHORE', 'INDUS'], ...over,
  };
}

const neft = (amount: string, date: string, narration: string) => ({ id: 'x', amount, transactionDate: date, narration });

describe('PayrollSettlementMatchService.pick', () => {
  it('matches on the UTR HR recorded even when the bank sent less', () => {
    const pool = [transfer('a', { amount: 25000, reference: 'IN42628359255434', names: ['SHANMUGAM'] })];
    const m = svc.pick(neft('15851', '2026-10-10', 'INF/NEFT/IN42628359255434/IDIB000T170/DAIRYSHANMUGAM'), BANK, pool, new Set());
    expect(m).toEqual({ transfer: pool[0], byUtr: true });
  });

  it('matches a paid transfer by name and amount within ±5 days', () => {
    const pool = [transfer('a', { amount: 5000, date: '2026-10-02', names: ['PAVITHRA', 'INDUS'] })];
    expect(svc.pick(neft('5000', '2026-10-02', 'INF/NEFT/IN4262/UCBA0002538/INDUSPAVITHRA'), BANK, pool, new Set())?.transfer.id).toBe('a');
  });

  it('needs the name — same amount to someone else is not a match', () => {
    const pool = [transfer('a', {})];
    expect(svc.pick(neft('17000', '2026-10-10', 'INF/NEFT/IN4262/SBIN/DAIRYCHETANDRIV'), BANK, pool, new Set())).toBeNull();
  });

  it('does not take a pending transfer before the payroll month has ended', () => {
    const pool = [transfer('a', { status: 'pending', amount: 18500, names: ['KARTHIK'] })];
    const txn = (date: string) => neft('18500', date, 'INF/NEFT/IN4262/UBIN0576085/DAIRYKARTHIK');
    expect(svc.pick(txn('2026-09-17'), BANK, pool, new Set())).toBeNull();
    expect(svc.pick(txn('2026-10-16'), BANK, pool, new Set())?.transfer.id).toBe('a');
  });

  it('ignores transfers recorded against another bank account', () => {
    const pool = [transfer('a', { bankAccountId: 'bank-2' })];
    expect(svc.pick(neft('17000', '2026-10-10', 'INF/NEFT/IN4262/UTIB/INDUSKISHORE'), BANK, pool, new Set())).toBeNull();
  });

  it('refuses an ambiguous name + amount match', () => {
    const pool = [transfer('a', {}), transfer('b', { date: '2026-10-11' })];
    expect(svc.pick(neft('17000', '2026-10-10', 'INF/NEFT/IN4262/UTIB/INDUSKISHORE'), BANK, pool, new Set())).toBeNull();
  });
});
