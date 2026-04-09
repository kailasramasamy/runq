import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { CogmComponent } from '@/hooks/queries/use-items';

// Generic suggested cost components — industry-neutral one-click presets
// that cover the most common cost line items across manufacturing,
// trading, retail, and construction. Click adds a row with a 0 amount.
const SUGGESTED_COMPONENTS = [
  'Purchase cost (vendor)',
  'Raw material',
  'Inbound freight',
  'Direct labour',
  'Overhead',
  'Packaging',
  'Utilities (power, water)',
  'Storage',
  'Quality testing',
  'Wastage / shrinkage',
  'Outbound logistics',
];

export function CogmBreakdownCard({
  rows,
  total,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: CogmComponent[];
  total: number;
  onAdd: (label?: string) => void;
  onUpdate: (i: number, patch: Partial<CogmComponent>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Card>
      <CardHeader title="Cost Breakdown — build your cost per unit line by line" />
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Add every cost that goes into one finished unit. Total auto-fills the
          Cost Price input above and is saved with the item, so next time you
          open this page you see exactly how you arrived at the number.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <Hd>Component</Hd>
                <Hd className="w-32 text-right">Amount (₹)</Hd>
                <Hd>Note</Hd>
                <Hd className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-zinc-400">
                    No components yet. Click a suggestion below or "Add component" to start.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-2 py-1.5">
                    <input
                      className={CELL}
                      value={row.label}
                      onChange={(e) => onUpdate(i, { label: e.target.value })}
                      placeholder="e.g. Raw material @ ₹42/unit"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      className={`${CELL} text-right font-mono`}
                      value={row.amount || ''}
                      onChange={(e) => onUpdate(i, { amount: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={CELL}
                      value={row.note ?? ''}
                      onChange={(e) => onUpdate(i, { note: e.target.value })}
                      placeholder="optional"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      aria-label="Remove component"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <td className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                    Total Cost
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {formatINR(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onAdd()}>
            <Plus size={14} /> Add component
          </Button>
          <span className="text-xs text-zinc-400">Quick add:</span>
          {SUGGESTED_COMPONENTS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onAdd(label)}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300"
            >
              + {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const CELL =
  'w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800';

function Hd({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
