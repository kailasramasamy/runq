import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft, Upload, Sparkles, FileSpreadsheet, Trash2, Link as LinkIcon,
  AlertTriangle, UserPlus, Search, Wand2,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, PageHeader, Button, Badge, Select, Input, Skeleton,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';
import {
  useBillSyncSources, useBillSyncLogs, useProposeMapping, useSaveMapping,
  usePreviewCsv, useCommitCsv,
  useUnmappedAttempts, useVendorMappings, useMapVendor, useUnmapVendor,
  type CsvPreviewResult, type MappingProposal, type UnmappedAttempt,
} from '@/hooks/queries/use-bill-sync';
import { useVendors } from '@/hooks/queries/use-vendors';

const CANONICAL_FIELDS = [
  '', 'external_id', 'version',
  'vendor_external_ref', 'vendor_gstin', 'vendor_phone', 'vendor_name',
  'invoice_number', 'invoice_date', 'due_date',
  'line_description', 'quantity', 'unit_price', 'line_amount',
  'hsn_sac', 'tax_rate',
  'subtotal', 'tax_amount', 'total_amount',
  'notes',
];

export function BillSyncSourceDetailPage({ id }: { id: string }) {
  const { data: sourcesData, isLoading } = useBillSyncSources();
  const source = sourcesData?.data.find((s) => s.id === id);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!source) {
    return (
      <div className="space-y-3">
        <Link to="/settings/bill-sync" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          Source not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/settings/bill-sync" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft size={14} /> All sources
      </Link>
      <PageHeader
        title={source.name}
        description={`Source identifier: ${source.slug} · API key prefix: ${source.apiKeyPrefix}…`}
        actions={<Badge variant={source.isActive ? 'success' : 'default'}>{source.isActive ? 'Active' : 'Disabled'}</Badge>}
      />

      <VendorMappingSection sourceId={id} />
      <MappingSection sourceId={id} mapping={source.columnMapping} />
      <CsvUploadSection sourceId={id} hasMapping={Object.keys(source.columnMapping).length > 0} />
      <LogsSection sourceId={id} />
    </div>
  );
}

// ─── Vendor mapping ──────────────────────────────────────────────────────────

function VendorMappingSection({ sourceId }: { sourceId: string }) {
  const { data: unmappedData, isLoading: loadingUnmapped } = useUnmappedAttempts(sourceId);
  const { data: mappingsData, isLoading: loadingMappings } = useVendorMappings(sourceId);
  const unmapped = unmappedData?.data ?? [];
  const mappings = mappingsData?.data ?? [];

  return (
    <Card>
      <CardHeader title="Vendor mappings" />
      <div className="border-b border-zinc-200 px-4 pb-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Link the upstream system's identifiers to runQ vendors so synced bills resolve correctly.
      </div>
      <CardContent>
        <div className="space-y-6">
          <Section
            title="Needs attention"
            count={unmapped.length}
            countTone="warn"
            icon={<AlertTriangle size={14} className="text-amber-500" />}
            empty="No unmapped sync attempts. Every recent push resolved to a vendor."
            loading={loadingUnmapped}
          >
            {unmapped.length > 0 && (
              <div className="space-y-2">
                {unmapped.map((u) => <UnmappedRow key={u.externalRef} sourceId={sourceId} attempt={u} />)}
              </div>
            )}
          </Section>

          <Section
            title="Active mappings"
            count={mappings.length}
            countTone="default"
            icon={<LinkIcon size={14} className="text-green-500" />}
            empty="No vendors mapped yet. Mappings will appear here once you link external IDs to runQ vendors."
            loading={loadingMappings}
          >
            {mappings.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow><Th>External ID</Th><Th>runQ vendor</Th><Th></Th></TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((m) => <MappingRow key={m.vendorId} sourceId={sourceId} mapping={m} />)}
                </TableBody>
              </Table>
            )}
          </Section>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, count, countTone, icon, empty, loading, children }: {
  title: string;
  count: number;
  countTone: 'warn' | 'default';
  icon: React.ReactNode;
  empty: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {icon}
        <span>{title}</span>
        {count > 0 && <Badge variant={countTone === 'warn' ? 'warning' : 'default'}>{count}</Badge>}
      </div>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : count === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
          {empty}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function UnmappedRow({ sourceId, attempt }: { sourceId: string; attempt: UnmappedAttempt }) {
  const [pickerVendorId, setPickerVendorId] = useState<string>(attempt.suggestion?.id ?? '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(attempt.externalName ?? '');
  const { data: vendorList } = useVendors({ search: search || undefined, limit: 10 });
  const map = useMapVendor();
  const { toast } = useToast();

  const candidates = vendorList?.data ?? attempt.candidates;

  async function handleMapExisting() {
    if (!pickerVendorId) { toast('Pick a vendor first', 'error'); return; }
    try {
      await map.mutateAsync({ id: sourceId, vendorId: pickerVendorId, externalRef: attempt.externalRef });
      toast('Vendor mapped', 'success');
    } catch {
      toast('Failed to map vendor', 'error');
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { toast('Enter a vendor name', 'error'); return; }
    try {
      await map.mutateAsync({
        id: sourceId,
        newVendorName: newName.trim(),
        externalRef: attempt.externalRef,
      });
      toast(`Created and mapped "${newName}"`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create vendor', 'error');
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono dark:bg-zinc-800">{attempt.externalRef}</code>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{attempt.externalName ?? '(no name in payload)'}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {attempt.attempts}× attempt{attempt.attempts === 1 ? '' : 's'} · last {new Date(attempt.lastAttemptAt).toLocaleDateString()}
        </span>
      </div>

      {!creating ? (
        <div className="space-y-2">
          {attempt.suggestion && (
            <div className="rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-800 dark:bg-green-950/30 dark:text-green-300">
              <Sparkles size={11} className="mr-1 inline" />
              Suggested match: <strong>{attempt.suggestion.name}</strong>
              <span className="ml-1 text-green-700/70 dark:text-green-400/70">({attempt.suggestion.matchType} match)</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search runQ vendors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full rounded-md border border-zinc-300 bg-white pl-7 pr-2 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <Select
              value={pickerVendorId}
              onChange={(e) => setPickerVendorId(e.target.value)}
              options={[
                { value: '', label: '— pick vendor —' },
                ...candidates.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Button size="sm" onClick={handleMapExisting} loading={map.isPending} disabled={!pickerVendorId}>
              <LinkIcon size={12} /> Link
            </Button>
            <span className="text-xs text-zinc-400">or</span>
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              <UserPlus size={12} /> Create new vendor
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            Create a new runQ vendor and map it to this external ID:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Vendor display name"
              className="flex-1 min-w-[200px]"
            />
            <Button size="sm" onClick={handleCreate} loading={map.isPending} disabled={!newName.trim()}>
              <UserPlus size={12} /> Create &amp; map
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingRow({ sourceId, mapping }: { sourceId: string; mapping: { vendorId: string; vendorName: string; externalRef: string } }) {
  const unmap = useUnmapVendor();
  const { toast } = useToast();
  async function handleUnmap() {
    if (!confirm(`Remove the mapping for ${mapping.vendorName}? Future syncs for ${mapping.externalRef} will fail until remapped.`)) return;
    try {
      await unmap.mutateAsync({ id: sourceId, vendorId: mapping.vendorId });
      toast('Mapping removed', 'success');
    } catch {
      toast('Failed to unmap', 'error');
    }
  }
  return (
    <TableRow>
      <TableCell>
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{mapping.externalRef}</code>
      </TableCell>
      <TableCell className="text-sm">{mapping.vendorName}</TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" onClick={handleUnmap} loading={unmap.isPending}>
          <Trash2 size={12} /> Unmap
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── CSV mapping wizard ──────────────────────────────────────────────────────

function MappingSection({ sourceId, mapping }: { sourceId: string; mapping: Record<string, string> }) {
  const [proposalCsv, setProposalCsv] = useState('');
  const [proposal, setProposal] = useState<MappingProposal | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>(mapping);
  const propose = useProposeMapping();
  const save = useSaveMapping();
  const { toast } = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setProposalCsv(text);
    try {
      const res = await propose.mutateAsync({ id: sourceId, csv: text });
      setProposal(res.data);
      setEditing(res.data.columnMapping);
    } catch {
      toast('Failed to analyse CSV columns', 'error');
    }
  }

  async function handleSave() {
    try {
      await save.mutateAsync({
        id: sourceId,
        columnMapping: editing,
        dateFormat: proposal?.dateFormat,
        amountFormat: proposal?.amountFormat,
      });
      toast('Mapping saved', 'success');
    } catch {
      toast('Failed to save mapping', 'error');
    }
  }

  const headers = proposal ? [...new Set([...Object.keys(proposal.columnMapping), ...proposal.unmapped])] : Object.keys(editing);
  const hasContent = headers.length > 0;

  return (
    <Card>
      <CardHeader title="CSV column mapping" />
      <div className="border-b border-zinc-200 px-4 pb-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Upload a sample CSV — runQ will propose a column-to-field mapping using local heuristics and AI for unknown headers. Confirm once, then strict imports use the saved mapping.
      </div>
      <CardContent>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-600 dark:hover:text-zinc-100">
            <Wand2 size={14} className="text-indigo-500" />
            <span>Upload sample CSV to propose a mapping</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
          {propose.isPending && <div className="text-sm text-zinc-500">Analysing columns…</div>}

          {hasContent && (
            <>
              {proposal && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Mapping source: <Badge variant="default">{proposal.source}</Badge></span>
                  <span>Date format: <code>{proposal.dateFormat ?? '—'}</code></span>
                  <span>Amount format: <code>{proposal.amountFormat ?? '—'}</code></span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow><Th>CSV column</Th><Th>Maps to runQ field</Th></TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((h) => (
                    <TableRow key={h}>
                      <TableCell><code className="text-xs">{h}</code></TableCell>
                      <TableCell>
                        <Select
                          value={editing[h] ?? ''}
                          onChange={(e) => setEditing({ ...editing, [h]: e.target.value })}
                          options={CANONICAL_FIELDS.map((f) => ({ value: f, label: f || '— skip column —' }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end">
                <Button onClick={handleSave} loading={save.isPending}>Save mapping</Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CSV upload + preview ────────────────────────────────────────────────────

function CsvUploadSection({ sourceId, hasMapping }: { sourceId: string; hasMapping: boolean }) {
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const previewMut = usePreviewCsv();
  const commitMut = useCommitCsv();
  const { toast } = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await previewMut.mutateAsync({ id: sourceId, csv: text });
      setPreview(res.data);
    } catch {
      toast('Failed to parse CSV', 'error');
    }
  }

  async function handleCommit() {
    if (!preview?.bills.length) return;
    try {
      const res = await commitMut.mutateAsync({ id: sourceId, bills: preview.bills });
      const counts: Record<string, number> = {};
      for (const r of res.data.results) counts[r.status] = (counts[r.status] ?? 0) + 1;
      const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ');
      toast(`Imported — ${summary}`, 'success');
      setPreview(null);
    } catch {
      toast('Commit failed', 'error');
    }
  }

  return (
    <Card>
      <CardHeader title="Upload bills (CSV)" />
      <div className="border-b border-zinc-200 px-4 pb-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {hasMapping ? 'Strict ingest using the saved column mapping. Preview before committing.' : 'Save a column mapping above first — it tells runQ how to read the CSV.'}
      </div>
      <CardContent>
        <div className="space-y-3">
          <label className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm ${hasMapping ? 'border-zinc-300 text-zinc-600 hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-600 dark:hover:text-zinc-100' : 'pointer-events-none border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600'}`}>
            <Upload size={14} />
            <span>Upload CSV to preview</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={!hasMapping} />
          </label>
          {previewMut.isPending && <div className="text-sm text-zinc-500">Parsing…</div>}

          {preview && (
            <>
              {preview.errors.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
                  {preview.errors.map((e, i) => <div key={i}>Row {e.rowNum}: {e.message}</div>)}
                </div>
              )}
              {preview.preview.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow><Th>External ID</Th><Th>Vendor</Th><Th>Invoice #</Th><Th className="text-right">Total</Th><Th>Outcome</Th></TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((r) => (
                      <TableRow key={r.externalId}>
                        <TableCell><code className="text-xs">{r.externalId}</code></TableCell>
                        <TableCell>{r.vendorRef}</TableCell>
                        <TableCell>{r.invoiceNumber}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{r.totalAmount.toLocaleString('en-IN')}</TableCell>
                        <TableCell>
                          <Badge variant={r.outcome === 'invalid' || r.outcome === 'unknown_vendor' ? 'danger' : 'default'}>
                            {r.outcome}{r.message ? ` — ${r.message}` : ''}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {preview.bills.length > 0 && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
                  <Button onClick={handleCommit} loading={commitMut.isPending}>
                    <FileSpreadsheet size={14} /> Import {preview.bills.length} bill{preview.bills.length === 1 ? '' : 's'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Logs ────────────────────────────────────────────────────────────────────

function LogsSection({ sourceId }: { sourceId: string }) {
  const { data, isLoading } = useBillSyncLogs(sourceId);
  return (
    <Card>
      <CardHeader title="Recent activity" />
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.data.length ? (
          <div className="text-sm text-zinc-500">No activity yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><Th>When</Th><Th>External ID</Th><Th>Action</Th><Th>Status</Th><Th>Detail</Th></TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-zinc-500">{new Date(l.createdAt).toLocaleString()}</TableCell>
                  <TableCell><code className="text-xs">{l.externalId ?? '—'}</code></TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell><Badge variant={l.status === 'rejected' ? 'danger' : l.status === 'created' || l.status === 'updated' ? 'success' : 'default'}>{l.status}</Badge></TableCell>
                  <TableCell className="text-xs text-zinc-500">{l.message ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
