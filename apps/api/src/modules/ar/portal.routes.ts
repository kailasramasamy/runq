import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PortalService } from './portal.service';
import { generateUPILink } from '../../utils/upi/upi-link';
import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import { renderHtmlToPdf } from './invoice-pdf';
import { renderStatementHtml } from './statement-template';
import { InvoiceService } from './invoice.service';
import { renderInvoiceHTML } from './invoice-template';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';
import { PaymentClaimService } from './payment-claim.service';

const tokenQuerySchema = z.object({ token: z.string().min(1) });
const slugParamSchema = z.object({ slug: z.string().min(1) });
const invoiceParamSchema = z.object({ invoiceId: z.string().uuid() });

const statementQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  token: z.string().optional(),
});

const createClaimBodySchema = z.object({
  claimDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(['neft', 'rtgs', 'imps', 'upi', 'cheque', 'cash', 'other']),
  referenceNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  invoiceIds: z.array(z.string().uuid()).min(1).max(200),
});

const claimParamSchema = z.object({ claimId: z.string().uuid() });

const loginBodySchema = z.object({ pin: z.string().regex(/^\d{4,6}$/) });

async function getAuthedSlugContext(
  db: import('@runq/db').Db,
  request: import('fastify').FastifyRequest,
  slug: string,
): Promise<{ tenantId: string; customerId: string }> {
  const ctx = await resolvePortalContext(db, { slug });
  await requireSessionIfPinSet(db, request, ctx);
  return ctx;
}

async function requireSessionIfPinSet(
  db: import('@runq/db').Db,
  request: import('fastify').FastifyRequest,
  ctx: { tenantId: string; customerId: string },
): Promise<void> {
  const service = new PortalService(db, ctx.tenantId);
  const pinRequired = await service.hasPin(ctx.customerId);
  if (!pinRequired) return;
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Portal session required');
  const token = auth.slice('Bearer '.length);
  try {
    const payload = PortalService.verifySession(token);
    if (payload.tenantId !== ctx.tenantId || payload.customerId !== ctx.customerId) {
      throw new UnauthorizedError('Portal session required');
    }
  } catch {
    throw new UnauthorizedError('Portal session required');
  }
}

function currentFinancialYear(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Indian FY: April 1 to March 31
  const fyStart = month >= 3 ? year : year - 1;
  return {
    from: `${fyStart}-04-01`,
    to: `${fyStart + 1}-03-31`,
  };
}

async function resolvePortalContext(
  db: import('@runq/db').Db,
  opts: { slug?: string; token?: string },
): Promise<{ tenantId: string; customerId: string }> {
  if (opts.slug) {
    const service = new PortalService(db, '');
    return service.resolveSlug(opts.slug);
  }
  if (opts.token) {
    const payload = PortalService.verifyToken(opts.token);
    return { tenantId: payload.tenantId, customerId: payload.customerId };
  }
  throw new Error('Missing slug or token');
}

async function buildInvoiceResponse(
  db: import('@runq/db').Db,
  tenantId: string,
  customerId: string,
) {
  const service = new PortalService(db, tenantId);
  const claimService = new PaymentClaimService(db, tenantId);
  const [companyName, customerName, invoices, pendingClaimMap] = await Promise.all([
    service.getCompanyName(),
    service.getCustomerName(customerId),
    service.getOutstandingInvoices(customerId),
    claimService.getPendingClaimByInvoice(customerId),
  ]);

  const upiId = await getUpiId(db, tenantId);
  const data = invoices.map((inv) => ({
    ...inv,
    pendingClaim: pendingClaimMap.get(inv.id) ?? null,
    upiLink: upiId
      ? generateUPILink({
          upiId,
          payeeName: companyName,
          amount: inv.balanceDue,
          transactionNote: `Payment for ${inv.invoiceNumber}`,
        })
      : null,
  }));

  return { companyName, customerName, data };
}

export const portalRoutes: FastifyPluginAsync = async (app) => {
  // Slug-based routes
  app.get('/portal/s/:slug/info', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { slug });
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, customerName, pinRequired] = await Promise.all([
      service.getCompanyName(),
      service.getCustomerName(customerId),
      service.hasPin(customerId),
    ]);
    return { companyName, customerName, pinRequired };
  });

  app.post('/portal/s/:slug/login', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { pin } = loginBodySchema.parse(request.body);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { slug });
    const service = new PortalService(request.server.db, tenantId);
    const token = await service.verifyPinAndIssueSession(customerId, pin);
    if (!token) return reply.status(401).send({ error: 'Invalid PIN' });
    return { token };
  });

  app.get('/portal/s/:slug/invoices', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    return buildInvoiceResponse(request.server.db, tenantId, customerId);
  });

  app.get('/portal/s/:slug/history', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, history] = await Promise.all([
      service.getCompanyName(),
      service.getPaymentHistory(customerId),
    ]);
    return { companyName, data: history };
  });

  app.get('/portal/s/:slug/statement', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { from, to } = statementQuerySchema.parse(request.query);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    return buildStatementResponse(request.server.db, tenantId, customerId, from, to);
  });

  app.get('/portal/s/:slug/statement.pdf', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { from, to } = statementQuerySchema.parse(request.query);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    const pdf = await buildStatementPdf(request.server.db, tenantId, customerId, from, to);
    void reply.type('application/pdf').header('Content-Disposition', 'attachment; filename="statement.pdf"');
    return pdf;
  });

  app.get('/portal/s/:slug/invoices/:invoiceId/print', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const format = (request.query as { format?: string } | undefined)?.format;
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    return renderPortalInvoice(request.server.db, tenantId, customerId, invoiceId, format, reply);
  });

  app.post('/portal/s/:slug/payment-claims', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const body = createClaimBodySchema.parse(request.body);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    return createClaim(request.server.db, tenantId, customerId, body);
  });

  app.get('/portal/s/:slug/payment-claims', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    const claimService = new PaymentClaimService(request.server.db, tenantId);
    const data = await claimService.list(customerId);
    return { data };
  });

  app.delete('/portal/s/:slug/payment-claims/:claimId', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { claimId } = claimParamSchema.parse(request.params);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    const claimService = new PaymentClaimService(request.server.db, tenantId);
    await claimService.cancel(customerId, claimId);
    return { ok: true };
  });

  app.get('/portal/s/:slug/payments', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await getAuthedSlugContext(request.server.db, request, slug);
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, payments] = await Promise.all([
      service.getCompanyName(),
      service.getReceiptsWithAllocations(customerId),
    ]);
    return { companyName, data: payments };
  });

  // Legacy token-based routes
  app.get('/portal/invoices', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    return buildInvoiceResponse(request.server.db, tenantId, customerId);
  });

  app.get('/portal/history', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, history] = await Promise.all([
      service.getCompanyName(),
      service.getPaymentHistory(customerId),
    ]);
    return { companyName, data: history };
  });

  app.get('/portal/statement', async (request) => {
    const { token, from, to } = statementQuerySchema.parse(request.query);
    if (!token) throw new Error('Missing token');
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    return buildStatementResponse(request.server.db, tenantId, customerId, from, to);
  });

  app.get('/portal/statement.pdf', async (request, reply) => {
    const { token, from, to } = statementQuerySchema.parse(request.query);
    if (!token) throw new Error('Missing token');
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    const pdf = await buildStatementPdf(request.server.db, tenantId, customerId, from, to);
    void reply.type('application/pdf').header('Content-Disposition', 'attachment; filename="statement.pdf"');
    return pdf;
  });

  app.get('/portal/invoices/:invoiceId/print', async (request, reply) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const format = (request.query as { format?: string } | undefined)?.format;
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    return renderPortalInvoice(request.server.db, tenantId, customerId, invoiceId, format, reply);
  });

  app.get('/portal/payments', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, payments] = await Promise.all([
      service.getCompanyName(),
      service.getReceiptsWithAllocations(customerId),
    ]);
    return { companyName, data: payments };
  });
};

async function buildStatementResponse(
  db: import('@runq/db').Db,
  tenantId: string,
  customerId: string,
  from?: string,
  to?: string,
) {
  const range = (from && to) ? { from, to } : currentFinancialYear();
  const service = new PortalService(db, tenantId);
  const [companyName, customerName, statement] = await Promise.all([
    service.getCompanyName(),
    service.getCustomerName(customerId),
    service.getStatementOfAccount(customerId, range.from, range.to),
  ]);
  return { companyName, customerName, statement };
}

async function buildStatementPdf(
  db: import('@runq/db').Db,
  tenantId: string,
  customerId: string,
  from?: string,
  to?: string,
): Promise<Buffer> {
  const { companyName, customerName, statement } = await buildStatementResponse(
    db,
    tenantId,
    customerId,
    from,
    to,
  );
  const html = renderStatementHtml({ companyName, customerName, statement });
  return renderHtmlToPdf(html);
}

async function createClaim(
  db: import('@runq/db').Db,
  tenantId: string,
  customerId: string,
  body: z.infer<typeof createClaimBodySchema>,
) {
  const portalService = new PortalService(db, tenantId);
  const claimService = new PaymentClaimService(db, tenantId);
  const allInvoices = await portalService.getOutstandingInvoices(customerId);
  const balanceById = new Map(allInvoices.map((i) => [i.id, i.balanceDue] as const));

  const allocations = body.invoiceIds.map((invoiceId) => {
    const balance = balanceById.get(invoiceId);
    if (balance === undefined) {
      throw new NotFoundError('Invoice');
    }
    return { invoiceId, amount: balance };
  });

  const claim = await claimService.create(customerId, {
    claimDate: body.claimDate,
    paymentMethod: body.paymentMethod,
    referenceNumber: body.referenceNumber ?? null,
    notes: body.notes ?? null,
    allocations,
  });
  return { data: claim };
}

async function renderPortalInvoice(
  db: import('@runq/db').Db,
  tenantId: string,
  customerId: string,
  invoiceId: string,
  format: string | undefined,
  reply: import('fastify').FastifyReply,
) {
  const invoiceService = new InvoiceService(db, tenantId);
  const { invoice, items, customer, tenant, bankAccounts } = await invoiceService.getForPrint(invoiceId);

  if (invoice.customerId !== customerId) {
    throw new NotFoundError('Invoice');
  }

  const tenantInfo = { ...tenant, settings: (tenant.settings ?? {}) as Record<string, unknown> };
  let html = renderInvoiceHTML(invoice, items, customer, tenantInfo, bankAccounts);
  // Hide the in-template "Print / Save as PDF" button — the portal provides its own Download.
  // Keep equivalent top spacing on body so the invoice header doesn't sit flush against the iframe edge.
  html = html.replace(
    '</head>',
    '<style>.print-btn{display:none!important}body{padding-top:48px}</style></head>',
  );

  if (format === 'pdf') {
    const pdf = await renderHtmlToPdf(html);
    const customerLabel = (customer.nickname?.trim() || customer.name.trim() || '')
      .replace(/[\\/:*?"<>| -]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80);
    const fileName = customerLabel
      ? `${invoice.invoiceNumber}-${customerLabel}.pdf`
      : `${invoice.invoiceNumber}.pdf`;
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(pdf);
  }
  return reply.type('text/html').send(html);
}

async function getUpiId(db: import('@runq/db').Db, tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  return (settings.upiId as string) ?? null;
}
