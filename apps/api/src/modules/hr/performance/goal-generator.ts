/**
 * AI-powered performance goal generator. Given an employee's role context,
 * produces 3-5 weighted, measurable goals via Claude Haiku. Goals come back
 * with status='draft' so HR can review before publishing.
 *
 * Caching is per-call (in-memory Map). Two employees in the same
 * (department, designation) share one inference within a single batch run.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getStreamClient, isAIEnabled } from '../../../utils/ai/claude.service';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1500;

export interface GeneratedGoal {
  title: string;
  description: string;
  weight: number;
  targetMetric: string;
}

export interface RoleContext {
  industry: string;
  department: string;
  designation: string;
  status?: 'active' | 'inactive' | 'terminated' | 'on_leave';
  cycleName: string;
  cycleStart: string;
  cycleEnd: string;
}

const GOAL_TOOL: Anthropic.ToolUnion = {
  name: 'set_goals',
  description: 'Return 3 to 5 weighted performance goals for the employee. Weights must sum to exactly 100.',
  input_schema: {
    type: 'object',
    properties: {
      goals: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short goal title (max 80 chars).' },
            description: { type: 'string', description: '1-2 sentences explaining the goal in context.' },
            weight: { type: 'number', description: 'Percentage weight 0-100. All weights must sum to 100.' },
            targetMetric: { type: 'string', description: 'Specific measurable target (e.g. "95% on-time delivery", "< 2 incidents per month").' },
          },
          required: ['title', 'description', 'weight', 'targetMetric'],
        },
      },
    },
    required: ['goals'],
  },
};

function buildPrompt(ctx: RoleContext): string {
  const onProbation = ctx.status === 'inactive';
  return `You are setting performance goals for an employee at a ${ctx.industry} company in India.

Cycle: **${ctx.cycleName}** (${ctx.cycleStart} → ${ctx.cycleEnd})
Department: **${ctx.department}**
Designation: **${ctx.designation}**
${onProbation ? 'Status: on probation — bias toward learning/onboarding goals.' : ''}

Generate 3 to 5 weighted, measurable performance goals appropriate for this role in this industry. Goals must be:
- Specific to the role and industry (not generic "improve communication" filler)
- Measurable (every goal must have a concrete target metric)
- Realistic for a quarter / half-year cycle
- Weighted so they sum to exactly 100 (most-important highest)

Indian SME context notes:
- Manufacturing / factory roles → production output, quality rejects, safety incidents, shift coverage
- Sales / customer-facing roles → revenue targets, account growth, customer satisfaction
- Engineering / IT roles → uptime, ticket resolution time, project delivery
- HR / Finance / Ops roles → compliance, process turnaround, accuracy

Call the set_goals tool with the structured output. Do not include any text outside the tool call.`;
}

export async function generateGoalsForRole(ctx: RoleContext): Promise<GeneratedGoal[]> {
  if (!isAIEnabled()) throw new Error('AI features are not enabled');
  const client = getStreamClient();
  if (!client) throw new Error('Anthropic client unavailable');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [GOAL_TOOL],
    tool_choice: { type: 'tool', name: 'set_goals' },
    messages: [{ role: 'user', content: buildPrompt(ctx) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'set_goals',
  );
  if (!toolUse) throw new Error('Model did not call set_goals');

  const input = toolUse.input as { goals?: GeneratedGoal[] };
  const goals = input.goals ?? [];
  if (goals.length < 3 || goals.length > 5) {
    throw new Error(`Generator returned ${goals.length} goals — expected 3-5`);
  }
  // Normalise weights to sum to exactly 100 (the model occasionally drifts by 1-2).
  const sum = goals.reduce((s, g) => s + (g.weight ?? 0), 0);
  if (sum === 0) throw new Error('All weights were zero');
  if (Math.abs(sum - 100) > 0.5) {
    const scale = 100 / sum;
    goals.forEach((g) => { g.weight = Math.round(g.weight * scale); });
    const diff = 100 - goals.reduce((s, g) => s + g.weight, 0);
    if (diff !== 0) goals[0].weight += diff;
  }
  return goals;
}

/**
 * Cache wrapper for batch generation. Keyed by (industry, department,
 * designation). 15 employees with the same role share one inference.
 */
export class GoalGeneratorCache {
  private cache = new Map<string, GeneratedGoal[]>();

  async get(ctx: RoleContext): Promise<GeneratedGoal[]> {
    const key = `${ctx.industry}|${ctx.department}|${ctx.designation}`;
    const cached = this.cache.get(key);
    if (cached) return cached.map((g) => ({ ...g }));
    const goals = await generateGoalsForRole(ctx);
    this.cache.set(key, goals);
    return goals.map((g) => ({ ...g }));
  }
}
