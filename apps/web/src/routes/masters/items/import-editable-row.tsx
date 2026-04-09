import { Trash2 } from 'lucide-react';
import type { ExtractedItem } from '@/hooks/queries/use-items';
import type { ItemAttributeField } from '@runq/types';

const CELL = 'w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800';
const NUM_CELL = `${CELL} text-right font-mono`;

/**
 * Fixed column headers (everything non-catalogue). Schema-driven
 * attribute headers are appended at call-time. The trailing empty
 * header is the delete-button cell.
 */
const FIXED_HEADERS = [
  'Name',
  'SKU',
  'EAN',
  'Type',
  'HSN/SAC',
  'Unit',
  'Sell',
  'Purchase',
  'MRP',
  'Cost',
  'GST%',
  'Margin%',
  'Category',
] as const;

/**
 * Build the review table headers for a given attribute schema. Used by
 * the import page so the preview shows attribute columns that match
 * what the tenant actually configured.
 */
export function buildReviewHeaders(schema: ItemAttributeField[]): string[] {
  // Limit to 3 attribute columns so the horizontal scroll stays sane —
  // the remaining attributes are still extracted, they just aren't
  // editable in the preview. Power users can fix them after import on
  // the item detail page.
  const attrHeaders = schema
    .filter((f) => f.type !== 'textarea')
    .slice(0, 3)
    .map((f) => f.label);
  return [...FIXED_HEADERS, ...attrHeaders, ''];
}

export function EditableRow({
  row,
  index,
  schema,
  onUpdate,
  onDelete,
}: {
  row: ExtractedItem;
  index: number;
  schema: ItemAttributeField[];
  onUpdate: (index: number, patch: Partial<ExtractedItem>) => void;
  onDelete: (index: number) => void;
}) {
  const nameMissing = !row.name.trim();

  const setNum = (key: keyof ExtractedItem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onUpdate(index, { [key]: v === '' ? null : Number(v) } as Partial<ExtractedItem>);
  };
  const setStr = (key: keyof ExtractedItem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onUpdate(index, { [key]: v === '' ? null : v } as Partial<ExtractedItem>);
  };

  // Inline edits to a single attribute key — merge into the row's
  // existing attributes object so other keys aren't clobbered.
  const setAttr = (key: string, field: ItemAttributeField) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const nextAttrs: Record<string, unknown> = { ...(row.attributes ?? {}) };
      if (raw === '') {
        delete nextAttrs[key];
      } else if (field.type === 'number') {
        const n = Number(raw);
        nextAttrs[key] = Number.isFinite(n) ? n : raw;
      } else {
        nextAttrs[key] = raw;
      }
      onUpdate(index, { attributes: Object.keys(nextAttrs).length > 0 ? nextAttrs : null });
    };

  const attributeFields = schema.filter((f) => f.type !== 'textarea').slice(0, 3);

  return (
    <tr className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${nameMissing ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}>
      <td className="px-2 py-1.5">
        <input
          className={`${CELL} font-medium ${nameMissing ? 'border-red-300' : ''}`}
          value={row.name}
          onChange={(e) => onUpdate(index, { name: e.target.value })}
          placeholder="Required"
        />
      </td>
      <td className="px-2 py-1.5">
        <input className={`${CELL} font-mono`} value={row.sku ?? ''} onChange={setStr('sku')} />
      </td>
      <td className="px-2 py-1.5">
        <input className={`${CELL} font-mono`} value={row.ean ?? ''} onChange={setStr('ean')} />
      </td>
      <td className="px-2 py-1.5">
        <select
          className={CELL}
          value={row.type}
          onChange={(e) => onUpdate(index, { type: e.target.value as 'product' | 'service' })}
        >
          <option value="product">Product</option>
          <option value="service">Service</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input className={`${CELL} font-mono`} value={row.hsnSacCode ?? ''} onChange={setStr('hsnSacCode')} />
      </td>
      <td className="px-2 py-1.5">
        <input className={CELL} value={row.unit ?? ''} onChange={setStr('unit')} />
      </td>
      <td className="px-2 py-1.5">
        <input type="number" step="0.01" className={NUM_CELL} value={row.defaultSellingPrice ?? ''} onChange={setNum('defaultSellingPrice')} />
      </td>
      <td className="px-2 py-1.5">
        <input type="number" step="0.01" className={NUM_CELL} value={row.defaultPurchasePrice ?? ''} onChange={setNum('defaultPurchasePrice')} />
      </td>
      <td className="px-2 py-1.5">
        <input type="number" step="0.01" className={NUM_CELL} value={row.mrp ?? ''} onChange={setNum('mrp')} />
      </td>
      <td className="px-2 py-1.5">
        <input type="number" step="0.01" className={NUM_CELL} value={row.costPrice ?? ''} onChange={setNum('costPrice')} />
      </td>
      <td className="px-2 py-1.5">
        <input type="number" step="0.01" className={NUM_CELL} value={row.gstRate ?? ''} onChange={setNum('gstRate')} />
      </td>
      <td className="px-2 py-1.5">
        <input type="number" step="0.01" className={NUM_CELL} value={row.margin ?? ''} onChange={setNum('margin')} />
      </td>
      <td className="px-2 py-1.5">
        <input className={CELL} value={row.category ?? ''} onChange={setStr('category')} />
      </td>
      {attributeFields.map((f) => {
        const val = row.attributes?.[f.key];
        const str = val === null || val === undefined ? '' : String(val);
        return (
          <td key={f.key} className="px-2 py-1.5">
            <input
              className={f.type === 'number' ? NUM_CELL : CELL}
              type={f.type === 'number' ? 'number' : 'text'}
              value={str}
              onChange={setAttr(f.key, f)}
            />
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-right">
        <button
          onClick={() => onDelete(index)}
          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          aria-label="Delete row"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
