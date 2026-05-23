import { FastifyPluginAsync } from 'fastify';
import {
  createWarehouseSchema, updateWarehouseSchema,
  createGrnSchema, updateGrnSchema, cancelGrnSchema, grnFilterSchema,
  createDeliveryNoteSchema, updateDeliveryNoteSchema, cancelDeliveryNoteSchema,
  deliveryNoteFilterSchema,
  stockOnHandFilterSchema, stockLedgerFilterSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WarehouseService } from './warehouse.service';
import { GrnService } from './grn.service';
import { DeliveryNoteService } from './delivery.service';
import { StockQueryService } from './stock-query.service';
import { InventoryDashboardService } from './dashboard.service';
import { NotFoundError } from '../../utils/errors';

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

  // ─── Dashboard ───────────────────────────────────────────────────────
  app.get('/dashboard', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new InventoryDashboardService(req.server.db, req.tenantId);
    return { data: await svc.kpis() };
  });
};
