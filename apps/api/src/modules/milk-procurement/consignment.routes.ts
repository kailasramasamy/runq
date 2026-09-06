import { FastifyPluginAsync } from 'fastify';
import {
  createConsignmentSchema,
  receiveConsignmentSchema,
  directReceiveConsignmentSchema,
  consignmentFilterSchema,
  consignmentAvailabilitySchema,
  fastTrackSchema,
  pendingDispatchSchema,
  unwindSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ConsignmentService } from './consignment.service';
import { PendingDispatchService } from './pending-dispatch.service';
import { MpFastTrackService } from './fast-track.service';
import { MpUnwindService } from './unwind.service';
import { resolveMpPrincipal } from './access-scope';

// field_operator dispatches/receives at their node; reads are node-scoped
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const consignmentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = consignmentFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.get('/available', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = consignmentAvailabilitySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.availability(q.nodeId, q.collectionDate, principal, q.shift, q.milkType) };
  });

  // Undispatched milk at a node, however old — drives the dispatch badge.
  app.get('/pending-dispatch', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = pendingDispatchSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new PendingDispatchService(request.server.db, request.tenantId);
    return { data: await service.list(q.nodeId, principal) };
  });

  // Single-site chain: preview, then commit. Both take the same body so the
  // operator commits exactly what the confirm sheet showed them.
  app.post('/fast-track/plan', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = fastTrackSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    return { data: await new MpFastTrackService(request.server.db, request.tenantId).plan(input, principal) };
  });

  app.post('/fast-track/run', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = fastTrackSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new MpFastTrackService(request.server.db, request.tenantId);
    return { data: await service.run(input, request.user?.userId, principal) };
  });

  // Undo a load end to end. Preview first, then commit — the same shape the
  // forward fast track uses, because the operator needs to see what a chain
  // action will do before it does it.
  app.post('/unwind/plan', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = unwindSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new MpUnwindService(request.server.db, request.tenantId);
    return { data: await service.plan(input, principal) };
  });

  app.post('/unwind/run', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = unwindSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new MpUnwindService(request.server.db, request.tenantId);
    return { data: await service.run(input, request.user?.userId, principal) };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.getById(id, principal) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createConsignmentSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.dispatch(input, request.user?.userId, principal) });
  });

  // Ad-hoc receive: record milk that arrived with no dispatch entry.
  app.post('/direct-receive', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = directReceiveConsignmentSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.directReceive(input, request.user?.userId, principal) });
  });

  app.post('/:id/receive', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = receiveConsignmentSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.receive(id, input, request.user?.userId, principal) };
  });

  // Correct the most recent receipt (CC fixing a just-entered qty/FAT/SNF).
  app.post('/:id/edit-receipt', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = receiveConsignmentSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.editReceipt(id, input, request.user?.userId, principal) };
  });

  // Undo a dispatch that hasn't landed — litres return to the source's pool.
  app.post('/:id/cancel-dispatch', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.cancelDispatch(id, principal) };
  });

  // Undo a receipt — puts the load back in transit (or withdraws a manual entry).
  app.post('/:id/cancel-receipt', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.cancelReceipt(id, request.user?.userId, principal) };
  });

  app.post('/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.reverse(id, principal) };
  });

  // Delete a manually-entered receipt mis-entry (only while not locked for dispatch).
  app.delete('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.deleteManualReceipt(id, principal) };
  });
};
