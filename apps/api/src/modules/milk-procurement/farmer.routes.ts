import { FastifyPluginAsync } from 'fastify';
import {
  createFarmerSchema,
  updateFarmerSchema,
  farmerFilterSchema,
  farmerDocumentKindSchema,
  transliterateNameSchema,
  pourStatementQuerySchema,
  paginationSchema,
  uuidParamSchema,
  HR_DOC_ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AppError, ForbiddenError } from '../../utils/errors';
import { getStorageProvider } from '../../utils/storage';
import { AttachmentService } from '../common/attachment.service';
import { FarmerService } from './farmer.service';
import { transliterateName } from './transliteration.service';
import { extractAadhaar, type ImageMime } from './aadhaar-extract.service';
import { StatementService } from './statement.service';
import { renderPourStatementHTML } from './statement-template';
import { resolveMpPrincipal, assertNodeAccess, assertFarmerAtNode } from './access-scope';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
// Operators may register/edit/photograph farmers, but only at their own node.
const FARMER_WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;
// list is scoped: operators see their node's farmers; a farmer sees themselves
const LIST_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;

export const farmerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...LIST_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = farmerFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  // Live native-script suggestion for the add-farmer form (operator confirms it).
  app.post('/transliterate', { preHandler: [rbacHook([...FARMER_WRITE_ROLES])] }, async (request) => {
    const { name, lang } = transliterateNameSchema.parse(request.body);
    return { data: { nameNative: await transliterateName(name, lang) } };
  });

  // Scan an Aadhaar card (multipart image) → AI-extracted fields to prefill the
  // add-farmer form. Does not store the image; operator reviews before saving.
  app.post('/extract-aadhaar', { preHandler: [rbacHook([...FARMER_WRITE_ROLES])] }, async (request) => {
    const file = await request.file();
    if (!file) throw new AppError(400, 'No image uploaded');
    const mime = file.mimetype;
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
      throw new AppError(400, `Image type '${mime}' is not allowed. Use JPG, PNG, or WEBP`);
    }
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_FILE_SIZE) throw new AppError(400, 'Image size exceeds 10MB limit');
    const fields = await extractAadhaar(buffer.toString('base64'), mime as ImageMime);
    return { data: fields };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new FarmerService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...FARMER_WRITE_ROLES])] }, async (request, reply) => {
    const input = createFarmerSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    // An operator can only register a farmer at one of their own nodes.
    if (principal.kind === 'operator') {
      if (!input.nodeId) throw new AppError(400, 'nodeId is required');
      assertNodeAccess(principal, input.nodeId);
    }
    const service = new FarmerService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.create(input) });
  });

  app.put('/:id', { preHandler: [rbacHook([...FARMER_WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateFarmerSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    await assertFarmerAtNode(request.server.db, request.tenantId, principal, id);
    const service = new FarmerService(request.server.db, request.tenantId);
    return { data: await service.update(id, input) };
  });

  // Profile photo / KYC / Aadhaar scan upload (multipart). Operators are
  // limited to farmers at their own node; the photo/KYC ref is set on success.
  app.post('/:id/attachments', { preHandler: [rbacHook([...FARMER_WRITE_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    await assertFarmerAtNode(request.server.db, request.tenantId, principal, id);

    const file = await request.file();
    if (!file) throw new AppError(400, 'No file uploaded');
    if (!HR_DOC_ALLOWED_MIME_TYPES.includes(file.mimetype as never)) {
      throw new AppError(400, `File type '${file.mimetype}' is not allowed. Allowed: PDF, PNG, JPG, WEBP`);
    }
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_FILE_SIZE) throw new AppError(400, 'File size exceeds 10MB limit');

    const rawKind = (file.fields as Record<string, { value?: string } | undefined>)?.kind?.value;
    const kind = farmerDocumentKindSchema.parse(rawKind ?? 'other');

    const attachments = new AttachmentService(request.server.db, request.tenantId, getStorageProvider());
    const data = await attachments.upload({
      entityType: 'farmer', entityId: id, fileName: file.filename, fileSize: buffer.length,
      mimeType: file.mimetype, data: buffer, uploadedBy: request.user!.userId, documentKind: kind,
    });
    await new FarmerService(request.server.db, request.tenantId).attachDoc(id, kind, data.id);
    return reply.status(201).send({ data });
  });

  // Per-cycle milk collection statement (PDF by default, ?format=html to debug).
  // Shared by mobile share-sheet and web download — one document, both surfaces.
  app.get('/:id/pour-statement', { preHandler: [rbacHook([...LIST_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const q = pourStatementQuerySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'farmer' && principal.farmerId !== id) {
      throw new ForbiddenError('Not allowed for this farmer');
    }
    if (principal.kind === 'operator') {
      await assertFarmerAtNode(request.server.db, request.tenantId, principal, id);
    }
    const data = await new StatementService(request.server.db, request.tenantId)
      .forFarmer(id, q.from, q.to, principal, q.label);
    const html = renderPourStatementHTML(data);
    if (q.format === 'html') return reply.type('text/html').send(html);
    const { renderHtmlToPdf } = await import('../ar/invoice-pdf');
    const pdf = await renderHtmlToPdf(html);
    const fname = `pour-statement-${data.farmer.code}-${q.from}_${q.to}.pdf`.replace(/[^\w.\-]/g, '-');
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${fname}"`).send(pdf);
  });

  app.post('/:id/deactivate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new FarmerService(request.server.db, request.tenantId);
    return { data: await service.deactivate(id) };
  });
};
