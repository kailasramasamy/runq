import { FastifyPluginAsync } from 'fastify';
import {
  generateVmccBillsSchema, payVmccBillSchema, settleOperatorSchema, vmccBillFilterSchema,
  vmccBillablePreviewSchema, vmccBillDetailSchema, paginationSchema, uuidParamSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { VmccBillService } from './vmcc-bill.service';
import { renderVmccBillHTML, vmccBillFilename, type VmccBillStatementData } from './statement-template';
import { resolveMpPrincipal } from './access-scope';

// A CC/PP manager (field_operator) may bill VMCCs in their own subtree; the
// service scopes every op to the node they're assigned to (see access-scope.ts).
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/billable', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { ccNodeId, ...sel } = vmccBillablePreviewSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return { data: await service.listBillable(sel, ccNodeId, principal) };
  });

  app.get('/direct', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { ccNodeId, ...sel } = vmccBillablePreviewSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return { data: await service.directDetail(sel, ccNodeId, principal) };
  });

  // the day/shift supply behind one VMCC's bill — how its milk cost was reached.
  // format=pdf returns the official bill document (same layout as the Dhenu app).
  app.get('/vmcc-detail', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { vmccNodeId, format, ...sel } = vmccBillDetailSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    if (format !== 'pdf') {
      return { data: await service.billDetail(sel, vmccNodeId, principal) };
    }
    const s = await service.billStatementData(sel, vmccNodeId, principal);
    const data: VmccBillStatementData = {
      tenantName: s.tenantName, vmcc: s.vmcc,
      period: { from: s.detail.periodStart, to: s.detail.periodEnd },
      lines: s.detail.lines.map((l) => ({
        collectionDate: l.date, shift: l.shift, milkType: l.milkType, qtyLitres: l.qtyLitres,
        fat: l.fat, snf: l.snf, water: l.water, ratePerLitre: l.ratePerLitre, amount: l.amount,
      })),
      totals: { litres: s.detail.totalQty, amount: s.detail.totalAmount, unpricedLines: s.detail.unpricedLines },
      commission: s.commission,
      generatedAt: new Date().toISOString(),
    };
    const { renderHtmlToPdf } = await import('../ar/invoice-pdf');
    const pdf = await renderHtmlToPdf(renderVmccBillHTML(data));
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${vmccBillFilename(data)}"`)
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .send(pdf);
  });

  app.post('/regenerate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { ccNodeId, ...sel } = vmccBillablePreviewSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return { data: await service.regenerateDirect(sel, ccNodeId, principal, request.user?.userId) };
  });

  app.get('/cycle-summary', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(24).default(5) }).parse(request.query);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return { data: await service.cycleBillingSummary(limit) };
  });

  app.get('/bills', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = vmccBillFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.post('/generate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = generateVmccBillsSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.generate(input, principal, request.user?.userId) });
  });

  app.post('/bills/:id/pay', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = payVmccBillSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return { data: await service.pay(id, input, principal, request.user?.userId) };
  });

  app.post('/bills/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    return { data: await service.reverse(id, principal, request.user?.userId) };
  });

  // Direct-mode per-farmer settlement (posts GL + AP payment + txn confirmation).
  app.post('/farmers/:id/settle', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = payVmccBillSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    await service.settleFarmer(id, input, principal, request.user?.userId);
    return { data: { ok: true } };
  });

  app.post('/farmers/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    await service.reverseFarmer(id, principal, request.user?.userId);
    return { data: { ok: true } };
  });

  // Direct-mode per-operator settlement.
  app.post('/operators/:id/settle', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = settleOperatorSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    await service.settleOperator(id, input, principal, request.user?.userId);
    return { data: { ok: true } };
  });

  app.post('/operators/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const { periodStart, periodEnd } = z.object({ periodStart: z.string().date(), periodEnd: z.string().date() }).parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new VmccBillService(request.server.db, request.tenantId);
    await service.reverseOperator(id, periodStart, periodEnd, principal, request.user?.userId);
    return { data: { ok: true } };
  });
};
