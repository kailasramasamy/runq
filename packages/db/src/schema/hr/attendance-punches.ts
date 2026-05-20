import {
  pgTable, uuid, varchar, decimal, timestamp, boolean, integer,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { employees } from './employees';

export const punchKindEnum = pgEnum('punch_kind', ['in', 'out']);

// Tenant-scoped geo-fences (office, factory, warehouse). Employees can punch
// from anywhere; punches outside any active fence are stored with
// `inside_fence=false` so managers can spot exceptions. radius is metres.
export const geoFences = pgTable('geo_fences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
  radiusMeters: integer('radius_meters').notNull().default(200),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_geo_tenant').on(t.tenantId),
]);

// One row per check-in or check-out event from the mobile app. The
// daily `attendance` row is derived from the first IN + last OUT.
export const attendancePunches = pgTable('attendance_punches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  punchAt: timestamp('punch_at', { withTimezone: true }).notNull(),
  kind: punchKindEnum('kind').notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  accuracyMeters: decimal('accuracy_meters', { precision: 8, scale: 2 }),
  insideFence: boolean('inside_fence').notNull().default(false),
  geoFenceId: uuid('geo_fence_id').references(() => geoFences.id),
  selfieUrl: varchar('selfie_url', { length: 500 }),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_punch_tenant_emp_at').on(t.tenantId, t.employeeId, t.punchAt),
]);
