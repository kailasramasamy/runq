// AP Pattern-B vendor catalog admin UI. Spec: docs/ap-pattern-b-spec.md §4.
// Slots into the vendor detail page as a self-contained section: list of
// catalog rows, "Add entry" + "Suggestions" affordances, edit / deactivate
// per row, and a price-history modal. Drives the same hooks the bill-line
// pickers consume so manual edits propagate everywhere immediately.

import { useState, useMemo } from 'react';
import { Plus, Pencil, History, Lightbulb, Link2, BookMarked, Trash2 } from 'lucide-react';
import {
  Button, Modal, Input, Select, Combobox, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState,
} from '@/components/ui';
import {
  useVendorCatalog,
  useVendorCatalogSuggestions,
  useVendorCatalogPriceHistory,
  useCreateVendorCatalogItem,
  useUpdateVendorCatalogItem,
  useDeleteVendorCatalogItem,
  type VendorCatalogItem,
  type VendorCatalogSuggestion,
} from '@/hooks/queries/use-vendor-catalog';
import { useItems } from '@/hooks/queries/use-items';
import { formatINR } from '@/lib/utils';
import type {
  CreateVendorCatalogItemInput,
  UpdateVendorCatalogItemInput,
} from '@runq/validators';

interface Props { vendorId: string }

const TAX_CATEGORY_OPTIONS = [
  { value: '', label: '—' },
  { value: 'taxable', label: 'Taxable' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'nil_rated', label: 'Nil Rated' },
  { value: 'zero_rated', label: 'Zero Rated' },
  { value: 'reverse_charge', label: 'Reverse Charge' },
];

export function VendorCatalogSection({ vendorId }: Props) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();
  const removeItem = useDeleteVendorCatalogItem(vendorId);

  const { data: list, isLoading } = useVendorCatalog(vendorId, search.trim() || undefined);
  const { data: suggestionsRes } = useVendorCatalogSuggestions(vendorId);
  const rows = list?.data ?? [];
  const suggestions = suggestionsRes?.data ?? [];

  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows],
  );
  const deletingRow = useMemo(
    () => (deletingId ? rows.find((r) => r.id === deletingId) ?? null : null),
    [deletingId, rows],
  );

  // The row leaves the catalog either way; the toast distinguishes a true
  // purge from the deactivate fallback for rows already used on a PO/GRN.
  const confirmRemove = () => {
    if (!deletingId) return;
    removeItem.mutate(deletingId, {
      onSuccess: (res) => {
        toast(
          res.data.deleted
            ? 'Catalog entry deleted'
            : 'Entry removed from the catalog. It stays on the documents that already use it.',
          'success',
        );
        setDeletingId(null);
      },
      onError: () => toast('Failed to remove entry', 'error'),
    });
  };

  return (
    <div
      className="rounded-xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between px-5 py-3.5">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Vendor catalog
          </h3>
          <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            Reusable line items for this vendor. Drives PO + bill suggestions.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={13} className="mr-1" />
          Add entry
        </Button>
      </div>

      {/* Frequent-uncatalogued suggestions — surfaces 3+ occurrences in
          the last 60 days that haven't been promoted yet. One-tap "Add to
          catalog" pre-fills the modal from the bill-line sample. */}
      {suggestions.length > 0 && (
        <div
          className="mx-5 mb-3 rounded-lg border px-3 py-2.5"
          style={{
            background: 'var(--amber-soft, rgba(245, 158, 11, 0.08))',
            borderColor: 'var(--amber-border, rgba(245, 158, 11, 0.3))',
          }}
        >
          <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: 'var(--text-1)' }}>
            <Lightbulb size={13} />
            Frequent lines not in catalog
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((s) => (
              <SuggestionChip
                key={s.normalizedDescription}
                suggestion={s}
                onAdd={() => {
                  setCreating(true);
                  // Defer to the modal; it reads `prefill` via closure.
                  setPrefillRef(s);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-5 pb-3">
        <Input
          placeholder="Search catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="px-5 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No catalog entries yet"
          description={
            search
              ? 'No entries match this search.'
              : 'Add entries here or tick "Save to catalog" while creating POs / bills.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <Th>Description</Th>
              <Th>UOM</Th>
              <Th align="right">Default rate</Th>
              <Th>HSN/SAC</Th>
              <Th align="right">Tax %</Th>
              <Th>Inventory link</Th>
              <Th align="right">Uses</Th>
              <Th className="w-[120px]" />
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="text-[12.5px]" style={{ color: 'var(--text-1)' }}>
                    {row.description}
                  </div>
                  {row.defaultTaxCategory && (
                    <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {row.defaultTaxCategory.replace(/_/g, ' ')}
                    </div>
                  )}
                </TableCell>
                <TableCell>{row.defaultUom ?? '—'}</TableCell>
                <TableCell align="right" numeric>
                  {row.defaultRate ? formatINR(Number(row.defaultRate)) : '—'}
                </TableCell>
                <TableCell>{row.hsnSacCode ?? '—'}</TableCell>
                <TableCell align="right">
                  {row.defaultTaxRate ? `${row.defaultTaxRate}%` : '—'}
                </TableCell>
                <TableCell>
                  {row.inventoryItemId ? (
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                      style={{ background: 'var(--info-soft, rgba(99,102,241,0.1))', color: 'var(--info, #6366f1)' }}
                    >
                      <Link2 size={10} />
                      Linked
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>—</span>
                  )}
                </TableCell>
                <TableCell align="right" numeric>{row.useCount}</TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => setHistoryForId(row.id)}
                      title="Price history"
                    >
                      <History size={13} />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => setEditingId(row.id)}
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => setDeletingId(row.id)}
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmationDialog
        open={!!deletingRow}
        onClose={() => setDeletingId(null)}
        onConfirm={confirmRemove}
        title="Remove catalog entry?"
        description={`"${deletingRow?.description ?? ''}" will no longer be suggested on bills or POs for this vendor. If it's already used on a PO or goods receipt, it stays on those documents.`}
        confirmLabel="Remove"
        variant="danger"
        loading={removeItem.isPending}
      />

      <CatalogEntryModal
        vendorId={vendorId}
        open={creating}
        onClose={() => { setCreating(false); setPrefillRef(null); }}
        initial={null}
        prefillSuggestion={prefillRefValue}
      />
      <CatalogEntryModal
        vendorId={vendorId}
        open={!!editingRow}
        onClose={() => setEditingId(null)}
        initial={editingRow}
      />
      <PriceHistoryModal
        vendorId={vendorId}
        itemId={historyForId}
        onClose={() => setHistoryForId(null)}
      />
    </div>
  );
}

// Module-level prefill ref dodges prop drilling for the one-shot
// "Add this suggestion" hand-off. Reset by the modal on close.
let prefillRefValue: VendorCatalogSuggestion | null = null;
function setPrefillRef(s: VendorCatalogSuggestion | null) { prefillRefValue = s; }

function SuggestionChip({ suggestion, onAdd }: {
  suggestion: VendorCatalogSuggestion; onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] hover:opacity-80"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--amber-border, rgba(245, 158, 11, 0.3))',
        color: 'var(--text-1)',
      }}
      title={`Seen ${suggestion.occurrences} times since ${suggestion.firstSeen}`}
    >
      <Plus size={11} />
      {suggestion.description}
      <span style={{ color: 'var(--text-3)' }}>·{suggestion.occurrences}×</span>
    </button>
  );
}

function CatalogEntryModal({
  vendorId, open, onClose, initial, prefillSuggestion,
}: {
  vendorId: string;
  open: boolean;
  onClose: () => void;
  initial: VendorCatalogItem | null;
  prefillSuggestion?: VendorCatalogSuggestion | null;
}) {
  const { toast } = useToast();
  const createMutation = useCreateVendorCatalogItem(vendorId);
  const updateMutation = useUpdateVendorCatalogItem(vendorId);
  const { data: itemsData } = useItems({ limit: 200 });
  const itemOptions = useMemo(
    () => [
      { value: '', label: '— Not tracked —' },
      ...(itemsData?.data?.filter((i) => i.isActive).map((i) => ({
        value: i.id,
        label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
      })) ?? []),
    ],
    [itemsData],
  );

  const [description, setDescription] = useState('');
  const [defaultUom, setDefaultUom] = useState('');
  const [defaultRate, setDefaultRate] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [defaultTaxRate, setDefaultTaxRate] = useState('');
  const [defaultTaxCategory, setDefaultTaxCategory] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Reset state whenever the modal opens with new context.
  useMemo(() => {
    if (!open) return;
    if (initial) {
      setDescription(initial.description);
      setDefaultUom(initial.defaultUom ?? '');
      setDefaultRate(initial.defaultRate ?? '');
      setHsnSacCode(initial.hsnSacCode ?? '');
      setDefaultTaxRate(initial.defaultTaxRate ?? '');
      setDefaultTaxCategory(initial.defaultTaxCategory ?? '');
      setInventoryItemId(initial.inventoryItemId ?? '');
      setIsActive(initial.isActive);
    } else {
      setDescription(prefillSuggestion?.description ?? '');
      setDefaultUom('');
      setDefaultRate(prefillSuggestion?.sampleUnitPrice ?? '');
      setHsnSacCode(prefillSuggestion?.sampleHsnSac ?? '');
      setDefaultTaxRate('');
      setDefaultTaxCategory('');
      setInventoryItemId('');
      setIsActive(true);
    }
  }, [open, initial, prefillSuggestion]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast('Description is required', 'error');
      return;
    }
    const base: CreateVendorCatalogItemInput = {
      description: description.trim(),
      defaultUom: defaultUom.trim() || null,
      defaultRate: defaultRate.trim() ? Number(defaultRate) : null,
      hsnSacCode: hsnSacCode.trim() || null,
      defaultTaxRate: defaultTaxRate.trim() ? Number(defaultTaxRate) : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defaultTaxCategory: (defaultTaxCategory || null) as any,
      inventoryItemId: inventoryItemId || null,
    };
    if (initial) {
      const patch: UpdateVendorCatalogItemInput = { ...base, isActive };
      updateMutation.mutate(
        { itemId: initial.id, data: patch },
        {
          onSuccess: () => { toast('Catalog entry updated', 'success'); onClose(); },
          onError: () => toast('Failed to update entry', 'error'),
        },
      );
    } else {
      createMutation.mutate(base, {
        onSuccess: () => { toast('Catalog entry added', 'success'); onClose(); },
        onError: () => toast('Failed to add entry', 'error'),
      });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit catalog entry' : 'Add catalog entry'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Pkg Film 50mic HDPE"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="UOM"
            value={defaultUom}
            onChange={(e) => setDefaultUom(e.target.value)}
            placeholder="kg, pcs, rolls…"
          />
          <Input
            label="Default rate"
            type="number" step="0.01" min="0"
            value={defaultRate}
            onChange={(e) => setDefaultRate(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="HSN/SAC"
            value={hsnSacCode}
            onChange={(e) => setHsnSacCode(e.target.value)}
          />
          <Input
            label="Tax %"
            type="number" step="0.01" min="0" max="100"
            value={defaultTaxRate}
            onChange={(e) => setDefaultTaxRate(e.target.value)}
          />
          <Select
            label="Tax category"
            value={defaultTaxCategory}
            onChange={(e) => setDefaultTaxCategory(e.target.value)}
            options={TAX_CATEGORY_OPTIONS}
          />
        </div>
        <Combobox
          label="Linked inventory item"
          options={itemOptions}
          value={inventoryItemId}
          onChange={(v) => setInventoryItemId(v)}
          placeholder="— Not tracked —"
        />
        <p className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          Linking pre-populates the items-received sub-form when this entry appears on a bill.
        </p>
        {initial && (
          <label className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-1)' }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            />
            Active (uncheck to hide from pickers)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {initial ? 'Save' : 'Add entry'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PriceHistoryModal({ vendorId, itemId, onClose }: {
  vendorId: string; itemId: string | null; onClose: () => void;
}) {
  const { data, isLoading } = useVendorCatalogPriceHistory(vendorId, itemId);
  const rows = data?.data ?? [];
  return (
    <Modal open={!!itemId} onClose={onClose} title="Price history">
      {isLoading ? (
        <p className="py-4 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No price changes"
          description="This entry has not been updated yet."
        />
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <tr>
                <Th>Date</Th>
                <Th align="right">Rate</Th>
                <Th>Source</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.changedAt).toLocaleString('en-IN')}</TableCell>
                  <TableCell align="right" numeric>{formatINR(Number(r.rate))}</TableCell>
                  <TableCell>{r.sourceDocType}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
