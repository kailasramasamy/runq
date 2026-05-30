import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button, Input, Combobox, Card, CardHeader, CardContent,
} from '@/components/ui';
import { useItems } from '@/hooks/queries/use-items';
import type { BomWithLines } from '@runq/types';
import type { CreateBomInput } from '@runq/validators';

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
  showVersionWarn?: boolean;
}

const UOM_OPTIONS = [
  'kg', 'g', 'mg', 'L', 'mL', 'pcs', 'box', 'bag', 'pack', 'unit',
  'dozen', 'tonne', 'nos', 'set',
].map((u) => ({ value: u, label: u }));

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

export function BomForm({ initial, onSubmit, isLoading, showVersionWarn }: BomFormProps) {
  const [bomCode, setBomCode] = useState(initial?.bomCode ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [outputItemId, setOutputItemId] = useState(initial?.outputItemId ?? '');
  const [outputQty, setOutputQty] = useState(String(initial?.outputQty ?? ''));
  const [outputUom, setOutputUom] = useState(initial?.outputUom ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
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

  // Output items: finished_good / semi_finished bucket. Inputs: raw_material /
  // packaging / consumable. Pre-filtering keeps each combobox short and on-task.
  const { data: outputItemsData } = useItems({
    limit: 500,
    type: 'product',
    itemClassGroup: 'finished',
  });
  const { data: inputItemsData } = useItems({
    limit: 500,
    type: 'product',
    itemClassGroup: 'inputs',
  });
  const outputItemOptions = (outputItemsData?.data ?? []).map((i) => ({
    value: i.id,
    label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
  }));
  const inputItemOptions = [
    { value: '', label: 'Select item…' },
    ...(inputItemsData?.data ?? []).map((i) => ({
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
    if (!outputQty || Number(outputQty) <= 0) errs.outputQty = 'Output qty must be positive';
    if (!outputUom.trim()) errs.outputUom = 'Output UOM is required';
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
      {showVersionWarn && (
        <div
          className="rounded-lg border px-4 py-3 text-[12.5px]"
          style={{
            background: 'rgba(234, 88, 12, 0.08)',
            borderColor: 'rgba(234, 88, 12, 0.30)',
            color: '#c2410c',
          }}
        >
          <strong>Note:</strong> Editing a BOM that has work orders referencing it will automatically create a new version. Existing work orders will keep their current snapshot.
        </div>
      )}

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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Output item *
              </label>
              <Combobox
                options={outputItemOptions}
                value={outputItemId}
                onChange={setOutputItemId}
                placeholder="Search finished good…"
              />
              {errors.outputItemId && <p className="mt-1 text-[11px] text-red-500">{errors.outputItemId}</p>}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Output qty *
              </label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value)}
                placeholder="1.000"
                error={errors.outputQty}
              />
              {errors.outputQty && <p className="mt-1 text-[11px] text-red-500">{errors.outputQty}</p>}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Output UOM *
              </label>
              <Combobox
                options={UOM_OPTIONS}
                value={outputUom}
                onChange={setOutputUom}
                placeholder="kg, L, pcs…"
              />
              {errors.outputUom && <p className="mt-1 text-[11px] text-red-500">{errors.outputUom}</p>}
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
                    onChange={(v) => updateLine(idx, 'inputItemId', v)}
                    placeholder="Search input item…"
                  />
                  {errors[`line_${idx}_item`] && (
                    <p className="mt-0.5 text-[10px] text-red-500">{errors[`line_${idx}_item`]}</p>
                  )}
                </div>
                <div className="col-span-5 sm:col-span-2">
                  {idx === 0 && (
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Qty / output *
                    </label>
                  )}
                  <Input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={line.qtyPerOutput}
                    onChange={(e) => updateLine(idx, 'qtyPerOutput', e.target.value)}
                    placeholder="1.0000"
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
                    options={UOM_OPTIONS}
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
