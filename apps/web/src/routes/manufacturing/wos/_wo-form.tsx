import { useState, useEffect } from 'react';
import { Factory } from 'lucide-react';
import {
  Button, Input, Combobox, Card, CardHeader, CardContent,
} from '@/components/ui';
import { useBoms, useBom } from '@/hooks/queries/use-boms';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import type { WorkOrderWithDetail } from '@runq/types';
import type { CreateWorkOrderInput } from '@runq/validators';

const SHIFT_OPTIONS = [
  { value: '', label: 'No shift' },
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
  { value: 'NIGHT', label: 'Night' },
];

interface WoFormProps {
  initial?: WorkOrderWithDetail;
  onSubmit: (data: CreateWorkOrderInput) => void;
  isLoading?: boolean;
}

export function WoForm({ initial, onSubmit, isLoading }: WoFormProps) {
  const [bomId, setBomId] = useState(initial?.bomId ?? '');
  const [plannedQty, setPlannedQty] = useState(String(initial?.plannedQty ?? ''));
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? '');
  const [shift, setShift] = useState(initial?.shift ?? '');
  const [scheduledFor, setScheduledFor] = useState(initial?.scheduledFor ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: bomsData } = useBoms({ isActive: true, limit: 200 });
  const { data: bomDetail } = useBom(bomId);
  const { data: warehousesData } = useWarehouses();

  const bomOptions = [
    { value: '', label: 'Select active BOM…' },
    ...(bomsData?.data?.map((b) => ({
      value: b.id,
      label: `${b.bomCode} — ${b.name}`,
    })) ?? []),
  ];

  // useWarehouses returns Warehouse[] directly (unwrapped by inventory hook)
  const warehouses = Array.isArray(warehousesData) ? warehousesData : [];
  const warehouseOptions = [
    { value: '', label: 'Select warehouse…' },
    ...warehouses.filter((w) => w.isActive).map((w) => ({
      value: w.id,
      label: w.name,
    })),
  ];

  const bom = bomDetail?.data;
  const outputPreview =
    bom && plannedQty
      ? `Will produce ${plannedQty} ${bom.outputUom} of ${bom.outputItemName}`
      : null;

  // Reset planned qty when BOM changes
  useEffect(() => {
    if (!initial && bomId) setPlannedQty('');
  }, [bomId, initial]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!bomId) errs.bomId = 'BOM is required';
    if (!plannedQty || Number(plannedQty) <= 0) errs.plannedQty = 'Planned qty must be positive';
    if (!warehouseId) errs.warehouseId = 'Warehouse is required';
    if (!scheduledFor) errs.scheduledFor = 'Scheduled date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      bomId,
      plannedQty: Number(plannedQty),
      warehouseId,
      shift: shift || null,
      scheduledFor,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader title="Work order details" />
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                BOM (active only) *
              </label>
              <Combobox
                options={bomOptions}
                value={bomId}
                onChange={setBomId}
                placeholder="Search BOM…"
              />
              {errors.bomId && <p className="mt-1 text-[11px] text-red-500">{errors.bomId}</p>}
            </div>

            {outputPreview && (
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
                style={{
                  background: 'rgba(225, 29, 72, 0.06)',
                  borderColor: 'rgba(225, 29, 72, 0.20)',
                  color: '#be123c',
                }}
              >
                <Factory size={14} />
                {outputPreview}
                {bom && bom.lines.length > 0 && ` using ${bom.lines.length} input lines`}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Planned qty *
                </label>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                  placeholder="e.g. 100"
                  error={errors.plannedQty}
                />
                {errors.plannedQty && <p className="mt-1 text-[11px] text-red-500">{errors.plannedQty}</p>}
                {bom && plannedQty && Number(plannedQty) > 0 && (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    = {plannedQty} {bom.outputUom} of {bom.outputItemName}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Scheduled date *
                </label>
                <Input
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  error={errors.scheduledFor}
                />
                {errors.scheduledFor && <p className="mt-1 text-[11px] text-red-500">{errors.scheduledFor}</p>}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Warehouse *
                </label>
                <Combobox
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="Select warehouse…"
                />
                {errors.warehouseId && <p className="mt-1 text-[11px] text-red-500">{errors.warehouseId}</p>}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Shift
                </label>
                <Combobox
                  options={SHIFT_OPTIONS}
                  value={shift}
                  onChange={setShift}
                  placeholder="No shift"
                />
              </div>
            </div>

            {bom && plannedQty && Number(plannedQty) > 0 && bom.lines.length > 0 && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Expected inputs
                </p>
                <ul className="space-y-1">
                  {bom.lines.map((l) => {
                    const expected = Number(l.qtyPerOutput) * Number(plannedQty) * (1 + Number(l.scrapPct) / 100);
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span>{l.inputItemId}</span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--text-2)' }}>
                          {expected.toFixed(3)} {l.inputUom}
                          {l.scrapPct > 0 && (
                            <span className="ml-1 text-[10px] text-amber-600">(+{l.scrapPct}% scrap)</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" loading={isLoading}>
          {initial ? 'Save work order' : 'Create work order'}
        </Button>
      </div>
    </form>
  );
}
