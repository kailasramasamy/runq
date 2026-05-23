import { Link } from '@tanstack/react-router';
import { Plus, Warehouse } from 'lucide-react';
import {
  PageHeader, Button, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  Badge, TableSkeleton, EmptyState,
} from '@/components/ui';
import { useWarehouses } from '@/hooks/queries/use-inventory';

const TYPE_LABELS: Record<string, string> = {
  main: 'Main', godown: 'Godown', shop: 'Shop', vehicle: 'Vehicle', virtual: 'Virtual',
};

export function WarehouseListPage() {
  const { data, isLoading } = useWarehouses();

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
                    className="font-medium text-primary-600 hover:underline"
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
