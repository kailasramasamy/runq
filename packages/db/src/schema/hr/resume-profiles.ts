import {
  pgTable, uuid, text, jsonb, numeric, boolean, timestamp,
  index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { employees } from './employees';
import { documentAttachments } from '../common/attachments';

// All fields are self-reported (lifted from the employee's own resume) and
// unverified — the UI presents them as "from resume", never as authoritative
// HR record. Dates are kept as free-text (YYYY or YYYY-MM) because resumes
// rarely print full dates and a real `date` column would force false precision.
export interface ResumeExperience {
  company: string;
  title: string | null;
  fromDate: string | null;
  toDate: string | null;
  description: string | null;
}

export interface ResumeEducation {
  degree: string;
  institution: string | null;
  year: string | null;
  grade: string | null;
}

export interface ResumeCertification {
  name: string;
  issuer: string | null;
  year: string | null;
}

export const employeeResumeProfiles = pgTable('employee_resume_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),

  summary: text('summary'),
  experience: jsonb('experience').$type<ResumeExperience[]>().notNull().default([]),
  education: jsonb('education').$type<ResumeEducation[]>().notNull().default([]),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  certifications: jsonb('certifications').$type<ResumeCertification[]>().notNull().default([]),
  languages: jsonb('languages').$type<string[]>().notNull().default([]),
  totalExpYears: numeric('total_exp_years', { precision: 4, scale: 1 }),

  // The resume file this profile was extracted from (a document_attachments
  // row with document_kind = 'resume').
  sourceAttachmentId: uuid('source_attachment_id').references(() => documentAttachments.id),
  aiConfidence: numeric('ai_confidence', { precision: 3, scale: 2 }),
  // Flips true once management corrects the extracted data. Drives the
  // first-edit correction logging and lets the UI drop the "AI extracted" tag.
  manuallyEdited: boolean('manually_edited').notNull().default(false),
  extractedAt: timestamp('extracted_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_resume_employee').on(t.employeeId),
  index('idx_resume_tenant').on(t.tenantId),
]);
