import { describe, it, expect } from 'vitest';
import {
  daysBetween, dayFactor, memberEarnings, memberWindow,
  contractEarnings, contractBalance, settlementJournalLines,
  type MemberTerms, type DayException, type ContractTerms,
} from './earnings';

const member = (o: Partial<MemberTerms> = {}): MemberTerms => ({
  id: 'm1',
  name: 'Ramesh',
  role: 'mason',
  dailyRate: 1200,
  joinedOn: null,
  leftOn: null,
  ...o,
});

const leave = (date: string, memberId = 'm1'): DayException => ({
  memberId, logDate: date, status: 'leave',
});
const half = (date: string, memberId = 'm1'): DayException => ({
  memberId, logDate: date, status: 'half_day',
});

const solo: ContractTerms = {
  contractType: 'solo_daily',
  fixedAmount: null,
  startDate: '2026-08-01',
  endDate: '2026-08-10',
};

describe('daysBetween', () => {
  it('is inclusive of both ends', () => {
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(1);
    expect(daysBetween('2026-08-01', '2026-08-10')).toBe(10);
  });

  it('crosses a month boundary', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(4);
  });

  /// India has no DST, but the maths runs in UTC anyway so a summer-time
  /// jump elsewhere cannot knock a day off a wage bill.
  it('is unaffected by daylight-saving transitions', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(3);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(3);
  });

  it('returns 0 for a backwards window', () => {
    expect(daysBetween('2026-08-10', '2026-08-01')).toBe(0);
  });
});

describe('dayFactor', () => {
  it('prices worked, half and leave', () => {
    expect(dayFactor('worked')).toBe(1);
    expect(dayFactor('half_day')).toBe(0.5);
    expect(dayFactor('leave')).toBe(0);
  });
});

describe('memberEarnings — every day works unless marked', () => {
  it('counts every day in the window with no exceptions at all', () => {
    const e = memberEarnings(member(), [], '2026-08-01', '2026-08-10');
    expect(e.eligibleDays).toBe(10);
    expect(e.daysWorked).toBe(10);
    expect(e.earned).toBe(12000);
  });

  it('subtracts a marked leave day', () => {
    const e = memberEarnings(member(), [leave('2026-08-05')], '2026-08-01', '2026-08-10');
    expect(e.leaveDays).toBe(1);
    expect(e.daysWorked).toBe(9);
    expect(e.earned).toBe(10800);
  });

  it('counts a half day as half', () => {
    const e = memberEarnings(member(), [half('2026-08-05')], '2026-08-01', '2026-08-10');
    expect(e.halfDays).toBe(1);
    expect(e.daysWorked).toBe(9.5);
    expect(e.earned).toBe(11400);
  });

  it('handles leave and half days together', () => {
    const e = memberEarnings(
      member(),
      [leave('2026-08-03'), leave('2026-08-04'), half('2026-08-07')],
      '2026-08-01', '2026-08-10',
    );
    expect(e.daysWorked).toBe(7.5);
    expect(e.earned).toBe(9000);
  });

  it('ignores exceptions belonging to another member', () => {
    const e = memberEarnings(member(), [leave('2026-08-05', 'other')], '2026-08-01', '2026-08-10');
    expect(e.daysWorked).toBe(10);
  });

  /// A member who joins on the 5th cannot have "worked" the 1st, and a
  /// leave marked before they arrived must not dock them.
  it('accrues only from the joining date', () => {
    const e = memberEarnings(
      member({ joinedOn: '2026-08-05' }),
      [leave('2026-08-02')],
      '2026-08-01', '2026-08-10',
    );
    expect(e.eligibleDays).toBe(6);
    expect(e.leaveDays).toBe(0);
    expect(e.earned).toBe(7200);
  });

  it('stops accruing after the leaving date', () => {
    const e = memberEarnings(
      member({ leftOn: '2026-08-06' }),
      [],
      '2026-08-01', '2026-08-10',
    );
    expect(e.eligibleDays).toBe(6);
    expect(e.earned).toBe(7200);
  });

  it('earns nothing when the member left before the window opened', () => {
    const e = memberEarnings(
      member({ leftOn: '2026-07-20' }),
      [],
      '2026-08-01', '2026-08-10',
    );
    expect(e.eligibleDays).toBe(0);
    expect(e.earned).toBe(0);
  });

  /// Marking every day of the term as leave must floor at zero rather than
  /// producing a negative wage.
  it('never goes negative when everything is marked leave', () => {
    const all = Array.from({ length: 10 }, (_, i) =>
      leave(`2026-08-${String(i + 1).padStart(2, '0')}`));
    const e = memberEarnings(member(), all, '2026-08-01', '2026-08-10');
    expect(e.daysWorked).toBe(0);
    expect(e.earned).toBe(0);
  });
});

describe('memberWindow', () => {
  it('narrows to the tighter of contract and member dates', () => {
    const w = memberWindow(
      member({ joinedOn: '2026-08-03', leftOn: '2026-08-08' }),
      '2026-08-01', '2026-08-10',
    );
    expect(w).toEqual({ from: '2026-08-03', to: '2026-08-08' });
  });

  it('is null when the member window falls outside the contract', () => {
    expect(memberWindow(member({ joinedOn: '2026-09-01' }), '2026-08-01', '2026-08-10')).toBeNull();
  });
});

describe('contractEarnings', () => {
  const TODAY = '2026-08-20';

  it('sums a crew at their own rates', () => {
    const crew: ContractTerms = { ...solo, contractType: 'crew_daily' };
    const e = contractEarnings(
      crew,
      [
        member({ id: 'm1', name: 'Ramesh', role: 'mason', dailyRate: 1200 }),
        member({ id: 'm2', name: 'Suresh', role: 'assistant', dailyRate: 800 }),
        member({ id: 'm3', name: 'Kumar', role: 'helper', dailyRate: 500 }),
      ],
      [leave('2026-08-04', 'm3')],
      TODAY,
    );
    // 10 days: 12000 + 8000 + (9 × 500 = 4500)
    expect(e.earned).toBe(24500);
    expect(e.members).toHaveLength(3);
  });

  it('returns the lump sum for a task contract, ignoring days', () => {
    const task: ContractTerms = {
      contractType: 'task_lumpsum', fixedAmount: 15000,
      startDate: '2026-08-01', endDate: null,
    };
    const e = contractEarnings(task, [], [], TODAY);
    expect(e.earned).toBe(15000);
    expect(e.members).toEqual([]);
  });

  /// The headline behaviour for open-ended work: it keeps accruing to today
  /// with nothing scheduled to write rows.
  it('accrues an open-ended contract up to today', () => {
    const open: ContractTerms = { ...solo, endDate: null };
    const e = contractEarnings(open, [member()], [], TODAY);
    expect(e.throughDate).toBe(TODAY);
    expect(e.isOpenEnded).toBe(true);
    expect(e.members[0].eligibleDays).toBe(20);
    expect(e.earned).toBe(24000);
  });

  it('stops a closed contract at its end date even long after', () => {
    const e = contractEarnings(solo, [member()], [], '2026-12-31');
    expect(e.throughDate).toBe('2026-08-10');
    expect(e.earned).toBe(12000);
  });

  it('does not accrue past today on a contract ending in the future', () => {
    const future: ContractTerms = { ...solo, endDate: '2026-12-31' };
    const e = contractEarnings(future, [member()], [], TODAY);
    expect(e.throughDate).toBe(TODAY);
    expect(e.earned).toBe(24000);
  });

  it('honours an explicit as-of date', () => {
    const open: ContractTerms = { ...solo, endDate: null };
    const e = contractEarnings(open, [member()], [], TODAY, '2026-08-05');
    expect(e.throughDate).toBe('2026-08-05');
    expect(e.earned).toBe(6000);
  });
});

describe('contractBalance', () => {
  const TODAY = '2026-08-20';
  const crew: ContractTerms = { ...solo, contractType: 'crew_daily' };
  const roster = [
    member({ id: 'm1', name: 'Ramesh', role: 'mason', dailyRate: 1200 }),
    member({ id: 'm2', name: 'Suresh', role: 'assistant', dailyRate: 800 }),
  ];

  it('nets each member against their own advance', () => {
    const e = contractEarnings(crew, roster, [], TODAY);
    const b = contractBalance(crew, e, [{ memberId: 'm1', amount: 5000 }], 'Ramesh');
    const ramesh = b.lines.find((l) => l.memberId === 'm1')!;
    const suresh = b.lines.find((l) => l.memberId === 'm2')!;
    expect(ramesh.earned).toBe(12000);
    expect(ramesh.advancesRecovered).toBe(5000);
    expect(ramesh.netPayable).toBe(7000);
    // Suresh took nothing, so his net is untouched by Ramesh's advance.
    expect(suresh.advancesRecovered).toBe(0);
    expect(suresh.netPayable).toBe(8000);
    expect(b.netPayable).toBe(15000);
  });

  it('puts an untagged advance on its own lead line rather than losing it', () => {
    const e = contractEarnings(crew, roster, [], TODAY);
    const b = contractBalance(crew, e, [{ memberId: null, amount: 3000 }], 'Ramesh');
    const lead = b.lines.find((l) => l.memberId === null)!;
    expect(lead.advancesRecovered).toBe(3000);
    expect(lead.netPayable).toBe(-3000);
    // Total still reconciles: 20000 earned − 3000 advanced.
    expect(b.netPayable).toBe(17000);
    expect(b.lines.reduce((s, l) => s + l.netPayable, 0)).toBe(17000);
  });

  it('settles a task lumpsum as a single line against the lead', () => {
    const task: ContractTerms = {
      contractType: 'task_lumpsum', fixedAmount: 15000,
      startDate: '2026-08-01', endDate: null,
    };
    const e = contractEarnings(task, [], [], TODAY);
    const b = contractBalance(task, e, [{ memberId: null, amount: 4000 }], 'Papu');
    expect(b.lines).toHaveLength(1);
    expect(b.lines[0].memberName).toBe('Papu');
    expect(b.lines[0].earned).toBe(15000);
    expect(b.lines[0].netPayable).toBe(11000);
    expect(b.netPayable).toBe(11000);
  });

  it('applies other deductions to the total only', () => {
    const e = contractEarnings(crew, roster, [], TODAY);
    const b = contractBalance(crew, e, [], 'Ramesh', 800);
    expect(b.earned).toBe(20000);
    expect(b.netPayable).toBe(19200);
    // Member lines stay unapportioned — splitting a damages recovery across
    // a crew would be inventing a policy nobody agreed.
    expect(b.lines.reduce((s, l) => s + l.netPayable, 0)).toBe(20000);
  });

  it('reports a negative net when advances outrun earnings', () => {
    const e = contractEarnings(crew, roster, [], TODAY);
    const b = contractBalance(crew, e, [{ memberId: 'm1', amount: 25000 }], 'Ramesh');
    expect(b.netPayable).toBe(-5000);
  });
});

describe('settlementJournalLines', () => {
  const sum = (l: Array<{ debit?: number; credit?: number }>, k: 'debit' | 'credit') =>
    l.reduce((s, x) => s + (x[k] ?? 0), 0);

  it('balances with advances and a payout', () => {
    const l = settlementJournalLines({
      earned: 24500, advancesRecovered: 5000, otherDeductions: 0, netPayable: 19500,
    });
    expect(sum(l, 'debit')).toBe(sum(l, 'credit'));
  });

  it('expenses the wage once and clears the advance asset', () => {
    const l = settlementJournalLines({
      earned: 24500, advancesRecovered: 5000, otherDeductions: 0, netPayable: 19500,
    });
    expect(l.filter((x) => x.accountCode === '5201' && x.debit)).toHaveLength(1);
    expect(l.find((x) => x.accountCode === '1122')?.credit).toBe(5000);
  });

  it('omits the payable line when advances absorb everything', () => {
    const l = settlementJournalLines({
      earned: 5000, advancesRecovered: 5000, otherDeductions: 0, netPayable: 0,
    });
    expect(l.find((x) => x.accountCode === '2110')).toBeUndefined();
    expect(sum(l, 'debit')).toBe(sum(l, 'credit'));
  });
});
