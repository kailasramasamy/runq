// Validators for the employee resume profile — the management-facing edit
// form that corrects AI-extracted resume data. Dates are free-text (resumes
// rarely print full dates), so they're loosely constrained strings.

import { z } from 'zod';

export const resumeExperienceSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().max(200).nullable().default(null),
  fromDate: z.string().max(20).nullable().default(null),
  toDate: z.string().max(20).nullable().default(null),
  description: z.string().max(2000).nullable().default(null),
});

export const resumeEducationSchema = z.object({
  degree: z.string().min(1).max(200),
  institution: z.string().max(200).nullable().default(null),
  year: z.string().max(20).nullable().default(null),
  grade: z.string().max(50).nullable().default(null),
});

export const resumeCertificationSchema = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().max(200).nullable().default(null),
  year: z.string().max(20).nullable().default(null),
});

// Full replace of the editable profile content — the form posts the whole
// block back, so omitted arrays mean "now empty", not "leave unchanged".
export const updateResumeProfileSchema = z.object({
  summary: z.string().max(4000).nullable().default(null),
  experience: z.array(resumeExperienceSchema).max(50).default([]),
  education: z.array(resumeEducationSchema).max(30).default([]),
  skills: z.array(z.string().min(1).max(100)).max(100).default([]),
  certifications: z.array(resumeCertificationSchema).max(50).default([]),
  languages: z.array(z.string().min(1).max(50)).max(30).default([]),
  totalExpYears: z.number().min(0).max(80).nullable().default(null),
});

export type UpdateResumeProfileInput = z.infer<typeof updateResumeProfileSchema>;
