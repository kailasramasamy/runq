import { FastifyPluginAsync } from 'fastify';
import {
  createWarehouseSchema, updateWarehouseSchema,
  createGrnSchema, updateGrnSchema, cancelGrnSchema, grnFilterSchema,
  createDeliveryNoteSchema, updateDeliveryNoteSchema, cancelDeliveryNoteSchema,
  deliveryNoteFilterSchema,
  stockOnHandFilterSchema, stockLedgerFilterSchema,
  uuidParamSchema,
  createTransferSchema, updateTransferSchema, cancelTransferSchema,
  receiveTransferSchema, transferFilterSchema,
  createAdjustmentSchema, updateAdjustmentSchema, cancelAdjustmentSchema,
  adjustmentFilterSchema,
  startStockTakeSchema, upsertCountLinesSchema, updateCountLineSchema,
  recountStockTakeSchema, stockTakeFilterSchema,
  upsertReorderRuleSchema, expiryFilterSchema,
  stockSummaryFilterSchema, valuationFilterSchema, ageingFilterSchema,
  movementSummaryFilterSchema, deadStockFilterSchema, serialLookupFilterSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { WarehouseService } from './warehouse.service';
import { GrnService } from './grn.service';
import { DeliveryNoteService } from './delivery.service';
import { StockQueryService } from './stock-query.service';
import { InventoryDashboardService } from './dashboard.service';
import { TransferService } from './transfer.service';
import { AdjustmentService } from './adjustment.service';
import { StockTakeService } from './stock-take.service';
import { ReorderService } from './reorder.service';
import { ReportsService } from './reports.service';
import { SerialService } from './serial.service';
import { NotFoundError } from '../../utils/errors';

const lineParamSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });
const itemWhParamSchema = z.object({ itemId: z.string().uuid(), warehouseId: z.string().uuid() });

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
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
};
