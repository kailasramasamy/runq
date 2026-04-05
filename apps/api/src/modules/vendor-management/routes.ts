import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createVendorContractSchema,
  createVendorRatingSchema,
  createRequisitionSchema,
  createPaymentScheduleSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { VendorManagementService } from './vendor-management.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const contractsQuerySchema = z.object({
  vendorId: z.string().uuid().optional(),
  status: z.string().optional(),
});

const updateContractSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  value: z.number().nullable().optional(),
  terms: z.string().nullable().optional(),
  renewalDate: z.string().date().nullable().optional(),
  status: z.enum(['draft', 'active', 'expired', 'cancelled']).optional(),
});
const updateRequisitionSchema = z.object({
  vendorId: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(500).optional(),
  items: z.array(z.object({
    itemName: z.string().min(1),
    quantity: z.number().positive(),
    estimatedUnitPrice: z.number().nonnegative().optional(),
  })).min(1).optional(),
});
const requisitionStatusSchema = z.object({
  status: z.enum(['draft', 'pending_approval', 'approved', 'rejected', 'converted']).optional(),
});
const scheduleStatusSchema = z.object({
  status: z.enum(['draft', 'approved', 'processing', 'completed', 'cancelled']).optional(),
});
const contractStatusSchema = z.object({
  status: z.enum(['draft', 'active', 'expired', 'cancelled']),
});

export const vendorManagementRoutes: FastifyPluginAsync = async (app) => {
  // --- Contracts ---
  app.get('/contracts', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { vendorId, status } = contractsQuerySchema.parse(request.query);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.listContracts(vendorId, status) };
  });

  app.post('/contracts', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createVendorContractSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    const data = await svc.createContract(input);
    return reply.status(201).send({ data });
  });

  app.get('/contracts/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.getContract(id) };
  });

  app.put('/contracts/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateContractSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.updateContract(id, input) };
  });

  app.put('/contracts/:id/status', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const { status } = contractStatusSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.updateContractStatus(id, status) };
  });

  // --- Ratings ---
  app.get('/ratings', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { vendorId } = z.object({ vendorId: z.string().uuid().optional() }).parse(request.query);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.listRatings(vendorId) };
  });

  app.post('/ratings', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createVendorRatingSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    const data = await svc.createRating(input, request.user.userId);
    return reply.status(201).send({ data });
  });

  app.get('/ratings/scorecard/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.getVendorScorecard(id) };
  });

  // --- Requisitions ---
  app.get('/requisitions', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { status } = requisitionStatusSchema.parse(request.query);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.listRequisitions(status) };
  });

  app.post('/requisitions', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createRequisitionSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    const data = await svc.createRequisition(input, request.user.userId);
    return reply.status(201).send({ data });
  });

  app.put('/requisitions/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateRequisitionSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.updateRequisition(id, input) };
  });

  app.put('/requisitions/:id/approve', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.approveRequisition(id, request.user.userId) };
  });

  app.put('/requisitions/:id/convert', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.convertRequisitionToPO(id) };
  });

  // --- Payment Schedules ---
  app.get('/payment-schedules', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { status } = scheduleStatusSchema.parse(request.query);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.listPaymentSchedules(status) };
  });

  app.get('/payment-schedules/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.getPaymentSchedule(id) };
  });

  app.post('/payment-schedules', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createPaymentScheduleSchema.parse(request.body);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    const data = await svc.createPaymentSchedule(input, request.user.userId);
    return reply.status(201).send({ data });
  });

  app.put('/payment-schedules/:id/approve', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.approvePaymentSchedule(id, request.user.userId) };
  });

  // --- Early Payment Discounts ---
  app.get('/early-payment-discounts', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new VendorManagementService(request.server.db, request.tenantId);
    return { data: await svc.getEarlyPaymentDiscounts() };
  });
};
