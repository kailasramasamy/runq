import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  uuidParamSchema, updateResumeProfileSchema, HR_DOC_ALLOWED_MIME_TYPES,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AppError } from '../../utils/errors';
import { getStorageProvider } from '../../utils/storage';
import { AttachmentService } from '../common/attachment.service';
import { EmployeeService } from './employee.service';
import { resolveHrAccessScope } from './access-scope';
import { resolveSelfEmployee } from './phase-next/self-employee';
import { ResumeProfileService, extractAndSaveResumeProfile } from './resume-profile.service';

// Viewing the resume profile is open to anyone who can see the employee —
// a manager sees their team (scoped), HR/owner see everyone.
const ALL = ['owner', 'accountant', 'viewer', 'hr', 'technician'] as const;
// Uploading on someone else's behalf + correcting the extracted data is an
// HR-admin action. Employees upload their own via the /me routes below.
const MANAGE = ['owner', 'accountant', 'hr'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Read the uploaded resume off the multipart request, store it as an
// `employee` attachment tagged `resume`, extract the profile, and reply.
async function uploadAndExtract(
  req: FastifyRequest,
  reply: FastifyReply,
  employeeId: string,
): Promise<FastifyReply> {
  const file = await req.file();
  if (!file) throw new AppError(400, 'No file uploaded');
  if (!(HR_DOC_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    throw new AppError(400, 'Resume must be a PDF or image (PDF, PNG, JPG, WEBP).');
  }
  const buffer = await file.toBuffer();
  if (buffer.length > MAX_FILE_SIZE) throw new AppError(400, 'File exceeds 10 MB');

  const attachments = new AttachmentService(
    req.server.db, req.tenantId, getStorageProvider(),
  );
  const attachment = await attachments.upload({
    entityType: 'employee',
    entityId: employeeId,
    fileName: file.filename,
    fileSize: buffer.length,
    mimeType: file.mimetype,
    data: buffer,
    uploadedBy: req.user!.userId,
    documentKind: 'resume',
  });

  const profile = await extractAndSaveResumeProfile(
    req.server.db, req.tenantId, employeeId, attachment.id, buffer, file.mimetype,
  );
  return reply.status(201).send({ data: profile });
}

export const resumeRoutes: FastifyPluginAsync = async (app) => {
  // ── Management surface — owner / accountant / HR ──────────────────────────

  // Upload a resume for an employee and extract the profile in one step.
  app.post(
    '/employees/:id/resume',
    { preHandler: [rbacHook([...MANAGE])] },
    async (req, reply) => {
      const { id } = uuidParamSchema.parse(req.params);
      // Verifies the employee exists in this tenant (throws NotFoundError).
      await new EmployeeService(req.server.db, req.tenantId).getById(id);
      return uploadAndExtract(req, reply, id);
    },
  );

  // Viewing is open to anyone who can see the employee. The scope check
  // 404s out-of-scope employees, so a manager only reads their own team.
  app.get(
    '/employees/:id/resume-profile',
    { preHandler: [rbacHook([...ALL])] },
    async (req) => {
      const { id } = uuidParamSchema.parse(req.params);
      const scope = await resolveHrAccessScope(req);
      await new EmployeeService(req.server.db, req.tenantId, scope).getById(id);
      const svc = new ResumeProfileService(req.server.db, req.tenantId);
      return { data: await svc.getByEmployee(id) };
    },
  );

  // Corrections stay with HR — the resume profile is an HR record.
  app.put(
    '/employees/:id/resume-profile',
    { preHandler: [rbacHook([...MANAGE])] },
    async (req) => {
      const { id } = uuidParamSchema.parse(req.params);
      const input = updateResumeProfileSchema.parse(req.body);
      const svc = new ResumeProfileService(req.server.db, req.tenantId);
      return { data: await svc.update(id, input, req.user!.userId) };
    },
  );

  // ── Employee self-service — any employee, their own record only ───────────
  // The employee holds their own resume, so the lowest-friction "later"
  // path is for them to upload it themselves.

  app.get(
    '/me/resume-profile',
    { preHandler: [rbacHook([...ALL])] },
    async (req) => {
      const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
      const svc = new ResumeProfileService(req.server.db, req.tenantId);
      return { data: await svc.getByEmployee(emp.id) };
    },
  );

  app.post(
    '/me/resume',
    { preHandler: [rbacHook([...ALL])] },
    async (req, reply) => {
      const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
      return uploadAndExtract(req, reply, emp.id);
    },
  );
};
