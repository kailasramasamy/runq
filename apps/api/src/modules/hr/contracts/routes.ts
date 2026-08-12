import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createContractSchema,
  updateContractSchema,
  contractFilterSchema,
  contractMemberInputSchema,
  updateMemberSchema,
  markDaysSchema,
  createAdvanceSchema,
  createSettlementSchema,
  paySettlementSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { ContractService } from './contract.service';
import { AdvanceService } from './advance.service';
import { SettlementService } from './settlement.service';

// Contracts carry pay data, so they follow the payroll gate rather than the
// wider HR-read one: a plain viewer has no business reading what the crew
// beside them is paid.
const READ = ['owner', 'accountant', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

const asOfQuery = z.object({ asOf: z.string().date().optional() });

export const contractRoutes: FastifyPluginAsync = async (app) => {
  app.get('/contracts', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const filter = contractFilterSchema.parse(req.query);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.list(filter) };
  });

  /** Contract, crew, day log, advances, settlements and the live balance. */
  app.get('/contracts/:id', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { asOf } = asOfQuery.parse(req.query);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.detail(id, asOf) };
  });

  app.post('/contracts', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createContractSchema.parse(req.body);
    const svc = new ContractService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input, req.user!.userId) });
  });

  app.put('/contracts/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateContractSchema.parse(req.body);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.put('/contracts/:id/cancel', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.cancel(id) };
  });

  // ── Crew ────────────────────────────────────────────────────────────────

  app.get('/contracts/:id/members', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.members(id) };
  });

  app.post('/contracts/:id/members', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = contractMemberInputSchema.parse(req.body);
    const svc = new ContractService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.addMember(id, input) });
  });

  app.put('/members/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateMemberSchema.parse(req.body);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.updateMember(id, input) };
  });

  app.delete('/members/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.removeMember(id) };
  });

  // ── Calendar ────────────────────────────────────────────────────────────

  /**
   * Mark a span of days. Sending `worked` clears whatever was there — the
   * absence of a row is what "worked" means.
   */
  app.post('/contracts/:id/days', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = markDaysSchema.parse(req.body);
    const svc = new ContractService(req.server.db, req.tenantId);
    return { data: await svc.markDays(id, input, req.user!.userId) };
  });

  // ── Advances ────────────────────────────────────────────────────────────

  app.get('/contracts/:id/advances', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new AdvanceService(req.server.db, req.tenantId);
    return { data: await svc.listForContract(id) };
  });

  app.post('/contracts/:id/advances', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = createAdvanceSchema.parse(req.body);
    const svc = new AdvanceService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(id, input, req.user!.userId) });
  });

  app.put('/advances/:id/cancel', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new AdvanceService(req.server.db, req.tenantId);
    return { data: await svc.cancel(id, req.user!.userId) };
  });

  // ── Settlement ──────────────────────────────────────────────────────────

  const previewQuery = z.object({
    throughDate: z.string().date().optional(),
    otherDeductions: z.coerce.number().nonnegative().optional(),
  });

  app.get('/contracts/:id/settlement-preview', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const q = previewQuery.parse(req.query);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.preview(id, q) };
  });

  app.post('/contracts/:id/settlement', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = createSettlementSchema.parse(req.body);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(id, input, req.user!.userId) });
  });

  app.get('/settlements/:id', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.get(id) };
  });

  app.put('/settlements/:id/approve', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.approve(id, req.user!.userId) };
  });

  app.put('/settlements/:id/pay', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = paySettlementSchema.parse(req.body);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.pay(id, input, req.user!.userId) };
  });

  app.put('/settlements/:id/cancel', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.cancel(id) };
  });
};
