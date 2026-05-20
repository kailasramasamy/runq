import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { statutoryChallans } from '@runq/db';
import {
  uuidParamSchema, recordTdsDepositSchema, recordStatutoryDepositSchema,
  tds24QQuerySchema, fileTdsReturnSchema, tdsFinancialYearQuerySchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { TdsChallanService } from './tds-challan.service';
import { TdsReturnService } from './tds-return.service';
import { TdsForm16Service } from './tds-form16.service';
import { StatutoryChallanService } from './statutory-challan.service';
import { PayrollRunService } from '../payroll/payroll-run.service';
import { ConflictError, NotFoundError } from '../../../utils/errors';

const challanListQuery = z.object({
  payrollRunId: z.string().uuid().optional(),
  kind: z.enum(['pf', 'esi', 'pt', 'tds']).optional(),
});

// TDS challans / returns / Form 16 carry per-deductee PAN + pay — admin
// roles only, no viewer. Filing is Finance write (owner/accountant).
const MANAGE = ['owner', 'accountant', 'hr'] as const;
const WRITE = ['owner', 'accountant'] as const;

export const tdsRoutes: FastifyPluginAsync = async (app) => {
  // ── Monthly TDS deposit challans (ITNS-281) ──────────────────────────
  app.get('/tds-challans', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const svc = new TdsChallanService(req.server.db, req.tenantId);
    return { data: await svc.syncAndList() };
  });

  app.get('/tds-challans/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TdsChallanService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/tds-challans/:id/deposit', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = recordTdsDepositSchema.parse(req.body);
    const svc = new TdsChallanService(req.server.db, req.tenantId);
    return { data: await svc.recordDeposit(id, input, req.user!.userId) };
  });

  // ── Quarterly Form 24Q returns ───────────────────────────────────────
  app.get('/tds-returns', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });

  app.get('/tds-returns/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/tds-returns/generate', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { financialYear, quarter } = tds24QQuerySchema.parse(req.body);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    return { data: await svc.generate(financialYear, quarter) };
  });

  app.post('/tds-returns/:id/validate', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    return { data: await svc.validate(id) };
  });

  app.post('/tds-returns/:id/file', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { token, notes } = fileTdsReturnSchema.parse(req.body);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    return { data: await svc.markFiled(id, token, req.user!.userId, notes) };
  });

  app.delete('/tds-returns/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    await svc.delete(id);
    return { data: { ok: true } };
  });

  app.get('/tds-returns/:id/export', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    const { filename, body } = await svc.buildExport(id);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(body);
  });

  // ── PF / ESI / PT challan deposits (statutory subledger settlement) ──
  // List deposited / pending statutory challans, optionally scoped to a run.
  // Used by the PF/ESI/PT modals to surface "already deposited" state.
  app.get('/statutory-challans', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { payrollRunId, kind } = challanListQuery.parse(req.query);
    const conditions = [eq(statutoryChallans.tenantId, req.tenantId)];
    if (kind) conditions.push(eq(statutoryChallans.kind, kind));
    if (payrollRunId) conditions.push(eq(statutoryChallans.payrollRunId, payrollRunId));
    const rows = await req.server.db
      .select()
      .from(statutoryChallans)
      .where(and(...conditions))
      .orderBy(desc(statutoryChallans.periodYear), desc(statutoryChallans.periodMonth));
    return { data: rows };
  });

  // Record a PF / ESI / PT challan deposit. Recomputes liability from the
  // run, creates the challan + posts the settlement JE atomically. TDS uses
  // its dedicated /tds-challans/:id/deposit route above (pre-existing pending
  // row + CIN capture).
  app.post('/statutory-challans/deposit', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = recordStatutoryDepositSchema.parse(req.body);

    const payroll = new PayrollRunService(req.server.db, req.tenantId);
    let liability: number;
    if (input.kind === 'pf') {
      liability = (await payroll.pfChallan(input.payrollRunId)).grandTotal;
    } else if (input.kind === 'esi') {
      liability = (await payroll.esiChallan(input.payrollRunId)).grandTotal;
    } else {
      // PT: per-state totals — caller must specify which state.
      if (!input.stateCode) throw new ConflictError('stateCode is required for PT deposits');
      const pt = await payroll.ptChallan(input.payrollRunId);
      const match = pt.challans.find((c) => c.stateCode === input.stateCode);
      if (!match) throw new NotFoundError(`No PT liability for state ${input.stateCode} on this run`);
      liability = match.totalPt;
    }

    const svc = new StatutoryChallanService(req.server.db, req.tenantId);
    const result = await svc.createAndRecordDeposit(
      {
        kind: input.kind,
        payrollRunId: input.payrollRunId,
        stateCode: input.stateCode ?? null,
        liabilityAmount: liability,
      },
      {
        bankAccountId: input.bankAccountId,
        depositDate: input.depositDate,
        paymentMode: input.paymentMode,
        bankRef: input.bankRef,
        referenceNumber: input.referenceNumber,
        interestAmount: input.interestAmount,
        lateFeeAmount: input.lateFeeAmount,
        notes: input.notes,
      },
      req.user!.userId,
    );
    return { data: result };
  });

  // ── Form 16 Part B — annual salary + tax computation per employee ────
  app.get('/tds-form-16', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { financialYear } = tdsFinancialYearQuerySchema.parse(req.query);
    const svc = new TdsForm16Service(req.server.db, req.tenantId);
    return { data: await svc.generate(financialYear) };
  });
};
