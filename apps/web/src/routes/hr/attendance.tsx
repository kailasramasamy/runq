import { useState, useMemo, useEffect } from 'react';
import { Upload, Save, CalendarClock, Download } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, Modal,
} from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import { downloadCSV } from '@/lib/csv-export';
import {
  useEmployees, useAttendance, useUpsertAttendance,
  useBiometricImport, useDailyMuster, useAttendanceImports,
  type AttendanceStatus, type AttendanceRow,
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

const STATUS_VARIANT: Record<AttendanceStatus, any> = {
  present: 'success', absent: 'danger', half_day: 'warning',
  leave: 'info', holiday: 'primary', week_off: 'outline',
};

type Draft = { status: AttendanceStatus; checkIn: string; checkOut: string };

export function AttendancePage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showImport, setShowImport] = useState(false);

  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  const employees = useMemo(() => empData?.data ?? [], [empData]);

  const { data: attData, isLoading } = useAttendance({ dateFrom: date, dateTo: date });
  const { data: musterData } = useDailyMuster(date);
  const upsert = useUpsertAttendance();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    const map: Record<string, Draft> = {};
    for (const e of employees) {
      map[e.id] = { status: 'present', checkIn: '', checkOut: '' };
    }
    for (const r of attData?.data ?? []) {
      map[r.employeeId] = {
        status: r.status,
        checkIn: r.checkIn ?? '',
        checkOut: r.checkOut ?? '',
      };
    }
    setDrafts(map);
  }, [employees, attData]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
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
      for (const e of employees) await saveRow(e.id);
      toast('Attendance saved', 'success');
    } catch (err: any) {
      toast(err?.message ?? 'Save failed', 'error');
    }
  }

  const muster = musterData?.data ?? { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, week_off: 0 };

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Attendance' }]}
        title="Attendance"
        description="Daily muster, OT, and biometric CSV imports."
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
                <Button size="sm" onClick={saveAll} disabled={upsert.isPending}>
                  <Save size={13} /> Save all
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatTile label="Present" value={muster.present} />
        <StatTile label="Half day" value={muster.half_day} />
        <StatTile label="Leave" value={muster.leave} />
        <StatTile label="Absent" value={muster.absent} />
        <StatTile label="Holiday" value={muster.holiday} />
        <StatTile label="Week off" value={muster.week_off} />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th>Check in</Th>
            <Th>Check out</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : employees.length === 0 ? (
            <tr><td colSpan={6}><EmptyState icon={<CalendarClock size={18} />} title="No active employees" description="Add employees to start tracking attendance." /></td></tr>
          ) : employees.map((e) => {
            const d = drafts[e.id] ?? { status: 'present' as AttendanceStatus, checkIn: '', checkOut: '' };
            return (
              <TableRow key={e.id}>
                <TableCell className="num" style={{ color: 'var(--text-3)' }}>{e.employeeCode}</TableCell>
                <TableCell><span className="font-medium" style={{ color: 'var(--text-1)' }}>{e.firstName}{e.lastName ? ' ' + e.lastName : ''}</span></TableCell>
                <TableCell>
                  {readOnly ? (
                    <Badge variant={STATUS_VARIANT[d.status]}>{d.status.replace('_', ' ')}</Badge>
                  ) : (
                    <Select
                      options={STATUS_OPTIONS}
                      value={d.status}
                      onChange={(ev) => setDraft(e.id, { status: ev.target.value as AttendanceStatus })}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    value={d.checkIn}
                    onChange={(ev) => setDraft(e.id, { checkIn: ev.target.value })}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    value={d.checkOut}
                    onChange={(ev) => setDraft(e.id, { checkOut: ev.target.value })}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell align="right">
                  {!readOnly && (
                    <Button size="sm" variant="outline" onClick={() => {
                      saveRow(e.id).then(() => toast(`Saved ${e.firstName}`, 'success')).catch((err: any) => toast(err?.message ?? 'Failed', 'error'));
                    }}>Save</Button>
                  )}
                </TableCell>
              </TableRow>
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
