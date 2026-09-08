/**
 * Manufacturing — the stock reads the shop floor needs, behind the
 * manufacturing gate. Mounted at /manufacturing/stock and
 * /manufacturing/warehouses.
 *
 * The floor is granted `manufacturing` and nothing else, but every stock view
 * in the module — what a draw can take, what a run consumed, what came out —
 * was reading `/inventory/*`, which `requireModule('inventory')` refuses them.
 * The module was quietly unusable without an entitlement it should never have
 * needed: nobody making paneer requires the Inventory module to see the milk
 * in front of them.
 *
 * These are the same services the inventory routes call, not a second
 * implementation — only the gate in front of them differs. Read-only by
 * design: moving stock still belongs to Inventory, and nothing here writes.
 */

import { FastifyPluginAsync } from 'fastify';
import {
  stockOnHandFilterSchema,
  itemMovementFilterSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { StockQueryService } from '../inventory/stock-query.service';
import { WarehouseService } from '../inventory/warehouse.service';
import { ItemMovementAuditService } from '../inventory/movement-audit.service';

// `field_operator` is spelled out for the same reason it is on the run routes:
// at a small dairy the operator who collects the milk is often the one who
// runs the plant, and they must be able to see what is on hand.
const READ_ROLES = [
  'owner', 'accountant', 'viewer', 'technician', 'field_operator',
] as const;

/** Mounted at /manufacturing/stock */
export const mfgStockRoutes: FastifyPluginAsync = async (app) => {
  /**
   * What is on hand, batch by batch. `itemClassGroup` picks the shelf:
   * `inputs` is what a run can draw, `finished` is what it produced.
   */
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = stockOnHandFilterSchema.parse(req.query);
    const svc = new StockQueryService(req.server.db, req.tenantId);
    return { data: await svc.onHand(filter) };
  });

  /** One lot's movements — the "full history" behind a stock row. */
  app.get('/items/:id/movements', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const filter = itemMovementFilterSchema.parse(req.query);
    const svc = new ItemMovementAuditService(req.server.db, req.tenantId);
    return { data: await svc.itemMovements(id, filter) };
  });
};

/** Mounted at /manufacturing/warehouses — for the pickers on every mfg form. */
export const mfgWarehouseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const svc = new WarehouseService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
};
