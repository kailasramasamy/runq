import { FastifyPluginAsync } from 'fastify';
import {
  createWarehouseSchema, updateWarehouseSchema,
  createGrnSchema, updateGrnSchema, cancelGrnSchema, grnFilterSchema,
  createDeliveryNoteSchema, updateDeliveryNoteSchema, cancelDeliveryNoteSchema,
  deliveryNoteFilterSchema, dispatchFromInvoiceSchema, pendingDispatchFilterSchema,
  bulkDispatchSchema, waiveDispatchSchema, salesReturnSchema,
  itemSubstitutesSchema, shortageFilterSchema, substituteDraftLineSchema,
  stockOnHandFilterSchema, stockLedgerFilterSchema, stockHighlightsQuerySchema,
  movementFeedQuerySchema,
  itemMovementFilterSchema,
  uuidParamSchema,
  createTransferSchema, updateTransferSchema, cancelTransferSchema,
  receiveTransferSchema, transferFilterSchema,
  createAdjustmentSchema, updateAdjustmentSchema, cancelAdjustmentSchema,
  adjustmentFilterSchema,
  zeroOutPreviewSchema,
  startStockTakeSchema, upsertCountLinesSchema, updateCountLineSchema,
  recountStockTakeSchema, stockTakeFilterSchema,
  upsertReorderRuleSchema, expiryFilterSchema, stockAlertFilterSchema,
  stockSummaryFilterSchema, valuationFilterSchema, ageingFilterSchema,
  movementSummaryFilterSchema, deadStockFilterSchema, serialLookupFilterSchema,
  writeOffFilterSchema,
  inventoryAnalyticsFilterSchema, inventoryPerformanceFilterSchema,
  inventoryTrendFilterSchema, inventoryForecastFilterSchema,
  inventoryReplenishmentFilterSchema, applyReplenishmentSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { WarehouseService } from './warehouse.service';
import { GrnService } from './grn.service';
import { DeliveryNoteService } from './delivery.service';
import { SalesDispatchService } from './sales-dispatch.service';
import { SalesReturnService } from './sales-return.service';
import { AutoDispatchService } from './auto-dispatch.service';
import { SubstitutionService } from './substitution.service';
import { ShortageService } from './shortage.service';
import { StockQueryService } from './stock-query.service';
import { ItemMovementAuditService } from './movement-audit.service';
import { InventoryDashboardService } from './dashboard.service';
import { TransferService } from './transfer.service';
import { AdjustmentService } from './adjustment.service';
import { StockResetService } from './stock-reset.service';
import { StockTakeService } from './stock-take.service';
import { ReorderService } from './reorder.service';
import { StockAlertService } from './stock-alert.service';
import { GrnExtractService } from './grn-extract.service';
import { ReportsService } from './reports.service';
import { InventoryAnalyticsService } from './analytics.service';
import { InventoryForecastService } from './analytics-forecast.service';
import { ReplenishmentService } from './replenishment.service';
import { SerialService } from './serial.service';
import { NotFoundError } from '../../utils/errors';

const lineParamSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });
const itemWhParamSchema = z.object({ itemId: z.string().uuid(), warehouseId: z.string().uuid() });

// `technician` is granted the inventory module (see roleAllowedModules) so it
// must read here too, else a granted module 403s. Write stays finance-side.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'technician'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  // ─── Warehouses ──────────────────────────────────────────────────────
  app.get('/warehouses', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });

  app.post('/warehouses', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = createWarehouseSchema.parse(req.body);
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.get('/warehouses/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return { data: await svc.get(id) };
  });

  app.put('/warehouses/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateWarehouseSchema.parse(req.body);
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/warehouses/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });

  app.get('/warehouses/:id/stock', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return { data: await svc.stockSummary(id) };
  });

  // ─── Stock visibility ────────────────────────────────────────────────
  app.get('/stock/on-hand', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = stockOnHandFilterSchema.parse(req.query);
    const svc = new StockQueryService(req.server.db, req.tenantId);
    return { data: await svc.onHand(filter) };
  });

  app.get('/stock/ledger', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = stockLedgerFilterSchema.parse(req.query);
    const svc = new StockQueryService(req.server.db, req.tenantId);
    return { data: await svc.ledger(filter) };
  });

  // ─── Item stock + ledger + barcode lookup ────────────────────────────
  app.get('/items/:id/stock', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new StockQueryService(req.server.db, req.tenantId);
    return { data: await svc.byItem(id) };
  });

  app.get('/items/:id/ledger', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const filter = stockLedgerFilterSchema.parse({ ...(req.query as object), itemId: id });
    const svc = new StockQueryService(req.server.db, req.tenantId);
    return { data: await svc.ledger(filter) };
  });

  // Audit trail — the ledger with each source resolved to its document
  // (GRN/vendor, DN/customer/invoice, WO/BOM). Powers the item master's
  // "Stock movements" view on web and mobile.
  app.get('/items/:id/movements', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const filter = itemMovementFilterSchema.parse(req.query);
    const svc = new ItemMovementAuditService(req.server.db, req.tenantId);
    return { data: await svc.itemMovements(id, filter) };
  });

  app.get<{ Params: { code: string } }>(
    '/items/barcode/:code',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (req) => {
      const svc = new StockQueryService(req.server.db, req.tenantId);
      const item = await svc.findByBarcode(req.params.code);
      if (!item) throw new NotFoundError('Item');
      return { data: item };
    },
  );

  // ─── GRN ─────────────────────────────────────────────────────────────
  app.get('/grn', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = grnFilterSchema.parse(req.query);
    const svc = new GrnService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.list(filter);
  });

  app.post('/grn', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = createGrnSchema.parse(req.body);
    const svc = new GrnService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.create(input) });
  });

  // AI invoice extract — feeds the mobile "Receive stock" screen. Reuses
  // the AP invoice extractor (local heuristic + Claude vision fallback)
  // and maps the parsed line items back onto the inventory catalog so
  // the UI can pre-fill the GRN form. No DB writes — purely a preview.
  const GRN_EXTRACT_MIMES: Record<string, boolean> = {
    'application/pdf': true,
    'image/png': true,
    'image/jpeg': true,
    'image/jpg': true,
  };
  const GRN_EXTRACT_MAX = 10 * 1024 * 1024;
  app.post('/grn/extract', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });
    const mime = file.mimetype.toLowerCase();
    if (!GRN_EXTRACT_MIMES[mime]) {
      return reply.status(400).send({ error: 'Unsupported file type. Upload PDF, PNG, or JPG.' });
    }
    const buffer = await file.toBuffer();
    if (buffer.length > GRN_EXTRACT_MAX) {
      return reply.status(400).send({ error: 'File too large. Maximum size is 10 MB.' });
    }
    const svc = new GrnExtractService(req.server.db, req.tenantId);
    return { data: await svc.extract(buffer, mime, file.filename) };
  });

  app.get('/grn/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new GrnService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.get(id) };
  });

  app.put('/grn/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateGrnSchema.parse(req.body);
    const svc = new GrnService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.update(id, input) };
  });

  app.post('/grn/:id/post', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new GrnService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.post(id) };
  });

  app.post('/grn/:id/cancel', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = cancelGrnSchema.parse(req.body);
    const svc = new GrnService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.cancel(id, input) };
  });

  // ─── Delivery notes ──────────────────────────────────────────────────
  app.get('/delivery-notes', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = deliveryNoteFilterSchema.parse(req.query);
    const svc = new DeliveryNoteService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.list(filter);
  });

  app.post('/delivery-notes', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = createDeliveryNoteSchema.parse(req.body);
    const svc = new DeliveryNoteService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.get('/delivery-notes/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new DeliveryNoteService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.get(id) };
  });

  app.put('/delivery-notes/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateDeliveryNoteSchema.parse(req.body);
    const svc = new DeliveryNoteService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.update(id, input) };
  });

  app.post('/delivery-notes/:id/dispatch', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new DeliveryNoteService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.dispatch(id) };
  });

  app.post('/delivery-notes/:id/cancel', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = cancelDeliveryNoteSchema.parse(req.body);
    const svc = new DeliveryNoteService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.cancel(id, input) };
  });

  // ─── Sales dispatch (invoice → stock) ────────────────────────────────
  // The queue of issued invoices whose goods haven't left yet.
  app.get('/sales-dispatch/pending', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = pendingDispatchFilterSchema.parse(req.query);
    const svc = new SalesDispatchService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.listPendingInvoices(filter);
  });

  app.get('/sales-dispatch/:id/preview', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { warehouseId } = z.object({ warehouseId: z.string().uuid() }).parse(req.query);
    const svc = new SalesDispatchService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.previewInvoice(id, warehouseId) };
  });

  // Creates the draft DN only. The client follows with the normal dispatch
  // call, so a shortage leaves a fixable draft instead of a partial posting.
  app.post('/sales-dispatch/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = dispatchFromInvoiceSchema.parse(req.body);
    const svc = new SalesDispatchService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.createFromInvoice(id, input) });
  });

  // Clears a batch off the queue in one action. Sequential inside — see
  // AutoDispatchService.runForInvoices — and capped by the schema, so the
  // client chunks a long backlog and reports progress between calls.
  app.post('/sales-dispatch/bulk', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const input = bulkDispatchSchema.parse(req.body);
    const svc = new AutoDispatchService({
      db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId,
    });
    const results = await svc.runForInvoices(input.invoiceIds, {
      dateMode: input.dateMode,
      warehouseId: input.warehouseId,
      notes: 'Bulk dispatch from Awaiting dispatch',
    });
    return { data: results };
  });

  // The cut-over: drop pre-inventory invoices out of the queue without
  // pretending stock moved. See SalesDispatchService.waiveDispatch.
  app.post('/sales-dispatch/waive', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const input = waiveDispatchSchema.parse(req.body);
    const svc = new SalesDispatchService({
      db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId,
    });
    return { data: await svc.waiveDispatch(input) };
  });

  app.get('/sales-dispatch/:id/status', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalesDispatchService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.invoiceDispatchStatus(id) };
  });

  // ─── Substituting on a parked draft ──────────────────────────────────
  // Where most substitutions are actually decided: auto-dispatch parked the
  // shortfall hours ago and the operator meets it here, not on the invoice.
  app.get('/delivery-notes/:id/substitutes', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SubstitutionService({ db: req.server.db, tenantId: req.tenantId });
    const byLine = await svc.optionsForDraft(id);
    return { data: Object.fromEntries(byLine) };
  });

  app.post('/delivery-notes/:id/lines/:lineId/substitute', {
    preHandler: [rbacHook([...WRITE_ROLES])],
  }, async (req) => {
    const { id, lineId } = z.object({
      id: z.string().uuid(), lineId: z.string().uuid(),
    }).parse(req.params);
    const input = substituteDraftLineSchema.parse(req.body);
    const svc = new SubstitutionService({
      db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId,
    });
    return { data: await svc.substituteDraftLine(id, lineId, input) };
  });

  // ─── Shortages: billed goods the warehouse never covered ─────────────
  app.get('/shortages', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = shortageFilterSchema.parse(req.query);
    const svc = new ShortageService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.list(filter);
  });

  app.get('/shortages/count', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new ShortageService({ db: req.server.db, tenantId: req.tenantId });
    return { data: { open: await svc.openCount() } };
  });

  // ─── Declared stand-ins, per item ────────────────────────────────────
  app.get('/items/:id/substitutes', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SubstitutionService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.listSubstitutes(id) };
  });

  app.put('/items/:id/substitutes', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = itemSubstitutesSchema.parse(req.body);
    const svc = new SubstitutionService({
      db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId,
    });
    return { data: await svc.setSubstitutes(id, input.substituteItemIds) };
  });

  app.post('/sales-dispatch/item-aliases', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = z.object({
      sourceName: z.string().min(1).max(255),
      itemId: z.string().uuid(),
    }).parse(req.body);
    const svc = new SalesDispatchService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.saveItemAlias(input.sourceName, input.itemId) });
  });

  // ─── Sales returns (stock back in) ───────────────────────────────────
  app.get('/delivery-notes/:id/returnable', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalesReturnService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.returnableLines(id) };
  });

  app.post('/delivery-notes/:id/return', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = salesReturnSchema.parse(req.body);
    const svc = new SalesReturnService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.create(id, input) });
  });

  // ─── Transfers ───────────────────────────────────────────────────────
  app.get('/transfers', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = transferFilterSchema.parse(req.query);
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.list(filter);
  });
  app.post('/transfers', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = createTransferSchema.parse(req.body);
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.create(input) });
  });
  app.get('/transfers/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.get(id) };
  });
  app.put('/transfers/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateTransferSchema.parse(req.body);
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.update(id, input) };
  });
  app.post('/transfers/:id/dispatch', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.dispatch(id) };
  });
  app.post('/transfers/:id/receive', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = receiveTransferSchema.parse(req.body ?? {});
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.receive(id, input) };
  });
  app.post('/transfers/:id/cancel', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = cancelTransferSchema.parse(req.body);
    const svc = new TransferService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.cancel(id, input) };
  });

  // ─── Adjustments ─────────────────────────────────────────────────────
  app.get('/adjustments', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = adjustmentFilterSchema.parse(req.query);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.list(filter);
  });
  // Prospective lines to flatten a warehouse's on-hand to nil, bucketed by
  // whether the GL ever capitalised the stock. Read-only — the caller creates
  // and posts the adjustments through the routes below.
  app.get('/adjustments/zero-out-preview', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const query = zeroOutPreviewSchema.parse(req.query);
    const svc = new StockResetService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.preview(query) };
  });
  app.post('/adjustments', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = createAdjustmentSchema.parse(req.body);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.create(input) });
  });
  app.get('/adjustments/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.get(id) };
  });
  app.put('/adjustments/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdjustmentSchema.parse(req.body);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.update(id, input) };
  });
  app.post('/adjustments/:id/approve', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.approve(id) };
  });
  app.post('/adjustments/:id/post', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.post(id) };
  });
  app.post('/adjustments/:id/cancel', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = cancelAdjustmentSchema.parse(req.body);
    const svc = new AdjustmentService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.cancel(id, input) };
  });

  // ─── Stock take ──────────────────────────────────────────────────────
  app.get('/stock-takes', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = stockTakeFilterSchema.parse(req.query);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId });
    return await svc.list(filter);
  });
  app.post('/stock-takes', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = startStockTakeSchema.parse(req.body);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return reply.status(201).send({ data: await svc.start(input) });
  });
  app.get('/stock-takes/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId });
    return { data: await svc.get(id) };
  });
  app.post('/stock-takes/:id/lines', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = upsertCountLinesSchema.parse(req.body);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.upsertCounts(id, input) };
  });
  app.put('/stock-takes/:id/lines/:lineId', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id, lineId } = lineParamSchema.parse(req.params);
    const input = updateCountLineSchema.parse(req.body);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.updateLine(id, lineId, input) };
  });
  app.post('/stock-takes/:id/recount', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = recountStockTakeSchema.parse(req.body ?? {});
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.markRecount(id, input) };
  });
  app.post('/stock-takes/:id/post', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.post(id) };
  });
  app.post('/stock-takes/:id/cancel', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new StockTakeService({ db: req.server.db, tenantId: req.tenantId, userId: req.user?.userId });
    return { data: await svc.cancel(id) };
  });

  // ─── Reorder rules + alerts + expiry ─────────────────────────────────
  app.get('/reorder-rules', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new ReorderService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
  app.post('/reorder-rules', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = upsertReorderRuleSchema.parse(req.body);
    const svc = new ReorderService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.upsert(input) });
  });
  app.delete<{ Params: { itemId: string; warehouseId: string } }>(
    '/reorder-rules/:itemId/:warehouseId',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (req) => {
      const { itemId, warehouseId } = itemWhParamSchema.parse(req.params);
      const svc = new ReorderService(req.server.db, req.tenantId);
      return { data: await svc.remove(itemId, warehouseId) };
    },
  );
  app.get('/stock/reorder-alerts', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new ReorderService(req.server.db, req.tenantId);
    return { data: await svc.alerts() };
  });
  // Stock alerts — low + out-of-stock in one list. Unlike reorder-alerts
  // above, an item with no reorder level configured still surfaces here
  // once it hits zero.
  app.get('/stock/alerts', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = stockAlertFilterSchema.parse(req.query);
    const svc = new StockAlertService(req.server.db, req.tenantId);
    return { data: await svc.list(filter) };
  });
  app.get('/stock/alerts/counts', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { warehouseId } = stockAlertFilterSchema.parse(req.query);
    const svc = new StockAlertService(req.server.db, req.tenantId);
    return { data: await svc.counts(warehouseId) };
  });
  app.get('/stock/expiring', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = expiryFilterSchema.parse(req.query);
    const svc = new ReorderService(req.server.db, req.tenantId);
    return { data: await svc.expiring(filter) };
  });

  // ─── Reports (Phase 3) ───────────────────────────────────────────────
  app.get('/reports/stock-summary', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = stockSummaryFilterSchema.parse(req.query);
    const svc = new ReportsService(req.server.db, req.tenantId);
    return { data: await svc.stockSummary(filter) };
  });
  app.get('/reports/valuation', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = valuationFilterSchema.parse(req.query);
    const svc = new ReportsService(req.server.db, req.tenantId);
    return { data: await svc.valuation(filter) };
  });
  app.get('/reports/ageing', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = ageingFilterSchema.parse(req.query);
    const svc = new ReportsService(req.server.db, req.tenantId);
    return { data: await svc.ageing(filter) };
  });
  app.get('/reports/movement', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = movementSummaryFilterSchema.parse(req.query);
    const svc = new ReportsService(req.server.db, req.tenantId);
    return { data: await svc.movementSummary(filter) };
  });
  app.get('/reports/write-offs', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = writeOffFilterSchema.parse(req.query);
    const svc = new ReportsService(req.server.db, req.tenantId);
    return { data: await svc.writeOffs(filter) };
  });
  app.get('/reports/dead-stock', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = deadStockFilterSchema.parse(req.query);
    const svc = new ReportsService(req.server.db, req.tenantId);
    return { data: await svc.deadStock(filter) };
  });

  // ─── Serials (Phase 3) ───────────────────────────────────────────────
  app.get('/serials', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = serialLookupFilterSchema.parse(req.query);
    const svc = new SerialService(req.server.db, req.tenantId);
    return await svc.list(filter);
  });
  app.get<{ Params: { serialNo: string } }>(
    '/serials/:serialNo',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (req) => {
      const svc = new SerialService(req.server.db, req.tenantId);
      return { data: await svc.findBySerial(req.params.serialNo) };
    },
  );

  // ─── Dashboard ───────────────────────────────────────────────────────
  app.get('/dashboard', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new InventoryDashboardService(req.server.db, req.tenantId);
    return { data: await svc.kpis() };
  });
  app.get('/dashboard/recent-activity', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new InventoryDashboardService(req.server.db, req.tenantId);
    return { data: await svc.recentActivity(10) };
  });
  // Filterable, valued version of the same feed — drives the mobile Stock
  // Movement screen, which the Home "Today in" / "Today out" tiles open
  // pre-filtered.
  app.get('/dashboard/activity', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const q = movementFeedQuerySchema.parse(req.query);
    const svc = new InventoryDashboardService(req.server.db, req.tenantId);
    return { data: await svc.movementFeed(q) };
  });
  // Home-screen strips: most-recently-moved stock in one class bucket.
  app.get('/dashboard/stock-highlights', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { group, limit } = stockHighlightsQuerySchema.parse(req.query);
    const svc = new InventoryDashboardService(req.server.db, req.tenantId);
    return { data: await svc.stockHighlights(group, limit) };
  });
  app.get('/dashboard/warehouse-breakdown', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new InventoryDashboardService(req.server.db, req.tenantId);
    return { data: await svc.warehouseBreakdown() };
  });

  // ─── Analytics ───────────────────────────────────────────────────────
  // Decision layer over the operational reports: how stock is performing,
  // what is about to run out, and what is about to expire. All read-only
  // and derived live from the ledger.
  app.get('/analytics/health', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = inventoryAnalyticsFilterSchema.parse(req.query);
    const svc = new InventoryAnalyticsService(req.server.db, req.tenantId);
    return { data: await svc.health(filter) };
  });

  app.get('/analytics/performance', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = inventoryPerformanceFilterSchema.parse(req.query);
    const svc = new InventoryAnalyticsService(req.server.db, req.tenantId);
    return { data: await svc.performance(filter) };
  });

  app.get('/analytics/stock-risk', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = inventoryAnalyticsFilterSchema.parse(req.query);
    const svc = new InventoryAnalyticsService(req.server.db, req.tenantId);
    return { data: await svc.stockRisk(filter) };
  });

  app.get('/analytics/forecast', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = inventoryForecastFilterSchema.parse(req.query);
    const svc = new InventoryForecastService(req.server.db, req.tenantId);
    const [stockout, expiry] = await Promise.all([
      svc.stockoutForecast(filter),
      svc.expiryForecast(filter),
    ]);
    return { data: { stockout, expiry } };
  });

  app.get('/analytics/trend', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = inventoryTrendFilterSchema.parse(req.query);
    const svc = new InventoryForecastService(req.server.db, req.tenantId);
    return { data: await svc.trend(filter) };
  });

  // What the reorder level SHOULD be, from demand + variability + lead
  // time. The operational alert list only reads a hand-typed reorder_level;
  // this is what tells you the number to type.
  app.get('/analytics/replenishment', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = inventoryReplenishmentFilterSchema.parse(req.query);
    const svc = new ReplenishmentService(req.server.db, req.tenantId);
    return { data: await svc.suggestions(filter) };
  });

  // Bulk-write the computed reorder points onto the item master. This is
  // the only practical way to populate thresholds across a large catalogue
  // — typing them one at a time is why they stay unset.
  app.post('/analytics/replenishment/apply', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const input = applyReplenishmentSchema.parse(req.body);
    const svc = new ReplenishmentService(req.server.db, req.tenantId);
    return { data: await svc.applySuggestions(input) };
  });

  // Drill-down behind a forecast row: the raw monthly demand its run-rate
  // was built from, so the number can be checked rather than trusted.
  app.get<{ Params: { itemId: string } }>(
    '/analytics/items/:itemId/demand',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (req) => {
      const { itemId } = z.object({ itemId: z.string().uuid() }).parse(req.params);
      const { months, warehouseId } = z.object({
        months: z.coerce.number().int().min(1).max(24).default(12),
        warehouseId: z.string().uuid().optional(),
      }).parse(req.query);
      const svc = new InventoryForecastService(req.server.db, req.tenantId);
      return { data: await svc.itemDemand(itemId, months, warehouseId) };
    },
  );
};
