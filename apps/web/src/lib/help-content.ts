/**
 * Help content loader.
 *
 * Bundles every markdown file under `docs/user-guide/` at build time via Vite's
 * `import.meta.glob`. The single source of truth lives in the docs/ directory —
 * editing those files updates both the repo docs and the in-app help.
 */

// eager: true → bundled into the JS, no runtime fetch
// query: '?raw' → import as a string instead of an ES module
const rawModules = import.meta.glob('../../../../docs/user-guide/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface HelpTopic {
  /** URL slug — used in /help/$slug routes */
  slug: string;
  /** H1 title pulled from the first markdown heading */
  title: string;
  /** Short summary pulled from the first paragraph */
  summary: string;
  /** Raw markdown body */
  content: string;
  /** Group label for the sidebar */
  group: 'guide' | 'setup' | 'ar' | 'ap' | 'banking' | 'export';
  /** Sort order within group */
  order: number;
}

const SLUG_OVERRIDES: Record<string, { group: HelpTopic['group']; order: number }> = {
  'README': { group: 'guide', order: 0 },
  'day-in-life': { group: 'guide', order: 1 },
  'recipes/01-setup-company': { group: 'setup', order: 1 },
  'recipes/02-add-customer': { group: 'setup', order: 2 },
  'recipes/05-add-vendor': { group: 'setup', order: 3 },
  'recipes/03-create-invoice': { group: 'ar', order: 1 },
  'recipes/04-record-customer-payment': { group: 'ar', order: 2 },
  'recipes/10-view-ar-aging': { group: 'ar', order: 3 },
  'recipes/06-enter-vendor-bill': { group: 'ap', order: 1 },
  'recipes/07-pay-vendor-bill': { group: 'ap', order: 2 },
  'recipes/08-import-bank-statement': { group: 'banking', order: 1 },
  'recipes/09-reconcile-bank': { group: 'banking', order: 2 },
  'recipes/12-bank-reconciliation-auto': { group: 'banking', order: 3 },
  'recipes/11-export-to-tally': { group: 'export', order: 1 },
};

function pathToSlug(filePath: string): string {
  // ../../../../docs/user-guide/recipes/03-create-invoice.md → recipes/03-create-invoice
  const match = filePath.match(/docs\/user-guide\/(.+)\.md$/);
  if (!match) return '';
  return match[1];
}

function extractTitle(md: string): string {
  const h1 = md.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : 'Untitled';
}

function extractSummary(md: string): string {
  // Find first paragraph after the H1 — skip blockquotes used as metadata
  const lines = md.split('\n');
  let inBody = false;
  for (const line of lines) {
    if (line.startsWith('# ')) {
      inBody = true;
      continue;
    }
    if (!inBody) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('>') || trimmed.startsWith('---')) continue;
    // Strip basic markdown
    return trimmed
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .slice(0, 160);
  }
  return '';
}

const topics: HelpTopic[] = Object.entries(rawModules)
  .map(([filePath, content]): HelpTopic | null => {
    const slug = pathToSlug(filePath);
    if (!slug) return null;
    const override = SLUG_OVERRIDES[slug];
    if (!override) return null;
    return {
      slug,
      title: extractTitle(content),
      summary: extractSummary(content),
      content,
      group: override.group,
      order: override.order,
    };
  })
  .filter((t): t is HelpTopic => t !== null)
  .sort((a, b) => a.order - b.order);

const topicsBySlug = new Map(topics.map((t) => [t.slug, t]));

export function getAllTopics(): HelpTopic[] {
  return topics;
}

export function getTopicsByGroup(group: HelpTopic['group']): HelpTopic[] {
  return topics.filter((t) => t.group === group);
}

export function getTopic(slug: string): HelpTopic | undefined {
  return topicsBySlug.get(slug);
}

export const GROUP_LABELS: Record<HelpTopic['group'], string> = {
  guide: 'Start Here',
  setup: 'Setup',
  ar: 'Money In (AR)',
  ap: 'Money Out (AP)',
  banking: 'Banking',
  export: 'CA Handoff',
};

export const GROUP_ORDER: HelpTopic['group'][] = ['guide', 'setup', 'ar', 'ap', 'banking', 'export'];
