import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from '@tanstack/react-router';

interface Props {
  content: string;
}

/**
 * Renders user-guide markdown with Tailwind styling that matches the runQ UI.
 *
 * Cross-doc links inside docs/user-guide are rewritten to in-app /help routes,
 * so clicking "Recipe 03 →" in the README jumps to /help/recipes/03-create-invoice
 * instead of opening a new tab to the file.
 */
export function MarkdownRenderer({ content }: Props) {
  return (
    <article className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-4 text-zinc-700 dark:text-zinc-300">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-4 ml-5 list-disc space-y-1 text-zinc-700 dark:text-zinc-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 ml-5 list-decimal space-y-1 text-zinc-700 dark:text-zinc-300">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code
                  className="block text-xs text-zinc-800 dark:text-zinc-100"
                  style={{ fontFamily: '"Menlo", "Consolas", "DejaVu Sans Mono", "Liberation Mono", monospace' }}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800 leading-snug dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              style={{ fontFamily: '"Menlo", "Consolas", "DejaVu Sans Mono", "Liberation Mono", monospace' }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-indigo-400 bg-indigo-50/40 px-4 py-2 text-zinc-700 dark:border-indigo-700 dark:bg-indigo-950/20 dark:text-zinc-300">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            const inAppHref = rewriteHelpLink(href ?? '');
            if (inAppHref) {
              return (
                <Link
                  to={inAppHref as '/help'}
                  className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-50 dark:bg-zinc-900">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-zinc-200 px-3 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {children}
            </td>
          ),
          hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-800" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

/**
 * Rewrite a markdown link to an in-app /help route if it points to another
 * user-guide doc. Returns null for external/non-help links.
 */
function rewriteHelpLink(href: string): string | null {
  if (!href) return null;
  if (/^https?:/i.test(href)) return null;
  // Strip leading ./ or ../
  const cleaned = href.replace(/^\.\//, '').replace(/^\.\.\//, '');
  // Strip any anchor fragment
  const [pathPart, anchor] = cleaned.split('#');
  // Match: README.md, day-in-life.md, recipes/NN-name.md
  const m = pathPart.match(/^(?:recipes\/)?[\w-]+\.md$/);
  if (!m) return null;
  const slug = pathPart.replace(/\.md$/, '');
  if (slug === 'README') return '/help';
  return `/help/${slug}${anchor ? `#${anchor}` : ''}`;
}
