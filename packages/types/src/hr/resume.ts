/**
 * Employee resume profile — AI-extracted enrichment data lifted from an
 * employee's resume. All fields are self-reported and unverified; the UI
 * presents them as "from resume", never as authoritative HR record.
 */

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

export interface ResumeProfile {
  id: string;
  tenantId: string;
  employeeId: string;
  summary: string | null;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  certifications: ResumeCertification[];
  languages: string[];
  /** Numeric columns arrive as strings over JSON. */
  totalExpYears: string | null;
  sourceAttachmentId: string | null;
  aiConfidence: string | null;
  manuallyEdited: boolean;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
