import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { GstReturnService } from './gst-return.service';
import { Gstr2bReconciliationService } from './gstr2b-reconciliation';
import { GstReadinessService } from './gst-readiness.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const periodSchema = z.object({
  period: z.string().regex(/^\d{6}$/, 'Period must be MMYYYY format'),
});

const otpRequestSchema = z.object({
  gstin: z.string().length(15),
  username: z.string().min(1),
});

const otpVerifySchema = z.object({
  gstin: z.string().length(15),
  username: z.string().min(1),
  otp: z.string().min(4),
  txn: z.string().min(1),
});

const fileSchema = z.object({
  evc: z.string().min(4),
});

const idParam = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = z.object({
  returnType: z.enum(['gstr1', 'gstr3b']).optional(),
  status: z.string().optional(),
});

export const gstRoutes: FastifyPluginAsync = async (app) => {
  // ─── List returns ──────────────────────────────────────────────────

  app.get('/returns', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const filters = listQuerySchema.parse(request.query);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.list(filters) };
  });

  // ─── Get single return ─────────────────────────────────────────────

  app.get('/returns/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.getById(id) };
  });

  // ─── Delete return (non-filed only) ─────────────────────────────────

  app.delete('/returns/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    await svc.delete(id);
    return reply.status(204).send();
  });

  // ─── Generate GSTR-1 draft ─────────────────────────────────────────

  app.post('/returns/generate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { period } = periodSchema.parse(request.body);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    const ret = await svc.generateGstr1(period);
    return reply.status(201).send({ data: ret });
  });

  // ─── Validate return ───────────────────────────────────────────────

  app.post('/returns/:id/validate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.validate(id) };
  });

  // ─── Request OTP ───────────────────────────────────────────────────

  app.post('/auth/request-otp', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { gstin, username } = otpRequestSchema.parse(request.body);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.requestOtp(gstin, username) };
  });

  // ─── Force logout (clears stuck GSP session) ───────────────────────

  app.post('/auth/force-logout', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { gstin, username } = otpRequestSchema.parse(request.body);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.forceLogout(gstin, username) };
  });

  // ─── Verify OTP ────────────────────────────────────────────────────

  app.post('/auth/verify-otp', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { gstin, username, otp, txn } = otpVerifySchema.parse(request.body);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    const token = await svc.verifyOtp(gstin, username, otp, txn);
    return { data: { success: true, expiresAt: token.expiresAt } };
  });

  // ─── Upload to GSTN ────────────────────────────────────────────────

  app.post('/returns/:id/upload', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.upload(id) };
  });

  // ─── Get GSTN summary ─────────────────────────────────────────────

  app.get('/returns/:id/summary', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.getGstnSummary(id) };
  });

  // ─── File return with EVC ──────────────────────────────────────────

  app.post('/returns/:id/file', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { evc } = fileSchema.parse(request.body);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.file(id, evc, request.user?.userId) };
  });

  // ─── Generate GSTR-3B draft ────────────────────────────────────────

  app.post('/returns/generate-3b', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { period } = periodSchema.parse(request.body);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    const ret = await svc.generateGstr3b(period);
    return reply.status(201).send({ data: ret });
  });

  // ─── Upload GSTR-3B ────────────────────────────────────────────────

  app.post('/returns/:id/upload-3b', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.upload3b(id) };
  });

  // ─── Get auto-populated 3B from GSTN ──────────────────────────────

  app.get('/returns/:id/auto-3b', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.getAutoPopulated3b(id) };
  });

  // ─── GSTR-2B Reconciliation ────────────────────────────────────────

  app.post('/2b/pull', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { period } = periodSchema.parse(request.body);
    const gstSvc = new GstReturnService(request.server.db, request.tenantId);
    const reconSvc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    // Reuse cached GSP auth token from previous OTP authentication
    const profile = await (gstSvc as any).getTenantGstProfile();
    const token = await gstSvc.getValidTokenForGstin(profile.gstin);
    const data = await reconSvc.pull2b(period, token);
    return reply.status(201).send({ data });
  });

  app.post('/2b/reconcile', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { period } = periodSchema.parse(request.body);
    const svc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    return { data: await svc.reconcile(period) };
  });

  app.get('/2b/matches', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const query = z.object({
      period: z.string().regex(/^\d{6}$/),
      status: z.string().optional(),
    }).parse(request.query);
    const svc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    return { data: await svc.getMatches(query.period, query.status) };
  });

  app.get('/2b/summary', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { period } = z.object({ period: z.string().regex(/^\d{6}$/) }).parse(request.query);
    const svc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    return { data: await svc.getSummary(period) };
  });

  // ─── GST Readiness (dashboard widget) ──────────────────────────────

  app.get('/readiness', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new GstReadinessService(request.server.db, request.tenantId);
    return { data: await svc.compute() };
  });

  app.get('/readiness/details', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new GstReadinessService(request.server.db, request.tenantId);
    return { data: await svc.computeDetails() };
  });
};
