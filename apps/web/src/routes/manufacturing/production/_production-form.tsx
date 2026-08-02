/**
 * Top form of the Record Production page — BOM, produced qty, warehouse, and
 * the output batch/scheduling fields. Mirrors the field layout of
 * manufacturing/wos/_wo-form.tsx.
 * Spec: docs/manufacturing-plan.md §5.4.
 */
import { Factory } from 'lucide-react';
import { Input, Combobox, Card, CardHeader, CardContent } from '@/components/ui';
import { useBoms } from '@/hooks/queries/use-boms';
import { useWarehouses, useAutoSelectWarehouse } from '@/hooks/queries/use-inventory';

const SHIFT_OPTIONS = [
  { value: '', label: 'No shift' },
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
  { value: 'NIGHT', label: 'Night' },
];

export interface ProductionFormState {
  bomId: string;
  producedQty: string;
  warehouseId: string;
  batchNo: string;
  expiryDate: string;
  shift: string;
  producedOn: string;
  notes: string;
}

interface Props {
  state: ProductionFormState;
  onChange: (patch: Partial<ProductionFormState>) => void;
  outputTracksBatches: boolean;
  outputLabel: string | null;
  errors: Record<string, string>;
}

export function ProductionForm({ state, onChange, outputTracksBatches, outputLabel, errors }: Props) {
  const { data: bomsData } = useBoms({ isActive: true, limit: 200 });
  const { data: warehousesData } = useWarehouses();
  useAutoSelectWarehouse(state.warehouseId, (id) => onChange({ warehouseId: id }));

  const bomOptions = [
    { value: '', label: 'Select active BOM…' },
    ...(bomsData?.data?.map((b) => ({ value: b.id, label: `${b.bomCode} — ${b.name}` })) ?? []),
  ];
  const warehouses = Array.isArray(warehousesData) ? warehousesData : [];
  const warehouseOptions = [
    { value: '', label: 'Select warehouse…' },
    ...warehouses.filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <Card>
      <CardHeader title="What was produced" />
      <CardContent>
        <div className="space-y-4">
          <Field label="BOM" required error={errors.bomId}>
            <Combobox
              options={bomOptions}
              value={state.bomId}
              onChange={(v) => onChange({ bomId: v })}
              placeholder="Search BOM…"
            />
          </Field>

          {outputLabel && (
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
              style={{ background: 'rgba(225, 29, 72, 0.06)', borderColor: 'rgba(225, 29, 72, 0.20)', color: '#be123c' }}
            >
              <Factory size={14} />
              {outputLabel}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Produced Qty" required error={errors.producedQty}>
              <Input
                type="number" min="0.001" step="0.001"
                value={state.producedQty}
                onChange={(e) => onChange({ producedQty: e.target.value })}
                placeholder="e.g. 100"
                error={errors.producedQty}
              />
            </Field>
            <Field label="Warehouse" required error={errors.warehouseId}>
              <Combobox
                options={warehouseOptions}
                value={state.warehouseId}
                onChange={(v) => onChange({ warehouseId: v })}
                placeholder="Select warehouse…"
              />
            </Field>
            <Field label="Output batch no">
              <Input
                value={state.batchNo}
                onChange={(e) => onChange({ batchNo: e.target.value })}
                placeholder="Auto-generated if left blank"
              />
            </Field>
            {outputTracksBatches && (
              <Field label="Expiry date" required error={errors.expiryDate}>
                <Input
                  type="date"
                  value={state.expiryDate}
                  onChange={(e) => onChange({ expiryDate: e.target.value })}
                  error={errors.expiryDate}
                />
              </Field>
            )}
            <Field label="Shift">
              <Combobox
                options={SHIFT_OPTIONS}
                value={state.shift}
                onChange={(v) => onChange({ shift: v })}
                placeholder="No shift"
              />
            </Field>
            <Field label="Produced on" required error={errors.producedOn}>
              <Input
                type="date"
                value={state.producedOn}
                onChange={(e) => onChange({ producedOn: e.target.value })}
                error={errors.producedOn}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Input
                  value={state.notes}
                  onChange={(e) => onChange({ notes: e.target.value })}
                  placeholder="Optional…"
                />
              </Field>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}{required ? ' *' : ''}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
