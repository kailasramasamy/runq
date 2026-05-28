import { FastifyPluginAsync } from 'fastify';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  closePurchaseOrderSchema,
  cancelPurchaseOrderSchema,
  purchaseOrderFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PurchaseOrderService } from './po.service';
import { renderPoHTML, type PoVendorInfo, type PoTenantInfo } from './po-template';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const purchaseOrderRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = purchaseOrderFilterSchema.parse(request.query);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      return service.list(filters, { page: pagination.page, limit: pagination.limit });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  // Linked GRNs + bills (PP Phase 2/5 — drives the PO detail card).
  app.get(
    '/:id/linked-documents',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.linkedDocuments(id);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createPurchaseOrderSchema.parse(request.body);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.create(input, request.user?.userId);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updatePurchaseOrderSchema.parse(request.body);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  app.post(
    '/:id/send',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.send(id, request.user?.userId);
      return { data };
    },
  );

  app.post(
    '/:id/close',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = closePurchaseOrderSchema.parse(request.body);
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.close(id, input);
      return { data };
    },
  );

  app.post(
    '/:id/cancel',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = cancelPurchaseOrderSchema.parse(request.body ?? {});
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const data = await service.cancel(id, input);
      return { data };
    },
  );

  // Print PO as HTML (?format=html) or PDF (default). Used by the web/mobile
  // detail pages' Download button and the auto-share-on-Send flow. Vendors
  // receive the file as an attachment — no public link.
  app.get(
    '/:id/pdf',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const format = (request.query as { format?: string } | undefined)?.format ?? 'pdf';
      const service = new PurchaseOrderService(request.server.db, request.tenantId);
      const { po, lines, vendor, tenant } = await service.getForPrint(id);

      const vendorInfo: PoVendorInfo = {
        name: vendor.name,
        addressLine1: vendor.addressLine1, addressLine2: vendor.addressLine2,
        city: vendor.city, state: vendor.state, pincode: vendor.pincode,
        gstin: vendor.gstin, pan: vendor.pan,
        phone: vendor.phone, email: vendor.email,
      };
      const tenantInfo: PoTenantInfo = {
        name: tenant.name,
        settings: (tenant.settings ?? {}) as Record<string, unknown>,
      };
      const html = renderPoHTML(po, lines, vendorInfo, tenantInfo);

      if (format === 'html') return reply.type('text/html').send(html);

      const { renderHtmlToPdf } = await import('../ar/invoice-pdf');
      const pdf = await renderHtmlToPdf(html);
      const vendorLabel = vendor.name
        .replace(/[\\/:*?"<>| -]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 80);
      const fileName = vendorLabel ? `${po.poNumber}-${vendorLabel}.pdf` : `${po.poNumber}.pdf`;
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `inline; filename="${fileName}"`)
        .send(pdf);
    },
  );
};
