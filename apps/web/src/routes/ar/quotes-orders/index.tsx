import { useState } from 'react';
import { Plus, Download, ClipboardList, Truck } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  PageHeader, Button, StatTile,
} from '@/components/ar/primitives';
import { formatINRShort } from '@/lib/utils';
import { QuotesSection, useQuotesKpis } from '../quotes/index';
import { SalesOrdersSection, useOrdersKpis } from '../sales-orders/index';

type Tab = 'quotes' | 'orders';

export function QuotesAndOrdersPage({ initialTab = 'quotes' }: { initialTab?: Tab } = {}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showCreateQuote, setShowCreateQuote] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);

  const q = useQuotesKpis();
  const o = useOrdersKpis();

  return (
    <div>
      <PageHeader
        title="Quotes & sales orders"
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: tab === 'quotes' ? 'Quotes' : 'Sales orders' },
        ]}
        description="Pre-invoice documents — track what's quoted, accepted, and converted."
        actions={
          tab === 'quotes' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={<Download size={13} />}
                onClick={() =>
                  downloadCSV(
                    'quotes.csv',
                    ['Quote#', 'Date', 'Customer', 'Amount', 'Status', 'Expiry'],
                    q.quotes.map((row) => [
                      row.quoteNumber, row.quoteDate, row.customerName,
                      String(row.totalAmount), row.status, row.expiryDate ?? '',
                    ]),
                  )
                }
              >
                Export
              </Button>
              <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowCreateQuote((v) => !v)}>
                New quote
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={<Download size={13} />}
                onClick={() =>
                  downloadCSV(
                    'sales-orders.csv',
                    ['Order#', 'Date', 'Customer', 'Amount', 'Status'],
                    o.orders.map((row) => [
                      row.orderNumber, row.orderDate, row.customerName,
                      String(row.totalAmount), row.status,
                    ]),
                  )
                }
              >
                Export
              </Button>
              <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowCreateOrder((v) => !v)}>
                New order
              </Button>
            </>
          )
        }
      />

      {/* Combined KPI strip — 4 tiles, two from each section */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open quotes" value={q.openCount} sub={formatINRShort(q.openTotal)} />
        <StatTile label="Quote win rate" value={`${q.winRate}%`} sub="Accepted / total" tone={q.winRate >= 50 ? 'pos' : 'neutral'} />
        <StatTile label="Open orders" value={o.openCount} sub={formatINRShort(o.openTotal)} />
        <StatTile label="Fulfilled orders" value={o.fulfilledCount} sub="Delivered to customer" tone="pos" />
      </div>

      {/* Section nav */}
      <div className="mb-4 flex items-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        <SectionTab
          active={tab === 'quotes'}
          onClick={() => setTab('quotes')}
          icon={<ClipboardList size={13} />}
          label="Quotes"
          count={q.quotes.length}
        />
        <SectionTab
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
          icon={<Truck size={13} />}
          label="Sales orders"
          count={o.orders.length}
        />
      </div>

      {tab === 'quotes' ? (
        <QuotesSection showCreate={showCreateQuote} setShowCreate={setShowCreateQuote} />
      ) : (
        <SalesOrdersSection showCreate={showCreateOrder} setShowCreate={setShowCreateOrder} />
      )}
    </div>
  );
}

function SectionTab({
  active, onClick, icon, label, count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className="-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors"
      style={{
        color: active ? 'var(--accent-text)' : 'var(--text-2)',
        borderColor: active ? 'var(--accent)' : 'transparent',
      }}
    >
      {icon}
      {label}
      <span
        className="num rounded px-1 text-[10.5px]"
        style={{
          background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
          color: active ? 'var(--accent-text)' : 'var(--text-3)',
        }}
      >
        {count}
      </span>
    </button>
  );
}
