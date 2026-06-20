
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createPurchaseInvoiceSchema,
  updatePurchaseInvoiceSchema,
  purchaseInvoiceFilterSchema,
  threeWayMatchSchema,
  approveInvoiceSchema,
  importBillsCSVSchema,
  previewBillsCSVSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WebhookEndpointService } from '../webhooks/webhook-endpoint.service';
import { GLService } from '../gl/gl.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';
import { BillImportService } from './bill-import.service';
import { ThreeWayMatchService } from './three-way-match.service';
import { DuplicateService } from './duplicate.service';
import { AnomalyService } from './anomaly.service';
import { checkDuplicatesSchema } from './duplicate.schema';
import { getStorageProvider } from '../../utils/storage';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const purchaseInvoiceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/anomalies',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new AnomalyService(request.server.db, request.tenantId);
      const anomalies = await service.detectAnomalies();
      return { data: anomalies };
    },
  );

  app.get(
    '/summary',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      // Reuses the list filter schema so callers can scope summary to one
      // vendor (?vendorId=…). Other filter fields are accepted but ignored.
      const filters = purchaseInvoiceFilterSchema.parse(request.query);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const summary = await service.summary({ vendorId: filters.vendorId });
      return { data: summary };
    },
  );

  app.post(
    '/import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { csvData, category, periodMonth, periodYear, vendorOverrides } = importBillsCSVSchema.parse(request.body);
      const service = new BillImportService(request.server.db, request.tenantId);
      const result = await service.importFromCSV(csvData, category, { periodMonth, periodYear, vendorOverrides });
      return { data: result };
    },
  );

  app.post(
    '/import/preview',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { csvData, category, periodMonth, periodYear } = previewBillsCSVSchema.parse(request.body);
      const service = new BillImportService(request.server.db, request.tenantId);
      const result = await service.previewFromCSV(csvData, category, { periodMonth, periodYear });
      return { data: result };
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = purchaseInvoiceFilterSchema.parse(request.query);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);
      return { data: invoice };
    },
  );

  app.post(
    '/:id/record-owner-payment',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const body = z.object({
        amount: z.number().positive(),
        paymentDate: z.string().date(),
        notes: z.string().max(500).nullish(),
      }).parse(request.body);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const result = await service.recordOwnerPayment(id, body);
      return reply.status(201).send({ data: result });
    },
  );

  app.get(
    '/vendor-advance-balance/:vendorId',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { vendorId } = (uuidParamSchema.transform((v) => ({ vendorId: v.id }))).parse(
        { id: (request.params as { vendorId: string }).vendorId },
      );
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const balance = await service.getOpenAdvanceBalance(vendorId);
      return { data: { vendorId, balance } };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createPurchaseInvoiceSchema.parse(request.body);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.create(input);

      const gl = new GLService(request.server.db, request.tenantId);
      await gl.postPurchaseInvoice({
        totalAmount: invoice.totalAmount,
        date: invoice.invoiceDate,
        id: invoice.id,
        vendorName: invoice.vendorName,
        invoiceNumber: invoice.invoiceNumber,
        // AP Pattern-B: inline-GRN path (bill carried its own
        // goods-received rows) → Dr Inventory split / Cr AP.
        linkedInventoryGrnId: invoice.linkedInventoryGrnId,
        // PP Phase 3: matched-to-PO path → Dr GR/IR clearing / Cr AP.
        matchedPoId: invoice.matchedPoId,
      });

      let advanceApplied = 0;
      if (input.applyAdvance !== false) {
        advanceApplied = await service.applyAdvancesToBill(invoice.id);
      }

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('bill.created', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        totalAmount: invoice.totalAmount,
      });

      const finalInvoice = advanceApplied > 0 ? await service.getById(invoice.id) : invoice;
      return reply.status(201).send({ data: finalInvoice, meta: { advanceApplied } });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updatePurchaseInvoiceSchema.parse(request.body);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.update(id, input);
      return { data: invoice };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      // Hard-delete (bill + items + attachments + S3 files, with the GL
      // posting unwound) when nothing downstream depends on the bill: drafts,
      // or an approved/matched bill with zero payment — e.g. a duplicate or a
      // 2B-booked supply that turned out not to be ours. cancel() only flips
      // status to 'cancelled' and does NOT unwind the GL, so using it on a
      // posted bill would leave its journal entry dangling. Anything with a
      // payment against it → soft-cancel to preserve the audit + payment trail.
      const existing = await service.getById(id);
      const amountPaid = Number(existing.amountPaid ?? 0);
      const canHardDelete = existing.status === 'draft'
        || ((existing.status === 'approved' || existing.status === 'matched') && amountPaid === 0);
      if (canHardDelete) {
        await service.hardDelete(id, getStorageProvider(), request.user.userId);
      } else {
        await service.cancel(id, request.user.userId);
      }
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/match',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { poId, grnId } = threeWayMatchSchema.parse(request.body);
      const service = new ThreeWayMatchService(request.server.db, request.tenantId);
      const result = await service.performMatch(id, poId, grnId);
      return { data: result };
    },
  );

  app.get(
    '/:id/match-status',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);
      return {
        data: {
          invoiceId: invoice.id,
          status: invoice.status,
          matchStatus: invoice.matchStatus,
          matchNotes: invoice.matchNotes,
          poId: invoice.poId,
          grnId: invoice.grnId,
        },
      };
    },
  );

  app.post(
    '/:id/approve',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      approveInvoiceSchema.parse(request.body);
      const matchService = new ThreeWayMatchService(request.server.db, request.tenantId);
      await matchService.approve(id, request.user.userId);
      const invoiceService = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await invoiceService.getById(id);
      return { data: invoice };
    },
  );

  app.post(
    '/:id/apply-advance',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const applied = await service.applyAdvancesToBill(id);
      if (applied <= 0) return reply.status(400).send({ error: 'No advance available to apply' });
      const invoice = await service.getById(id);
      return { data: invoice, meta: { advanceApplied: applied } };
    },
  );

  app.post(
    '/check-duplicates',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = checkDuplicatesSchema.parse(request.body);
      const service = new DuplicateService(request.server.db, request.tenantId);
      const result = await service.checkDuplicates(input);
      return { data: result };
    },
  );
};
