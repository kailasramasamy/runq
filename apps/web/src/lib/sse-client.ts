/**
 * POST-based SSE client. Standard EventSource only supports GET,
 * so we use fetch + ReadableStream to consume SSE from a POST endpoint.
 */
export async function* postSSE<T>(
  url: string,
  body: unknown,
  token: string,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Agent request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines: "data: {...}\n\n"
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const jsonStr = trimmed.slice(6); // Remove "data: " prefix
      try {
        yield JSON.parse(jsonStr) as T;
      } catch {
        // Skip malformed JSON
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim().startsWith('data: ')) {
    try {
      yield JSON.parse(buffer.trim().slice(6)) as T;
    } catch {
      // Skip malformed JSON
    }
  }
}
