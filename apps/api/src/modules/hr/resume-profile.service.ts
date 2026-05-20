import { eq, and } from 'drizzle-orm';
import { employeeResumeProfiles } from '@runq/db';
import type {
  Db, ResumeExperience, ResumeEducation, ResumeCertification,
} from '@runq/db';
import type { UpdateResumeProfileInput } from '@runq/validators';
import {
  extractFromPDF, extractFromImage, isAIEnabled,
} from '../../utils/ai/claude.service';
import {
  RESUME_EXTRACTION_SYSTEM_PROMPT, RESUME_EXTRACTION_USER_PROMPT,
} from '../../utils/ai/prompts/resume-extraction';
import { recordExtractionCorrection } from '../common/extraction-corrections.service';
import { NotFoundError, AppError } from '../../utils/errors';

export type ResumeProfileRow = typeof employeeResumeProfiles.$inferSelect;

interface ExtractedResume {
  summary: string | null;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  certifications: ResumeCertification[];
  languages: string[];
  totalExpYears: number | null;
  confidence: number;
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const IMAGE_MEDIA: Record<string, ImageMediaType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};

// Resumes run long (multiple roles, descriptions) — give the model headroom
// over the 4096 default so the JSON isn't truncated mid-array.
const MAX_TOKENS = 8192;

export class ResumeProfileService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Run the resume file through Claude Vision and return the parsed profile. */
  async extractFromFile(buffer: Buffer, mimeType: string): Promise<ExtractedResume> {
    if (!isAIEnabled()) {
      throw new AppError(503, 'Resume extraction is unavailable — ANTHROPIC_API_KEY is not set.');
    }
    const raw = await this.callClaude(buffer, mimeType);
    if (!raw) throw new AppError(502, 'AI extraction returned an empty response.');
    return parseResume(raw);
  }

  private async callClaude(buffer: Buffer, mimeType: string): Promise<string | null> {
    const base64 = buffer.toString('base64');
    if (mimeType === 'application/pdf') {
      return extractFromPDF(base64, RESUME_EXTRACTION_SYSTEM_PROMPT, RESUME_EXTRACTION_USER_PROMPT, MAX_TOKENS);
    }
    const media = IMAGE_MEDIA[mimeType];
    if (!media) {
      // DOCX and other formats aren't accepted by Claude's document API.
      throw new AppError(400, 'Resume must be a PDF or image (PDF, PNG, JPG, WEBP).');
    }
    return extractFromImage(base64, media, RESUME_EXTRACTION_SYSTEM_PROMPT, RESUME_EXTRACTION_USER_PROMPT, MAX_TOKENS);
  }

  async getByEmployee(employeeId: string): Promise<ResumeProfileRow | null> {
    const [row] = await this.db
      .select()
      .from(employeeResumeProfiles)
      .where(and(
        eq(employeeResumeProfiles.employeeId, employeeId),
        eq(employeeResumeProfiles.tenantId, this.tenantId),
      ))
      .limit(1);
    return row ?? null;
  }

  /** Insert or replace the employee's profile from a fresh extraction. */
  async saveExtraction(
    employeeId: string,
    sourceAttachmentId: string,
    extracted: ExtractedResume,
  ): Promise<ResumeProfileRow> {
    const content = {
      summary: extracted.summary,
      experience: extracted.experience,
      education: extracted.education,
      skills: extracted.skills,
      certifications: extracted.certifications,
      languages: extracted.languages,
      totalExpYears: extracted.totalExpYears != null ? String(extracted.totalExpYears) : null,
    };
    const [row] = await this.db
      .insert(employeeResumeProfiles)
      .values({
        tenantId: this.tenantId,
        employeeId,
        ...content,
        sourceAttachmentId,
        aiConfidence: String(clamp01(extracted.confidence)),
        manuallyEdited: false,
        extractedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: employeeResumeProfiles.employeeId,
        set: {
          ...content,
          sourceAttachmentId,
          aiConfidence: String(clamp01(extracted.confidence)),
          manuallyEdited: false,
          extractedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  /** Apply a management correction to an extracted profile. */
  async update(
    employeeId: string,
    input: UpdateResumeProfileInput,
    userId: string,
  ): Promise<ResumeProfileRow> {
    const existing = await this.getByEmployee(employeeId);
    if (!existing) throw new NotFoundError('Resume profile');

    // Log the first human correction against the AI baseline — feeds the
    // same "where is extraction weakest" analytics as bill corrections.
    if (!existing.manuallyEdited) {
      await recordExtractionCorrection(this.db, {
        tenantId: this.tenantId,
        documentType: 'hr_resume',
        sourceEntityType: 'employee',
        sourceEntityId: employeeId,
        aiOutput: correctionShape(existing),
        userOutput: correctionShape(input),
        aiConfidence: existing.aiConfidence != null ? Number(existing.aiConfidence) : null,
        createdBy: userId,
      });
    }

    const [row] = await this.db
      .update(employeeResumeProfiles)
      .set({
        summary: input.summary,
        experience: input.experience,
        education: input.education,
        skills: input.skills,
        certifications: input.certifications,
        languages: input.languages,
        totalExpYears: input.totalExpYears != null ? String(input.totalExpYears) : null,
        manuallyEdited: true,
        updatedAt: new Date(),
      })
      .where(and(
        eq(employeeResumeProfiles.employeeId, employeeId),
        eq(employeeResumeProfiles.tenantId, this.tenantId),
      ))
      .returning();
    return row!;
  }
}

/**
 * Extract a resume and persist the profile in one step. Shared by the manual
 * upload route (awaited) and the onboarding upload hook (fire-and-forget).
 */
export async function extractAndSaveResumeProfile(
  db: Db,
  tenantId: string,
  employeeId: string,
  sourceAttachmentId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<ResumeProfileRow> {
  const svc = new ResumeProfileService(db, tenantId);
  const extracted = await svc.extractFromFile(buffer, mimeType);
  return svc.saveExtraction(employeeId, sourceAttachmentId, extracted);
}

function parseResume(raw: string): ExtractedResume {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new AppError(502, 'AI returned invalid JSON. Please try again.');
  }
  return {
    summary: strOrNull(parsed.summary),
    experience: asArray(parsed.experience).map(normExperience),
    education: asArray(parsed.education).map(normEducation),
    skills: asArray(parsed.skills).map((s) => String(s).trim()).filter(Boolean),
    certifications: asArray(parsed.certifications).map(normCertification),
    languages: asArray(parsed.languages).map((s) => String(s).trim()).filter(Boolean),
    totalExpYears: numOrNull(parsed.totalExpYears),
    confidence: clamp01(numOrNull(parsed.confidence) ?? 0),
  };
}

function normExperience(raw: unknown): ResumeExperience {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    company: String(o.company ?? '').trim(),
    title: strOrNull(o.title),
    fromDate: strOrNull(o.fromDate),
    toDate: strOrNull(o.toDate),
    description: strOrNull(o.description),
  };
}

function normEducation(raw: unknown): ResumeEducation {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    degree: String(o.degree ?? '').trim(),
    institution: strOrNull(o.institution),
    year: strOrNull(o.year),
    grade: strOrNull(o.grade),
  };
}

function normCertification(raw: unknown): ResumeCertification {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(o.name ?? '').trim(),
    issuer: strOrNull(o.issuer),
    year: strOrNull(o.year),
  };
}

function correctionShape(p: {
  summary: string | null;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  certifications: ResumeCertification[];
  languages: string[];
  totalExpYears: string | number | null;
}): Record<string, unknown> {
  return {
    summary: p.summary,
    experience: p.experience,
    education: p.education,
    skills: p.skills,
    certifications: p.certifications,
    languages: p.languages,
    totalExpYears: p.totalExpYears != null ? Number(p.totalExpYears) : null,
  };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
