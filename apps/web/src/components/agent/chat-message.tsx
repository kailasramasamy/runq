import { Bot, User, Loader2, Database } from 'lucide-react';
import type { ChatMessage, ToolCall } from '@/hooks/use-agent-chat';

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold** and [link text](url)
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    if (match[1]) {
      // Bold
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[1]}
        </strong>,
      );
    } else if (match[2] && match[3]) {
      // Link — use <a> for internal navigation
      parts.push(
        <a
          key={key++}
          href={match[3]}
          className="font-medium text-indigo-600 underline decoration-indigo-300 hover:text-indigo-700 dark:text-indigo-400 dark:decoration-indigo-700 dark:hover:text-indigo-300"
        >
          {match[2]}
        </a>,
      );
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

type Block =
  | { type: 'blank' }
  | { type: 'bullet'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Group lines into semantic blocks so tables are parsed as single units. */
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Table detection: current line looks like | ... | and next line is a separator
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableCells(trimmed);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length) {
        const row = lines[i].trim();
        if (!row.startsWith('|') || !row.endsWith('|')) break;
        rows.push(parseTableCells(row));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (!trimmed) {
      blocks.push({ type: 'blank' });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'bullet', text: trimmed.slice(2) });
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'heading', text: trimmed.slice(4) });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'heading', text: trimmed.slice(3) });
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      blocks.push({ type: 'heading', text: trimmed.slice(2, -2).replace(/:$/, '') });
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
    i++;
  }

  return blocks;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  // Detect numeric columns (right-align amounts)
  const isNumeric = headers.map((_, colIdx) =>
    rows.length > 0 && rows.every((row) => /^[₹\d,.\-\s]+[LCr]*$/.test(row[colIdx]?.trim() ?? '')),
  );

  return (
    <div className="-mx-1 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
            {headers.map((h, j) => (
              <th
                key={j}
                className={`px-2.5 py-1.5 font-medium text-zinc-500 dark:text-zinc-400 ${isNumeric[j] ? 'text-right' : 'text-left'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-2.5 py-1.5 ${isNumeric[ci] ? 'text-right tabular-nums' : 'text-left'}`}
                >
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownContent({ text }: { text: string }) {
  const blocks = parseBlocks(text);

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'blank':
            return <div key={i} className="h-1" />;
          case 'bullet':
            return (
              <div key={i} className="flex gap-2 pl-1">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                <p className="text-sm leading-relaxed">{renderInline(block.text)}</p>
              </div>
            );
          case 'heading':
            return (
              <p key={i} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 pt-1">
                {block.text}
              </p>
            );
          case 'table':
            return <DataTable key={i} headers={block.headers} rows={block.rows} />;
          case 'paragraph':
            return (
              <p key={i} className="text-sm leading-relaxed">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

function ToolCallIndicator({ toolCall }: { toolCall: ToolCall }) {
  const label = toolCall.name.replace(/_/g, ' ').replace(/^get /, '').replace(/^search /, 'Searching ');
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
      {toolCall.status === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Database className="h-3 w-3" />
      )}
      <span>{toolCall.status === 'running' ? `Looking up ${label}...` : toolCall.summary ?? label}</span>
    </div>
  );
}

export function ChatMessageBubble({ message, onFollowUp }: { message: ChatMessage; onFollowUp?: (text: string) => void }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white">
          {message.content}
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
          <User className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <Bot className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
      </div>
      <div className="max-w-[85%] space-y-2">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc, i) => (
              <ToolCallIndicator key={i} toolCall={tc} />
            ))}
          </div>
        )}
        {message.content && (
          <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <MarkdownContent text={message.content} />
          </div>
        )}
        {message.isStreaming && !message.content && (!message.toolCalls || message.toolCalls.length === 0) && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        )}
        {message.followUps && message.followUps.length > 0 && !message.isStreaming && onFollowUp && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {message.followUps.map((fu) => (
              <button
                key={fu}
                type="button"
                onClick={() => onFollowUp(fu)}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-600 transition-colors hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:border-indigo-600"
              >
                {fu}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
