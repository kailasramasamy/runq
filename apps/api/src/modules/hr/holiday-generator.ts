/**
 * AI-powered Indian holiday calendar generator. Given a year (and optionally a
 * state), it proposes the standard national holidays plus major festivals via
 * Claude Haiku — useful because festival dates (Diwali, Holi, Eid…) shift each
 * year and vary by region. Nothing is persisted; the list is reviewed in the UI
 * and bulk-saved through the existing holiday create path.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getStreamClient, isAIEnabled } from '../../utils/ai/claude.service';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 2500;
const TYPES = ['national', 'state', 'company', 'optional'] as const;
type HolidayType = (typeof TYPES)[number];

export interface GeneratedHoliday {
  name: string;
  date: string;
  type: HolidayType;
  state: string | null;
  isPaid: boolean;
}

export interface HolidayGenContext {
  year: number;
  state?: string;
}

const HOLIDAY_TOOL: Anthropic.ToolUnion = {
  name: 'set_holidays',
  description: 'Return the list of Indian public holidays for the requested year.',
  input_schema: {
    type: 'object',
    properties: {
      holidays: {
        type: 'array',
        minItems: 8,
        maxItems: 40,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Holiday name, e.g. "Diwali", "Independence Day".' },
            date: { type: 'string', description: 'Exact date in YYYY-MM-DD format for the requested year.' },
            type: { type: 'string', enum: [...TYPES], description: 'national = gazetted all-India; state = state-specific; optional = restricted holiday.' },
            isPaid: { type: 'boolean', description: 'Whether it is a paid holiday (true for gazetted holidays).' },
          },
          required: ['name', 'date', 'type', 'isPaid'],
        },
      },
    },
    required: ['holidays'],
  },
};

function buildPrompt(ctx: HolidayGenContext): string {
  return `List the Indian public holidays for the calendar year ${ctx.year}.

Include:
- All gazetted NATIONAL holidays (Republic Day 26 Jan, Independence Day 15 Aug, Gandhi Jayanti 2 Oct) as type "national".
- Major all-India festivals with their correct ${ctx.year} dates (Holi, Ram Navami, Mahavir Jayanti, Good Friday, Eid ul-Fitr, Eid ul-Adha/Bakrid, Janmashtami, Ganesh Chaturthi, Dussehra/Vijayadashami, Diwali, Guru Nanak Jayanti, Christmas, etc.) as type "national" or "optional" as appropriate.
${ctx.state ? `- State-specific holidays for **${ctx.state}** as type "state" (set them to that state's name).` : '- Skip purely state-specific holidays.'}

Rules:
- Use the ACTUAL date each holiday falls on in ${ctx.year} (lunar/Islamic festivals move year to year — be accurate).
- Every date MUST be in ${ctx.year} and in YYYY-MM-DD format.
- Do not invent duplicate entries.

Call the set_holidays tool with the structured list. Do not include any text outside the tool call.`;
}

export async function generateHolidaysForYear(ctx: HolidayGenContext): Promise<GeneratedHoliday[]> {
  if (!isAIEnabled()) throw new Error('AI features are not enabled');
  const client = getStreamClient();
  if (!client) throw new Error('Anthropic client unavailable');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [HOLIDAY_TOOL],
    tool_choice: { type: 'tool', name: 'set_holidays' },
    messages: [{ role: 'user', content: buildPrompt(ctx) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'set_holidays',
  );
  if (!toolUse) throw new Error('Model did not call set_holidays');
  const raw = (toolUse.input as { holidays?: Array<Partial<GeneratedHoliday>> }).holidays ?? [];

  const inYear = new RegExp(`^${ctx.year}-\\d{2}-\\d{2}$`);
  const seen = new Set<string>();
  const holidays: GeneratedHoliday[] = [];
  for (const h of raw) {
    const name = (h.name ?? '').trim();
    const date = (h.date ?? '').trim();
    if (!name || !inYear.test(date) || seen.has(date + name.toLowerCase())) continue;
    seen.add(date + name.toLowerCase());
    const type: HolidayType = TYPES.includes(h.type as HolidayType) ? (h.type as HolidayType) : 'national';
    holidays.push({
      name,
      date,
      type,
      state: type === 'state' ? (ctx.state ?? null) : null,
      isPaid: h.isPaid !== false,
    });
  }
  if (holidays.length === 0) throw new Error('Generator returned no valid holidays');
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}
