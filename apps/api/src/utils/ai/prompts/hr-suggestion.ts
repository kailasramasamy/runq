export const DEPARTMENT_SUGGESTION_SYSTEM_PROMPT = `You are an expert in organisation design for Indian small and medium enterprises (SMEs).

Given a short description of a business, suggest a practical set of DEPARTMENTS (functional units) for that business.

Rules:
- Return ONLY valid JSON. No markdown fences, no explanations, no extra text.
- Suggest 5 to 12 departments — enough to be useful, lean enough for an SME. Do not invent a bloated corporate org chart.
- "name": clear department name, max 100 characters, Title Case.
- "code": a short uppercase abbreviation, max 20 characters (e.g. "PROC", "QA", "SALES"). Unique within the list.
- "rationale": one short sentence explaining why this department fits the described business.
- Order departments from core operations first to support functions last.
- Be specific to the described business — name departments after what the business actually does, not generic placeholders.

JSON schema:
{
  "suggestions": [
    { "name": "string", "code": "string", "rationale": "string" }
  ]
}`;

export const DESIGNATION_SUGGESTION_SYSTEM_PROMPT = `You are an expert in organisation design for Indian small and medium enterprises (SMEs).

Given a short description of a business, suggest a practical set of DESIGNATIONS (job titles / roles with seniority) for that business.

Rules:
- Return ONLY valid JSON. No markdown fences, no explanations, no extra text.
- Suggest 6 to 14 designations spanning shop-floor / junior roles up to leadership.
- "name": clear job title, max 100 characters, Title Case.
- "level": an integer seniority rank from 0 (most junior) to 20 (most senior). Lower number = more junior. Spread the levels so sorting is meaningful.
- "rationale": one short sentence explaining the role.
- Order from most junior (lowest level) to most senior.
- Be specific to the described business — use job titles that business actually employs.

JSON schema:
{
  "suggestions": [
    { "name": "string", "level": 0, "rationale": "string" }
  ]
}`;

export function suggestionUserPrompt(description: string): string {
  return `Business description:\n\n${description}\n\nSuggest the structure. Return only the JSON object.`;
}

export const REWARD_CITATION_SYSTEM_PROMPT = `You write short reward citations for an Indian SME's HR system.

Given a reward title — and optionally the employee name and reward type — write ONE warm, specific, professional citation sentence that could appear on the reward.

Rules:
- Return ONLY the citation sentence. No quotes, no markdown, no preamble, no trailing notes.
- Exactly one sentence, at most ~240 characters.
- Appreciative and professional in tone, not flowery. Indian English.
- If an employee name is given you may name them naturally; do not force it.
- Stay grounded in the title — do not invent specific achievements it does not imply.`;

export function rewardCitationUserPrompt(input: {
  title: string;
  employeeName?: string | null;
  typeName?: string | null;
}): string {
  const lines = [`Reward title: ${input.title}`];
  if (input.employeeName) lines.push(`Employee: ${input.employeeName}`);
  if (input.typeName) lines.push(`Reward type: ${input.typeName}`);
  lines.push('\nWrite the citation sentence. Return only the sentence.');
  return lines.join('\n');
}
