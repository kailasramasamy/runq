import { useState, useMemo, useEffect } from 'react';
import { Upload, Save, CalendarClock, Download, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, Modal,
} from '@/components/ui';
import { EmptyState, Avatar } from '@/components/ar/primitives';
import { downloadCSV } from '@/lib/csv-export';
import {
  useEmployees, useAttendance, useUpsertAttendance,
  useBiometricImport, useDailyMuster, useAttendanceImports,
  useDepartments,
  type AttendanceStatus,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'half_day', label: 'Half day' },
  { value: 'leave', label: 'Leave' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'week_off', label: 'Week off' },
];

// Semantic colours per status. Light + dark variants so the page reads
// correctly in both themes. Hex values are intentional design tokens —
// the app's CSS-variable system has no per-status -bg/-fg trio yet.
type StatusPalette = { bg: string; fg: string; border: string };
const STATUS_COLORS_LIGHT: Record<AttendanceStatus, StatusPalette> = {
  present: { bg: '#dcfce7', fg: '#14532d', border: '#86efac' },
  absent: { bg: '#fee2e2', fg: '#7f1d1d', border: '#fca5a5' },
  half_day: { bg: '#dbeafe', fg: '#1e3a8a', border: '#93c5fd' },
  leave: { bg: '#fef3c7', fg: '#78350f', border: '#fcd34d' },
  holiday: { bg: '#ede9fe', fg: '#4c1d95', border: '#c4b5fd' },
  week_off: { bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' },
};
const STATUS_COLORS_DARK: Record<AttendanceStatus, StatusPalette> = {
  present: { bg: 'rgba(34,197,94,0.18)', fg: '#86efac', border: 'rgba(34,197,94,0.40)' },
  absent: { bg: 'rgba(239,68,68,0.18)', fg: '#fca5a5', border: 'rgba(239,68,68,0.40)' },
  half_day: { bg: 'rgba(59,130,246,0.18)', fg: '#93c5fd', border: 'rgba(59,130,246,0.40)' },
  leave: { bg: 'rgba(245,158,11,0.18)', fg: '#fcd34d', border: 'rgba(245,158,11,0.40)' },
  holiday: { bg: 'rgba(139,92,246,0.18)', fg: '#c4b5fd', border: 'rgba(139,92,246,0.40)' },
  week_off: { bg: 'rgba(148,163,184,0.18)', fg: '#cbd5e1', border: 'rgba(148,163,184,0.35)' },
};

function useStatusColors() {
  // Match the rest of the app — check the documentElement for the .dark
  // class set by the theme provider.
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
}

// HTML <input type="time"> requires strict zero-padded HH:MM. Legacy data
// stored as "9:00" or "5:00" silently renders empty otherwise.
function padTime(v: string | null | undefined): string {
  if (!v) return '';
  const [h = '', m = ''] = v.split(':');
  if (!h || !m) return '';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

// Keyboard shortcut → status (fires when an attendance row is focused).
const KEY_MAP: Record<string, AttendanceStatus> = {
  p: 'present', a: 'absent', h: 'half_day', l: 'leave', w: 'week_off', o: 'holiday',
};

const NON_WORKING: AttendanceStatus[] = ['leave', 'holiday', 'week_off', 'absent'];

type Draft = { status: AttendanceStatus; checkIn: string; checkOut: string };

function calcHours(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null;
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  const diff = (oh * 60 + om) - (ih * 60 + im);
  return diff > 0 ? diff / 60 : null;
}

// Shift an ISO date string (YYYY-MM-DD) by N days. The naive
// `new Date(iso + 'T00:00:00').toISOString()` round-trip silently
// drops the date by one in any TZ east of UTC (the local-midnight
// instant is the previous day in UTC). Build the output from local
// components instead so the calendar nav lands on the right day in
// every timezone.
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AttendancePage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const STATUS_COLORS = useStatusColors();
  const [date, setDate] = useState(todayLocal());
  const [showImport, setShowImport] = useState(false);

  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  const employees = useMemo(() => empData?.data ?? [], [empData]);
  const { data: deptData } = useDepartments();
  const departments = deptData?.data ?? [];

  const { data: attData, isLoading } = useAttendance({ dateFrom: date, dateTo: date });
  const { data: musterData } = useDailyMuster(date);
  const upsert = useUpsertAttendance();

  // Filter / search state — applied client-side over the loaded roster.
  // Keeps the UI snappy; the day's roster rarely exceeds the 200 employees
  // fetched above. Save / muster / "mark all" operate on the unfiltered
  // employees so a filter view never silently strips off-screen rows.
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('');

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [focusRow, setFocusRow] = useState<string | null>(null);

  useEffect(() => {
    const map: Record<string, Draft> = {};
    for (const e of employees) {
      map[e.id] = { status: 'present', checkIn: '', checkOut: '' };
    }
    for (const r of attData?.data ?? []) {
      map[r.employeeId] = {
        status: r.status,
        checkIn: padTime(r.checkIn),
        checkOut: padTime(r.checkOut),
      };
    }
    setDrafts(map);
    setDirty(new Set());
  }, [employees, attData]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setDirty((p) => new Set([...p, id]));
  }

  function markAll(status: AttendanceStatus) {
    setDrafts((p) => {
      const next: Record<string, Draft> = {};
      for (const e of employees) next[e.id] = { ...(p[e.id] ?? { checkIn: '', checkOut: '' }), status };
      return next;
    });
    setDirty(new Set(employees.map((e) => e.id)));
  }

  async function saveRow(employeeId: string) {
    const d = drafts[employeeId];
    if (!d) return;
    await upsert.mutateAsync({
      employeeId, date,
      status: d.status,
      checkIn: d.checkIn || undefined,
      checkOut: d.checkOut || undefined,
      source: 'manual',
    });
  }

  async function saveAll() {
    try {
      for (const id of dirty) await saveRow(id);
      setDirty(new Set());
      toast('Attendance saved', 'success');
    } catch (err: any) {
      toast(err?.message ?? 'Save failed', 'error');
    }
  }

  function handleRowKey(e: React.KeyboardEvent, id: string, idx: number) {
    const k = e.key.toLowerCase();
    if (KEY_MAP[k]) { e.preventDefault(); setDraft(id, { status: KEY_MAP[k] }); return; }
    if (e.key === 'ArrowDown' && idx < displayed.length - 1) { e.preventDefault(); setFocusRow(displayed[idx + 1].id); }
    if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); setFocusRow(displayed[idx - 1].id); }
    if (e.key === 'Escape') setFocusRow(null);
  }

  const muster = musterData?.data ?? { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, week_off: 0 };
  const weekday = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Filtered roster for table rendering. Search matches name + code
  // case-insensitively. Department + status filters narrow the visible
  // rows; both default to "all". Unfiltered `employees` is still used
  // for muster aggregation, mark-all, and save-all.
  const filtersActive = !!search || !!deptFilter || !!statusFilter;
  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (deptFilter && e.departmentId !== deptFilter) return false;
      if (statusFilter && (drafts[e.id]?.status ?? 'present') !== statusFilter) return false;
      if (!q) return true;
      const name = `${e.firstName} ${e.lastName ?? ''}`.toLowerCase();
      return name.includes(q) || (e.employeeCode ?? '').toLowerCase().includes(q);
    });
  }, [employees, drafts, search, deptFilter, statusFilter]);

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Attendance' }]}
        title="Attendance"
        description="Daily muster, check-in/out, OT. Use keyboard shortcuts to mark status quickly."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCSV(
                  `attendance_${date}.csv`,
                  ['Code', 'Name', 'Date', 'Status', 'Check In', 'Check Out', 'Hours'],
                  (attData?.data ?? []).map((r) => [
                    r.employeeCode, r.employeeName, r.date, r.status, r.checkIn ?? '', r.checkOut ?? '', r.hoursWorked ?? '',
                  ]),
                )
              }
            >
              <Download size={13} /> Export CSV
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                  <Upload size={13} /> Import biometric
                </Button>
                <Button size="sm" onClick={saveAll} disabled={upsert.isPending || dirty.size === 0}>
                  <Save size={13} /> Save{dirty.size > 0 ? ` (${dirty.size})` : ''}
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Date navigation + quick actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-[color:var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          aria-label="Previous day"
        >
          <ChevronLeft size={14} />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-[13px] font-semibold"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
        />
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-[color:var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          aria-label="Next day"
        >
          <ChevronRight size={14} />
        </button>
        {date !== todayLocal() && (
          <button
            type="button"
            onClick={() => setDate(todayLocal())}
            className="rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-[color:var(--surface-2)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >Today</button>
        )}
        <span className="ml-1 text-[13px]" style={{ color: 'var(--text-2)' }}>{weekday}</span>
        <div className="flex-1" />
        {!readOnly && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => markAll('present')}>All present</Button>
            <Button variant="outline" size="sm" onClick={() => markAll('week_off')}>All week off</Button>
            <Button variant="outline" size="sm" onClick={() => markAll('holiday')}>Mark holiday</Button>
          </div>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code"
            className="rounded-md border pl-8 pr-7 py-1.5 text-[13px] w-64 outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-[color:var(--surface-2)]"
              style={{ color: 'var(--text-3)' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-[13px] outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | '')}
          className="rounded-md border px-2 py-1.5 text-[13px] outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {filtersActive && (
          <>
            <button
              type="button"
              onClick={() => { setSearch(''); setDeptFilter(''); setStatusFilter(''); }}
              className="rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-[color:var(--surface-2)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >Clear filters</button>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              Showing {displayed.length} of {employees.length}
            </span>
          </>
        )}
      </div>

      {/* Muster tiles */}
      <div className="mb-4 grid grid-cols-3 gap-2 md:grid-cols-6">
        {(Object.keys(STATUS_COLORS) as AttendanceStatus[]).map((k) => {
          const c = STATUS_COLORS[k];
          return (
            <div key={k} className="rounded-lg border px-2 py-2.5 text-center" style={{ background: c.bg, borderColor: c.border }}>
              <div className="num text-[22px] font-bold leading-none tabular-nums" style={{ color: c.fg }}>
                {muster[k]}
              </div>
              <div className="mt-1 text-[10px] font-semibold capitalize opacity-80" style={{ color: c.fg }}>
                {k.replace('_', ' ')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Keyboard shortcut legend */}
      {!readOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
            Shortcuts (focus a row first):
          </span>
          {Object.entries(KEY_MAP).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-2)' }}>
              <kbd
                className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                {k.toUpperCase()}
              </kbd>
              <span style={{ color: STATUS_COLORS[v].fg }}>{v.replace('_', ' ')}</span>
            </span>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee</Th>
            <Th>Status</Th>
            <Th>Check in</Th>
            <Th>Check out</Th>
            <Th align="right">Hours</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : employees.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<CalendarClock size={18} />} title="No active employees" description="Add employees to start tracking attendance." /></td></tr>
          ) : displayed.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<Search size={18} />} title="No matches" description="No employees match the current search or filters." /></td></tr>
          ) : displayed.map((e, idx) => {
            const d = drafts[e.id] ?? { status: 'present' as AttendanceStatus, checkIn: '', checkOut: '' };
            const c = STATUS_COLORS[d.status];
            const isDirty = dirty.has(e.id);
            const isFocused = focusRow === e.id;
            const disableTimes = readOnly || NON_WORKING.includes(d.status);
            const hours = calcHours(d.checkIn, d.checkOut);
            const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`;
            return (
              <tr
                key={e.id}
                tabIndex={readOnly ? -1 : 0}
                onFocus={() => setFocusRow(e.id)}
                onKeyDown={(ev) => !readOnly && handleRowKey(ev, e.id, idx)}
                className="border-b outline-none"
                style={{
                  borderColor: 'var(--border-soft)',
                  background: isFocused
                    ? 'var(--accent-soft)'
                    : isDirty
                      ? 'color-mix(in srgb, #f59e0b 12%, transparent)'
                      : 'transparent',
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={name} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{name}</span>
                        {isDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#f59e0b' }} />}
                      </div>
                      <div className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{e.employeeCode}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <select
                    value={d.status}
                    onChange={(ev) => setDraft(e.id, { status: ev.target.value as AttendanceStatus })}
                    disabled={readOnly}
                    className="rounded-md border px-2 py-1 text-[12px] font-semibold outline-none"
                    style={{ background: c.bg, borderColor: c.border, color: c.fg }}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    value={d.checkIn}
                    onChange={(ev) => setDraft(e.id, { checkIn: ev.target.value })}
                    disabled={disableTimes}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    value={d.checkOut}
                    onChange={(ev) => setDraft(e.id, { checkOut: ev.target.value })}
                    disabled={disableTimes}
                  />
                </TableCell>
                <TableCell align="right">
                  <span
                    className="num text-[13px] font-semibold tabular-nums"
                    style={{ color: hours != null ? '#16a34a' : 'var(--text-3)' }}
                  >
                    {hours != null ? `${hours.toFixed(1)}h` : '—'}
                  </span>
                </TableCell>
                <TableCell align="right">
                  {!readOnly && (
                    <Button size="sm" variant="outline" onClick={() => {
                      saveRow(e.id)
                        .then(() => {
                          setDirty((p) => { const n = new Set(p); n.delete(e.id); return n; });
                          toast(`Saved ${e.firstName}`, 'success');
                        })
                        .catch((err: any) => toast(err?.message ?? 'Failed', 'error'));
                    }}>Save</Button>
                  )}
                </TableCell>
              </tr>
            );
          })}
        </TableBody>
      </Table>

      {showImport && <BiometricImportModal date={date} onClose={() => setShowImport(false)} />}
    </div>
  );
}

function BiometricImportModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { toast } = useToast();
  const importMut = useBiometricImport();
  const { data: importsData } = useAttendanceImports();
  const [fileName, setFileName] = useState('');
  const [deviceType, setDeviceType] = useState('eSSL');
  const [parsed, setParsed] = useState<Array<{ employeeCode: string; date: string; checkIn?: string; checkOut?: string }>>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  function onFile(file: File) {
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        const records = parseCSV(text, date);
        setParsed(records);
      } catch (e: any) {
        setParseError(e.message ?? 'Failed to parse CSV');
        setParsed([]);
      }
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!parsed.length) {
      toast('Nothing to import', 'error');
      return;
    }
    importMut.mutate(
      { fileName: fileName || 'biometric.csv', deviceType, records: parsed },
      {
        onSuccess: (res) => {
          const d = res.data;
          toast(`Imported ${d.successCount}/${d.totalRecords} (${d.errorCount} errors)`, d.errorCount > 0 ? 'error' : 'success');
          if (d.errorCount === 0) onClose();
        },
        onError: (err: any) => toast(err?.message ?? 'Import failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Import biometric attendance" size="lg">
      <div className="space-y-3">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          CSV format: <code>employee_code,date,check_in,check_out</code>. Date in YYYY-MM-DD, times in HH:MM.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Device type"
            options={[
              { value: 'eSSL', label: 'eSSL' },
              { value: 'Matrix', label: 'Matrix' },
              { value: 'ZKTeco', label: 'ZKTeco' },
              { value: 'Other', label: 'Other' },
            ]}
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
          />
          <Input
            label="CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>

        {parseError && <p className="text-[12px]" style={{ color: 'var(--danger-text, #b91c1c)' }}>{parseError}</p>}
        {parsed.length > 0 && (
          <Card>
            <CardHeader>{parsed.length} records parsed</CardHeader>
            <CardContent>
              <div className="max-h-60 overflow-y-auto text-[12px]">
                <table className="w-full">
                  <thead>
                    <tr style={{ color: 'var(--text-3)' }}>
                      <th className="text-left">Code</th><th className="text-left">Date</th><th>In</th><th>Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="num">{r.employeeCode}</td>
                        <td className="num">{r.date}</td>
                        <td className="num text-center">{r.checkIn ?? '—'}</td>
                        <td className="num text-center">{r.checkOut ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 20 && (
                  <p className="mt-1" style={{ color: 'var(--text-3)' }}>+ {parsed.length - 20} more…</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {importsData?.data && importsData.data.length > 0 && (
          <Card>
            <CardHeader>Recent imports</CardHeader>
            <CardContent>
              <div className="text-[12px]">
                {importsData.data.slice(0, 5).map((imp) => (
                  <div key={imp.id} className="flex items-center justify-between border-b py-1" style={{ borderColor: 'var(--border-soft)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{imp.fileName}</span>
                    <span className="num" style={{ color: 'var(--text-3)' }}>
                      {imp.successCount}/{imp.totalRecords} · {new Date(imp.importedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={!parsed.length || importMut.isPending}>
            {importMut.isPending ? 'Importing…' : `Import ${parsed.length || ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function parseCSV(text: string, fallbackDate: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Empty file');
  const first = lines[0].toLowerCase();
  const start = first.includes('employee') || first.includes('code') ? 1 : 0;
  const out: Array<{ employeeCode: string; date: string; checkIn?: string; checkOut?: string }> = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (!cols[0]) continue;
    const [code, date, ci, co] = cols;
    out.push({
      employeeCode: code,
      date: date || fallbackDate,
      checkIn: normTime(ci),
      checkOut: normTime(co),
    });
  }
  if (!out.length) throw new Error('No data rows found');
  return out;
}

function normTime(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const h = m[1].padStart(2, '0');
  return `${h}:${m[2]}${m[3] ? ':' + m[3] : ''}`;
}
