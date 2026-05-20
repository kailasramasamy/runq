import { useState } from 'react';
import { Clock } from 'lucide-react';
import {
  PageHeader, Badge, Modal,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import { useAttendancePunches, usePunchSelfieSrc } from '@/hooks/queries/use-hr-phase-next';

// A punch's `selfieUrl` is an S3 storage key once uploaded properly.
// Legacy values from before the upload pipeline were local mobile file
// paths (e.g. "/var/mobile/Containers/..."). Filter those out — we can't
// render them and the API will 404 anyway.
function hasUsableSelfie(url: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('/') || url.startsWith('file:')) return false;
  return true;
}

function SelfieCell({ punchId, selfieUrl }: { punchId: string; selfieUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const usable = hasUsableSelfie(selfieUrl);
  const { data: src } = usePunchSelfieSrc(open ? punchId : null, usable);
  if (!usable) return <span className="text-xs text-slate-400">—</span>;
  return (
    <>
      <button
        className="text-blue-600 underline text-xs hover:text-blue-800"
        onClick={() => setOpen(true)}
      >View</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Check-in selfie">
        {src
          ? <img src={src} alt="Selfie" className="rounded max-h-[60vh] mx-auto" />
          : <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>}
      </Modal>
    </>
  );
}

export function AttendancePunchesPage() {
  const { data, isLoading } = useAttendancePunches();
  const rows = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((p) => {
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
    if (q && !name.includes(q) && !(p.employeeCode ?? '').toLowerCase().includes(q)) return false;
    if (kindFilter && p.kind !== kindFilter) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Attendance punches' }]}
        title="Attendance punches"
        description="Geo-tagged check-in / check-out events from the mobile app."
      />
      {rows.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by employee name or code…"
          count={filtered.length}
          noun="punch"
        >
          <FilterSelect
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            options={[
              { value: '', label: 'All punches' },
              { value: 'in', label: 'Check-in' },
              { value: 'out', label: 'Check-out' },
            ]}
          />
        </ListToolbar>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Clock className="h-10 w-10" />} title="No punches yet"
          description="Employees can punch from the runq mobile app once geo-fences are configured." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Time</Th><Th>Employee</Th><Th>Kind</Th><Th>Fence</Th><Th>Coords</Th><Th>Selfie</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={<Clock className="h-10 w-10" />} title="No punches match" description="Try a different search or filter." /></td></tr>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{new Date(p.punchAt).toLocaleString()}</TableCell>
                <TableCell className="font-medium">
                  {[p.firstName, p.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{p.employeeCode}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={p.kind === 'in' ? 'success' as any : 'info' as any}>
                    {p.kind === 'in' ? 'Check-in' : 'Check-out'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {p.insideFence
                    ? <Badge variant="success">Inside fence</Badge>
                    : <Badge variant="warning">Outside / N-A</Badge>}
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {p.latitude && p.longitude
                    ? `${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`
                    : '—'}
                </TableCell>
                <TableCell>
                  <SelfieCell punchId={p.id} selfieUrl={p.selfieUrl} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
