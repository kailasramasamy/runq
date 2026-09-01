import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, sql, asc } from 'drizzle-orm';
import {
  fnfSettlements,
  onboardingTemplates, onboardingTemplateItems,
  onboardingWorkflows, onboardingItems,
  letterTemplates, employeeLetters,
  employees, documentAttachments, tenants, users,
} from '@runq/db';
import {
  uuidParamSchema,
  createFnfSchema, updateFnfSchema,
  createOnboardingTemplateSchema, updateOnboardingTemplateSchema,
  startOnboardingSchema, completeOnboardingItemSchema,
  createLetterTemplateSchema, updateLetterTemplateSchema,
  generateLetterSchema, issueLetterSchema,
  requestLetterSchema, fulfilLetterRequestSchema,
  employeeDocumentKindSchema, HR_DOC_ALLOWED_MIME_TYPES,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { NotFoundError, ConflictError, ForbiddenError, AppError } from '../../../utils/errors';
import { HrNotifier } from '../hr-notifier';
import { resolveSelfEmployee } from './self-employee';
import { AttachmentService } from '../../common/attachment.service';
import { extractAndSaveResumeProfile } from '../resume-profile.service';
import { getStorageProvider } from '../../../utils/storage';
import { renderLetterPdf } from './letter-pdf';
import { renderTemplate, buildLetterheadTokens } from './letter-render';
import { Readable } from 'node:stream';

const ALL = ['owner', 'accountant', 'viewer', 'hr', 'technician'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
// Company-wide admin lists (everyone's F&F, letters, onboarding) — viewer
// excluded; employees use the /me/* routes for their own records.
const MANAGE = ['owner', 'accountant', 'hr'] as const;

function num(n: number | undefined, dflt = '0') {
  return n === undefined ? dflt : n.toString();
}

// renderTemplate + buildLetterheadTokens are exported from ./letter-render so
// the HR agent can render letters without depending on this route module.

export const lifecycleRoutes: FastifyPluginAsync = async (app) => {
  // ====================== FNF ======================
  app.get('/fnf', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({ status: z.string().optional() }).parse(req.query);
    const conds = [eq(fnfSettlements.tenantId, req.tenantId)];
    if (q.status) conds.push(sql`${fnfSettlements.status}::text = ${q.status}`);
    const rows = await req.server.db
      .select({
        f: fnfSettlements,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(fnfSettlements)
      .innerJoin(employees, eq(employees.id, fnfSettlements.employeeId))
      .where(and(...conds))
      .orderBy(desc(fnfSettlements.createdAt));
    return { data: rows.map((r) => ({ ...r.f, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode })) };
  });

  app.get('/fnf/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .select()
      .from(fnfSettlements)
      .where(and(eq(fnfSettlements.id, id), eq(fnfSettlements.tenantId, req.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('FNF');
    return { data: row };
  });

  app.post('/fnf', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createFnfSchema.parse(req.body);
    const totals = computeFnfTotals(input);
    const [row] = await req.server.db
      .insert(fnfSettlements)
      .values({
        tenantId: req.tenantId,
        employeeId: input.employeeId,
        resignationDate: input.resignationDate,
        lastWorkingDate: input.lastWorkingDate,
        noticePeriodDays: input.noticePeriodDays?.toString(),
        noticeShortfallDays: num(input.noticeShortfallDays),
        lastMonthSalary: num(input.lastMonthSalary),
        leaveEncashment: num(input.leaveEncashment),
        gratuity: num(input.gratuity),
        bonusPayable: num(input.bonusPayable),
        otherEarnings: num(input.otherEarnings),
        noticeRecovery: num(input.noticeRecovery),
        loanRecovery: num(input.loanRecovery),
        tds: num(input.tds),
        pfDeduction: num(input.pfDeduction),
        otherDeductions: num(input.otherDeductions),
        grossEarnings: totals.gross.toString(),
        totalDeductions: totals.deductions.toString(),
        netPayable: totals.net.toString(),
        notes: input.notes,
        status: 'draft',
      })
      .returning();

    new HrNotifier(req.server.db, req.tenantId)
      .notifyEmployee(row.employeeId, {
        source: 'hr_lifecycle',
        title: 'Final settlement started',
        body: 'Your full & final settlement is being processed.',
        targetUrl: '/hr/fnf',
      })
      .catch((e) => req.log.error(e, 'FnF created notification failed'));

    return reply.status(201).send({ data: row });
  });

  app.put('/fnf/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateFnfSchema.parse(req.body);
    const [existing] = await req.server.db
      .select()
      .from(fnfSettlements)
      .where(and(eq(fnfSettlements.id, id), eq(fnfSettlements.tenantId, req.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('FNF');
    if (existing.status !== 'draft') throw new ConflictError('FNF is locked');

    const merged = {
      lastMonthSalary: input.lastMonthSalary ?? Number(existing.lastMonthSalary),
      leaveEncashment: input.leaveEncashment ?? Number(existing.leaveEncashment),
      gratuity: input.gratuity ?? Number(existing.gratuity),
      bonusPayable: input.bonusPayable ?? Number(existing.bonusPayable),
      otherEarnings: input.otherEarnings ?? Number(existing.otherEarnings),
      noticeRecovery: input.noticeRecovery ?? Number(existing.noticeRecovery),
      loanRecovery: input.loanRecovery ?? Number(existing.loanRecovery),
      tds: input.tds ?? Number(existing.tds),
      pfDeduction: input.pfDeduction ?? Number(existing.pfDeduction),
      otherDeductions: input.otherDeductions ?? Number(existing.otherDeductions),
    };
    const totals = computeFnfTotals(merged);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && k !== 'employeeId') {
        patch[k] = typeof v === 'number' ? v.toString() : v;
      }
    }
    patch.grossEarnings = totals.gross.toString();
    patch.totalDeductions = totals.deductions.toString();
    patch.netPayable = totals.net.toString();

    const [row] = await req.server.db
      .update(fnfSettlements)
      .set(patch)
      .where(eq(fnfSettlements.id, id))
      .returning();
    return { data: row };
  });

  app.put('/fnf/:id/approve', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .update(fnfSettlements)
      .set({
        status: 'approved',
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(fnfSettlements.id, id),
        eq(fnfSettlements.tenantId, req.tenantId),
        eq(fnfSettlements.status, 'draft'),
      ))
      .returning();
    if (!row) throw new NotFoundError('Draft FNF');
    // Mark employee as terminated.
    await req.server.db
      .update(employees)
      .set({ status: 'terminated', exitDate: row.lastWorkingDate, updatedAt: new Date() })
      .where(and(eq(employees.id, row.employeeId), eq(employees.tenantId, req.tenantId)));

    new HrNotifier(req.server.db, req.tenantId)
      .notifyEmployee(row.employeeId, {
        type: 'ok',
        source: 'hr_lifecycle',
        title: 'Final settlement approved',
        body: `Your full & final settlement of ₹${row.netPayable} was approved.`,
        targetUrl: '/hr/fnf',
      })
      .catch((e) => req.log.error(e, 'FnF approved notification failed'));

    return { data: row };
  });

  app.put('/fnf/:id/pay', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .update(fnfSettlements)
      .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(fnfSettlements.id, id),
        eq(fnfSettlements.tenantId, req.tenantId),
        eq(fnfSettlements.status, 'approved'),
      ))
      .returning();
    if (!row) throw new NotFoundError('Approved FNF');

    new HrNotifier(req.server.db, req.tenantId)
      .notifyEmployee(row.employeeId, {
        type: 'ok',
        source: 'hr_lifecycle',
        title: 'Final settlement paid',
        body: `Your full & final settlement of ₹${row.netPayable} has been paid.`,
        targetUrl: '/hr/fnf',
      })
      .catch((e) => req.log.error(e, 'FnF paid notification failed'));

    return { data: row };
  });

  // ====================== ONBOARDING ======================
  // Templates
  app.get('/onboarding/templates', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const rows = await req.server.db
      .select()
      .from(onboardingTemplates)
      .where(eq(onboardingTemplates.tenantId, req.tenantId))
      .orderBy(asc(onboardingTemplates.name));
    return { data: rows };
  });

  app.get('/onboarding/templates/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [tmpl] = await req.server.db
      .select()
      .from(onboardingTemplates)
      .where(and(eq(onboardingTemplates.id, id), eq(onboardingTemplates.tenantId, req.tenantId)))
      .limit(1);
    if (!tmpl) throw new NotFoundError('Template');
    const items = await req.server.db
      .select()
      .from(onboardingTemplateItems)
      .where(eq(onboardingTemplateItems.templateId, id))
      .orderBy(onboardingTemplateItems.sequence);
    return { data: { ...tmpl, items } };
  });

  app.post('/onboarding/templates', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createOnboardingTemplateSchema.parse(req.body);
    const [tmpl] = await req.server.db
      .insert(onboardingTemplates)
      .values({ tenantId: req.tenantId, name: input.name, description: input.description, isDefault: input.isDefault })
      .returning();
    if (input.items.length) {
      await req.server.db.insert(onboardingTemplateItems).values(
        input.items.map((it) => ({ templateId: tmpl.id, ...it })),
      );
    }
    return reply.status(201).send({ data: tmpl });
  });

  app.put('/onboarding/templates/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateOnboardingTemplateSchema.parse(req.body);
    const [tmpl] = await req.server.db
      .update(onboardingTemplates)
      .set({
        name: input.name,
        description: input.description,
        isDefault: input.isDefault,
        updatedAt: new Date(),
      })
      .where(and(eq(onboardingTemplates.id, id), eq(onboardingTemplates.tenantId, req.tenantId)))
      .returning();
    if (!tmpl) throw new NotFoundError('Template');
    if (input.items !== undefined) {
      await req.server.db.delete(onboardingTemplateItems).where(eq(onboardingTemplateItems.templateId, id));
      if (input.items.length) {
        await req.server.db.insert(onboardingTemplateItems).values(
          input.items.map((it) => ({ templateId: id, ...it })),
        );
      }
    }
    return { data: tmpl };
  });

  app.delete('/onboarding/templates/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(onboardingTemplates)
      .where(and(eq(onboardingTemplates.id, id), eq(onboardingTemplates.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Template');
    return { data: row };
  });

  // Workflows. Aggregates item counts (completed/total) so the listing UI
  // can show progress without a per-row fetch.
  app.get('/onboarding/workflows', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const rows = await req.server.db
      .select({
        w: onboardingWorkflows,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        totalCount: sql<number>`count(${onboardingItems.id})::int`,
        completedCount: sql<number>`count(*) filter (where ${onboardingItems.isCompleted})::int`,
      })
      .from(onboardingWorkflows)
      .innerJoin(employees, eq(employees.id, onboardingWorkflows.employeeId))
      .leftJoin(onboardingItems, eq(onboardingItems.workflowId, onboardingWorkflows.id))
      .where(eq(onboardingWorkflows.tenantId, req.tenantId))
      .groupBy(onboardingWorkflows.id, employees.firstName, employees.lastName, employees.employeeCode)
      .orderBy(desc(onboardingWorkflows.startedAt));
    return {
      data: rows.map((r) => ({
        ...r.w,
        firstName: r.firstName,
        lastName: r.lastName,
        employeeCode: r.employeeCode,
        totalCount: r.totalCount,
        completedCount: r.completedCount,
      })),
    };
  });

  app.get('/onboarding/workflows/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [wf] = await req.server.db
      .select()
      .from(onboardingWorkflows)
      .where(and(eq(onboardingWorkflows.id, id), eq(onboardingWorkflows.tenantId, req.tenantId)))
      .limit(1);
    if (!wf) throw new NotFoundError('Workflow');
    const rows = await req.server.db
      .select({
        i: onboardingItems,
        attachmentFileName: documentAttachments.fileName,
        attachmentMime: documentAttachments.mimeType,
      })
      .from(onboardingItems)
      .leftJoin(documentAttachments, eq(documentAttachments.id, onboardingItems.attachmentId))
      .where(eq(onboardingItems.workflowId, id))
      .orderBy(onboardingItems.sequence);
    const items = rows.map((r) => ({
      ...r.i,
      attachmentFileName: r.attachmentFileName,
      attachmentMime: r.attachmentMime,
    }));
    return { data: { ...wf, items } };
  });

  // Delete an onboarding workflow. Cascades to onboarding_items via the
  // workflow_id FK (ON DELETE CASCADE). Documents already uploaded into
  // document_attachments stay — they belong to the employee, not the
  // workflow. HR uses this to retire a stale or wrongly-started workflow
  // and replace it with the right template.
  app.delete('/onboarding/workflows/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(onboardingWorkflows)
      .where(and(eq(onboardingWorkflows.id, id), eq(onboardingWorkflows.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Workflow');
    return { data: row };
  });

  app.post('/onboarding/start', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = startOnboardingSchema.parse(req.body);

    // Default template if none specified.
    let templateId = input.templateId ?? null;
    if (!templateId) {
      const [d] = await req.server.db
        .select({ id: onboardingTemplates.id })
        .from(onboardingTemplates)
        .where(and(
          eq(onboardingTemplates.tenantId, req.tenantId),
          eq(onboardingTemplates.isDefault, true),
        ))
        .limit(1);
      templateId = d?.id ?? null;
    }

    const [wf] = await req.server.db
      .insert(onboardingWorkflows)
      .values({
        tenantId: req.tenantId,
        employeeId: input.employeeId,
        templateId,
        status: 'in_progress',
      })
      .returning();

    let itemCount = 0;
    if (templateId) {
      const tmplItems = await req.server.db
        .select()
        .from(onboardingTemplateItems)
        .where(eq(onboardingTemplateItems.templateId, templateId))
        .orderBy(onboardingTemplateItems.sequence);
      if (tmplItems.length) {
        await req.server.db.insert(onboardingItems).values(
          tmplItems.map((t) => ({
            workflowId: wf.id,
            sequence: t.sequence,
            title: t.title,
            kind: t.kind,
            assignedRole: t.assignedRole,
            documentKind: t.documentKind,
            instructions: t.instructions,
          })),
        );
        itemCount = tmplItems.length;
      }
    }

    new HrNotifier(req.server.db, req.tenantId)
      .notifyEmployee(input.employeeId, {
        source: 'hr_onboarding',
        title: 'Welcome aboard',
        body: `Your onboarding checklist is ready — ${itemCount} items to complete.`,
        targetUrl: '/hr/onboarding',
      })
      .catch((e) => req.log.error(e, 'Onboarding started notification failed'));

    return reply.status(201).send({ data: wf });
  });

  app.put('/onboarding/items/:id/complete', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = completeOnboardingItemSchema.parse(req.body);
    const [row] = await req.server.db
      .update(onboardingItems)
      .set({
        isCompleted: true,
        completedBy: req.user!.userId,
        completedAt: new Date(),
        notes: input.notes,
      })
      .where(eq(onboardingItems.id, id))
      .returning();
    if (!row) throw new NotFoundError('Onboarding item');

    // If all items complete, mark workflow completed and activate employee.
    const remaining = await req.server.db
      .select({ count: sql<number>`count(*)::int` })
      .from(onboardingItems)
      .where(and(
        eq(onboardingItems.workflowId, row.workflowId),
        eq(onboardingItems.isCompleted, false),
      ));
    if ((remaining[0]?.count ?? 0) === 0) {
      const [wf] = await req.server.db
        .update(onboardingWorkflows)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(onboardingWorkflows.id, row.workflowId))
        .returning();
      if (wf) {
        await req.server.db
          .update(employees)
          .set({ status: 'active', updatedAt: new Date() })
          .where(and(eq(employees.id, wf.employeeId), eq(employees.tenantId, req.tenantId)));

        const [emp] = await req.server.db
          .select({ firstName: employees.firstName, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, wf.employeeId))
          .limit(1);
        const empName = emp
          ? [emp.firstName, emp.lastName].filter(Boolean).join(' ')
          : 'Employee';
        new HrNotifier(req.server.db, req.tenantId)
          .notifyHrAdmins({
            type: 'ok',
            source: 'hr_onboarding',
            title: 'Onboarding complete',
            body: `${empName} finished their onboarding checklist.`,
            targetUrl: '/hr/onboarding',
          })
          .catch((e) => req.log.error(e, 'Onboarding completed notification failed'));
      }
    }
    return { data: row };
  });

  // Employee self-service for own onboarding items. Joins document
  // attachments so the mobile UI can render "Uploaded: <file>" for
  // document-upload items the employee has already completed.
  app.get('/me/onboarding', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [wf] = await req.server.db
      .select()
      .from(onboardingWorkflows)
      .where(and(
        eq(onboardingWorkflows.tenantId, req.tenantId),
        eq(onboardingWorkflows.employeeId, emp.id),
      ))
      .limit(1);
    if (!wf) return { data: null };
    const rows = await req.server.db
      .select({
        i: onboardingItems,
        attachmentFileName: documentAttachments.fileName,
        attachmentMime: documentAttachments.mimeType,
      })
      .from(onboardingItems)
      .leftJoin(documentAttachments, eq(documentAttachments.id, onboardingItems.attachmentId))
      .where(eq(onboardingItems.workflowId, wf.id))
      .orderBy(onboardingItems.sequence);
    const items = rows.map((r) => ({
      ...r.i,
      attachmentFileName: r.attachmentFileName,
      attachmentMime: r.attachmentMime,
    }));
    return { data: { ...wf, items } };
  });

  // Employee uploads a document for one of their own onboarding items.
  // Auto-completes the item on success and tags the file with the item's
  // document_kind so it shows up in the employee's Documents tab.
  app.post('/me/onboarding/items/:id/upload', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);

    const [row] = await req.server.db
      .select({ i: onboardingItems, w: onboardingWorkflows })
      .from(onboardingItems)
      .innerJoin(onboardingWorkflows, eq(onboardingWorkflows.id, onboardingItems.workflowId))
      .where(and(
        eq(onboardingItems.id, id),
        eq(onboardingWorkflows.tenantId, req.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Onboarding item');
    if (row.w.employeeId !== emp.id) throw new ForbiddenError('Not your onboarding item');
    if (row.i.assignedRole !== 'employee') throw new ForbiddenError('This task is assigned to HR');
    if (row.i.kind !== 'document_upload') throw new ConflictError('This item does not accept uploads');
    if (row.i.isCompleted) throw new ConflictError('Already completed');

    const file = await req.file();
    if (!file) throw new AppError(400, 'No file uploaded');
    if (!(HR_DOC_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new AppError(400, 'Unsupported file type — use PDF, PNG, JPG, or WEBP');
    }
    const buffer = await file.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) throw new AppError(400, 'File exceeds 10 MB');

    // Tag the attachment with the item's document_kind so it slots into
    // the employee's Documents tab. Fall back to 'other' when the item
    // doesn't specify one — keeps the upload working even for ad-hoc items.
    const docKind = row.i.documentKind
      ? employeeDocumentKindSchema.parse(row.i.documentKind)
      : 'other';

    const service = new AttachmentService(req.server.db, req.tenantId, getStorageProvider());
    const attachment = await service.upload({
      entityType: 'employee',
      entityId: emp.id,
      fileName: file.filename,
      fileSize: buffer.length,
      mimeType: file.mimetype,
      data: buffer,
      uploadedBy: req.user!.userId,
      documentKind: docKind,
      expiryDate: null,
    });

    const [updated] = await req.server.db
      .update(onboardingItems)
      .set({
        isCompleted: true,
        completedBy: req.user!.userId,
        completedAt: new Date(),
        attachmentId: attachment.id,
      })
      .where(eq(onboardingItems.id, id))
      .returning();

    // Auto-complete the workflow if this was the last open item.
    const remaining = await req.server.db
      .select({ count: sql<number>`count(*)::int` })
      .from(onboardingItems)
      .where(and(
        eq(onboardingItems.workflowId, row.i.workflowId),
        eq(onboardingItems.isCompleted, false),
      ));
    if ((remaining[0]?.count ?? 0) === 0) {
      await req.server.db
        .update(onboardingWorkflows)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(onboardingWorkflows.id, row.i.workflowId));
      await req.server.db
        .update(employees)
        .set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(employees.id, emp.id), eq(employees.tenantId, req.tenantId)));

      const [empRow] = await req.server.db
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, emp.id))
        .limit(1);
      const empName = empRow
        ? [empRow.firstName, empRow.lastName].filter(Boolean).join(' ')
        : 'Employee';
      new HrNotifier(req.server.db, req.tenantId)
        .notifyHrAdmins({
          type: 'ok',
          source: 'hr_onboarding',
          title: 'Onboarding complete',
          body: `${empName} finished their onboarding checklist.`,
          targetUrl: '/hr/onboarding',
        })
        .catch((e) => req.log.error(e, 'Onboarding completed notification failed'));
    }

    // A resume upload also feeds the AI-extracted profile block. Best-effort
    // and backgrounded — onboarding completion must never wait on (or fail
    // because of) extraction.
    if (docKind === 'resume') {
      void extractAndSaveResumeProfile(
        req.server.db, req.tenantId, emp.id, attachment.id, buffer, file.mimetype,
      ).catch((err) => {
        req.log.error({ err, employeeId: emp.id }, 'Resume profile extraction failed');
      });
    }

    return reply.status(201).send({ data: { ...updated, attachment } });
  });

  // ====================== LETTERS ======================
  app.get('/letter-templates', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const rows = await req.server.db
      .select()
      .from(letterTemplates)
      .where(eq(letterTemplates.tenantId, req.tenantId))
      .orderBy(asc(letterTemplates.name));
    return { data: rows };
  });

  app.get('/letter-templates/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .select()
      .from(letterTemplates)
      .where(and(eq(letterTemplates.id, id), eq(letterTemplates.tenantId, req.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Template');
    return { data: row };
  });

  app.post('/letter-templates', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createLetterTemplateSchema.parse(req.body);
    const [row] = await req.server.db
      .insert(letterTemplates)
      .values({ tenantId: req.tenantId, ...input })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/letter-templates/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateLetterTemplateSchema.parse(req.body);
    const [row] = await req.server.db
      .update(letterTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(letterTemplates.id, id), eq(letterTemplates.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Template');
    return { data: row };
  });

  app.delete('/letter-templates/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(letterTemplates)
      .where(and(eq(letterTemplates.id, id), eq(letterTemplates.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Template');
    return { data: row };
  });

  // Generate a draft letter for an employee from a template.
  app.post('/letters', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = generateLetterSchema.parse(req.body);
    const [tmpl] = await req.server.db
      .select()
      .from(letterTemplates)
      .where(and(eq(letterTemplates.id, input.templateId), eq(letterTemplates.tenantId, req.tenantId)))
      .limit(1);
    if (!tmpl) throw new NotFoundError('Template');
    const [emp] = await req.server.db
      .select()
      .from(employees)
      .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, req.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const letterhead = await buildLetterheadTokens(req.server.db, req.tenantId, req.user!.userId);
    const tokens = {
      employee: {
        firstName: emp.firstName,
        lastName: emp.lastName ?? '',
        fullName: [emp.firstName, emp.lastName].filter(Boolean).join(' '),
        employeeCode: emp.employeeCode,
        email: emp.email ?? '',
        phone: emp.phone ?? '',
        joiningDate: emp.joiningDate,
        ctcAnnual: emp.ctcAnnual ?? '0',
        pan: emp.pan ?? '',
      },
      date: {
        today: new Date().toISOString().slice(0, 10),
        todayLong: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
      },
      ...letterhead,
      ...(input.extraTokens ?? {}),
    };
    const renderedSubject = tmpl.subject ? renderTemplate(tmpl.subject, tokens) : null;
    const renderedBody = renderTemplate(tmpl.body, tokens);
    const [row] = await req.server.db
      .insert(employeeLetters)
      .values({
        tenantId: req.tenantId,
        employeeId: input.employeeId,
        templateId: input.templateId,
        kind: tmpl.kind,
        subject: renderedSubject,
        renderedBody,
        tokens,
        status: 'draft',
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.get('/letters', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({
      employeeId: z.string().uuid().optional(),
      kind: z.string().optional(),
    }).parse(req.query);
    const conds = [eq(employeeLetters.tenantId, req.tenantId)];
    if (q.employeeId) conds.push(eq(employeeLetters.employeeId, q.employeeId));
    if (q.kind) conds.push(sql`${employeeLetters.kind}::text = ${q.kind}`);
    const rows = await req.server.db
      .select({
        l: employeeLetters,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(employeeLetters)
      .innerJoin(employees, eq(employees.id, employeeLetters.employeeId))
      .where(and(...conds))
      .orderBy(desc(employeeLetters.createdAt))
      .limit(500);
    return { data: rows.map((r) => ({ ...r.l, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode })) };
  });

  app.get('/letters/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .select()
      .from(employeeLetters)
      .where(and(eq(employeeLetters.id, id), eq(employeeLetters.tenantId, req.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Letter');
    return { data: row };
  });

  // ── Self-service letters (employee-facing) ───────────────────────────
  // Letter kinds an employee may request for themselves. Anything else
  // (offer/appointment/increment/relieving) must be issued by HR.
  const SELF_SERVICE_KINDS = new Set(['salary_certificate', 'address_proof', 'experience']);

  app.get('/me/letter-templates', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select({
        id: letterTemplates.id,
        name: letterTemplates.name,
        kind: letterTemplates.kind,
        subject: letterTemplates.subject,
      })
      .from(letterTemplates)
      .where(eq(letterTemplates.tenantId, req.tenantId))
      .orderBy(asc(letterTemplates.name));
    // Only expose self-service kinds. Experience letter additionally requires
    // the employee to be terminated/relieved.
    const empRow = await req.server.db
      .select({ status: employees.status })
      .from(employees)
      .where(eq(employees.id, emp.id))
      .limit(1);
    const isRelieved = empRow[0]?.status === 'terminated';
    const visible = rows.filter((r) => {
      if (!SELF_SERVICE_KINDS.has(r.kind)) return false;
      if (r.kind === 'experience' && !isRelieved) return false;
      return true;
    });
    return { data: visible };
  });

  // Instant self-issue: agent / employee picks a template; we render + issue
  // in one call. Distinct from POST /me/letters which only creates a
  // 'requested' row that HR has to fulfil from a template.
  app.post('/me/letters/instant', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = z.object({
      templateId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(req.body);

    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [tmpl] = await req.server.db
      .select()
      .from(letterTemplates)
      .where(and(eq(letterTemplates.id, input.templateId), eq(letterTemplates.tenantId, req.tenantId)))
      .limit(1);
    if (!tmpl) throw new NotFoundError('Template');
    if (!SELF_SERVICE_KINDS.has(tmpl.kind)) {
      throw new ForbiddenError('This letter type cannot be self-issued. Please raise a ticket and HR will help.');
    }

    const [empRow] = await req.server.db
      .select()
      .from(employees)
      .where(eq(employees.id, emp.id))
      .limit(1);
    if (tmpl.kind === 'experience' && empRow.status !== 'terminated') {
      throw new ForbiddenError('Experience letter is available only after your relieving date.');
    }

    const letterhead = await buildLetterheadTokens(req.server.db, req.tenantId, null);
    const tokens = {
      employee: {
        firstName: empRow.firstName,
        lastName: empRow.lastName ?? '',
        fullName: [empRow.firstName, empRow.lastName].filter(Boolean).join(' '),
        employeeCode: empRow.employeeCode,
        email: empRow.email ?? '',
        phone: empRow.phone ?? '',
        joiningDate: empRow.joiningDate,
        ctcAnnual: empRow.ctcAnnual ?? '0',
        pan: empRow.pan ?? '',
      },
      date: {
        today: new Date().toISOString().slice(0, 10),
        todayLong: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
      },
      ...letterhead,
    };
    const renderedSubject = tmpl.subject ? renderTemplate(tmpl.subject, tokens) : null;
    const renderedBody = renderTemplate(tmpl.body, tokens);

    const [row] = await req.server.db
      .insert(employeeLetters)
      .values({
        tenantId: req.tenantId,
        employeeId: emp.id,
        templateId: tmpl.id,
        kind: tmpl.kind,
        subject: renderedSubject,
        renderedBody,
        tokens,
        status: 'issued',
        issuedAt: new Date(),
        issuedBy: req.user!.userId,
        requestedReason: input.reason ?? null,
      })
      .returning();

    // PDF in the background.
    void generateAndStoreLetterPdf(req.server.db, req.tenantId, row, req.user!.userId).catch((err) => {
      req.log.error({ err, letterId: row.id }, 'Self-service letter PDF generation failed');
    });

    return reply.status(201).send({ data: row });
  });

  app.put('/letters/:id/issue', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    issueLetterSchema.parse(req.body);
    const [row] = await req.server.db
      .update(employeeLetters)
      .set({
        status: 'issued',
        issuedAt: new Date(),
        issuedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(employeeLetters.id, id),
        eq(employeeLetters.tenantId, req.tenantId),
        eq(employeeLetters.status, 'draft'),
      ))
      .returning();
    if (!row) throw new NotFoundError('Draft letter');

    // Generate the PDF in the background. Don't block the issue response —
    // the row is already marked issued; if PDF generation fails we'll
    // retry on next view. The pdfUrl is set asynchronously.
    void generateAndStoreLetterPdf(req.server.db, req.tenantId, row, req.user!.userId).catch((err) => {
      req.log.error({ err, letterId: row.id }, 'Letter PDF generation failed');
    });

    return { data: row };
  });

  // On-demand PDF generation if the issue flow's background job failed or
  // if the letter pre-dates this feature. Returns the streamed PDF.
  app.get('/letters/:id/pdf', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .select()
      .from(employeeLetters)
      .where(and(eq(employeeLetters.id, id), eq(employeeLetters.tenantId, req.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Letter');
    if (row.status !== 'issued') throw new ConflictError('Only issued letters can be downloaded as PDF');
    const key = row.pdfUrl ?? (await generateAndStoreLetterPdf(req.server.db, req.tenantId, row, row.issuedBy));
    const stream = await getStorageProvider().getStream(key);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${(row.subject ?? row.kind).replace(/[^a-z0-9_\- ]/gi, '_')}.pdf"`)
      .send(stream);
  });

  // Employee variant — scoped to self.
  app.get('/me/letters/:id/pdf', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .select()
      .from(employeeLetters)
      .where(and(
        eq(employeeLetters.id, id),
        eq(employeeLetters.tenantId, req.tenantId),
        eq(employeeLetters.employeeId, emp.id),
        eq(employeeLetters.status, 'issued'),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Letter');
    const key = row.pdfUrl ?? (await generateAndStoreLetterPdf(req.server.db, req.tenantId, row, row.issuedBy));
    const stream = await getStorageProvider().getStream(key);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${(row.subject ?? row.kind).replace(/[^a-z0-9_\- ]/gi, '_')}.pdf"`)
      .send(stream);
  });

  app.put('/letters/:id/revoke', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .update(employeeLetters)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(employeeLetters.id, id), eq(employeeLetters.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Letter');
    return { data: row };
  });

  app.delete('/letters/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(employeeLetters)
      .where(and(
        eq(employeeLetters.id, id),
        eq(employeeLetters.tenantId, req.tenantId),
        sql`${employeeLetters.status} IN ('draft','requested')`,
      ))
      .returning();
    if (!row) throw new NotFoundError('Draft or requested letter');
    return { data: row };
  });

  // Company logo upload — used at the top of letter PDFs and downstream
  // on invoices/receipts. Storage key is persisted to
  // tenants.settings.companyLogoUrl by the settings form.
  app.post('/company-logo', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'No file uploaded');
    if (!(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'] as const).includes(file.mimetype as any)) {
      throw new AppError(400, `Logo must be PNG, JPG, WEBP or SVG (got ${file.mimetype})`);
    }
    const buf = await file.toBuffer();
    if (buf.length > 2 * 1024 * 1024) throw new AppError(400, 'Logo exceeds 2 MB');
    const storage = getStorageProvider();
    const storageKey = await storage.upload({
      tenantId: req.tenantId,
      entityType: 'company_logo',
      entityId: req.tenantId,
      fileName: `logo-${Date.now()}.${file.mimetype.split('/')[1] ?? 'png'}`,
      mimeType: file.mimetype,
      data: buf,
    });
    return reply.code(201).send({ data: { storageKey } });
  });

  app.get('/company-logo', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const [t] = await req.server.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const key = (t?.settings as Record<string, unknown> | undefined)?.companyLogoUrl as string | undefined;
    if (!key) throw new NotFoundError('Logo');
    const stream = await getStorageProvider().getStream(key);
    return reply.header('Content-Type', 'image/png').send(stream);
  });

  // HR signature image upload. Stores the file in object storage and
  // returns the storageKey, which the company settings form persists to
  // tenants.settings.hrSignatory.signatureImageUrl. PDF rendering will
  // pick it up; the plain-text body uses the typed name + designation.
  app.post('/signature-image', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'No file uploaded');
    if (!(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const).includes(file.mimetype as any)) {
      throw new AppError(400, `Signature must be PNG, JPG, or WEBP (got ${file.mimetype})`);
    }
    const buf = await file.toBuffer();
    if (buf.length > 2 * 1024 * 1024) throw new AppError(400, 'Signature image exceeds 2 MB');
    const storage = getStorageProvider();
    const storageKey = await storage.upload({
      tenantId: req.tenantId,
      entityType: 'hr_signature',
      entityId: req.tenantId,
      fileName: `signature-${Date.now()}.${file.mimetype.split('/')[1] ?? 'png'}`,
      mimeType: file.mimetype,
      data: buf,
    });
    return reply.code(201).send({ data: { storageKey } });
  });

  // Stream the currently-configured HR signature image for preview.
  app.get('/signature-image', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const [t] = await req.server.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const sig = ((t?.settings as Record<string, unknown> | undefined)?.hrSignatory ?? {}) as Record<string, unknown>;
    const key = sig.signatureImageUrl as string | undefined;
    if (!key) throw new NotFoundError('Signature');
    const stream = await getStorageProvider().getStream(key);
    return reply.header('Content-Type', 'image/png').send(stream);
  });

  // Employee view of own letters — both their own pending requests and any
  // letters HR has issued to them. Drafts and revoked rows stay hidden.
  app.get('/me/letters', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select()
      .from(employeeLetters)
      .where(and(
        eq(employeeLetters.tenantId, req.tenantId),
        eq(employeeLetters.employeeId, emp.id),
        sql`${employeeLetters.status} IN ('requested', 'issued')`,
      ))
      .orderBy(desc(employeeLetters.createdAt));
    return { data: rows };
  });

  // Employee creates a letter request. Lands in 'requested' status with an
  // empty rendered body until HR fulfils it from a template.
  app.post('/me/letters', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = requestLetterSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .insert(employeeLetters)
      .values({
        tenantId: req.tenantId,
        employeeId: emp.id,
        templateId: null,
        kind: input.kind,
        subject: null,
        renderedBody: '',
        tokens: null,
        status: 'requested',
        requestedReason: input.reason,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  // Employee withdraws their own pending request.
  app.delete('/me/letters/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .delete(employeeLetters)
      .where(and(
        eq(employeeLetters.id, id),
        eq(employeeLetters.tenantId, req.tenantId),
        eq(employeeLetters.employeeId, emp.id),
        eq(employeeLetters.status, 'requested'),
      ))
      .returning();
    if (!row) throw new NotFoundError('Pending request');
    return { data: row };
  });

  // HR fulfils a pending request: picks a template, renders the body, and
  // promotes the row from 'requested' → 'draft'. HR then reviews/edits
  // before calling /letters/:id/issue.
  app.post('/letters/:id/fulfil', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = fulfilLetterRequestSchema.parse(req.body);
    const [letter] = await req.server.db
      .select()
      .from(employeeLetters)
      .where(and(eq(employeeLetters.id, id), eq(employeeLetters.tenantId, req.tenantId)))
      .limit(1);
    if (!letter) throw new NotFoundError('Letter');
    if (letter.status !== 'requested') {
      throw new ConflictError('Only requested letters can be fulfilled');
    }
    const [tmpl] = await req.server.db
      .select()
      .from(letterTemplates)
      .where(and(eq(letterTemplates.id, input.templateId), eq(letterTemplates.tenantId, req.tenantId)))
      .limit(1);
    if (!tmpl) throw new NotFoundError('Template');
    const [emp] = await req.server.db
      .select()
      .from(employees)
      .where(and(eq(employees.id, letter.employeeId), eq(employees.tenantId, req.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const letterhead = await buildLetterheadTokens(req.server.db, req.tenantId, req.user!.userId);
    const tokens = {
      employee: {
        firstName: emp.firstName,
        lastName: emp.lastName ?? '',
        fullName: [emp.firstName, emp.lastName].filter(Boolean).join(' '),
        employeeCode: emp.employeeCode,
        email: emp.email ?? '',
        phone: emp.phone ?? '',
        joiningDate: emp.joiningDate,
        ctcAnnual: emp.ctcAnnual ?? '0',
        pan: emp.pan ?? '',
      },
      date: {
        today: new Date().toISOString().slice(0, 10),
        todayLong: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
      },
      request: { reason: letter.requestedReason ?? '' },
      ...letterhead,
      ...(input.extraTokens ?? {}),
    };
    const renderedSubject = tmpl.subject ? renderTemplate(tmpl.subject, tokens) : null;
    const renderedBody = renderTemplate(tmpl.body, tokens);
    const [row] = await req.server.db
      .update(employeeLetters)
      .set({
        templateId: input.templateId,
        kind: tmpl.kind,
        subject: renderedSubject,
        renderedBody,
        tokens,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(employeeLetters.id, id))
      .returning();
    return { data: row };
  });
};

function computeFnfTotals(p: {
  lastMonthSalary?: number;
  leaveEncashment?: number;
  gratuity?: number;
  bonusPayable?: number;
  otherEarnings?: number;
  noticeRecovery?: number;
  loanRecovery?: number;
  tds?: number;
  pfDeduction?: number;
  otherDeductions?: number;
}) {
  const sum = (...xs: (number | undefined)[]) => xs.reduce<number>((s, x) => s + Number(x ?? 0), 0);
  const gross: number = sum(p.lastMonthSalary, p.leaveEncashment, p.gratuity, p.bonusPayable, p.otherEarnings);
  const deductions: number = sum(p.noticeRecovery, p.loanRecovery, p.tds, p.pfDeduction, p.otherDeductions);
  return {
    gross: Math.round(gross * 100) / 100,
    deductions: Math.round(deductions * 100) / 100,
    net: Math.round((gross - deductions) * 100) / 100,
  };
}

// Build a PDF for an issued letter, upload it, and save the storage key
// on the row. Returns the storageKey. Idempotent — if pdfUrl is already
// set we'd skip, but the callers gate on row.pdfUrl being null so we
// always do the work here.
async function generateAndStoreLetterPdf(
  db: import('@runq/db').Db,
  tenantId: string,
  letter: typeof employeeLetters.$inferSelect,
  issuedByUserId: string | null,
): Promise<string> {
  // Pull tenant settings to populate letterhead + signature + branding.
  const [t] = await db.select({ name: tenants.name, settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const s = (t?.settings ?? {}) as Record<string, unknown>;
  const hr = (s.hrSignatory ?? {}) as Record<string, unknown>;

  // Fall back to the issuing HR user's name when no dedicated signatory.
  let signatoryName = (hr.name as string | undefined) ?? '';
  if (!signatoryName && issuedByUserId) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, issuedByUserId)).limit(1);
    signatoryName = u?.name ?? '';
  }

  const storage = getStorageProvider();
  const fetchBuf = async (key: unknown): Promise<Buffer | null> => {
    if (!key || typeof key !== 'string') return null;
    try {
      const stream = await storage.getStream(key);
      const chunks: Buffer[] = [];
      for await (const c of stream as Readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      return Buffer.concat(chunks);
    } catch { return null; }
  };

  const [logo, sigImg] = await Promise.all([
    fetchBuf(s.companyLogoUrl),
    fetchBuf(hr.signatureImageUrl),
  ]);

  const addressBlock = [
    s.addressLine1, s.addressLine2,
    [s.city, s.state, s.pincode].filter(Boolean).join(', '),
  ].filter((line) => line && String(line).trim()).join('\n');

  const pdfBuf = await renderLetterPdf({
    companyName: (s.legalName as string | undefined) ?? t?.name ?? '',
    companyAddressBlock: addressBlock,
    companyGstin: (s.gstin as string | undefined) ?? null,
    companyEmail: (s.companyEmail as string | undefined) ?? null,
    companyPhone: (s.companyPhone as string | undefined) ?? null,
    companyWebsite: (s.website as string | undefined) ?? null,
    logo,
    body: letter.renderedBody,
    subject: letter.subject,
    signatoryName,
    signatoryDesignation: (hr.designation as string | undefined) ?? 'Human Resources',
    signatureImage: sigImg,
  });

  const storageKey = await storage.upload({
    tenantId,
    entityType: 'employee_letter',
    entityId: letter.id,
    fileName: `${letter.kind}-${letter.id}.pdf`,
    mimeType: 'application/pdf',
    data: pdfBuf,
  });

  await db
    .update(employeeLetters)
    .set({ pdfUrl: storageKey, updatedAt: new Date() })
    .where(eq(employeeLetters.id, letter.id));

  return storageKey;
}
