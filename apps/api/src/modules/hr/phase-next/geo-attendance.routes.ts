import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import sharp from 'sharp';
import { and, eq, desc, asc, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  geoFences, attendancePunches, attendanceRegularizations,
  attendance, employees,
} from '@runq/db';
import {
  uuidParamSchema,
  createGeoFenceSchema, updateGeoFenceSchema,
  createPunchSchema,
  createRegularizationSchema, reviewRegularizationSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { AppError, NotFoundError, ConflictError, ForbiddenError } from '../../../utils/errors';
import { getStorageProvider } from '../../../utils/storage';
import { resolveSelfEmployee } from './self-employee';
import { resolveHrAccessScope } from '../access-scope';
import { HrNotifier } from '../hr-notifier';

const SELFIE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const SELFIE_MAX_BYTES = 6 * 1024 * 1024;
const SELFIE_SIZE_PX = 512;

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
// Company-wide punch log — viewer excluded; employees see their own via
// the /me/punches route. (Geo-fences GET stays open: mobile punch needs it.)
const MANAGE = ['owner', 'accountant', 'hr'] as const;

// Haversine distance in metres between two lat/lng points.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const dateRangeQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  employeeId: z.string().uuid().optional(),
});

// Optimise a phone-camera selfie to a 512px square JPEG. Same pattern as
// employee photos — strips EXIF, normalises orientation, drops file size
// from MB to ~30-80 KB.
async function optimiseSelfie(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(SELFIE_SIZE_PX, SELFIE_SIZE_PX, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

export const geoAttendanceRoutes: FastifyPluginAsync = async (app) => {
  // POST /me/punch-selfie — multipart upload, returns the storage key the
  // mobile then sends as `selfieUrl` on POST /me/punch. Two-step instead of
  // a single multipart punch endpoint so the JSON punch flow stays simple
  // and the selfie can fail independently (it's optional).
  app.post('/me/punch-selfie', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const file = await req.file();
    if (!file) throw new AppError(400, 'No file uploaded');
    if (!SELFIE_MIMES.includes(file.mimetype as any)) {
      throw new AppError(400, `Selfie must be PNG, JPG, or WEBP (got ${file.mimetype})`);
    }
    const raw = await file.toBuffer();
    if (raw.length > SELFIE_MAX_BYTES) throw new AppError(400, 'Selfie exceeds 6 MB');
    let optimised: Buffer;
    try { optimised = await optimiseSelfie(raw); }
    catch (e: any) { throw new AppError(400, `Could not read image: ${e?.message ?? 'unknown'}`); }
    const storage = getStorageProvider();
    const storageKey = await storage.upload({
      tenantId: req.tenantId,
      entityType: 'punch_selfie',
      entityId: emp.id,
      fileName: `${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      data: optimised,
    });
    return reply.code(201).send({ data: { storageKey } });
  });

  // GET /punches/:id/selfie — stream the selfie image for a stored punch.
  // Auth-gated; tenant-scoped; honours the manager/HR access scope used
  // elsewhere (employees see only their own).
  app.get('/punches/:id/selfie', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .select({ selfieUrl: attendancePunches.selfieUrl })
      .from(attendancePunches)
      .where(and(
        eq(attendancePunches.id, id),
        eq(attendancePunches.tenantId, req.tenantId),
      ))
      .limit(1);
    if (!row?.selfieUrl) throw new NotFoundError('Selfie');
    // Reject legacy local-file paths from before the upload pipeline existed
    // — these can't be streamed and would 500 inside the storage provider.
    if (row.selfieUrl.startsWith('/') || row.selfieUrl.startsWith('file:')) {
      throw new NotFoundError('Selfie');
    }
    const stream = await getStorageProvider().getStream(row.selfieUrl);
    reply
      .header('Content-Type', 'image/jpeg')
      .header('Cache-Control', 'private, max-age=300');
    return reply.send(stream);
  });

  // ===== GEO FENCES =====
  app.get('/geo-fences', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const rows = await req.server.db
      .select()
      .from(geoFences)
      .where(eq(geoFences.tenantId, req.tenantId))
      .orderBy(asc(geoFences.name));
    return { data: rows };
  });

  app.post('/geo-fences', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createGeoFenceSchema.parse(req.body);
    const [row] = await req.server.db
      .insert(geoFences)
      .values({
        tenantId: req.tenantId,
        name: input.name,
        latitude: input.latitude.toString(),
        longitude: input.longitude.toString(),
        radiusMeters: input.radiusMeters,
        isActive: input.isActive,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/geo-fences/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateGeoFenceSchema.parse(req.body);
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.latitude !== undefined) updateData.latitude = input.latitude.toString();
    if (input.longitude !== undefined) updateData.longitude = input.longitude.toString();
    if (input.radiusMeters !== undefined) updateData.radiusMeters = input.radiusMeters;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    const [row] = await req.server.db
      .update(geoFences)
      .set(updateData)
      .where(and(eq(geoFences.id, id), eq(geoFences.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Geo fence');
    return { data: row };
  });

  app.delete('/geo-fences/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [row] = await req.server.db
      .delete(geoFences)
      .where(and(eq(geoFences.id, id), eq(geoFences.tenantId, req.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Geo fence');
    return { data: row };
  });

  // ===== ATTENDANCE PUNCHES =====
  // POST /hr/me/punch — employee creates a punch with GPS + optional selfie.
  app.post('/me/punch', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = createPunchSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);

    // Geo-fence check — pick nearest active fence and decide inside/out.
    let insideFence = false;
    let geoFenceId: string | null = null;
    if (input.latitude !== undefined && input.longitude !== undefined) {
      const fences = await req.server.db
        .select()
        .from(geoFences)
        .where(and(eq(geoFences.tenantId, req.tenantId), eq(geoFences.isActive, true)));
      for (const f of fences) {
        const d = distanceMeters(
          input.latitude, input.longitude,
          Number(f.latitude), Number(f.longitude),
        );
        if (d <= f.radiusMeters) {
          insideFence = true;
          geoFenceId = f.id;
          break;
        }
      }
    }

    const punchAt = new Date();
    const [row] = await req.server.db
      .insert(attendancePunches)
      .values({
        tenantId: req.tenantId,
        employeeId: emp.id,
        punchAt,
        kind: input.kind,
        latitude: input.latitude?.toString(),
        longitude: input.longitude?.toString(),
        accuracyMeters: input.accuracyMeters?.toString(),
        insideFence,
        geoFenceId,
        selfieUrl: input.selfieUrl,
        notes: input.notes,
      })
      .returning();

    // Roll up into daily attendance row — first IN sets check_in,
    // latest OUT updates check_out & hours_worked.
    const date = punchAt.toISOString().slice(0, 10);
    const time = punchAt.toISOString().slice(11, 19);
    const [existing] = await req.server.db
      .select()
      .from(attendance)
      .where(and(
        eq(attendance.tenantId, req.tenantId),
        eq(attendance.employeeId, emp.id),
        eq(attendance.date, date),
      ))
      .limit(1);

    if (!existing) {
      await req.server.db.insert(attendance).values({
        tenantId: req.tenantId,
        employeeId: emp.id,
        date,
        checkIn: input.kind === 'in' ? time : undefined,
        checkOut: input.kind === 'out' ? time : undefined,
        status: 'present',
        source: 'mobile',
      });
    } else {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.kind === 'in' && !existing.checkIn) patch.checkIn = time;
      if (input.kind === 'out') {
        patch.checkOut = time;
        if (existing.checkIn) {
          // hh:mm:ss → minutes
          const toMin = (s: string) => {
            const [h, m, sec] = s.split(':').map(Number);
            return h * 60 + m + (sec || 0) / 60;
          };
          const mins = toMin(time) - toMin(existing.checkIn);
          if (mins > 0) patch.hoursWorked = (mins / 60).toFixed(2);
        }
      }
      await req.server.db
        .update(attendance)
        .set(patch)
        .where(eq(attendance.id, existing.id));
    }

    return reply.status(201).send({ data: row });
  });

  // GET /hr/me/punches — last 30 days of own punches.
  app.get('/me/punches', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await req.server.db
      .select()
      .from(attendancePunches)
      .where(and(
        eq(attendancePunches.tenantId, req.tenantId),
        eq(attendancePunches.employeeId, emp.id),
        gte(attendancePunches.punchAt, since),
      ))
      .orderBy(desc(attendancePunches.punchAt))
      .limit(200);
    return { data: rows };
  });

  // GET /hr/attendance-punches — manager / HR view across employees.
  app.get('/attendance-punches', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { from, to, employeeId } = dateRangeQuery.parse(req.query);
    const conds = [eq(attendancePunches.tenantId, req.tenantId)];
    if (from) conds.push(gte(attendancePunches.punchAt, new Date(from)));
    if (to) conds.push(lte(attendancePunches.punchAt, new Date(`${to}T23:59:59Z`)));
    if (employeeId) conds.push(eq(attendancePunches.employeeId, employeeId));
    const rows = await req.server.db
      .select({
        p: attendancePunches,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(attendancePunches)
      .innerJoin(employees, eq(employees.id, attendancePunches.employeeId))
      .where(and(...conds))
      .orderBy(desc(attendancePunches.punchAt))
      .limit(500);
    return { data: rows.map((r) => ({ ...r.p, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode })) };
  });

  // ===== ATTENDANCE REGULARIZATIONS =====
  app.post('/me/regularizations', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = createRegularizationSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .insert(attendanceRegularizations)
      .values({
        tenantId: req.tenantId,
        employeeId: emp.id,
        ...input,
      })
      .returning();

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    const empName = `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}`;
    notifier.notifyManagerOf(emp.id, {
      source: 'hr_attendance',
      title: 'Attendance regularisation',
      body: `${empName} requested a correction for ${row.date}.`,
      targetUrl: '/hr/regularizations',
    }).catch((e) => req.log.error(e, 'regularization-submitted notify failed'));

    return reply.status(201).send({ data: row });
  });

  app.get('/me/regularizations', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select()
      .from(attendanceRegularizations)
      .where(and(
        eq(attendanceRegularizations.tenantId, req.tenantId),
        eq(attendanceRegularizations.employeeId, emp.id),
      ))
      .orderBy(desc(attendanceRegularizations.createdAt))
      .limit(100);
    return { data: rows };
  });

  app.get('/regularizations', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const q = z.object({ status: z.string().optional(), employeeId: z.string().uuid().optional() }).parse(req.query);
    const conds = [eq(attendanceRegularizations.tenantId, req.tenantId)];
    if (q.status) conds.push(sql`${attendanceRegularizations.status}::text = ${q.status}`);
    if (q.employeeId) conds.push(eq(attendanceRegularizations.employeeId, q.employeeId));

    // Access scope: managers see only their reporting subtree minus their
    // own row (their own pending requests belong in "My requests", not
    // "Pending approvals"). Owner/HR/accountant get tenant-wide. Bare
    // viewers without a manager scope get nothing.
    const scope = await resolveHrAccessScope(req);
    if (scope.kind === 'subset') {
      const ids = [...scope.ids].filter((id) => id !== scope.selfEmployeeId);
      if (ids.length === 0) return { data: [] };
      // drizzle's `sql\`= ANY(${arr})\`` doesn't marshal JS arrays as
      // Postgres arrays — use inArray(), which expands to a tuple form
      // Postgres can bind.
      conds.push(inArray(attendanceRegularizations.employeeId, ids));
    } else if (scope.kind === 'self' || scope.kind === 'none') {
      return { data: [] };
    }

    const rows = await req.server.db
      .select({
        r: attendanceRegularizations,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(attendanceRegularizations)
      .innerJoin(employees, eq(employees.id, attendanceRegularizations.employeeId))
      .where(and(...conds))
      .orderBy(desc(attendanceRegularizations.createdAt))
      .limit(500);
    return { data: rows.map((x) => ({ ...x.r, firstName: x.firstName, lastName: x.lastName, employeeCode: x.employeeCode })) };
  });

  app.put('/regularizations/:id/review', {
    preHandler: [rbacHook(['owner', 'accountant', 'hr', 'viewer'])],
  }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = reviewRegularizationSchema.parse(req.body);
    const [existing] = await req.server.db
      .select()
      .from(attendanceRegularizations)
      .where(and(
        eq(attendanceRegularizations.id, id),
        eq(attendanceRegularizations.tenantId, req.tenantId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Regularization');
    if (existing.status !== 'pending') {
      throw new ConflictError('Already reviewed');
    }

    // Block self-approval. If the reviewer has an employee record and
    // it's the same as the request's employee, refuse. Owner/HR with no
    // linked employee row still get tenant-wide rights — the same model
    // used by expense-claims.
    const scope = await resolveHrAccessScope(req);
    const selfEmployeeId =
      scope.kind === 'subset' ? scope.selfEmployeeId
      : scope.kind === 'self' ? scope.selfEmployeeId
      : null;
    if (selfEmployeeId && selfEmployeeId === existing.employeeId) {
      throw new ForbiddenError('You cannot review your own regularization request');
    }
    // Manager scope guard: the request must belong to someone in their
    // reporting subtree.
    if (scope.kind === 'subset' && !scope.ids.has(existing.employeeId)) {
      throw new ForbiddenError('This request is outside your approval scope');
    }
    if (scope.kind === 'self' || scope.kind === 'none') {
      throw new ForbiddenError('You do not have approval rights');
    }

    const newStatus = input.approved ? 'approved' as const : 'rejected' as const;
    const [row] = await req.server.db
      .update(attendanceRegularizations)
      .set({
        status: newStatus,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(attendanceRegularizations.id, id))
      .returning();

    // On approval, patch the daily attendance row.
    if (input.approved) {
      const [att] = await req.server.db
        .select()
        .from(attendance)
        .where(and(
          eq(attendance.tenantId, req.tenantId),
          eq(attendance.employeeId, existing.employeeId),
          eq(attendance.date, existing.date),
        ))
        .limit(1);

      const patch: Record<string, unknown> = { updatedAt: new Date(), source: 'manual' };
      if (existing.requestedCheckIn) patch.checkIn = existing.requestedCheckIn;
      if (existing.requestedCheckOut) patch.checkOut = existing.requestedCheckOut;
      if (existing.requestedStatus) patch.status = existing.requestedStatus;

      if (!att) {
        await req.server.db.insert(attendance).values({
          tenantId: req.tenantId,
          employeeId: existing.employeeId,
          date: existing.date,
          status: (existing.requestedStatus as 'present' | 'absent' | 'half_day') ?? 'present',
          source: 'manual',
          checkIn: existing.requestedCheckIn ?? undefined,
          checkOut: existing.requestedCheckOut ?? undefined,
        });
      } else {
        await req.server.db
          .update(attendance)
          .set(patch)
          .where(eq(attendance.id, att.id));
      }
    }

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    if (row.status === 'approved') {
      notifier.notifyEmployee(existing.employeeId, {
        type: 'ok',
        source: 'hr_attendance',
        title: 'Regularisation approved',
        body: `Your attendance correction for ${existing.date} was approved.`,
        targetUrl: '/hr/regularizations',
      }).catch((e) => req.log.error(e, 'regularization-approved notify failed'));
    } else {
      const reason = row.rejectionReason ? ` ${row.rejectionReason}` : '';
      notifier.notifyEmployee(existing.employeeId, {
        type: 'warn',
        source: 'hr_attendance',
        title: 'Regularisation rejected',
        body: `Your attendance correction for ${existing.date} was rejected.${reason}`,
        targetUrl: '/hr/regularizations',
      }).catch((e) => req.log.error(e, 'regularization-rejected notify failed'));
    }

    return { data: row };
  });

  // Employee can cancel a pending request of their own.
  app.put('/me/regularizations/:id/cancel', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .update(attendanceRegularizations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(attendanceRegularizations.id, id),
        eq(attendanceRegularizations.tenantId, req.tenantId),
        eq(attendanceRegularizations.employeeId, emp.id),
        eq(attendanceRegularizations.status, 'pending'),
      ))
      .returning();
    if (!row) throw new NotFoundError('Pending regularization');
    return { data: row };
  });
};
