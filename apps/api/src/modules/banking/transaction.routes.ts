import { FastifyPluginAsync } from 'fastify';
import { transactionFilterSchema, paginationSchema } from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { TransactionService } from './transaction.service';
import { CategorizeService } from './categorize.service';
import { BankChargesService } from './bank-charges.service';
import { AutoBillPayService } from './auto-bill-pay.service';
import { AutoReceiptService } from './auto-receipt.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const accountParamSchema = z.object({ accountId: z.string().uuid() });

const importBodySchema = z.object({
  csvData: z.string().min(1, 'CSV data is required'),
});

const transactionParamSchema = z.object({ id: z.string().uuid() });
const setCategoryBodySchema = z.object({
  glAccountId: z.string().uuid(),
  reconcile: z.boolean().optional().default(true),
  learn: z.boolean().optional().default(true),
});

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/:accountId/transactions',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const pagination = paginationSchema.parse(request.query);
      const filters = transactionFilterSchema.parse(request.query);
      const service = new TransactionService(request.server.db, request.tenantId);
      return service.list(accountId, {
        page: pagination.page,
        limit: pagination.limit,
        filters,
      });
    },
  );

  app.post(
    '/:accountId/import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const { csvData } = importBodySchema.parse(request.body);
      const service = new TransactionService(request.server.db, request.tenantId);
      const result = await service.importCSV(accountId, csvData);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/:accountId/categorize',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new CategorizeService(request.server.db, request.tenantId);
      const result = await service.categorizeTransactions(accountId);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/:accountId/sync',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new TransactionService(request.server.db, request.tenantId);
      const result = await service.syncFromFeed(accountId);
      return reply.status(200).send({ data: result });
    },
  );

  app.get(
    '/:accountId/charges-summary',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new BankChargesService(request.server.db, request.tenantId);
      const data = await service.getChargesSummary(accountId);
      return { data };
    },
  );

  app.put(
    '/transactions/:id/category',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = transactionParamSchema.parse(request.params);
      const { glAccountId, reconcile, learn } = setCategoryBodySchema.parse(request.body);
      const service = new CategorizeService(request.server.db, request.tenantId);
      await service.setCategory(id, glAccountId, { reconcile, learn });
      return reply.status(200).send({ data: { success: true } });
    },
  );

  // ── Assign vendor to a bank transaction ────────────────────────

  const assignVendorBodySchema = z.object({ vendorId: z.string().uuid() });

  app.put(
    '/transactions/:id/vendor',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = transactionParamSchema.parse(request.params);
      const { vendorId } = assignVendorBodySchema.parse(request.body);
      const { bankTransactions, vendors, accounts: glAccounts, bankAccounts } = await import('@runq/db');
      const { eq, and } = await import('drizzle-orm');
      const db = request.server.db;
      const tenantId = request.tenantId;

      // Fetch transaction
      let [txn] = await db.select().from(bankTransactions)
        .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, tenantId))).limit(1);
      if (!txn) return reply.status(404).send({ error: 'Transaction not found' });

      // Fetch vendor
      const [vendor] = await db.select().from(vendors)
        .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, tenantId))).limit(1);
      if (!vendor) return reply.status(404).send({ error: 'Vendor not found' });
      if (!vendor.expenseAccountCode) return reply.status(400).send({ error: 'Vendor has no expense account code set' });

      // Reassignment: roll back any prior auto-bill-pay artifacts before re-applying
      if (txn.vendorId && txn.vendorId !== vendorId) {
        const reverter = new AutoBillPayService(db, tenantId);
        await reverter.reverseFromBankTxn(id);
        const [refreshed] = await db.select().from(bankTransactions)
          .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, tenantId))).limit(1);
        if (refreshed) txn = refreshed;
      }

      let result = null;

      if (txn.reconStatus === 'unreconciled') {
        // Full auto-bill-pay for unreconciled transactions
        const [bankGl] = await db
          .select({ code: glAccounts.code })
          .from(bankAccounts)
          .innerJoin(glAccounts, eq(bankAccounts.glAccountId, glAccounts.id))
          .where(and(eq(bankAccounts.id, txn.bankAccountId), eq(bankAccounts.tenantId, tenantId)))
          .limit(1);
        if (!bankGl) return reply.status(400).send({ error: 'Bank account has no GL mapping' });

        const autoBillPay = new AutoBillPayService(db, tenantId);
        result = await autoBillPay.createFromBankTxn({
          bankTransactionId: id,
          vendorId,
          vendorName: vendor.name,
          expenseAccountCode: vendor.expenseAccountCode,
          bankAccountId: txn.bankAccountId,
          bankGlAccountCode: bankGl.code,
          amount: parseFloat(txn.amount),
          transactionDate: txn.transactionDate,
          narration: txn.narration,
          reference: txn.reference,
        });
      } else {
        // Already reconciled — just tag the vendor (metadata only, no JEs)
        await db.update(bankTransactions)
          .set({ vendorId, updatedAt: new Date() })
          .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, tenantId)));
      }

      // Learn the pattern and apply to similar transactions — but only if the
      // narration unambiguously identifies this vendor. If any other vendor
      // already has txns with the same pattern, multiple parties share this
      // narration (e.g. group entities, generic "NEFT/IMPS" prefixes) and
      // bulk-applying or learning a rule would mass-misclassify future imports.
      let applied = 0;
      let ambiguous = false;
      if (txn.narration) {
        const { extractNarrationPattern } = await import('./categorize.service');
        const pattern = extractNarrationPattern(txn.narration);
        if (pattern) {
          const { sql, isNull, ne } = await import('drizzle-orm');
          const [conflict] = await db.select({ id: bankTransactions.id }).from(bankTransactions)
            .where(and(
              eq(bankTransactions.tenantId, tenantId),
              ne(bankTransactions.vendorId, vendorId),
              sql`${bankTransactions.vendorId} IS NOT NULL`,
              sql`${bankTransactions.narration} ILIKE ${'%' + pattern + '%'}`,
            )).limit(1);
          ambiguous = !!conflict;

          if (!ambiguous) {
            const categorize = new CategorizeService(db, tenantId);
            const [expenseGl] = await db.select({ id: glAccounts.id }).from(glAccounts)
              .where(and(eq(glAccounts.code, vendor.expenseAccountCode), eq(glAccounts.tenantId, tenantId))).limit(1);
            if (expenseGl) {
              await categorize.learnVendorRule(txn.narration, expenseGl.id, vendorId, txn.type);
            }
            const similarResult = await db.update(bankTransactions)
              .set({ vendorId, updatedAt: new Date() })
              .where(and(
                eq(bankTransactions.tenantId, tenantId),
                isNull(bankTransactions.vendorId),
                sql`${bankTransactions.narration} ILIKE ${'%' + pattern + '%'}`,
              ))
              .returning({ id: bankTransactions.id });
            applied = similarResult.length;
          }
        }
      }

      return reply.status(200).send({ data: { success: true, applied, ambiguous, ...result } });
    },
  );

  // ── Assign customer to a bank transaction ──────────────────────

  const assignCustomerBodySchema = z.object({ customerId: z.string().uuid() });

  app.put(
    '/transactions/:id/customer',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = transactionParamSchema.parse(request.params);
      const { customerId } = assignCustomerBodySchema.parse(request.body);
      const { bankTransactions, customers } = await import('@runq/db');
      const { eq, and } = await import('drizzle-orm');
      const db = request.server.db;
      const tenantId = request.tenantId;

      let [txn] = await db.select().from(bankTransactions)
        .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, tenantId))).limit(1);
      if (!txn) return reply.status(404).send({ error: 'Transaction not found' });

      const [customer] = await db.select().from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId))).limit(1);
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });

      // Reassignment: roll back any prior auto-receipt artifacts before re-applying
      if (txn.customerId && txn.customerId !== customerId) {
        const reverter = new AutoReceiptService(db, tenantId);
        await reverter.reverseFromBankTxn(id);
        const [refreshed] = await db.select().from(bankTransactions)
          .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, tenantId))).limit(1);
        if (refreshed) txn = refreshed;
      }

      // Tag customer on the transaction
      await db.update(bankTransactions)
        .set({ customerId, updatedAt: new Date() })
        .where(and(eq(bankTransactions.id, id), eq(bankTransactions.tenantId, tenantId)));

      // For unreconciled credits, run the auto-receipt waterfall so the
      // customer's open invoices are allocated and marked paid/partially_paid.
      // (Mirrors the vendor route's auto-bill-pay step for debits.)
      let result: Awaited<ReturnType<AutoReceiptService['createFromBankTxn']>> = null;
      if (txn.type === 'credit' && txn.reconStatus === 'unreconciled') {
        const { bankAccounts, accounts: glAccounts } = await import('@runq/db');
        const [bankGl] = await db
          .select({ code: glAccounts.code })
          .from(bankAccounts)
          .innerJoin(glAccounts, eq(bankAccounts.glAccountId, glAccounts.id))
          .where(and(eq(bankAccounts.id, txn.bankAccountId), eq(bankAccounts.tenantId, tenantId)))
          .limit(1);
        if (bankGl) {
          const autoReceipt = new AutoReceiptService(db, tenantId);
          result = await autoReceipt.createFromBankTxn({
            bankTransactionId: id,
            customerId,
            customerName: customer.name,
            bankAccountId: txn.bankAccountId,
            bankGlAccountCode: bankGl.code,
            amount: parseFloat(txn.amount),
            transactionDate: txn.transactionDate,
            narration: txn.narration,
            reference: txn.reference,
          });
        }
      }

      // Same ambiguity guard as the vendor route: if other customers already
      // have txns matching this narration pattern, the bank statement format
      // can't distinguish them — don't bulk-apply, don't learn a rule.
      let applied = 0;
      let ambiguous = false;
      if (txn.narration) {
        const { extractNarrationPattern } = await import('./categorize.service');
        const pattern = extractNarrationPattern(txn.narration);
        if (pattern) {
          const { sql, isNull, ne } = await import('drizzle-orm');
          const [conflict] = await db.select({ id: bankTransactions.id }).from(bankTransactions)
            .where(and(
              eq(bankTransactions.tenantId, tenantId),
              ne(bankTransactions.customerId, customerId),
              sql`${bankTransactions.customerId} IS NOT NULL`,
              sql`${bankTransactions.narration} ILIKE ${'%' + pattern + '%'}`,
            )).limit(1);
          ambiguous = !!conflict;

          if (!ambiguous) {
            const categorize = new CategorizeService(db, tenantId);
            const { accounts: glAccounts } = await import('@runq/db');
            const [arAccount] = await db.select({ id: glAccounts.id }).from(glAccounts)
              .where(and(eq(glAccounts.code, '1103'), eq(glAccounts.tenantId, tenantId))).limit(1);
            if (arAccount) {
              await categorize.learnNarrationRule(txn.narration, arAccount.id, txn.type, undefined, customerId);
            }
            const result = await db.update(bankTransactions)
              .set({ customerId, updatedAt: new Date() })
              .where(and(
                eq(bankTransactions.tenantId, tenantId),
                isNull(bankTransactions.customerId),
                sql`${bankTransactions.narration} ILIKE ${'%' + pattern + '%'}`,
              ))
              .returning({ id: bankTransactions.id });
            applied = result.length;
          }
        }
      }

      return reply.status(200).send({ data: { success: true, applied, ambiguous, ...(result ?? {}) } });
    },
  );

  // ── Clear vendor / customer assignment (reverses auto-bill-pay / auto-receipt) ──

  app.delete(
    '/transactions/:id/vendor',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = transactionParamSchema.parse(request.params);
      const reverter = new AutoBillPayService(request.server.db, request.tenantId);
      await reverter.reverseFromBankTxn(id);
      return reply.status(200).send({ data: { success: true } });
    },
  );

  app.delete(
    '/transactions/:id/customer',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = transactionParamSchema.parse(request.params);
      const reverter = new AutoReceiptService(request.server.db, request.tenantId);
      await reverter.reverseFromBankTxn(id);
      return reply.status(200).send({ data: { success: true } });
    },
  );

  // ── Narration rules (learned categorization patterns) ──────────

  app.get(
    '/narration-rules',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { bankNarrationRules, accounts: glAccounts } = await import('@runq/db');
      const { eq } = await import('drizzle-orm');
      const rules = await request.server.db
        .select({
          id: bankNarrationRules.id,
          pattern: bankNarrationRules.pattern,
          glAccountId: bankNarrationRules.glAccountId,
          glAccountName: glAccounts.name,
          glAccountCode: glAccounts.code,
          autoReconcile: bankNarrationRules.autoReconcile,
          txnType: bankNarrationRules.txnType,
          createdAt: bankNarrationRules.createdAt,
        })
        .from(bankNarrationRules)
        .innerJoin(glAccounts, eq(bankNarrationRules.glAccountId, glAccounts.id))
        .where(eq(bankNarrationRules.tenantId, request.tenantId))
        .orderBy(bankNarrationRules.pattern);
      return { data: rules };
    },
  );

  app.delete(
    '/narration-rules/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { bankNarrationRules } = await import('@runq/db');
      const { eq, and } = await import('drizzle-orm');
      const { id } = transactionParamSchema.parse(request.params);
      await request.server.db
        .delete(bankNarrationRules)
        .where(and(eq(bankNarrationRules.id, id), eq(bankNarrationRules.tenantId, request.tenantId)));
      return reply.status(204).send();
    },
  );
};
