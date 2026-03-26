import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  client = new Anthropic({ apiKey });
  return client;
}

export function isAIEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Extract structured data from a PDF document using Claude Vision.
 * Returns the raw text response from Claude.
 */
export async function extractFromPDF(
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : null;
}

/**
 * Extract structured data from an image (JPG/PNG) using Claude Vision.
 */
export async function extractFromImage(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : null;
}

/**
 * General text analysis using Claude (no vision).
 */
export async function analyze(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : null;
}
