import { FastifyPluginAsync } from 'fastify';
import {
  uuidParamSchema, recordTdsDepositSchema,
  tds24QQuerySchema, fileTdsReturnSchema, tdsFinancialYearQuerySchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { TdsChallanService } from './tds-challan.service';
import { TdsReturnService } from './tds-return.service';
import { TdsForm16Service } from './tds-form16.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;
const WRITE = ['owner', 'accountant'] as const;

export const tdsRoutes: FastifyPluginAsync = async (app) => {
  // ── Monthly TDS deposit challans (ITNS-281) ──────────────────────────
  app.get('/tds-challans', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new TdsChallanService(req.server.db, req.tenantId);
    return { data: await svc.syncAndList() };
  });

  app.get('/tds-challans/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
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
  app.get('/tds-returns', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });

  app.get('/tds-returns/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
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

  app.get('/tds-returns/:id/export', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TdsReturnService(req.server.db, req.tenantId);
    const { filename, body } = await svc.buildExport(id);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(body);
  });

  // ── Form 16 Part B — annual salary + tax computation per employee ────
  app.get('/tds-form-16', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { financialYear } = tdsFinancialYearQuerySchema.parse(req.query);
    const svc = new TdsForm16Service(req.server.db, req.tenantId);
    return { data: await svc.generate(financialYear) };
  });
};
