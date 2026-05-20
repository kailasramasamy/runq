import { extractionCorrections } from '@runq/db';
import type { Db } from '@runq/db';

type DocType = 'ap_bill' | 'ar_po' | 'bank_statement' | 'hr_resume';
type Method = 'local' | 'ai' | 'template' | 'manual';

export interface RecordCorrectionParams {
  tenantId: string;
  documentType: DocType;
  sourceEntityType?: string;
  sourceEntityId?: string;
  vendorId?: string | null;
  customerId?: string | null;
  aiOutput: Record<string, unknown>;
  userOutput: Record<string, unknown>;
  aiConfidence?: number | null;
  extractionMethod?: Method;
  createdBy?: string | null;
}

export interface FieldDiff {
  field: string;
  ai: unknown;
  user: unknown;
}

export interface CorrectionDiff {
  fieldDiffs: FieldDiff[];
  itemsAddedByUser: number;
  itemsRemovedByUser: number;
  itemsModified: number;
  totalChanges: number;
}

/**
 * Compute a shallow diff at the top level + a coarse line-items comparison.
 * Skips deep object diffing — the goal is analytics signal, not a perfect
 * reconstruction. Stable enough to drive "where is AI weakest" reports and
 * "did this vendor's layout change" detection.
 */
export function diffExtraction(
  ai: Record<string, unknown>,
  user: Record<string, unknown>,
): CorrectionDiff {
  const fieldDiffs: FieldDiff[] = [];

  // Top-level scalar/string fields — skip arrays/objects (handled separately).
  const allKeys = new Set([...Object.keys(ai), ...Object.keys(user)]);
  for (const key of allKeys) {
    const aiVal = ai[key];
    const userVal = user[key];

    // Items array: compare separately below.
    if (Array.isArray(aiVal) || Array.isArray(userVal)) continue;
    // Skip nested objects for now — they're rare in extracted shapes.
    if (typeof aiVal === 'object' && aiVal !== null) continue;
    if (typeof userVal === 'object' && userVal !== null) continue;

    if (normalize(aiVal) !== normalize(userVal)) {
      fieldDiffs.push({ field: key, ai: aiVal, user: userVal });
    }
  }

  // Line items: count adds/removes/modifies. Match by index, not identity —
  // good enough for "did the user have to fix line items".
  const aiItems = Array.isArray(ai.items) ? (ai.items as unknown[]) : [];
  const userItems = Array.isArray(user.items) ? (user.items as unknown[]) : [];

  let itemsModified = 0;
  const minLen = Math.min(aiItems.length, userItems.length);
  for (let i = 0; i < minLen; i++) {
    if (JSON.stringify(aiItems[i]) !== JSON.stringify(userItems[i])) {
      itemsModified++;
    }
  }

  const itemsAddedByUser = Math.max(0, userItems.length - aiItems.length);
  const itemsRemovedByUser = Math.max(0, aiItems.length - userItems.length);

  return {
    fieldDiffs,
    itemsAddedByUser,
    itemsRemovedByUser,
    itemsModified,
    totalChanges: fieldDiffs.length + itemsAddedByUser + itemsRemovedByUser + itemsModified,
  };
}

function normalize(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  return String(v);
}

/**
 * Persist an extraction correction row. Non-fatal: if recording fails, we
 * log the error but never block the save flow that triggered the call.
 */
export async function recordExtractionCorrection(
  db: Db,
  params: RecordCorrectionParams,
): Promise<void> {
  try {
    const diff = diffExtraction(params.aiOutput, params.userOutput);
    await db.insert(extractionCorrections).values({
      tenantId: params.tenantId,
      documentType: params.documentType,
      sourceEntityType: params.sourceEntityType ?? null,
      sourceEntityId: params.sourceEntityId ?? null,
      vendorId: params.vendorId ?? null,
      customerId: params.customerId ?? null,
      aiOutput: params.aiOutput,
      userOutput: params.userOutput,
      diff: diff as unknown as Record<string, unknown>,
      aiConfidence: params.aiConfidence != null ? String(params.aiConfidence) : null,
      extractionMethod: params.extractionMethod ?? 'ai',
      fieldsChangedCount: diff.totalChanges,
      createdBy: params.createdBy ?? null,
    });
  } catch (err) {
    // Never block the user save flow if we fail to log telemetry.
    // eslint-disable-next-line no-console
    console.error('[extraction-corrections] failed to record', err);
  }
}
