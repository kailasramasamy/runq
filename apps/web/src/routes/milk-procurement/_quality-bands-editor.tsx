import { useState, useEffect, Fragment } from 'react';
import { Card, CardHeader, CardContent, Button, useToast } from '@/components/ui';
import {
  useQualityBands, useUpsertQualityBands, milkTypeLabel,
  type MilkType, type QualityMetric, type QualityBandMap,
} from '@/hooks/queries/use-milk-procurement';

const MILK_TYPES: MilkType[] = ['cow_a1', 'cow_a2', 'buffalo', 'mixed', 'cow'];
const METRICS: QualityMetric[] = ['fat', 'snf', 'clr'];
const METRIC_LABELS: Record<QualityMetric, string> = { fat: 'FAT (%)', snf: 'SNF (%)', clr: 'CLR' };

type CellState = { goodMin: string; watchMin: string };
type RowState = Record<QualityMetric, CellState>;
type FormState = Record<MilkType, RowState>;

function emptyCell(): CellState { return { goodMin: '', watchMin: '' }; }
function emptyRow(): RowState {
  return { fat: emptyCell(), snf: emptyCell(), clr: emptyCell() };
}
function defaultFormState(): FormState {
  return Object.fromEntries(MILK_TYPES.map((mt) => [mt, emptyRow()])) as FormState;
}

function initState(map: QualityBandMap): FormState {
  return Object.fromEntries(MILK_TYPES.map((mt) => [mt,
    Object.fromEntries(METRICS.map((m) => {
      const range = map[mt]?.[m];
      return [m, {
        goodMin: range?.goodMin != null ? String(range.goodMin) : '',
        watchMin: range?.watchMin != null ? String(range.watchMin) : '',
      }];
    })),
  ])) as FormState;
}

function collectBands(f: FormState) {
  const out: { milkType: MilkType; metric: QualityMetric; goodMin: number; watchMin: number }[] = [];
  for (const mt of MILK_TYPES) {
    for (const m of METRICS) {
      const { goodMin, watchMin } = f[mt][m];
      if (goodMin !== '' && watchMin !== '') {
        out.push({ milkType: mt, metric: m, goodMin: Number(goodMin), watchMin: Number(watchMin) });
      }
    }
  }
  return out;
}

function validate(f: FormState): string | null {
  for (const mt of MILK_TYPES) {
    for (const m of METRICS) {
      const { goodMin, watchMin } = f[mt][m];
      if (goodMin === '' && watchMin === '') continue;
      const g = Number(goodMin), w = Number(watchMin);
      if (isNaN(g) || isNaN(w)) return 'All thresholds must be numbers.';
      if (g < w) return `${milkTypeLabel(mt)} ${m.toUpperCase()}: Good min (${g}) must be ≥ Watch min (${w}).`;
    }
  }
  return null;
}

export function QualityBandsEditor({ nodeId, title }: { nodeId?: string | null; title?: string }) {
  const { data } = useQualityBands(nodeId ?? undefined);
  const upsert = useUpsertQualityBands();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(defaultFormState);

  useEffect(() => { if (data?.data) setForm(initState(data.data)); }, [data]);

  const setCell = (mt: MilkType, m: QualityMetric, field: 'goodMin' | 'watchMin', v: string) =>
    setForm((prev) => ({ ...prev, [mt]: { ...prev[mt], [m]: { ...prev[mt][m], [field]: v } } }));

  const save = () => {
    const err = validate(form);
    if (err) { toast(err, 'error'); return; }
    upsert.mutate(
      { nodeId: nodeId ?? null, bands: collectBands(form) },
      { onSuccess: () => toast('Quality bands saved', 'success'), onError: () => toast('Failed to save', 'error') },
    );
  };

  return (
    <Card>
      <CardHeader>{title ?? 'Quality bands'}</CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-zinc-500">
          Band thresholds for FAT, SNF, and CLR. Values at or above <span className="text-green-700 dark:text-green-400">Good min</span> are green;
          at or above <span className="text-amber-700 dark:text-amber-400">Watch min</span> are amber; below are red.
          Leave a row blank to inherit from the tenant default.
        </p>
        <div className="overflow-x-auto">
          <BandsTable form={form} setCell={setCell} />
        </div>
        <div className="mt-4">
          <Button onClick={save} loading={upsert.isPending}>Save quality bands</Button>
        </div>
      </CardContent>
    </Card>
  );
}

const INPUT_CLS =
  'w-16 rounded border border-zinc-300 bg-white px-1.5 py-1 text-center text-xs text-zinc-900 ' +
  'focus:border-[var(--accent)] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

function BandsTable({ form, setCell }: {
  form: FormState;
  setCell: (mt: MilkType, m: QualityMetric, f: 'goodMin' | 'watchMin', v: string) => void;
}) {
  return (
    <table className="border-collapse text-xs">
      <thead className="text-zinc-500">
        <tr>
          <th className="pb-1 pr-4 text-left font-medium" rowSpan={2}>Milk type</th>
          {METRICS.map((m) => (
            <th key={m} colSpan={2} className="px-2 pb-1 text-center font-medium">{METRIC_LABELS[m]}</th>
          ))}
        </tr>
        <tr>
          {METRICS.map((m) => (
            <Fragment key={m}>
              <th className="px-1 pb-2 text-center font-normal"><span className="text-green-600 dark:text-green-400">Good ≥</span></th>
              <th className="px-1 pb-2 text-center font-normal"><span className="text-amber-600 dark:text-amber-400">Watch ≥</span></th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {MILK_TYPES.map((mt) => (
          <tr key={mt} className="border-t border-zinc-100 dark:border-zinc-800">
            <td className="whitespace-nowrap py-1.5 pr-4 text-zinc-700 dark:text-zinc-300">{milkTypeLabel(mt)}</td>
            {METRICS.map((m) => (
              <Fragment key={m}>
                <td className="px-1 py-1">
                  <input type="number" step="0.1" className={INPUT_CLS}
                    value={form[mt][m].goodMin} onChange={(e) => setCell(mt, m, 'goodMin', e.target.value)} />
                </td>
                <td className="px-1 py-1">
                  <input type="number" step="0.1" className={INPUT_CLS}
                    value={form[mt][m].watchMin} onChange={(e) => setCell(mt, m, 'watchMin', e.target.value)} />
                </td>
              </Fragment>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
