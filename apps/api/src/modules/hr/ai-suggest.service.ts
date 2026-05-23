import { analyze, isAIEnabled } from '../../utils/ai/claude.service';
import {
  DEPARTMENT_SUGGESTION_SYSTEM_PROMPT,
  DESIGNATION_SUGGESTION_SYSTEM_PROMPT,
  REWARD_CITATION_SYSTEM_PROMPT,
  suggestionUserPrompt,
  rewardCitationUserPrompt,
} from '../../utils/ai/prompts/hr-suggestion';
import { AppError } from '../../utils/errors';

export interface DepartmentSuggestion {
  name: string;
  code: string | null;
  rationale: string;
}

export interface DesignationSuggestion {
  name: string;
  level: number | null;
  rationale: string;
}

const AI_DISABLED = new AppError(
  503,
  'AI suggestions are not configured on this server.',
  'ServiceUnavailableError',
);

function parseSuggestions<T>(raw: string): T[] {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  let parsed: { suggestions?: T[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AppError(502, 'AI returned an unexpected response. Please try again.', 'BadGatewayError');
  }
  return Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
}

export async function suggestDepartments(description: string): Promise<DepartmentSuggestion[]> {
  if (!isAIEnabled()) throw AI_DISABLED;
  const raw = await analyze(DEPARTMENT_SUGGESTION_SYSTEM_PROMPT, suggestionUserPrompt(description));
  if (!raw) throw AI_DISABLED;

  return parseSuggestions<Partial<DepartmentSuggestion>>(raw)
    .filter((s): s is DepartmentSuggestion => typeof s?.name === 'string' && s.name.trim().length > 0)
    .map((s) => ({
      name: s.name.trim().slice(0, 100),
      code: s.code ? String(s.code).trim().slice(0, 20) : null,
      rationale: typeof s.rationale === 'string' ? s.rationale.trim() : '',
    }));
}

/**
 * Draft a one-sentence reward citation from the reward's title (and, when
 * known, the recipient and reward type). Returns plain text — not JSON.
 */
export async function suggestRewardCitation(input: {
  title: string;
  employeeName?: string | null;
  typeName?: string | null;
}): Promise<string> {
  if (!isAIEnabled()) throw AI_DISABLED;
  const raw = await analyze(REWARD_CITATION_SYSTEM_PROMPT, rewardCitationUserPrompt(input), 256);
  if (!raw) throw AI_DISABLED;

  const citation = raw
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
  if (!citation) {
    throw new AppError(502, 'AI returned an empty citation. Please try again.', 'BadGatewayError');
  }
  return citation;
}

export async function suggestDesignations(description: string): Promise<DesignationSuggestion[]> {
  if (!isAIEnabled()) throw AI_DISABLED;
  const raw = await analyze(DESIGNATION_SUGGESTION_SYSTEM_PROMPT, suggestionUserPrompt(description));
  if (!raw) throw AI_DISABLED;

  return parseSuggestions<Partial<DesignationSuggestion>>(raw)
    .filter((s): s is DesignationSuggestion => typeof s?.name === 'string' && s.name.trim().length > 0)
    .map((s) => ({
      name: s.name.trim().slice(0, 100),
      level:
        typeof s.level === 'number'
          ? Math.max(0, Math.min(20, Math.round(s.level)))
          : null,
      rationale: typeof s.rationale === 'string' ? s.rationale.trim() : '',
    }));
}
