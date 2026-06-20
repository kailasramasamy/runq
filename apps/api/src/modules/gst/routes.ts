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

  // ─── Download GSTN-wire-format JSON (for direct portal upload) ──────

  // ─── Export filed return as CSV (record-keeping) ────────────────────

  app.get('/returns/:id/export.csv', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    const { csv, filename } = await svc.exportGstr1Csv(id);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  });

  app.get('/returns/:id/payload.json', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    const { payload, gstin, period } = await svc.getGstr1UploadPayload(id);
    const filename = `GSTR1_${gstin}_${period}.json`;
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return payload;
  });

  // ─── HSN summary breakdown (drill-down to invoice lines) ────────────

  app.get('/returns/:id/hsn-breakdown', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { hsn, rate } = z.object({
      hsn: z.string().min(2).max(8),
      rate: z.coerce.number().min(0).max(40),
    }).parse(request.query);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.getHsnBreakdown(id, hsn, rate) };
  });

  app.get('/returns/:id/summary', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.getGstnSummary(id) };
  });

  // ─── File return with EVC ──────────────────────────────────────────

  // ─── Request EVC OTP (sent to registered mobile/email) ─────────────

  app.post('/returns/:id/request-evc', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.requestEvcOtp(id) };
  });

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
    const reconSvc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    const data = await reconSvc.pull2b(period);
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

  // List every period the tenant has reconciled, newest first. Lets the
  // reconciliation screen show history without forcing the user to pick
  // periods blindly from a dropdown.
  app.get('/2b/periods', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    return { data: await svc.listReconciledPeriods() };
  });

  // Manually re-run post-save verification of a 3B against GSTN's stored
  // summary. Auto-runs once after each upload; this endpoint lets the
  // user re-check (e.g. after WhiteBooks propagation, or after manually
  // fixing values in the GST portal directly).
  app.post('/returns/:id/verify-3b', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new GstReturnService(request.server.db, request.tenantId);
    return { data: await svc.verify3b(id) };
  });

  // Promote a `not_in_books` match into a draft purchase invoice so the
  // owner can claim the ITC. Returns the new bill id, or — if a similar
  // vendor already exists (typo'd GSTIN, same legal entity, etc.) —
  // returns candidate vendors so the caller can decide merge vs new.
  app.post('/2b/matches/:matchId/book', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { matchId } = z.object({ matchId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      vendorAction: z.enum(['use_existing', 'create_new']).optional(),
      existingVendorId: z.string().uuid().optional(),
    }).parse(request.body ?? {});
    const svc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    const result = await svc.bookFromMatch(matchId, body, request.user?.userId);
    const status = result.status === 'booked' ? 201 : 200;
    return reply.status(status).send({ data: result });
  });

  // Classify a 2B line's ITC as eligible or ineligible. Ineligible lines are
  // auto-reversed in GSTR-3B Table 4(B) (sec_17_5/personal → 4B1, others →
  // 4B2), so the filed net ITC excludes blocked credits, personal-use, and
  // not-our-supply (shared-GSTIN) items without anyone hand-editing the return.
  app.patch('/2b/matches/:matchId/eligibility', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { matchId } = z.object({ matchId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      eligible: z.boolean(),
      reason: z.enum(['sec_17_5', 'personal', 'not_our_supply', 'other']).optional(),
      note: z.string().max(500).optional(),
    }).parse(request.body ?? {});
    const svc = new Gstr2bReconciliationService(request.server.db, request.tenantId);
    return { data: await svc.setEligibility(matchId, body) };
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

  app.get('/readiness/missing-hsn-grouped', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new GstReadinessService(request.server.db, request.tenantId);
    return { data: await svc.getMissingHsnGrouped() };
  });

  app.post('/readiness/bulk-assign-hsn', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const body = z.object({
      assignments: z.array(z.object({
        description: z.string().min(1),
        hsnSacCode: z.string().min(2).max(8),
      })).min(1),
    }).parse(request.body);
    const svc = new GstReadinessService(request.server.db, request.tenantId);
    return { data: await svc.bulkAssignHsnByItem(body.assignments) };
  });
};
