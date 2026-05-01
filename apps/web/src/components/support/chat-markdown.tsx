import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  inverted?: boolean;       // user-side bubbles need different colors
}

/**
 * Compact markdown renderer for chat bubbles. Smaller margins than the
 * full-page MarkdownRenderer in components/help — designed to read well
 * inside a 480px-wide bubble.
 *
 * Supports: bold, italic, inline code, code blocks, bulleted/numbered lists,
 * links, headings (rendered as h4-equivalent), and tables (via remark-gfm).
 */
export function ChatMarkdown({ content, inverted = false }: Props) {
  const muted = inverted ? 'text-indigo-100' : 'text-zinc-500 dark:text-zinc-400';
  const linkColor = inverted ? 'text-indigo-100 underline' : 'text-indigo-600 dark:text-indigo-400 underline';
  const codeBg = inverted ? 'bg-indigo-700/40' : 'bg-zinc-200 dark:bg-zinc-700';
  const codeBlockBg = inverted ? 'bg-indigo-900/50' : 'bg-zinc-50 dark:bg-zinc-900/60';

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className={linkColor}>
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
        h2: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
        h3: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
        h4: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');
          if (isBlock) {
            return (
              <pre className={`my-2 overflow-x-auto rounded ${codeBlockBg} p-2 text-xs`}>
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className={`rounded px-1 py-0.5 text-xs ${codeBg}`}>{children}</code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className={`my-2 border-l-2 pl-2 italic ${muted}`}>{children}</blockquote>
        ),
        hr: () => <hr className="my-2 border-current opacity-20" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b px-1.5 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b border-current/10 px-1.5 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
