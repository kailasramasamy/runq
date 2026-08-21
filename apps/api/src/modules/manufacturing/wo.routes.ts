import { FastifyPluginAsync } from 'fastify';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  cancelWorkOrderSchema,
  workOrderFilterSchema,
  paginationSchema,
  uuidParamSchema,
  recordConsumptionSchema,
  recordOutputSchema,
  closeWorkOrderSchema,
  suggestBatchesQuerySchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WorkOrderService } from './wo.service';
import { WoConsumptionService } from './consumption.service';
import { WoOutputService } from './output.service';
import { BatchSuggestService } from './batch-suggest.service';
import { WoLifecycleService } from './wo-lifecycle.service';
import { WoReversalService } from './wo-reversal.service';
import { computePreview } from './costing.service';

const READ_ROLES = ['owner', 'accountant', 'viewer', 'technician'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
// Running a WO is shop-floor work: technicians may start it, draw materials,
// record output and close it. Authoring, editing and cancelling WOs stay with
// WRITE_ROLES — a technician executes the plan, they don't set it.
// `field_operator` is spelled out because these lists carry no `viewer` for
// the rbac alias to widen: at a small dairy the operator who collects the
// milk is often the one who runs the plant.
const RUN_ROLES = ['owner', 'accountant', 'technician', 'field_operator'] as const;

// ─── Work Order CRUD ────────────────────────────────────────────────────────

export const woRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = workOrderFilterSchema.parse(request.query);
      const service = new WorkOrderService(request.server.db, request.tenantId);
      return service.list(filters, { page: pagination.page, limit: pagination.limit });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WorkOrderService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createWorkOrderSchema.parse(request.body);
      const service = new WorkOrderService(request.server.db, request.tenantId);
      const data = await service.create(input, request.user?.userId);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateWorkOrderSchema.parse(request.body);
      const service = new WorkOrderService(request.server.db, request.tenantId);
      const data = await service.update(id, input, request.user?.userId);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WorkOrderService(request.server.db, request.tenantId);
      await service.delete(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/cancel',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = cancelWorkOrderSchema.parse(request.body ?? {});
      const lifecycle = new WoLifecycleService(request.server.db, request.tenantId);
      const data = await lifecycle.cancelWithReversal(id, input.reason ?? null, request.user?.userId);
      return { data };
    },
  );

  // Undo a closed run. Same roles as running one: whoever recorded the
  // production is who notices the wrong number, and making them chase an
  // owner leaves bad stock on the shelf in the meantime.
  app.post(
    '/:id/reverse',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = cancelWorkOrderSchema.parse(request.body ?? {});
      const reversal = new WoReversalService(request.server.db, request.tenantId);
      const data = await reversal.reverseClosed(id, input.reason ?? null, request.user?.userId);
      return { data };
    },
  );

  // ─── Lifecycle transitions ────────────────────────────────────────────────

  app.post(
    '/:id/start',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const lifecycle = new WoLifecycleService(request.server.db, request.tenantId);
      const data = await lifecycle.start(id, request.user?.userId);
      return { data };
    },
  );

  app.post(
    '/:id/complete',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const lifecycle = new WoLifecycleService(request.server.db, request.tenantId);
      const data = await lifecycle.complete(id, request.user?.userId);
      return { data };
    },
  );

  app.post(
    '/:id/close',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = closeWorkOrderSchema.parse(request.body ?? {});
      const lifecycle = new WoLifecycleService(request.server.db, request.tenantId);
      return lifecycle.close(id, input, request.user?.userId);
    },
  );

  // ─── Costing preview ─────────────────────────────────────────────────────

  app.get(
    '/:id/preview',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const wo = await new WorkOrderService(request.server.db, request.tenantId).getById(id);
      const [consumptionSvc, outputSvc] = [
        new WoConsumptionService(request.server.db, request.tenantId),
        new WoOutputService(request.server.db, request.tenantId),
      ];
      const [consumption, output] = await Promise.all([
        consumptionSvc.list(id),
        outputSvc.list(id),
      ]);
      const data = computePreview({
        woId: id,
        plannedQty: wo.plannedQty,
        consumption: consumption.map((c) => ({ itemClass: null, value: c.value })),
        output: output.map((o) => ({ qty: o.qty })),
      });
      return { data };
    },
  );

  // ─── Consumption ─────────────────────────────────────────────────────────

  app.get(
    '/:id/consumption',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WoConsumptionService(request.server.db, request.tenantId);
      const data = await service.list(id);
      return { data };
    },
  );

  app.post(
    '/:id/consumption',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = recordConsumptionSchema.parse(request.body);
      const service = new WoConsumptionService(request.server.db, request.tenantId);
      const data = await service.record(id, input, request.user?.userId);
      return reply.status(201).send({ data });
    },
  );

  app.delete(
    '/:id/consumption/:cid',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { cid } = (request.params as { id: string; cid: string });
      void id;
      const service = new WoConsumptionService(request.server.db, request.tenantId);
      await service.reverse(cid, request.user?.userId);
      return reply.status(204).send();
    },
  );

  // ─── Output ──────────────────────────────────────────────────────────────

  app.get(
    '/:id/output',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WoOutputService(request.server.db, request.tenantId);
      const data = await service.list(id);
      return { data };
    },
  );

  app.post(
    '/:id/output',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = recordOutputSchema.parse(request.body);
      const service = new WoOutputService(request.server.db, request.tenantId);
      const data = await service.record(id, input, request.user?.userId);
      return reply.status(201).send({ data });
    },
  );

  app.delete(
    '/:id/output/:oid',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { oid } = (request.params as { id: string; oid: string });
      void id;
      const service = new WoOutputService(request.server.db, request.tenantId);
      await service.reverse(oid, request.user?.userId);
      return reply.status(204).send();
    },
  );

  // ─── Batch suggestions ────────────────────────────────────────────────────

  app.get(
    '/:id/suggested-batches',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      void id;
      const query = suggestBatchesQuerySchema.parse(request.query);
      const service = new BatchSuggestService(request.server.db, request.tenantId);
      const data = await service.suggest(query.inputItemId, query.warehouseId, query.requiredQty);
      return { data };
    },
  );
};
