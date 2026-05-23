import { eq, and } from 'drizzle-orm';
import { employeeRewards } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { NotFoundError, ConflictError } from '../../utils/errors';

const REWARDS_PAYABLE = '2114';        // Employee Rewards Payable
const DEFAULT_REWARD_ACCOUNT = '5205'; // Bonus & Incentives (fallback)

/**
 * Post an approved monetary reward to the GL: debit the reward type's expense
 * account (Bonus & Incentives by default), credit 2114 Employee Rewards
 * Payable. That liability is later cleared by an employee_payments row
 * (sourceType='employee_reward') when the reward is actually disbursed.
 *
 * Recognition rewards never reach this service — they carry no money.
 */
export class RewardPostingService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async post(rewardId: string, userId: string) {
    const [reward] = await this.db
      .select()
      .from(employeeRewards)
      .where(and(
        eq(employeeRewards.id, rewardId),
        eq(employeeRewards.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!reward) throw new NotFoundError('Reward');
    if (reward.kind !== 'monetary') {
      // Recognition and points-grant rewards never reach the ledger —
      // points hit GL only when redeemed (a redemption is itself stored
      // as a monetary reward and goes through this path normally).
      throw new ConflictError('Only monetary rewards post to the ledger');
    }
    if (reward.status !== 'approved') {
      throw new ConflictError('Only approved rewards can be posted to GL');
    }
    if (reward.journalEntryId) {
      throw new ConflictError('Reward is already posted');
    }
    const amount = Math.round(Number(reward.amount) * 100) / 100;
    if (amount <= 0) throw new ConflictError('Reward has zero amount');

    const expenseAccount = reward.glAccountCode ?? DEFAULT_REWARD_ACCOUNT;

    return this.db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: reward.awardDate,
        description: `Reward ${reward.rewardNumber} — ${reward.title}`,
        sourceType: 'employee_reward',
        sourceId: reward.id,
        lines: [
          { accountCode: expenseAccount, debit: amount, description: `Reward ${reward.rewardNumber}` },
          { accountCode: REWARDS_PAYABLE, credit: amount, description: `Owed to employee for ${reward.rewardNumber}` },
        ],
        createdBy: userId,
      });

      const [updated] = await tx
        .update(employeeRewards)
        .set({ status: 'posted', journalEntryId: je.id, updatedAt: new Date() })
        .where(eq(employeeRewards.id, reward.id))
        .returning();
      return updated;
    });
  }
}
