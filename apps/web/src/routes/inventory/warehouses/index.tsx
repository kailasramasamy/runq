import { Link } from '@tanstack/react-router';
import { Plus, Warehouse, CheckCircle2, Boxes, Store } from 'lucide-react';
import {
  PageHeader, Button, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  Badge, TableSkeleton, EmptyState,
} from '@/components/ui';
import { useWarehouses, useWarehouseBreakdown } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

const TYPE_LABELS: Record<string, string> = {
  main: 'Main', godown: 'Godown', shop: 'Shop', vehicle: 'Vehicle', virtual: 'Virtual',
};

export function WarehouseListPage() {
  const { data, isLoading } = useWarehouses();
  const { data: breakdown } = useWarehouseBreakdown();

  const activeCount = (data ?? []).filter((w) => w.isActive).length;
  const totalValue = (breakdown ?? []).reduce((s, w) => s + w.totalValue, 0);
  const shopCount = (data ?? []).filter((w) => w.type === 'shop').length;

  return (
    <div>
      <PageHeader
        title="Warehouses"
        description="Where your stock physically lives."
        actions={
          <Link to="/inventory/warehouses/new">
            <Button variant="primary">
              <Plus size={16} /> New warehouse
            </Button>
          </Link>
        }
      />

      <KpiStrip tiles={[
        { label: 'Total locations', value: data?.length ?? 0, icon: Warehouse, loading: isLoading },
        { label: 'Active', value: activeCount, icon: CheckCircle2, tone: 'success', loading: isLoading },
        { label: 'Stock value', value: formatInrShort(totalValue), icon: Boxes, loading: !breakdown },
        { label: 'Shop counters', value: shopCount, icon: Store, loading: isLoading },
      ]} />

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No warehouses yet"
          description="Add your first warehouse to start tracking stock movements."
          action={
            <Link to="/inventory/warehouses/new">
              <Button variant="primary"><Plus size={16} /> Add warehouse</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Default</Th>
              <Th>Status</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-mono">{w.code}</TableCell>
                <TableCell>
                  <Link
                    to="/inventory/warehouses/$id"
                    params={{ id: w.id }}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    {w.name}
                  </Link>
                </TableCell>
                <TableCell>{TYPE_LABELS[w.type] ?? w.type}</TableCell>
                <TableCell>{w.isDefault ? <Badge>Default</Badge> : '—'}</TableCell>
                <TableCell>
                  <Badge variant={w.isActive ? 'success' : 'default'}>
                    {w.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
