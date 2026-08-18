import { eq, and, desc } from 'drizzle-orm';
import { tenants, contractPauses, labourSettlementPayments } from '@runq/db';
import type { Db } from '@runq/db';
import { ContractService } from './contract.service';
import {
  contractEarnings, daysBetween,
  type MemberTerms, type DayException, type ContractTerms, type PauseWindow,
} from './earnings';
import type {
  ContractStatementData, StatementMember, StatementPause,
  StatementLeave, StatementAdvance,
} from './statement-template';

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Assembles the whole life of one contract for its statement.
 *
 * Earnings are recomputed here rather than read off the stored balance
 * because the statement needs the per-person workings — days on the job,
 * leave, half days, paused stretches — and the balance only carries what
 * each person is owed. Both go through `contractEarnings`, so the document
 * and the screen can never disagree.
 */
export class ContractStatementService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async forContract(contractId: string): Promise<ContractStatementData> {
    const contracts = new ContractService(this.db, this.tenantId);
    const c = await contracts.detail(contractId);

    const terms: ContractTerms = {
      contractType: c.contractType,
      fixedAmount: c.fixedAmount == null ? null : Number(c.fixedAmount),
      startDate: c.startDate,
      endDate: c.endDate,
    };
    const roster: MemberTerms[] = c.members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      dailyRate: Number(m.dailyRate),
      joinedOn: m.joinedOn,
      leftOn: m.leftOn,
    }));
    const exceptions: DayException[] = c.dayLog.map((e) => ({
      memberId: e.memberId,
      logDate: e.logDate,
      status: e.status,
    }));
    const windows: PauseWindow[] = c.pauses.map((p) => ({
      fromDate: p.fromDate,
      toDate: p.toDate,
    }));
    const earnings = contractEarnings(terms, roster, exceptions, today(), undefined, windows);

    const members: StatementMember[] = earnings.members.map((e, i) => ({
      name: e.name,
      role: e.role,
      dailyRate: e.dailyRate,
      joinedOn: c.members[i]?.joinedOn ?? null,
      leftOn: c.members[i]?.leftOn ?? null,
      // `eligibleDays` is already net of pauses; the statement shows the
      // gross so the row's subtractions read left to right.
      daysOnJob: e.eligibleDays + e.pausedDays,
      pausedDays: e.pausedDays,
      leaveDays: e.leaveDays,
      halfDays: e.halfDays,
      daysWorked: e.daysWorked,
      earned: e.earned,
    }));

    const [t] = await this.db.select({ name: tenants.name }).from(tenants)
      .where(eq(tenants.id, this.tenantId)).limit(1);

    const advances = this.advanceRows(c);
    // Settling flips every advance to `recovered`, which zeroes the balance's
    // "still to recover" figure. The statement is a history, so it reports
    // what was handed over rather than what is left outstanding.
    const advancesTotal = r2(advances
      .filter((a) => a.status !== 'cancelled')
      .reduce((s, a) => s + a.amount, 0));

    return {
      tenantName: t?.name ?? 'runq',
      contract: {
        number: c.contractNumber,
        name: c.name,
        leadPersonName: c.leadPersonName,
        leadPersonPhone: c.leadPersonPhone,
        contractType: c.contractType,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        fixedAmount: c.fixedAmount == null ? null : Number(c.fixedAmount),
        notes: c.notes,
      },
      throughDate: earnings.throughDate,
      members,
      pauses: await this.pauseRows(contractId, earnings.throughDate),
      leaves: this.leaveRows(c),
      advances,
      totals: {
        daysWorked: Math.round(members.reduce((s, m) => s + m.daysWorked, 0) * 10) / 10,
        leaveDays: members.reduce((s, m) => s + m.leaveDays, 0),
        halfDays: members.reduce((s, m) => s + m.halfDays, 0),
        pausedDays: earnings.pausedDays,
        earned: earnings.earned,
        advancesTotal,
        advancesPaid: c.balance.advancesPaid,
        outstanding: c.balance.netPayable,
      },
      settlement: await this.settlementBlock(c),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Pause windows with their length, clipped to the counted period so an
   *  unresumed pause does not print a run to the end of time. */
  private async pauseRows(contractId: string, throughDate: string): Promise<StatementPause[]> {
    const rows = await this.db
      .select()
      .from(contractPauses)
      .where(and(
        eq(contractPauses.tenantId, this.tenantId),
        eq(contractPauses.contractId, contractId),
      ))
      .orderBy(contractPauses.fromDate);
    return rows.map((p) => ({
      fromDate: p.fromDate,
      toDate: p.toDate,
      reason: p.reason,
      days: daysBetween(p.fromDate, p.toDate ?? throughDate),
    }));
  }

  private leaveRows(c: Awaited<ReturnType<ContractService['detail']>>): StatementLeave[] {
    const nameOf = new Map(c.members.map((m) => [m.id, m.name] as const));
    return c.dayLog
      .map((e) => ({
        logDate: e.logDate,
        memberName: nameOf.get(e.memberId) ?? '—',
        status: e.status,
        note: e.note,
      }))
      .sort((a, b) => a.logDate.localeCompare(b.logDate)
        || a.memberName.localeCompare(b.memberName));
  }

  private advanceRows(c: Awaited<ReturnType<ContractService['detail']>>): StatementAdvance[] {
    const nameOf = new Map(c.members.map((m) => [m.id, m.name] as const));
    return c.advances.map((a) => ({
      paidOn: a.paidOn,
      toName: (a.memberId ? nameOf.get(a.memberId) : null) ?? c.leadPersonName,
      paymentMethod: a.paymentMethod,
      reference: a.reference,
      amount: Number(a.amount),
      status: a.status,
    }));
  }

  /** The live settlement and everything handed over against it. */
  private async settlementBlock(c: Awaited<ReturnType<ContractService['detail']>>) {
    const s = c.settlements.find((x) => x.status !== 'cancelled');
    if (!s) return null;
    const payments = await this.db
      .select()
      .from(labourSettlementPayments)
      .where(and(
        eq(labourSettlementPayments.tenantId, this.tenantId),
        eq(labourSettlementPayments.settlementId, s.id),
      ))
      .orderBy(desc(labourSettlementPayments.paymentDate));
    const netPayable = r2(Number(s.netPayable));
    const amountPaid = r2(Number(s.amountPaid));
    return {
      number: s.settlementNumber,
      toDate: s.toDate,
      earned: r2(Number(s.earned)),
      advancesRecovered: r2(Number(s.advancesRecovered)),
      otherDeductions: r2(Number(s.otherDeductions)),
      netPayable,
      amountPaid,
      amountDue: Math.max(0, r2(netPayable - amountPaid)),
      status: s.status === 'approved' && amountPaid > 0 ? 'part paid' : s.status,
      payments: payments.map((p) => ({
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        amount: Number(p.amount),
        voided: p.voidedAt != null,
      })),
    };
  }
}
