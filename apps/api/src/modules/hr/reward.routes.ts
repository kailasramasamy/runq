import { FastifyPluginAsync } from 'fastify';
import type { Db } from '@runq/db';
import {
  createRewardSchema,
  updateRewardSchema,
  approveRewardSchema,
  rewardFilterSchema,
  payRewardSchema,
  createRewardTypeSchema,
  updateRewardTypeSchema,
  suggestRewardCitationSchema,
  redeemPointsSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { resolveHrAccessScope } from './access-scope';
import { RewardService } from './reward.service';
import { RewardTypeService } from './reward-type.service';
import { RewardPostingService } from './reward-posting.service';
import { EmployeePaymentService } from './payroll/employee-payment.service';
import { HrNotifier } from './hr-notifier';
import { suggestRewardCitation } from './ai-suggest.service';

// Everyone authenticated reads (service scopes a manager/viewer down).
const ALL_ROLES = ['owner', 'accountant', 'hr', 'viewer'] as const;
// A manager initiates; HR decides. Approval excludes bare viewers.
const APPROVE_ROLES = ['owner', 'accountant', 'hr'] as const;
// GL post + payout move money — accountant / owner only.
const FINANCE_ROLES = ['owner', 'accountant'] as const;
// Reward type catalogue is HR configuration.
const CONFIG_ROLES = ['owner', 'accountant', 'hr'] as const;

export const rewardRoutes: FastifyPluginAsync = async (app) => {
  // ---- Reward type catalogue ----

  app.get(
    '/reward-types',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const activeOnly = (request.query as { activeOnly?: string }).activeOnly === 'true';
      const service = new RewardTypeService(request.server.db, request.tenantId);
      return { data: await service.list({ activeOnly }) };
    },
  );

  app.post(
    '/reward-types',
    { preHandler: [rbacHook([...CONFIG_ROLES])] },
    async (request) => {
      const input = createRewardTypeSchema.parse(request.body);
      const service = new RewardTypeService(request.server.db, request.tenantId);
      return { data: await service.create(input) };
    },
  );

  app.post(
    '/reward-types/seed-defaults',
    { preHandler: [rbacHook([...CONFIG_ROLES])] },
    async (request) => {
      const service = new RewardTypeService(request.server.db, request.tenantId);
      return { data: await service.seedDefaults() };
    },
  );

  app.put(
    '/reward-types/:id',
    { preHandler: [rbacHook([...CONFIG_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateRewardTypeSchema.parse(request.body);
      const service = new RewardTypeService(request.server.db, request.tenantId);
      return { data: await service.update(id, input) };
    },
  );

  app.delete(
    '/reward-types/:id',
    { preHandler: [rbacHook([...CONFIG_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new RewardTypeService(request.server.db, request.tenantId);
      await service.remove(id);
      return reply.status(204).send();
    },
  );

  // ---- Reward points ----

  // Employee's redeemable points balance. Resolves the caller to their
  // employee record via email-or-phone match.
  app.get(
    '/rewards/points/balance',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new RewardService(request.server.db, request.tenantId);
      return { data: await service.pointsBalanceForUser(request.user!.userId) };
    },
  );

  // Employee self-service redemption — submits a kind='monetary' reward
  // with pointsUsed set, awaiting HR approval.
  app.post(
    '/rewards/redeem',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const input = redeemPointsSchema.parse(request.body);
      const service = new RewardService(request.server.db, request.tenantId);
      return { data: await service.createRedemption(input, request.user!.userId) };
    },
  );

  // ---- Rewards ----

  // AI: draft a citation from the reward title. Open to anyone who can
  // initiate a reward. 503 when the server has no Anthropic key configured.
  app.post(
    '/rewards/suggest-citation',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const input = suggestRewardCitationSchema.parse(request.body);
      return { data: { citation: await suggestRewardCitation(input) } };
    },
  );

  app.get(
    '/rewards',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const filters = rewardFilterSchema.parse(request.query);
      const scope = await resolveHrAccessScope(request);
      const service = new RewardService(request.server.db, request.tenantId, scope);
      return { data: await service.list(filters) };
    },
  );

  app.get(
    '/rewards/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new RewardService(request.server.db, request.tenantId);
      return { data: await service.getById(id) };
    },
  );

  // A manager initiates a reward for one of their reports. The service
  // scope-gates a viewer to their reporting subtree and blocks self-rewards.
  app.post(
    '/rewards',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const input = createRewardSchema.parse(request.body);
      const scope = await resolveHrAccessScope(request);
      const service = new RewardService(request.server.db, request.tenantId, scope);
      return { data: await service.create(input, request.user!.userId) };
    },
  );

  app.put(
    '/rewards/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateRewardSchema.parse(request.body);
      const scope = await resolveHrAccessScope(request);
      const service = new RewardService(request.server.db, request.tenantId, scope);
      return { data: await service.update(id, input) };
    },
  );

  app.post(
    '/rewards/:id/submit',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const scope = await resolveHrAccessScope(request);
      const service = new RewardService(request.server.db, request.tenantId, scope);
      return { data: await service.submit(id) };
    },
  );

  // HR decision. Owner / accountant / hr only — a manager cannot approve.
  app.put(
    '/rewards/:id/approve',
    { preHandler: [rbacHook([...APPROVE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = approveRewardSchema.parse(request.body);
      const service = new RewardService(request.server.db, request.tenantId);
      const data = await service.approve(id, request.user!.userId, input.approved, input.rejectionReason);
      return { data };
    },
  );

  // Post an approved monetary reward to the GL (Dr expense / Cr 2114).
  app.post(
    '/rewards/:id/post',
    { preHandler: [rbacHook([...FINANCE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const posting = new RewardPostingService(request.server.db, request.tenantId);
      await posting.post(id, request.user!.userId);
      const service = new RewardService(request.server.db, request.tenantId);
      return { data: await service.getById(id) };
    },
  );

  // Disburse a posted reward through the employee_payments subledger.
  app.post(
    '/rewards/:id/pay',
    { preHandler: [rbacHook([...FINANCE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = payRewardSchema.parse(request.body);
      const payments = new EmployeePaymentService(request.server.db, request.tenantId);
      await payments.recordRewardPayment(id, input, request.user!.userId);

      const service = new RewardService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      void firePaid(request.server.db, request.tenantId, data);
      return { data };
    },
  );

  app.delete(
    '/rewards/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const scope = await resolveHrAccessScope(request);
      const service = new RewardService(request.server.db, request.tenantId, scope);
      await service.hardDelete(id);
      return reply.status(204).send();
    },
  );
};

/** Notify the employee that their reward was disbursed. Never throws. */
async function firePaid(
  db: Db,
  tenantId: string,
  reward: { id: string; employeeId: string; title: string; amount: string },
): Promise<void> {
  try {
    await new HrNotifier(db, tenantId).notifyEmployee(reward.employeeId, {
      type: 'ok',
      source: 'hr_reward',
      title: 'Reward paid',
      body: `₹${reward.amount} for "${reward.title}" has been disbursed.`,
      targetUrl: `/hr/rewards/${reward.id}`,
    });
  } catch {
    /* notification failures must not fail the payout */
  }
}
