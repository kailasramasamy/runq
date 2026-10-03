import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useToPay, type ToPayCategory } from '@/hooks/queries/use-to-pay';
import { PageHeader, EmptyState, Tabs } from '@/components/ar/primitives';
import { CategoryList } from './_category-list';
import { ItemsTable } from './_items-table';
import { MonthStepper } from './_month-stepper';
import { ToPayStats } from './_stats';
import { currentMonth, shiftMonth } from './_shared';

type Mode = 'outstanding' | 'month';

export function ToPayPage() {
  const [mode, setMode] = useState<Mode>('outstanding');
  const [month, setMonth] = useState<string | null>(null);
  const [category, setCategory] = useState<ToPayCategory | null>(null);
  const monthMode = mode === 'month';
  const { data, isLoading } = useToPay(monthMode ? (month ?? undefined) : undefined);
  const toPay = data?.data;
  const thisMonth = toPay ? currentMonth(toPay.asOf) : new Date().toISOString().slice(0, 7);
  const activeMonth = month ?? thisMonth;
  const items = toPay ? toPay.items.filter((i) => !category || i.category === category) : [];

  const changeMode = (m: Mode) => { setMode(m); setCategory(null); };

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'Finance' }, { label: 'To pay' }]}
        title="To pay"
        description="Everything still to be paid — bills, salaries, statutory dues, milk payments"
      />
      <Tabs active={mode} onChange={changeMode} tabs={[{ id: 'outstanding', label: 'Outstanding' }, { id: 'month', label: 'By month' }]} />
      {monthMode && <MonthStepper month={activeMonth} max={shiftMonth(thisMonth, 1)} onChange={setMonth} />}

      {isLoading || !toPay ? (
        <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--surface-2)' }} />
      ) : toPay.items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={18} />}
          title={monthMode ? 'Nothing for this month' : "Nothing to pay — you're all caught up"} />
      ) : (
        <>
          <ToPayStats toPay={toPay} />
          <CategoryList categories={toPay.categories} selected={category} onSelect={setCategory} monthMode={monthMode} />
          <ItemsTable asOf={toPay.asOf} items={items} categories={toPay.categories} groupBy={monthMode ? 'category' : 'due'} />
        </>
      )}
    </div>
  );
}
