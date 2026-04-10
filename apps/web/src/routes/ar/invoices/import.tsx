import { useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, FileSpreadsheet, X, Check, AlertTriangle, ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Input, Select, Combobox, Modal, Badge, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useParseInvoices, useCommitInvoiceImport } from '@/hooks/queries/use-invoice-import';
import { useCustomers, useCreateCustomer } from '@/hooks/queries/use-customers';
import { useItems, useCreateItem } from '@/hooks/queries/use-items';
import type { ImportFormat, ParsedInvoice, ParsedLineItem } from '@runq/types';

/** Sentinel option value used by the inline-create dropdowns. */
const CREATE_NEW = '__create_new__';

/**
 * Extract a size suffix like "500ml", "1000ml", "200g", "1kg" from a name.
 * Used to pre-fill the Unit field on the inline item-create modal so the
 * user doesn't have to retype it.
 */
function extractUnit(name: string): string {
  const m = name.match(/(\d+(?:\.\d+)?\s*(?:ml|g|kg|l|pcs|nos))\s*$/i);
  return m ? m[1]!.replace(/\s+/g, '').toLowerCase() : '';
}

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'generic-rows', label: 'Generic CSV/xlsx (runq schema)' },
  { value: 'single-invoice-template', label: 'Single-invoice template (one file = one invoice)' },
];

type RowStatus = 'ready' | 'needs-mapping' | 'error';

function statusForInvoice(inv: ParsedInvoice): RowStatus {
  if (!inv.parseable) return 'error';
  if (!inv.customerMatch.resolvedId) return 'needs-mapping';
  if (inv.lineItems.some((li) => !li.match.resolvedId)) return 'needs-mapping';
  return 'ready';
}

const STATUS_BADGE: Record<RowStatus, { variant: 'success' | 'warning' | 'danger'; label: string }> = {
  ready: { variant: 'success', label: 'Ready' },
  'needs-mapping': { variant: 'warning', label: 'Needs Mapping' },
  error: { variant: 'danger', label: 'Error' },
};

export function InvoiceImportPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<ImportFormat>('auto');
  const [staged, setStaged] = useState<ParsedInvoice[] | null>(null);
  const [failedFiles, setFailedFiles] = useState<{ fileName: string; error: string }[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [commitResult, setCommitResult] = useState<Awaited<ReturnType<typeof commitMutation.mutateAsync>>['data'] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseMutation = useParseInvoices();
  const commitMutation = useCommitInvoiceImport();

  // Master data for the inline pickers when a row needs mapping.
  const { data: customersData } = useCustomers({ limit: 500 });
  const customerOpts = useMemo(
    () =>
      [
        { value: '', label: 'Select customer…' },
        { value: CREATE_NEW, label: '+ Create new customer…' },
      ].concat((customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }))),
    [customersData],
  );

  const { data: itemsData } = useItems({ limit: 500 });
  const itemOpts = useMemo(
    () =>
      [
        { value: '', label: 'Select item…' },
        { value: CREATE_NEW, label: '+ Create new item…' },
      ].concat(
        (itemsData?.data ?? [])
          .filter((i) => i.isActive)
          .map((i) => ({
            value: i.id,
            label: `${i.name}${i.sku ? ` (${i.sku})` : ''}${i.unit ? ` · ${i.unit}` : ''}`,
          })),
      ),
    [itemsData],
  );
  // Map itemId → unit for the matched-row UOM badge. Built once and
  // passed down so LineRow doesn't have to scan the items array per row.
  const itemUnitById = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of itemsData?.data ?? []) {
      if (i.unit) map.set(i.id, i.unit);
    }
    return map;
  }, [itemsData]);

  // Inline create modal state. Both forms identify the row(s) they were
  // opened for so we can auto-map after the master record is created.
  const [createCustomerCtx, setCreateCustomerCtx] = useState<{ invoiceIdx: number } | null>(null);
  const [createItemCtx, setCreateItemCtx] = useState<{ invoiceIdx: number; lineIdx: number } | null>(null);

  const stats = useMemo(() => {
    if (!staged) return null;
    const counts = { ready: 0, needsMapping: 0, error: 0 };
    for (const inv of staged) {
      const s = statusForInvoice(inv);
      if (s === 'ready') counts.ready++;
      else if (s === 'needs-mapping') counts.needsMapping++;
      else counts.error++;
    }
    return counts;
  }, [staged]);

  const allReady = stats != null && stats.needsMapping === 0 && stats.error === 0 && (staged?.length ?? 0) > 0;

  function onFilesPicked(picked: FileList | null) {
    if (!picked) return;
    const arr = Array.from(picked);
    setFiles((prev) => [...prev, ...arr]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleParse() {
    if (files.length === 0) {
      toast('Pick at least one file', 'error');
      return;
    }
    try {
      const result = await parseMutation.mutateAsync({ files, format });
      setStaged(result.invoices);
      setFailedFiles(result.failedFiles);
      setCommitResult(null);
      if (result.invoices.length === 0) {
        toast('No invoices parsed from the uploaded files', 'error');
      } else {
        toast(`Parsed ${result.invoices.length} invoice${result.invoices.length === 1 ? '' : 's'}`, 'success');
      }
    } catch (err) {
      toast((err as Error).message || 'Parse failed', 'error');
    }
  }

  function updateInvoice(idx: number, updater: (inv: ParsedInvoice) => ParsedInvoice) {
    setStaged((prev) => (prev ? prev.map((inv, i) => (i === idx ? updater(inv) : inv)) : prev));
  }

  function setCustomerForInvoice(idx: number, customerId: string) {
    if (customerId === CREATE_NEW) {
      setCreateCustomerCtx({ invoiceIdx: idx });
      return;
    }
    const customer = customersData?.data.find((c) => c.id === customerId);
    updateInvoice(idx, (inv) => ({
      ...inv,
      customerMatch: customerId
        ? {
            resolvedId: customerId,
            source: 'fuzzy-master',
            confidence: 1,
            resolvedName: customer?.name ?? null,
            suggestions: inv.customerMatch.suggestions,
          }
        : { ...inv.customerMatch, resolvedId: null, resolvedName: null, source: 'unmatched', confidence: 0 },
    }));
  }

  function setItemForLine(invIdx: number, lineIdx: number, itemId: string) {
    if (itemId === CREATE_NEW) {
      setCreateItemCtx({ invoiceIdx: invIdx, lineIdx });
      return;
    }
    const item = itemsData?.data.find((i) => i.id === itemId);
    updateInvoice(invIdx, (inv) => ({
      ...inv,
      lineItems: inv.lineItems.map((li, i) =>
        i === lineIdx
          ? {
              ...li,
              match: itemId
                ? {
                    resolvedId: itemId,
                    source: 'fuzzy-master',
                    confidence: 1,
                    resolvedName: item?.name ?? null,
                    suggestions: li.match.suggestions,
                  }
                : { ...li.match, resolvedId: null, resolvedName: null, source: 'unmatched', confidence: 0 },
            }
          : li,
      ),
    }));
  }

  function removeStagedInvoice(idx: number) {
    setStaged((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  function toggleCollapsed(idx: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleCommit() {
    if (!staged || !allReady) return;
    try {
      const res = await commitMutation.mutateAsync({
        invoices: staged,
        defaultStatus: 'draft',
        persistAliases: true,
      });
      setCommitResult(res.data);
      toast(
        `Imported ${res.data.created.length} invoice${res.data.created.length === 1 ? '' : 's'}` +
          (res.data.skipped.length > 0 ? ` · ${res.data.skipped.length} skipped` : '') +
          (res.data.errors.length > 0 ? ` · ${res.data.errors.length} errors` : ''),
        res.data.errors.length > 0 ? 'error' : 'success',
      );
    } catch (err) {
      toast((err as Error).message || 'Commit failed', 'error');
    }
  }

  function reset() {
    setFiles([]);
    setStaged(null);
    setFailedFiles([]);
    setCommitResult(null);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Invoices', href: '/ar/invoices' }, { label: 'Import' }]}
        title="Import Invoices"
        description="Bulk-import invoices from CSV, xlsx, or PDF. Imported invoices land as drafts so you can review them before sending."
      />

      {/* Step 1: Upload */}
      {!staged && !commitResult && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ImportFormat)}
                options={FORMAT_OPTIONS}
              />
            </div>

            {/* Drop zone */}
            <div
              className="rounded-lg border-2 border-dashed border-zinc-300 p-8 text-center transition-colors hover:border-indigo-400 dark:border-zinc-700 dark:hover:border-indigo-500"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onFilesPicked(e.dataTransfer.files);
              }}
            >
              <Upload size={32} className="mx-auto text-zinc-400" />
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Drag &amp; drop one or more files here, or
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2"
              >
                Browse files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp"
                hidden
                onChange={(e) => onFilesPicked(e.target.files)}
              />
              <p className="mt-2 text-xs text-zinc-500">xlsx, csv, pdf, or image (jpg/png) · max 10 MB each</p>
            </div>

            {/* Picked files */}
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet size={14} className="text-zinc-400 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-zinc-500">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="rounded p-1 text-zinc-400 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button onClick={handleParse} loading={parseMutation.isPending} disabled={files.length === 0}>
                Parse {files.length > 0 ? `(${files.length} file${files.length === 1 ? '' : 's'})` : ''}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Staging preview */}
      {staged && !commitResult && (
        <div className="space-y-3">
          {/* Top bar with stats + commit button */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{staged.length} invoice{staged.length === 1 ? '' : 's'} parsed</span>
                {stats && (
                  <>
                    {stats.ready > 0 && <Badge variant="success">{stats.ready} ready</Badge>}
                    {stats.needsMapping > 0 && <Badge variant="warning">{stats.needsMapping} need mapping</Badge>}
                    {stats.error > 0 && <Badge variant="danger">{stats.error} errors</Badge>}
                  </>
                )}
                {failedFiles.length > 0 && (
                  <Badge variant="danger">{failedFiles.length} file{failedFiles.length === 1 ? '' : 's'} failed</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  Start over
                </Button>
                <Button onClick={handleCommit} loading={commitMutation.isPending} disabled={!allReady}>
                  Import as draft
                </Button>
              </div>
            </CardContent>
          </Card>

          {failedFiles.length > 0 && (
            <Card>
              <CardContent className="space-y-1 p-4 text-xs">
                <p className="font-medium text-red-700 dark:text-red-400">Files that couldn't be parsed:</p>
                {failedFiles.map((f) => (
                  <div key={f.fileName} className="text-zinc-600 dark:text-zinc-400">
                    <span className="font-mono">{f.fileName}</span>: {f.error}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {staged.map((inv, idx) => (
            <StagedInvoiceCard
              key={`${inv.sourceFile}-${inv.invoiceNumber}-${idx}`}
              invoice={inv}
              isCollapsed={collapsed.has(idx)}
              onToggleCollapse={() => toggleCollapsed(idx)}
              onRemove={() => removeStagedInvoice(idx)}
              customerOpts={customerOpts}
              itemOpts={itemOpts}
              itemUnitById={itemUnitById}
              onSetCustomer={(id) => setCustomerForInvoice(idx, id)}
              onSetItem={(lineIdx, id) => setItemForLine(idx, lineIdx, id)}
            />
          ))}
        </div>
      )}

      {/* Step 3: Result summary */}
      {commitResult && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Import complete</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Created</p>
                <p className="font-mono text-2xl font-semibold text-emerald-900 dark:text-emerald-200">
                  {commitResult.created.length}
                </p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">Skipped (duplicates)</p>
                <p className="font-mono text-2xl font-semibold text-amber-900 dark:text-amber-200">
                  {commitResult.skipped.length}
                </p>
              </div>
              <div className="rounded border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-400">Errors</p>
                <p className="font-mono text-2xl font-semibold text-red-900 dark:text-red-200">
                  {commitResult.errors.length}
                </p>
              </div>
            </div>

            {commitResult.aliasesPersisted > 0 && (
              <p className="text-xs text-zinc-500">
                Saved {commitResult.aliasesPersisted} new name mapping
                {commitResult.aliasesPersisted === 1 ? '' : 's'} for next time.
              </p>
            )}

            {commitResult.skipped.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-amber-700 dark:text-amber-400">Skipped invoices</summary>
                <ul className="mt-1 ml-4 list-disc space-y-0.5">
                  {commitResult.skipped.map((s) => (
                    <li key={s.invoiceNumber}>
                      <span className="font-mono">{s.invoiceNumber}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {commitResult.errors.length > 0 && (
              <details className="text-xs" open>
                <summary className="cursor-pointer text-red-700 dark:text-red-400">Errors</summary>
                <ul className="mt-1 ml-4 list-disc space-y-0.5">
                  {commitResult.errors.map((e, i) => (
                    <li key={`${e.invoiceNumber}-${i}`}>
                      <span className="font-mono">{e.invoiceNumber ?? e.sourceFile}</span> — {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={() => navigate({ to: '/ar/invoices' })}>Go to Invoices</Button>
              <Button variant="outline" onClick={reset}>
                Import more
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inline customer-create modal */}
      {createCustomerCtx && staged && (
        <CreateCustomerModal
          source={staged[createCustomerCtx.invoiceIdx]!}
          onClose={() => setCreateCustomerCtx(null)}
          onCreated={(customerId, customerName) => {
            updateInvoice(createCustomerCtx.invoiceIdx, (inv) => ({
              ...inv,
              customerMatch: {
                resolvedId: customerId,
                source: 'fuzzy-master',
                confidence: 1,
                resolvedName: customerName,
                suggestions: inv.customerMatch.suggestions,
              },
            }));
            setCreateCustomerCtx(null);
          }}
        />
      )}

      {/* Inline item-create modal */}
      {createItemCtx && staged && (
        <CreateItemModal
          source={staged[createItemCtx.invoiceIdx]!.lineItems[createItemCtx.lineIdx]!}
          onClose={() => setCreateItemCtx(null)}
          onCreated={(itemId, itemName) => {
            const { invoiceIdx, lineIdx } = createItemCtx;
            updateInvoice(invoiceIdx, (inv) => ({
              ...inv,
              lineItems: inv.lineItems.map((li, i) =>
                i === lineIdx
                  ? {
                      ...li,
                      match: {
                        resolvedId: itemId,
                        source: 'fuzzy-master',
                        confidence: 1,
                        resolvedName: itemName,
                        suggestions: li.match.suggestions,
                      },
                    }
                  : li,
              ),
            }));
            setCreateItemCtx(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Inline create modals ──────────────────────────────────────────────────

function CreateCustomerModal({
  source,
  onClose,
  onCreated,
}: {
  source: ParsedInvoice;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const create = useCreateCustomer();
  const { toast } = useToast();
  const [name, setName] = useState(source.customerSourceName);
  const [gstin, setGstin] = useState(source.customerSourceGstin ?? '');
  const [state, setState] = useState('');

  async function handleSave() {
    if (!name.trim()) {
      toast('Customer name is required', 'error');
      return;
    }
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        type: 'b2b',
        gstin: gstin.trim() || null,
        state: state.trim() || null,
        paymentTermsDays: 30,
      });
      toast('Customer created', 'success');
      onCreated(res.data.id, res.data.name);
    } catch (err) {
      toast((err as Error).message || 'Failed to create customer', 'error');
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Create new customer">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Pre-filled from <span className="font-mono">{source.sourceFile}</span>. You can edit the
          full record later from the Customers page.
        </p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="GSTIN"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="29AAMCT1355L1ZS"
          />
          <Input
            label="State"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Karnataka"
          />
        </div>
        <p className="text-[11px] text-zinc-500">
          Tip: GSTIN's first two digits drive the place-of-supply / IGST vs CGST/SGST split. Set
          State if no GSTIN.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={create.isPending} onClick={handleSave}>
            <Plus size={14} /> Create &amp; map
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateItemModal({
  source,
  onClose,
  onCreated,
}: {
  source: ParsedLineItem;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const create = useCreateItem();
  const { toast } = useToast();
  const [name, setName] = useState(source.sourceName);
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState(extractUnit(source.sourceName));
  const [hsnSacCode, setHsnSacCode] = useState(source.hsnSacCode ?? '');
  const [gstRate, setGstRate] = useState<string>(source.taxRate != null ? String(source.taxRate) : '0');
  const [defaultSellingPrice, setDefaultSellingPrice] = useState<string>(String(source.unitPrice));

  async function handleSave() {
    if (!name.trim()) {
      toast('Item name is required', 'error');
      return;
    }
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        type: 'product',
        sku: sku.trim() || null,
        unit: unit.trim() || null,
        hsnSacCode: hsnSacCode.trim() || null,
        gstRate: gstRate ? Number(gstRate) : null,
        defaultSellingPrice: defaultSellingPrice ? Number(defaultSellingPrice) : null,
      });
      toast('Item created', 'success');
      onCreated(res.data.id, res.data.name);
    } catch (err) {
      toast((err as Error).message || 'Failed to create item', 'error');
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Create new item">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Pre-filled from the staged line. You can edit cost, margin, and other fields later from
          the Items page.
        </p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} />
          <Input label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="500ml, 200g, pcs" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="HSN/SAC"
            value={hsnSacCode}
            onChange={(e) => setHsnSacCode(e.target.value)}
            placeholder="04031000"
          />
          <Input
            label="GST %"
            type="number"
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
            placeholder="5"
          />
          <Input
            label="Default Sell Price"
            type="number"
            value={defaultSellingPrice}
            onChange={(e) => setDefaultSellingPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={create.isPending} onClick={handleSave}>
            <Plus size={14} /> Create &amp; map
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StagedInvoiceCard({
  invoice,
  isCollapsed,
  onToggleCollapse,
  onRemove,
  customerOpts,
  itemOpts,
  itemUnitById,
  onSetCustomer,
  onSetItem,
}: {
  invoice: ParsedInvoice;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRemove: () => void;
  customerOpts: { value: string; label: string }[];
  itemOpts: { value: string; label: string }[];
  itemUnitById: Map<string, string>;
  onSetCustomer: (id: string) => void;
  onSetItem: (lineIdx: number, id: string) => void;
}) {
  const status = statusForInvoice(invoice);
  const badge = STATUS_BADGE[status];
  const customerNeeded = !invoice.customerMatch.resolvedId;
  const unmatchedItemCount = invoice.lineItems.filter((li) => !li.match.resolvedId).length;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <div className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-zinc-900 dark:text-zinc-100">{invoice.invoiceNumber}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-700 dark:text-zinc-300">{invoice.invoiceDate}</span>
            <span className="text-zinc-500">·</span>
            <span className="truncate text-zinc-700 dark:text-zinc-300">
              {invoice.customerMatch.resolvedName || invoice.customerSourceName}
            </span>
            <span className="ml-auto font-mono text-zinc-900 dark:text-zinc-100">
              {formatINR(invoice.sourceGrandTotal || invoice.computedSubtotal)}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            title="Remove from this batch"
            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {!isCollapsed && (
          <div className="space-y-3 p-4">
            {/* Source file + warnings */}
            <div className="text-xs text-zinc-500">
              From <span className="font-mono">{invoice.sourceFile}</span> · parser:{' '}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{invoice.parserUsed}</code>
            </div>
            {invoice.warnings.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    {invoice.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Customer mapping */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Customer (source: {invoice.customerSourceName || '—'}
                {invoice.customerSourceGstin ? ` · ${invoice.customerSourceGstin}` : ''})
              </label>
              {customerNeeded ? (
                <Combobox
                  options={customerOpts}
                  value=""
                  onChange={onSetCustomer}
                  placeholder="Pick the customer…"
                />
              ) : (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Check size={14} className="text-emerald-600" />
                  <span className="text-zinc-900 dark:text-zinc-100">{invoice.customerMatch.resolvedName}</span>
                  <button
                    type="button"
                    onClick={() => onSetCustomer('')}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    change
                  </button>
                </div>
              )}
            </div>

            {/* Line items table */}
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Source name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Mapped item</th>
                    <th className="w-16 px-3 py-2 text-right text-xs font-medium text-zinc-500">Qty</th>
                    <th className="w-24 px-3 py-2 text-right text-xs font-medium text-zinc-500">Rate</th>
                    <th className="w-24 px-3 py-2 text-right text-xs font-medium text-zinc-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li, idx) => (
                    <LineRow
                      key={`${li.sourceName}-${idx}`}
                      line={li}
                      itemOpts={itemOpts}
                      itemUnitById={itemUnitById}
                      onSetItem={(id) => onSetItem(idx, id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {unmatchedItemCount > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {unmatchedItemCount} item{unmatchedItemCount === 1 ? '' : 's'} need mapping before this invoice can be imported.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LineRow({
  line,
  itemOpts,
  itemUnitById,
  onSetItem,
}: {
  line: ParsedLineItem;
  itemOpts: { value: string; label: string }[];
  itemUnitById: Map<string, string>;
  onSetItem: (id: string) => void;
}) {
  const matched = !!line.match.resolvedId;
  const lowConfidence = matched && line.match.confidence < 0.85;
  const matchedUnit = matched && line.match.resolvedId ? itemUnitById.get(line.match.resolvedId) : undefined;

  return (
    <tr className="border-t border-zinc-100 align-top dark:border-zinc-800">
      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
        {line.sourceName}
        {line.hsnSacCode && (
          <div className="text-[10px] text-zinc-500">HSN {line.hsnSacCode}</div>
        )}
      </td>
      <td className="px-3 py-2">
        {matched ? (
          <div className="flex items-center gap-2">
            <Check size={14} className={lowConfidence ? 'text-amber-500' : 'text-emerald-600'} />
            <span className="text-zinc-900 dark:text-zinc-100">{line.match.resolvedName}</span>
            {matchedUnit && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">· {matchedUnit}</span>
            )}
            <button
              type="button"
              onClick={() => onSetItem('')}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              change
            </button>
            {lowConfidence && (
              <Badge variant="warning">low conf {(line.match.confidence * 100).toFixed(0)}%</Badge>
            )}
          </div>
        ) : (
          <Combobox
            options={itemOpts}
            value=""
            onChange={onSetItem}
            placeholder="Pick item…"
          />
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-700 dark:text-zinc-300">{line.quantity}</td>
      <td className="px-3 py-2 text-right font-mono text-zinc-700 dark:text-zinc-300">{formatINR(line.unitPrice)}</td>
      <td className="px-3 py-2 text-right font-mono text-zinc-900 dark:text-zinc-100">{formatINR(line.lineTotal)}</td>
    </tr>
  );
}
