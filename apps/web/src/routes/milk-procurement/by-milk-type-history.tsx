import { useState } from 'react';
import { PageHeader, EmptyState } from '@/components/ui';
import { Droplets } from 'lucide-react';
import { Tabs } from '@/components/ar/primitives';
import {
  useMilkTypeDaily, milkTypeLabel, type MilkType,
} from '@/hooks/queries/use-milk-procurement';
import { daysAgo, today } from './_node-dashboard-shared';
import { DailyTable, RangePills, rangeFor, type Preset } from './_daily-history';

// Preferred tab order; only types with data for the window are shown.
const TYPE_ORDER: MilkType[] = ['cow_a1', 'cow_a2', 'buffalo', 'mixed', 'cow'];

export function MpByMilkTypeHistoryPage() {
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState({ from: daysAgo(29), to: today() });
  const [active, setActive] = useState<MilkType | null>(null);
  const [page, setPage] = useState(1);

  const { data } = useMilkTypeDaily(rangeFor(preset, custom));
  const rows = data?.data ?? [];
  const types = TYPE_ORDER.filter((t) => rows.some((r) => r.milkType === t));
  const activeType = active && types.includes(active) ? active : types[0] ?? null;
  const typeRows = rows.filter((r) => r.milkType === activeType);

  return (
    <div>
      <PageHeader
        title="By milk type — history"
        description="Daily collection totals split by milk type. Pick a type below."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RangePills preset={preset} custom={custom} setPreset={setPreset} setCustom={setCustom}
          onChange={() => setPage(1)} />
      </div>

      {types.length === 0 ? (
        <EmptyState
          icon={Droplets}
          title="No pours in this window"
          description="Record collection to see per-milk-type daily history."
        />
      ) : (
        <>
          <Tabs<MilkType>
            active={activeType!}
            onChange={(t) => { setActive(t); setPage(1); }}
            tabs={types.map((t) => ({
              id: t, label: milkTypeLabel(t), count: rows.filter((r) => r.milkType === t).length,
            }))}
          />
          <DailyTable rows={typeRows} page={page} setPage={setPage} />
        </>
      )}
    </div>
  );
}
