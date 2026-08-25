import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button, Input, Combobox, Card, CardHeader, CardContent,
} from '@/components/ui';
import { useItems } from '@/hooks/queries/use-items';
import type { BomWithLines } from '@runq/types';
import type { CreateBomInput } from '@runq/validators';

/** Pack sizes, units and filler — see mfgSuggestKeyword in the mobile picker,
 *  which uses the same list to seed its input search. */
const GENERIC_WORDS = new Set([
  'ml', 'ltr', 'litre', 'liter', 'kg', 'kgs', 'gm', 'gms', 'gram', 'grams',
  'pcs', 'pack', 'packet', 'pouch', 'bottle', 'box', 'jar', 'tin', 'can',
  'the', 'and', 'with', 'plain', 'pure', 'premium', 'refined', 'fresh',
  'new', 'std', 'standard', 'grade',
]);

/** Distinctive word of an item name — the longest one that isn't filler.
 *  In FMCG naming the ingredient outruns the form ("mustard" > "oil"). */
function suggestKeyword(itemName: string | undefined): string | null {
  const words = (itemName ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
  if (words.length === 0) return null;
  return words.sort((a, b) => b.length - a.length)[0];
}

interface BomLineField {
  inputItemId: string;
  qtyPerOutput: string;
  inputUom: string;
  scrapPct: string;
  isOptional: boolean;
  notes: string;
}

interface BomFormProps {
  initial?: BomWithLines;
  onSubmit: (data: CreateBomInput) => void;
  isLoading?: boolean;
}

const UOM_OPTIONS = [
  'kg', 'g', 'mg', 'L', 'mL', 'pcs', 'box', 'bag', 'pack', 'unit',
  'dozen', 'tonne', 'nos', 'set',
].map((u) => ({ value: u, label: u }));

/** Build a UOM option list with the picked item's stocking unit pinned at
 *  the top — so a recipe stated per "500ml pouch" or "400g pack" is one
 *  click instead of typing the custom unit each time. */
function uomOptionsFor(unit: string | null | undefined) {
  if (unit && !UOM_OPTIONS.some((o) => o.value === unit)) {
    return [{ value: unit, label: `${unit} (item unit)` }, ...UOM_OPTIONS];
  }
  return UOM_OPTIONS;
}

function emptyLine(): BomLineField {
  return {
    inputItemId: '',
    qtyPerOutput: '',
    inputUom: '',
    scrapPct: '0',
    isOptional: false,
    notes: '',
  };
}

export function BomForm({ initial, onSubmit, isLoading }: BomFormProps) {
  const [bomCode, setBomCode] = useState(initial?.bomCode ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [outputItemId, setOutputItemId] = useState(initial?.outputItemId ?? '');
  // Default to 1 on a new BOM — most recipes are stated "per 1 finished
  // unit". The WO scales components by wo.qty / bom.outputQty, so this is
  // the recipe's reference batch size, not a production target.
  const [outputQty, setOutputQty] = useState(String(initial?.outputQty ?? '1'));
  const [outputUom, setOutputUom] = useState(initial?.outputUom ?? '');
  // Pre-fill output UOM from the picked item's stocking unit. User can
  // override — e.g. an item stocked in "pouch" with a recipe sized per mL.
  function handleOutputItemChange(value: string) {
    setOutputItemId(value);
    const picked = outputItemsData?.data?.find((i) => i.id === value);
    if (picked?.unit && !outputUom) setOutputUom(picked.unit);
  }
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [allowAutoRepack, setAllowAutoRepack] = useState(initial?.allowAutoRepack ?? false);
  const [lines, setLines] = useState<BomLineField[]>(
    initial?.lines?.length
      ? initial.lines.map((l) => ({
          inputItemId: l.inputItemId,
          qtyPerOutput: String(l.qtyPerOutput),
          inputUom: l.inputUom,
          scrapPct: String(l.scrapPct),
          isOptional: l.isOptional,
          notes: l.notes ?? '',
        }))
      : [emptyLine()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Output items: the finished_good / semi_finished bucket.
  //
  // Input items: the 'bom_inputs' bucket — raw material, packaging, consumables
  // and semi-finished. Semi-finished stays in because a second-stage recipe
  // consumes exactly that (including the unlabelled pool behind a made-on-demand
  // SKU), which the narrower 'inputs' group hid. Finished and trading goods are
  // sold as-is and only clutter the list.
  const { data: outputItemsData } = useItems({
    limit: 500,
    type: 'product',
    itemClassGroup: 'finished',
  });
  const { data: inputItemsData } = useItems({
    limit: 500,
    type: 'product',
    itemClassGroup: 'bom_inputs',
  });
  const outputItemOptions = (outputItemsData?.data ?? []).map((i) => ({
    value: i.id,
    label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
  }));
  // Picked items — used to render the static UOM suffix on yield + line qty.
  const pickedOutputItem = outputItemsData?.data?.find((i) => i.id === outputItemId);
  const pickedInputItem = (inputItemId: string) =>
    inputItemsData?.data?.find((i) => i.id === inputItemId);

  // Pre-fill line UOM from the picked item's stocking unit (the common
  // case). User can still override the dropdown to record components in a
  // different unit (e.g. raw milk item stocked in L, recipe written in mL).
  function handleInputItemChange(idx: number, value: string) {
    updateLine(idx, 'inputItemId', value);
    const picked = pickedInputItem(value);
    if (picked?.unit && !lines[idx]?.inputUom) updateLine(idx, 'inputUom', picked.unit);
  }
  // Float items sharing the output's distinctive word to the top — a
  // mustard-oil recipe consumes mustard something. Ranked, never filtered:
  // the bottle, cap and label share no word with the oil but are just as
  // much a part of the recipe, so nothing is ever hidden from the list.
  const inputKeyword = suggestKeyword(pickedOutputItem?.name);
  const matchesKeyword = (i: { name: string; sku?: string | null }) =>
    inputKeyword !== null &&
    (i.name.toLowerCase().includes(inputKeyword) ||
      (i.sku ?? '').toLowerCase().includes(inputKeyword));
  const rankedInputItems = [...(inputItemsData?.data ?? [])].sort(
    (a, b) => Number(matchesKeyword(b)) - Number(matchesKeyword(a)),
  );
  const suggestionActive = rankedInputItems.some(matchesKeyword);
  const inputItemOptions = [
    { value: '', label: 'Select item…' },
    ...rankedInputItems.map((i) => ({
      value: i.id,
      label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
    })),
  ];

  function updateLine(idx: number, field: keyof BomLineField, value: string | boolean) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!initial && !bomCode.trim()) errs.bomCode = 'BOM code is required';
    if (!name.trim()) errs.name = 'Name is required';
    if (!outputItemId) errs.outputItemId = 'Output item is required';
    if (!outputQty || Number(outputQty) <= 0) errs.outputQty = 'Yield per batch must be positive';
    if (!outputUom.trim()) errs.outputUom = 'UOM is required';
    if (lines.length === 0) errs.lines = 'At least one input line is required';
    lines.forEach((l, i) => {
      if (!l.inputItemId) errs[`line_${i}_item`] = 'Item required';
      if (!l.qtyPerOutput || Number(l.qtyPerOutput) <= 0) errs[`line_${i}_qty`] = 'Qty required';
      if (!l.inputUom.trim()) errs[`line_${i}_uom`] = 'UOM required';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      ...(initial ? {} : { bomCode: bomCode.trim().toUpperCase() }),
      name: name.trim(),
      outputItemId,
      outputQty: Number(outputQty),
      outputUom: outputUom.trim(),
      allowAutoRepack,
      effectiveFrom: effectiveFrom || null,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        inputItemId: l.inputItemId,
        qtyPerOutput: Number(l.qtyPerOutput),
        inputUom: l.inputUom.trim(),
        scrapPct: Number(l.scrapPct) || 0,
        isOptional: l.isOptional,
        notes: l.notes.trim() || null,
      })),
    } as CreateBomInput);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader title="BOM details" />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!initial && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  BOM code *
                </label>
                <Input
                  value={bomCode}
                  onChange={(e) => setBomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. BOM-PANEER-1KG"
                  error={errors.bomCode}
                />
                {errors.bomCode && <p className="mt-1 text-[11px] text-red-500">{errors.bomCode}</p>}
              </div>
            )}
            <div className={initial ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Paneer 1KG Recipe"
                error={errors.name}
              />
              {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name}</p>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Output item *
              </label>
              <Combobox
                options={outputItemOptions}
                value={outputItemId}
                onChange={handleOutputItemChange}
                placeholder="Search finished good…"
              />
              {errors.outputItemId && <p className="mt-1 text-[11px] text-red-500">{errors.outputItemId}</p>}
            </div>
            <div className="sm:col-span-4">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Unit size *
              </label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value)}
                error={errors.outputQty}
              />
              {errors.outputQty && <p className="mt-1 text-[11px] text-red-500">{errors.outputQty}</p>}
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                UOM *
              </label>
              <Combobox
                options={uomOptionsFor(pickedOutputItem?.unit)}
                value={outputUom}
                onChange={setOutputUom}
                placeholder="mL, kg, pcs…"
              />
              {errors.outputUom && <p className="mt-1 text-[11px] text-red-500">{errors.outputUom}</p>}
            </div>
            <div className="sm:col-span-12 -mt-2">
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                One unit of {pickedOutputItem?.name ?? 'the output'} is this much (e.g. <em>500 mL</em>, <em>1 kg</em>, <em>1 pouch</em>).
                Components below are stated per this unit; work orders scale them by <code>wo.qty ÷ this</code>.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Effective from
              </label>
              <Input
                type="date"
                value={effectiveFrom ?? ''}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Notes
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this BOM"
              />
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-zinc-300"
              checked={allowAutoRepack}
              onChange={(e) => setAllowAutoRepack(e.target.checked)}
            />
            <span className="flex-1">
              <span className="block text-[12.5px] font-medium">
                Make on demand at dispatch
              </span>
              <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-3)' }}>
                For products that are only branded when they ship. The output
                keeps no stock of its own — a delivery note that is short runs
                this recipe on the spot, drawing its components, then sends what
                it just made. Leave off unless the labelling decision really is
                taken on the loading bay.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Input lines"
          action={
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus size={12} className="mr-1" /> Add line
            </Button>
          }
        />
        <CardContent className="p-0">
          {suggestionActive && (
            <p className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Items matching “{inputKeyword}” are listed first — packaging and
              other inputs are still in the list below them.
            </p>
          )}
          {errors.lines && (
            <p className="px-4 py-2 text-[11px] text-red-500">{errors.lines}</p>
          )}
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 p-3 items-end">
                <div className="col-span-12 sm:col-span-4">
                  {idx === 0 && (
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Input item *
                    </label>
                  )}
                  <Combobox
                    options={inputItemOptions}
                    value={line.inputItemId}
                    onChange={(v) => handleInputItemChange(idx, v)}
                    placeholder="Search input item…"
                  />
                  {errors[`line_${idx}_item`] && (
                    <p className="mt-0.5 text-[10px] text-red-500">{errors[`line_${idx}_item`]}</p>
                  )}
                </div>
                <div className="col-span-5 sm:col-span-2">
                  {idx === 0 && (
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Qty per unit *
                    </label>
                  )}
                  <Input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={line.qtyPerOutput}
                    onChange={(e) => updateLine(idx, 'qtyPerOutput', e.target.value)}
                    placeholder="0"
                    error={errors[`line_${idx}_qty`]}
                  />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  {idx === 0 && (
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      UOM *
                    </label>
                  )}
                  <Combobox
                    options={uomOptionsFor(pickedInputItem(line.inputItemId)?.unit)}
                    value={line.inputUom}
                    onChange={(v) => updateLine(idx, 'inputUom', v)}
                    placeholder="UOM"
                  />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  {idx === 0 && (
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Scrap %
                    </label>
                  )}
                  <Input
                    type="number"
                    min="0"
                    max="99.99"
                    step="0.01"
                    value={line.scrapPct}
                    onChange={(e) => updateLine(idx, 'scrapPct', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="col-span-1 sm:col-span-1 flex items-end justify-end">
                  {idx === 0 && <div className="mb-1 h-4" />}
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded p-1 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
                    style={{ color: 'var(--text-3)' }}
                    disabled={lines.length === 1}
                    title="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" loading={isLoading}>
          {initial ? 'Save BOM' : 'Create BOM'}
        </Button>
      </div>
    </form>
  );
}
