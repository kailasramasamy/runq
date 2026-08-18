import { eq, and, desc } from 'drizzle-orm';
import { contractPauses } from '@runq/db';
import type { Db } from '@runq/db';
import type { PauseContractInput, ResumeContractInput } from '@runq/validators';
import { NotFoundError, ConflictError, ValidationError } from '../../../utils/errors';
import { ContractService } from './contract.service';

/**
 * Stopping and restarting the clock on a labour contract.
 *
 * Days accrue by themselves from the start date, so a stretch where nobody
 * turned up — rain, a stalled site, a festival — has to be recorded or the
 * crew is paid for it. Marking every one of those days as leave, for every
 * person, is the alternative this replaces.
 *
 * Stored as windows rather than a flag on the contract: a pause can be
 * booked for a future date, and a flag would need something running
 * overnight to flip it on the right morning.
 */

const MS_PER_DAY = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);

const FOREVER = '9999-12-31';

export type PauseState =
  | { state: 'running' }
  | { state: 'paused'; since: string; until: string | null; reason: string | null }
  | { state: 'pause_scheduled'; from: string; until: string | null; reason: string | null };

/**
 * Where the contract stands on a given day, derived from its pauses rather
 * than stored — which is what lets a pause booked for next Monday start
 * counting on Monday with nothing scheduled to make it happen.
 */
export function pauseState(
  pauses: (typeof contractPauses.$inferSelect)[],
  now: string,
): PauseState {
  const live = pauses.find(
    (p) => p.fromDate <= now && (p.toDate === null || p.toDate >= now),
  );
  if (live) {
    return { state: 'paused', since: live.fromDate, until: live.toDate, reason: live.reason };
  }
  const upcoming = pauses
    .filter((p) => p.fromDate > now)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate))[0];
  if (upcoming) {
    return {
      state: 'pause_scheduled',
      from: upcoming.fromDate,
      until: upcoming.toDate,
      reason: upcoming.reason,
    };
  }
  return { state: 'running' };
}

export class PauseService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(contractId: string) {
    return this.db
      .select()
      .from(contractPauses)
      .where(and(
        eq(contractPauses.tenantId, this.tenantId),
        eq(contractPauses.contractId, contractId),
      ))
      .orderBy(desc(contractPauses.fromDate));
  }

  /**
   * Stop the clock from a date. Leaving `toDate` off is the usual case —
   * nobody knows when the rain stops — and `resume` fills it in later.
   */
  async pause(contractId: string, input: PauseContractInput, userId: string) {
    const c = await this.assertChangeable(contractId);
    if (input.fromDate < c.startDate) {
      throw new ValidationError('A pause cannot start before the contract does');
    }
    if (c.endDate && input.fromDate > c.endDate) {
      throw new ValidationError('That date is after the contract ends');
    }
    await this.assertNoClash(contractId, input.fromDate, input.toDate ?? null);

    const [row] = await this.db
      .insert(contractPauses)
      .values({
        tenantId: this.tenantId,
        contractId,
        fromDate: input.fromDate,
        toDate: input.toDate ?? null,
        reason: input.reason ?? null,
        createdBy: userId,
      })
      .returning();
    return row;
  }

  /**
   * Back to work: the resume date is the first day that earns again, so the
   * pause ends the day before it.
   *
   * Two cases that are easy to get wrong, and both were:
   *
   * - **Resuming on the day the pause started.** The pause would cover no
   *   days at all, so it is removed rather than closed — a zero-day pause
   *   cannot be stored (the dates CHECK forbids it) and would be a lie
   *   anyway. This is how "actually, we did work that day" is undone.
   * - **Resuming on a date already set.** Re-sending the same resume is a
   *   no-op that succeeds, instead of failing with "not paused on that
   *   date" — which is what the screen invited when it kept offering the
   *   button after the resume had been booked.
   */
  async resume(contractId: string, input: ResumeContractInput, userId: string) {
    await this.assertChangeable(contractId);
    const dayBefore = addDays(input.resumeDate, -1);
    // A pause is in play for this resume if it starts on or before the
    // resume date and still covers the day before it. Latest first, so that
    // a pause starting exactly on the resume date wins over the one that
    // ended the day before.
    const live = (await this.list(contractId))
      .filter((p) => p.fromDate <= input.resumeDate
        && (p.toDate === null || p.toDate >= dayBefore))
      .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0];
    if (!live) {
      throw new ConflictError(
        'The work is not paused on that date. Pick the first day back after a pause that has already started.',
      );
    }

    if (live.fromDate === input.resumeDate) {
      await this.db.delete(contractPauses).where(eq(contractPauses.id, live.id));
      return { ...live, removed: true };
    }

    const [row] = await this.db
      .update(contractPauses)
      .set({ toDate: dayBefore, resumedBy: userId, updatedAt: new Date() })
      .where(eq(contractPauses.id, live.id))
      .returning();
    return { ...row, removed: false };
  }

  /** Drop a pause entered by mistake — including one booked for later. */
  async remove(pauseId: string) {
    const [row] = await this.db
      .select()
      .from(contractPauses)
      .where(and(
        eq(contractPauses.id, pauseId),
        eq(contractPauses.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Pause not found');
    await this.assertChangeable(row.contractId);
    await this.db.delete(contractPauses).where(eq(contractPauses.id, pauseId));
    return { id: pauseId };
  }

  /** Pauses move the money, so they freeze with the rest of the terms. */
  private async assertChangeable(contractId: string) {
    const contracts = new ContractService(this.db, this.tenantId);
    const c = await contracts.get(contractId);
    if (c.status !== 'active') {
      throw new ConflictError(`Contract is ${c.status} — its pauses can no longer be changed`);
    }
    if (await contracts.liveSettlement(contractId)) {
      throw new ConflictError(
        'This contract has a settlement — cancel it before changing when the work was paused',
      );
    }
    return c;
  }

  /**
   * Pauses are added, never unioned, when days are counted — so two of them
   * may not overlap or the same day would be deducted twice.
   */
  private async assertNoClash(contractId: string, from: string, to: string | null) {
    const clash = (await this.list(contractId)).find(
      (p) => from <= (p.toDate ?? FOREVER) && (to ?? FOREVER) >= p.fromDate,
    );
    if (!clash) return;
    throw new ConflictError(
      clash.toDate === null
        ? `The work is already paused from ${clash.fromDate} with no date to resume. Resume it first.`
        : `That overlaps the pause from ${clash.fromDate} to ${clash.toDate}.`,
    );
  }
}
