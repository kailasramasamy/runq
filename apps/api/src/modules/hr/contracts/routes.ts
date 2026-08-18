import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createContractSchema,
  updateContractSchema,
  contractFilterSchema,
  contractMemberInputSchema,
  updateMemberSchema,
  markDaysSchema,
  pauseContractSchema,
  resumeContractSchema,
  createAdvanceSchema,
  createSettlementSchema,
  paySettlementSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { ContractService } from './contract.service';
import { PauseService } from './pause.service';
import { ContractStatementService } from './statement.service';
import {
  renderContractStatementHTML, contractStatementFilename,
} from './statement-template';
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

  // ── Statement ───────────────────────────────────────────────────────────

  /**
   * The whole contract on paper: days worked and what was taken off them,
   * pauses, leave, advances, and the settlement with its payments. PDF by
   * default; `?format=html` renders the same document in the browser, which
   * is how the template is iterated on without Chromium in the loop.
   */
  const statementQuery = z.object({
    format: z.enum(['pdf', 'html']).default('pdf'),
  });

  app.get('/contracts/:id/statement', { preHandler: [rbacHook([...READ])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { format } = statementQuery.parse(req.query);
    const data = await new ContractStatementService(req.server.db, req.tenantId)
      .forContract(id);
    const html = renderContractStatementHTML(data);
    if (format === 'html') return reply.type('text/html').send(html);

    // Lazy-imported so the Chromium dependency only loads when a PDF is
    // actually asked for.
    const { renderHtmlToPdf } = await import('../../ar/invoice-pdf');
    const pdf = await renderHtmlToPdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${contractStatementFilename(data)}"`)
      // Browsers hide non-safelisted headers from JS; the clients read the
      // server's filename back rather than each inventing one.
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .send(pdf);
  });

  // ── Pauses ──────────────────────────────────────────────────────────────

  /** Stop the clock from a date, optionally until a known one. */
  app.post('/contracts/:id/pause', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = pauseContractSchema.parse(req.body);
    const svc = new PauseService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.pause(id, input, req.user!.userId) });
  });

  /** `resumeDate` is the first day back; the pause ends the day before. */
  app.put('/contracts/:id/resume', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = resumeContractSchema.parse(req.body);
    const svc = new PauseService(req.server.db, req.tenantId);
    return { data: await svc.resume(id, input, req.user!.userId) };
  });

  app.delete('/contract-pauses/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PauseService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
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

  /**
   * Record money handed over. Omitting `amount` pays off whatever is due,
   * so the same route serves both a full payout and an instalment.
   */
  app.post('/settlements/:id/payments', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = paySettlementSchema.parse(req.body);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.pay(id, input, req.user!.userId) });
  });

  app.get('/settlements/:id/payments', { preHandler: [rbacHook([...READ])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.payments(id) };
  });

  app.put('/settlement-payments/:id/void', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SettlementService(req.server.db, req.tenantId);
    return { data: await svc.voidPayment(id, req.user!.userId) };
  });

  /** @deprecated Kept for older clients — POST the payments route instead. */
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
