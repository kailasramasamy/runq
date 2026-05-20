import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import {
  PageHeader, Button, Input, Badge, Modal,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import {
  useGeoFences, useCreateGeoFence, useUpdateGeoFence, useDeleteGeoFence,
} from '@/hooks/queries/use-hr-phase-next';
import { useIsReadOnly } from '@/providers/auth-provider';

export function GeoFencesPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useGeoFences();
  const create = useCreateGeoFence();
  const update = useUpdateGeoFence();
  const remove = useDeleteGeoFence();

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fences = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = fences.filter((f) => {
    if (q && !f.name.toLowerCase().includes(q)) return false;
    if (statusFilter === 'active' && !f.isActive) return false;
    if (statusFilter === 'inactive' && f.isActive) return false;
    return true;
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !lat || !lng) return;
    create.mutate(
      { name, latitude: Number(lat), longitude: Number(lng), radiusMeters: Number(radius), isActive: true },
      {
        onSuccess: () => {
          setShowAdd(false); setName(''); setLat(''); setLng(''); setRadius('200');
          toast('Geo-fence added', 'success');
        },
        onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
      },
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Geo-fences' }]}
        title="Geo-fences"
        description="Define office/factory locations for mobile attendance check-in."
        actions={!readOnly && (
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" />New fence</Button>
        )}
      />

      {fences.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filtered.length}
          noun="fence"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </ListToolbar>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : fences.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10" />}
          title="No geo-fences"
          description="Add a fence for each work location. Mobile punches inside the fence are auto-marked verified."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Name</Th><Th>Latitude</Th><Th>Longitude</Th><Th>Radius</Th><Th>Status</Th><Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={<MapPin className="h-10 w-10" />} title="No fences match" description="Try a different search or filter." /></td></tr>
            ) : filtered.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell>{Number(f.latitude).toFixed(5)}</TableCell>
                <TableCell>{Number(f.longitude).toFixed(5)}</TableCell>
                <TableCell>{f.radiusMeters} m</TableCell>
                <TableCell>
                  <Badge variant={f.isActive ? 'success' as any : 'outline'}>
                    {f.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {!readOnly && (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm"
                        onClick={() => update.mutate({ id: f.id, isActive: !f.isActive })}>
                        {f.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteId(f.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New geo-fence">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Head Office" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Latitude</label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="12.97160" required />
            </div>
            <div>
              <label className="text-sm font-medium">Longitude</label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.59456" required />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Radius (metres)</label>
            <Input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" min={10} max={50000} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, {
            onSuccess: () => { setDeleteId(null); toast('Geo-fence deleted', 'success'); },
            onError: (err: any) => toast(err?.message ?? 'Delete failed', 'error'),
          });
        }}
        title="Delete geo-fence?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
