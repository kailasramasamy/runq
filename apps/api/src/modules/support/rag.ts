/**
 * Lightweight RAG over the docs/ folder. Loads markdown files at startup,
 * indexes by tokenized words, and returns the top-k snippets for a query
 * using a simple TF-IDF-ish scoring.
 *
 * Why no embeddings: at our scale (a few dozen docs, ~50 conversations/day)
 * keyword retrieval is fast, deterministic, debuggable, and the docs are
 * keyword-dense (feature names, screen names, GST terms). Swap to embeddings
 * later if precision proves insufficient.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const DOCS_ROOT = resolve(process.cwd(), '../../docs');

interface Doc {
  path: string;          // relative path under docs/
  title: string;
  content: string;
  // Map of normalized term → count
  termFreq: Map<string, number>;
}

let docs: Doc[] | null = null;
let docFreq: Map<string, number> | null = null;   // term → number of docs containing it

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'as', 'from', 'this', 'that',
  'it', 'its', 'i', 'you', 'we', 'they', 'he', 'she', 'his', 'her', 'their', 'our',
  'how', 'what', 'when', 'where', 'why', 'can', 'my', 'me', 'us', 'if', 'so', 'not',
  'no', 'yes',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function loadAllMarkdown(dir: string, root: string): Doc[] {
  const out: Doc[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;          // skip .obsidian etc.
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      out.push(...loadAllMarkdown(full, root));
    } else if (entry.endsWith('.md')) {
      const content = readFileSync(full, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : entry.replace(/\.md$/, '');
      const termFreq = new Map<string, number>();
      for (const tok of tokenize(content)) {
        termFreq.set(tok, (termFreq.get(tok) ?? 0) + 1);
      }
      out.push({ path: relative(root, full), title, content, termFreq });
    }
  }
  return out;
}

function ensureLoaded(): { docs: Doc[]; docFreq: Map<string, number> } {
  if (docs && docFreq) return { docs, docFreq };
  try {
    docs = loadAllMarkdown(DOCS_ROOT, DOCS_ROOT);
  } catch (err) {
    // Docs folder missing in some envs (production image may not include it) —
    // RAG just returns nothing in that case.
    docs = [];
  }
  docFreq = new Map();
  for (const doc of docs) {
    for (const term of doc.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  return { docs, docFreq };
}

export interface RagSnippet {
  path: string;
  title: string;
  excerpt: string;     // ~500 char window around the best match
  score: number;
}

export function searchDocs(query: string, topK = 4): RagSnippet[] {
  const { docs, docFreq } = ensureLoaded();
  if (docs.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const totalDocs = docs.length;
  const scored = docs.map((doc) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.termFreq.get(term) ?? 0;
      if (tf === 0) continue;
      const df = docFreq.get(term) ?? 1;
      const idf = Math.log(totalDocs / df);
      score += tf * idf;
    }
    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map(({ doc, score }) => ({
      path: doc.path,
      title: doc.title,
      excerpt: extractExcerpt(doc.content, queryTerms),
      score,
    }));
}

function extractExcerpt(content: string, terms: string[]): string {
  const lower = content.toLowerCase();
  let bestStart = 0;
  let bestHits = 0;
  const windowSize = 600;
  // Slide a window in 200-char steps; pick the window with the most term hits
  for (let i = 0; i < content.length; i += 200) {
    const window = lower.substring(i, i + windowSize);
    let hits = 0;
    for (const term of terms) {
      if (window.includes(term)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestStart = i;
    }
  }
  let excerpt = content.substring(bestStart, bestStart + windowSize).trim();
  if (bestStart > 0) excerpt = '… ' + excerpt;
  if (bestStart + windowSize < content.length) excerpt = excerpt + ' …';
  return excerpt;
}

/** Stable summary block for prompt caching — call once per request. */
export function formatSnippetsForPrompt(snippets: RagSnippet[]): string {
  if (snippets.length === 0) return '';
  const sections = snippets.map(
    (s, i) => `## [${i + 1}] ${s.title} (${s.path})\n\n${s.excerpt}`,
  );
  return `<docs>\nThe following excerpts from runQ documentation may be relevant.\n\n${sections.join('\n\n---\n\n')}\n</docs>`;
}
