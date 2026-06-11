/**
 * AI-powered default salary-structure generator. Given the tenant's industry,
 * a free-text role hint, and the master salary components already defined for
 * the tenant, it proposes a sensible India-standard component template
 * (Basic / HRA / DA / allowances + optional statutory lines) via Claude Haiku.
 *
 * The model only picks from the tenant's EXISTING component codes (passed as an
 * enum) so it can never invent a component — the route resolves codes to IDs.
 * Nothing is persisted here; the proposal is reviewed in the UI before saving.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getStreamClient, isAIEnabled } from '../../../utils/ai/claude.service';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1200;

// The structure-component form only supports these three (formula needs an
// expression the template flow doesn't capture), so constrain the model too.
const CALC_TYPES = ['fixed', 'percent_of_basic', 'percent_of_ctc'] as const;
type CalcType = (typeof CALC_TYPES)[number];

export interface AvailableComponent {
  code: string;
  name: string;
  type: 'earning' | 'deduction' | 'reimbursement' | 'statutory';
}

export interface StructureGenContext {
  industry: string;
  roleHint: string;
  includeStatutory: boolean;
  components: AvailableComponent[];
}

export interface ProposedComponent {
  code: string;
  value: number;
  calcType: CalcType;
}

export interface ProposedStructure {
  name: string;
  description: string;
  components: ProposedComponent[];
}

function buildTool(codes: string[]): Anthropic.ToolUnion {
  return {
    name: 'propose_structure',
    description: 'Return a default salary structure: a name, a one-line description, and the chosen components.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short structure name (max 60 chars), e.g. "Factory Worker" or "Office Staff".' },
        description: { type: 'string', description: 'One line describing who this structure suits.' },
        components: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', enum: codes, description: 'Component code — must be one of the listed codes.' },
              value: { type: 'number', description: 'The amount (for fixed, in ₹/month) or percentage (for percent_of_* calc types).' },
              calcType: { type: 'string', enum: [...CALC_TYPES] },
            },
            required: ['code', 'value', 'calcType'],
          },
        },
      },
      required: ['name', 'description', 'components'],
    },
  };
}

function buildPrompt(ctx: StructureGenContext): string {
  const lines = ctx.components.map((c) => `- ${c.code} (${c.name}, ${c.type})`).join('\n');
  return `You are designing a default monthly salary structure for a ${ctx.industry} company in India.

Target role / grade: **${ctx.roleHint}**

Available components (pick only from these codes):
${lines}

Build a realistic India-standard structure for this role:
- BASIC is the foundation — usually 40-50% of CTC (calcType percent_of_ctc).
- HRA is typically 40-50% of Basic (calcType percent_of_basic).
- Add DA / Conveyance / Special Allowance as fits the role (factory/blue-collar roles lean on DA + fixed allowances; office/white-collar roles lean on HRA + special allowance).
- Use 'fixed' for flat ₹/month amounts, 'percent_of_basic' or 'percent_of_ctc' for proportional ones.
${ctx.includeStatutory
  ? '- Include the statutory components (PF, ESI, PT, TDS) that apply — leave their value 0 (the payroll engine computes them).'
  : '- Do NOT include any statutory components (PF, ESI, PT, TDS).'}

Call the propose_structure tool with the structured output. Do not include any text outside the tool call.`;
}

export async function generateDefaultStructure(ctx: StructureGenContext): Promise<ProposedStructure> {
  if (!isAIEnabled()) throw new Error('AI features are not enabled');
  const client = getStreamClient();
  if (!client) throw new Error('Anthropic client unavailable');

  const byCode = new Map(ctx.components.map((c) => [c.code, c]));
  const allowed = ctx.includeStatutory
    ? ctx.components
    : ctx.components.filter((c) => c.type !== 'statutory');
  if (allowed.length === 0) throw new Error('No salary components are defined — seed defaults first');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [buildTool(allowed.map((c) => c.code))],
    tool_choice: { type: 'tool', name: 'propose_structure' },
    messages: [{ role: 'user', content: buildPrompt({ ...ctx, components: allowed }) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'propose_structure',
  );
  if (!toolUse) throw new Error('Model did not call propose_structure');
  const out = toolUse.input as ProposedStructure;

  // Keep only known codes, dedupe, and (defensively) drop statutory lines the
  // caller excluded — the model occasionally ignores the instruction.
  const seen = new Set<string>();
  const components = (out.components ?? []).filter((c) => {
    const comp = byCode.get(c.code);
    if (!comp || seen.has(c.code)) return false;
    if (!ctx.includeStatutory && comp.type === 'statutory') return false;
    seen.add(c.code);
    return true;
  });
  if (components.length === 0) throw new Error('Generator returned no usable components');

  return {
    name: (out.name ?? ctx.roleHint).trim().slice(0, 100),
    description: (out.description ?? '').trim(),
    components,
  };
}
