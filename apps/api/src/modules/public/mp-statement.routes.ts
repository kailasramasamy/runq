import { FastifyPluginAsync } from 'fastify';
import { verifyStatementToken } from '../milk-procurement/mp-statement-token';
import { VmccBillService } from '../milk-procurement/vmcc-bill.service';
import { StatementService } from '../milk-procurement/statement.service';
import {
  renderVmccBillHTML, renderPourStatementHTML, vmccBillFilename, pourStatementFilename,
  type VmccBillStatementData,
} from '../milk-procurement/statement-template';

// Public, token-signed PDF for one VMCC bill or one farmer statement — the URL
// WhatsApp (Interakt) fetches as the document header. Unauthenticated by design:
// the HMAC token IS the authorization, scoped to a single document and expiring.
// No listing, no tenant enumeration — an invalid/expired token just 404s.
export const mpStatementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/statement/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const payload = verifyStatementToken(token);
    if (!payload) return reply.status(404).send({ error: 'Invalid or expired link' });
    const db = request.server.db;
    const { renderHtmlToPdf } = await import('../ar/invoice-pdf');

    if (payload.k === 'vb') {
      const s = await new VmccBillService(db, payload.t)
        .billStatementData({ year: payload.y, month: payload.m, half: payload.h }, payload.n);
      const data: VmccBillStatementData = {
        tenantName: s.tenantName, vmcc: s.vmcc,
        period: { from: s.detail.periodStart, to: s.detail.periodEnd },
        lines: s.detail.lines.map((l) => ({
          collectionDate: l.date, shift: l.shift, milkType: l.milkType, qtyLitres: l.qtyLitres,
          fat: l.fat, snf: l.snf, water: l.water, ratePerLitre: l.ratePerLitre, amount: l.amount,
        })),
        totals: { litres: s.detail.totalQty, amount: s.detail.totalAmount, unpricedLines: s.detail.unpricedLines },
        commission: s.commission, generatedAt: new Date().toISOString(),
      };
      const pdf = await renderHtmlToPdf(renderVmccBillHTML(data));
      return reply.type('application/pdf')
        .header('Content-Disposition', `inline; filename="${vmccBillFilename(data)}"`)
        .header('Access-Control-Expose-Headers', 'Content-Disposition')
        .send(pdf);
    }

    const data = await new StatementService(db, payload.t)
      .forFarmer(payload.f, payload.from, payload.to, { kind: 'all' });
    const pdf = await renderHtmlToPdf(renderPourStatementHTML(data));
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${pourStatementFilename(data)}"`)
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .send(pdf);
  });
};
