/**
 * Contract earnings, with no database in sight.
 *
 * The rule the whole feature turns on: **every day from the start date is a
 * working day unless something says otherwise.** The day log therefore
 * stores only exceptions, and this module reconstructs the calendar from
 * (window + exceptions) rather than from a materialised row per day. That
 * is what lets an open-ended contract stay correct without a scheduler
 * quietly writing rows every midnight.
 *
 * Kept pure so the running total on the contract screen, the settlement
 * preview and the posted settlement all derive from one implementation.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type DayStatus = 'worked' | 'leave' | 'half_day';

/** What a day is worth, as a multiple of the daily rate. */
export function dayFactor(status: DayStatus): number {
  switch (status) {
    case 'leave': return 0;
    case 'half_day': return 0.5;
    default: return 1;
  }
}

export interface MemberTerms {
  id: string;
  name: string;
  role: string | null;
  dailyRate: number;
  /** Defaults to the contract start when null. */
  joinedOn: string | null;
  /** Defaults to the through-date when null. */
  leftOn: string | null;
}

export interface DayException {
  memberId: string;
  /** ISO yyyy-mm-dd */
  logDate: string;
  status: DayStatus;
}

export interface MemberEarnings {
  memberId: string;
  name: string;
  role: string | null;
  dailyRate: number;
  /** Calendar days the member was on the contract, inside the window. */
  eligibleDays: number;
  leaveDays: number;
  halfDays: number;
  /** eligibleDays − leaveDays − halfDays/2 */
  daysWorked: number;
  earned: number;
}

const MS_PER_DAY = 86_400_000;

/** Inclusive day count between two ISO dates. Negative windows give 0. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.round(ms / MS_PER_DAY) + 1);
}

const laterOf = (a: string, b: string) => (a > b ? a : b);
const earlierOf = (a: string, b: string) => (a < b ? a : b);

/**
 * The window a member actually accrues over: the contract window,
 * narrowed by when they joined and left.
 */
export function memberWindow(
  member: MemberTerms,
  contractStart: string,
  throughDate: string,
): { from: string; to: string } | null {
  const from = laterOf(contractStart, member.joinedOn ?? contractStart);
  const to = earlierOf(throughDate, member.leftOn ?? throughDate);
  return to < from ? null : { from, to };
}

export function memberEarnings(
  member: MemberTerms,
  exceptions: DayException[],
  contractStart: string,
  throughDate: string,
): MemberEarnings {
  const window = memberWindow(member, contractStart, throughDate);
  const base: MemberEarnings = {
    memberId: member.id,
    name: member.name,
    role: member.role,
    dailyRate: member.dailyRate,
    eligibleDays: 0,
    leaveDays: 0,
    halfDays: 0,
    daysWorked: 0,
    earned: 0,
  };
  if (!window) return base;

  const eligibleDays = daysBetween(window.from, window.to);

  // Only exceptions inside the member's own window count. A leave marked
  // before they joined must not reduce days they were never going to work.
  let leaveDays = 0;
  let halfDays = 0;
  for (const e of exceptions) {
    if (e.memberId !== member.id) continue;
    if (e.logDate < window.from || e.logDate > window.to) continue;
    if (e.status === 'leave') leaveDays++;
    else if (e.status === 'half_day') halfDays++;
  }

  const daysWorked = eligibleDays - leaveDays - halfDays * 0.5;
  return {
    ...base,
    eligibleDays,
    leaveDays,
    halfDays,
    daysWorked: Math.max(0, Math.round(daysWorked * 10) / 10),
    earned: r2(Math.max(0, daysWorked) * member.dailyRate),
  };
}

export interface ContractTerms {
  contractType: 'solo_daily' | 'task_lumpsum' | 'crew_daily';
  fixedAmount: number | null;
  startDate: string;
  /** Null for an open-ended contract. */
  endDate: string | null;
}

export interface ContractEarnings {
  /** The date earnings were computed up to. */
  throughDate: string;
  members: MemberEarnings[];
  earned: number;
  /** True when the term is still running (open-ended, or end date in future). */
  isOpenEnded: boolean;
}

/**
 * Earnings to date.
 *
 * @param today ISO date, injected rather than read from the clock so this
 *              stays deterministic under test.
 * @param asOf  Optional override — settle a contract through a specific
 *              date rather than today.
 */
export function contractEarnings(
  contract: ContractTerms,
  members: MemberTerms[],
  exceptions: DayException[],
  today: string,
  asOf?: string,
): ContractEarnings {
  // A closed term stops accruing at its end date even if that is in the
  // past; an open one accrues to today.
  const ceiling = contract.endDate ?? today;
  const throughDate = asOf ?? earlierOf(today, ceiling);
  const isOpenEnded = contract.endDate === null;

  if (contract.contractType === 'task_lumpsum') {
    return {
      throughDate,
      members: [],
      earned: r2(contract.fixedAmount ?? 0),
      isOpenEnded,
    };
  }

  const rows = members.map((m) =>
    memberEarnings(m, exceptions, contract.startDate, throughDate),
  );
  return {
    throughDate,
    members: rows,
    earned: r2(rows.reduce((s, m) => s + m.earned, 0)),
    isOpenEnded,
  };
}

export interface AdvanceRow {
  memberId: string | null;
  amount: number;
}

export interface SettlementLine {
  memberId: string | null;
  memberName: string;
  memberRole: string | null;
  dailyRate: number | null;
  daysWorked: number;
  earned: number;
  advancesRecovered: number;
  netPayable: number;
}

export interface ContractBalance {
  throughDate: string;
  earned: number;
  advancesPaid: number;
  /** earned − advances − deductions. Can be negative; callers guard. */
  netPayable: number;
  lines: SettlementLine[];
  isOpenEnded: boolean;
}

/**
 * Earnings netted against advances, broken down per person.
 *
 * A crew is settled individually — the mason and the helper are handed
 * different amounts — so an advance tagged to a member reduces that
 * member's net, not the pool. Advances with no member (a task lumpsum, or
 * cash handed to the lead) land on a single lead line.
 *
 * `otherDeductions` is an employer-side recovery against the contract as a
 * whole and is applied to the total only, not apportioned — splitting a
 * damages recovery across a crew would be inventing a policy.
 */
export function contractBalance(
  contract: ContractTerms,
  earnings: ContractEarnings,
  advances: AdvanceRow[],
  leadPersonName: string,
  otherDeductions = 0,
): ContractBalance {
  const advancesPaid = r2(advances.reduce((s, a) => s + a.amount, 0));
  const byMember = new Map<string, number>();
  let unattributed = 0;
  for (const a of advances) {
    if (a.memberId) {
      byMember.set(a.memberId, r2((byMember.get(a.memberId) ?? 0) + a.amount));
    } else {
      unattributed = r2(unattributed + a.amount);
    }
  }

  const lines: SettlementLine[] = earnings.members.map((m) => {
    const adv = byMember.get(m.memberId) ?? 0;
    return {
      memberId: m.memberId,
      memberName: m.name,
      memberRole: m.role,
      dailyRate: m.dailyRate,
      daysWorked: m.daysWorked,
      earned: m.earned,
      advancesRecovered: adv,
      netPayable: r2(m.earned - adv),
    };
  });

  // A lumpsum has no members, so the whole job is one line against the lead.
  if (contract.contractType === 'task_lumpsum') {
    lines.push({
      memberId: null,
      memberName: leadPersonName,
      memberRole: 'Crew lead',
      dailyRate: null,
      daysWorked: 0,
      earned: earnings.earned,
      advancesRecovered: unattributed,
      netPayable: r2(earnings.earned - unattributed),
    });
  } else if (unattributed > 0) {
    // Cash handed to the lead on a day-rate crew: it is still owed back, so
    // it shows as its own recovery line rather than vanishing from the
    // per-member arithmetic.
    lines.push({
      memberId: null,
      memberName: leadPersonName,
      memberRole: 'Crew lead',
      dailyRate: null,
      daysWorked: 0,
      earned: 0,
      advancesRecovered: unattributed,
      netPayable: r2(-unattributed),
    });
  }

  return {
    throughDate: earnings.throughDate,
    earned: earnings.earned,
    advancesPaid,
    netPayable: r2(earnings.earned - advancesPaid - r2(otherDeductions)),
    lines,
    isOpenEnded: earnings.isOpenEnded,
  };
}

/**
 * Journal lines for an approved settlement.
 *
 *   Dr 5201 Salary & Wages       earned
 *     Cr 1122 Employee Advances  advances recovered
 *     Cr 5201 Salary & Wages     other deductions
 *     Cr 2110 Salary Payable     net payable
 */
export function settlementJournalLines(f: {
  earned: number;
  advancesRecovered: number;
  otherDeductions: number;
  netPayable: number;
}): Array<{ accountCode: string; debit?: number; credit?: number; description: string }> {
  const lines: Array<{
    accountCode: string; debit?: number; credit?: number; description: string;
  }> = [
    { accountCode: '5201', debit: r2(f.earned), description: 'Contract wages' },
  ];
  if (f.advancesRecovered > 0) {
    lines.push({
      accountCode: '1122',
      credit: r2(f.advancesRecovered),
      description: 'Advances recovered',
    });
  }
  if (f.otherDeductions > 0) {
    lines.push({
      accountCode: '5201',
      credit: r2(f.otherDeductions),
      description: 'Other deductions',
    });
  }
  if (f.netPayable > 0) {
    lines.push({
      accountCode: '2110',
      credit: r2(f.netPayable),
      description: 'Net payable',
    });
  }
  return lines;
}
