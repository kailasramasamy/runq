import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, Pencil, Zap } from 'lucide-react';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useItems } from '@/hooks/queries/use-items';
import type { Item } from '@/hooks/queries/use-items';
import { resolvePrice } from '@/hooks/queries/use-price-lists';
import {
  useQuickTemplates, useQuickTemplate, useCreateQuickTemplate, useUpdateQuickTemplate,
  useDeleteQuickTemplate,
  type QuickInvoiceTemplate, type CreateQuickTemplateInput,
} from '@/hooks/queries/use-quick-templates';
import { GenerateInvoiceModal } from '@/components/ar/generate-invoice-modal';

// ─── Template Form ────────────────────────────────────────────────────────────

interface TemplateLineRow {
  /** Stable client-side row id. Used as React key so deleting a middle row
   *  doesn't cause the row below to inherit its DOM position. */
  rowId: string;
  itemId: string;
  description: string;
  hsnSacCode: string;
  unitPrice: string;
  taxRate: string;
  defaultQuantity: string;
  /** Source of the unitPrice that was last auto-populated. UI hint only. */
  priceSource?: 'priceList' | 'itemDefault' | null;
  priceListName?: string | null;
}

let rowIdCounter = 0;
function newRowId() { return `r${Date.now().toString(36)}_${rowIdCounter++}`; }
function emptyRow(): TemplateLineRow {
  return {
    rowId: newRowId(),
    itemId: '', description: '', hsnSacCode: '', unitPrice: '', taxRate: '0', defaultQuantity: '',
  };
}

function TemplateForm({ template, onClose }: { template?: QuickInvoiceTemplate; onClose: () => void }) {
  const create = useCreateQuickTemplate();
  const update = useUpdateQuickTemplate();
  const { toast } = useToast();
  const isEdit = !!template;

  const { data: customersData } = useCustomers({ limit: 100 });
  const customerOptions = (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const { data: itemsData } = useItems({ limit: 100 });
  const allItems: Item[] = itemsData?.data?.filter((i) => i.isActive) ?? [];
  const itemOptions = allItems.map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }));

  const [customerId, setCustomerId] = useState(template?.customerId ?? '');
  const [name, setName] = useState(template?.name ?? '');
  const [paymentTermsDays, setPaymentTermsDays] = useState(
    String(template?.paymentTermsDays ?? 30),
  );
  const [notes, setNotes] = useState(template?.notes ?? '');
  const [rows, setRows] = useState<TemplateLineRow[]>(
    template?.items.length
      ? template.items.map((it) => ({
          rowId: newRowId(),
          itemId: it.itemId,
          description: it.description,
          hsnSacCode: it.hsnSacCode ?? '',
          unitPrice: String(it.unitPrice),
          taxRate: String(it.taxRate ?? 0),
          defaultQuantity: it.defaultQuantity ? String(it.defaultQuantity) : '',
        }))
      : [emptyRow()],
  );

  // When the customer changes, re-resolve every populated row so the unit
  // price reflects the new customer's price list. Each row's manual override
  // is replaced — switching customer is a strong signal that prices should
  // come from that customer's list.
  useEffect(() => {
    if (!customerId) return;
    const itemIds = rows.map((r) => r.itemId).filter(Boolean);
    if (itemIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        itemIds.map((itemId) => resolvePrice({ customerId, itemId }).catch(() => null)),
      );
      if (cancelled) return;
      setRows((prev) => prev.map((r) => {
        if (!r.itemId) return r;
        const idx = itemIds.indexOf(r.itemId);
        const resolved = results[idx];
        if (!resolved) return r;
        const fromPriceList = resolved.source !== 'item_default';
        return {
          ...r,
          unitPrice: String(resolved.effectiveRate),
          priceSource: fromPriceList ? 'priceList' : 'itemDefault',
          priceListName: fromPriceList ? resolved.priceListName : null,
        };
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  function addRow() { setRows((p) => [...p, emptyRow()]); }
  function removeRow(i: number) { setRows((p) => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, field: keyof TemplateLineRow, value: string) {
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  async function selectItem(idx: number, itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    // Optimistic update with item-master defaults so the UI is immediately
    // populated; the price-list lookup runs async and overwrites unitPrice if
    // the customer has a matching price list.
    setRows((p) => p.map((r, i) => i === idx ? {
      ...r,
      itemId,
      description: item?.name ?? r.description,
      hsnSacCode: item?.hsnSacCode ?? r.hsnSacCode,
      unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : r.unitPrice,
      taxRate: item?.gstRate != null ? String(item.gstRate) : r.taxRate,
      priceSource: 'itemDefault',
      priceListName: null,
    } : r));

    if (!customerId || !itemId) return;
    try {
      const resolved = await resolvePrice({ customerId, itemId });
      if (!resolved) return;
      const fromPriceList = resolved.source !== 'item_default';
      setRows((p) => p.map((r, i) => {
        if (i !== idx || r.itemId !== itemId) return r;
        return {
          ...r,
          unitPrice: String(resolved.effectiveRate),
          priceSource: fromPriceList ? 'priceList' : 'itemDefault',
          priceListName: fromPriceList ? resolved.priceListName : null,
        };
      }));
    } catch {
      // Resolver failed (network, unknown item) — keep the item-master default.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { toast('Please select a customer', 'error'); return; }
    if (!name.trim()) { toast('Please enter a template name', 'error'); return; }
    const validRows = rows.filter((r) => r.itemId && r.unitPrice);
    if (validRows.length === 0) { toast('Add at least one item', 'error'); return; }

    const data: CreateQuickTemplateInput = {
      customerId,
      name: name.trim(),
      paymentTermsDays: Number(paymentTermsDays) || 30,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      items: validRows.map((r) => {
        // GSTN accepts only 2/4/6/8-digit HSN. Drop any legacy value that
        // doesn't match (e.g. saved freeform text from older templates) so the
        // server schema doesn't reject the whole save.
        const validHsn = /^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(r.hsnSacCode);
        return {
          itemId: r.itemId,
          description: r.description,
          ...(validHsn ? { hsnSacCode: r.hsnSacCode } : {}),
          unitPrice: Number(r.unitPrice),
          ...(r.taxRate ? { taxRate: Number(r.taxRate) } : {}),
          defaultQuantity: r.defaultQuantity !== '' ? Number(r.defaultQuantity) : 0,
        };
      }),
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: template.id, data });
        toast('Template updated', 'success');
      } else {
        await create.mutateAsync(data);
        toast('Template created', 'success');
      }
      onClose();
    } catch {
      toast(`Failed to ${isEdit ? 'update' : 'create'} template`, 'error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Combobox
          label="Customer"
          options={customerOptions}
          value={customerId}
          onChange={setCustomerId}
          placeholder="Search customers…"
        />
        <Input
          label="Template Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monthly Retainer"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Payment Terms (days)"
          value={paymentTermsDays}
          onChange={(e) => setPaymentTermsDays(e.target.value)}
          options={[
            { value: '0', label: 'Due Immediately' },
            { value: '7', label: 'Net 7' },
            { value: '15', label: 'Net 15' },
            { value: '30', label: 'Net 30' },
            { value: '45', label: 'Net 45' },
            { value: '60', label: 'Net 60' },
            { value: '90', label: 'Net 90' },
          ]}
        />
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Default notes for generated invoices"
          rows={1}
        />
      </div>

      {/* Line items */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Items
        </legend>
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={row.rowId} className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem_2rem]">
                <Combobox
                  label="Item"
                  options={itemOptions}
                  value={row.itemId}
                  onChange={(v) => selectItem(idx, v)}
                  placeholder="Search items…"
                />
                <Input
                  label="Qty"
                  type="number"
                  value={row.defaultQuantity}
                  onChange={(e) => updateRow(idx, 'defaultQuantity', e.target.value)}
                  placeholder="1"
                  min={0}
                />
                <div>
                  <Input
                    label="Unit Price"
                    type="number"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(idx, 'unitPrice', e.target.value)}
                    placeholder="0.00"
                  />
                  {row.priceSource === 'priceList' && row.priceListName && (
                    <div className="mt-1 truncate text-[10px] text-emerald-600 dark:text-emerald-400">
                      from {row.priceListName}
                    </div>
                  )}
                </div>
                <Input
                  label="GST %"
                  type="number"
                  value={row.taxRate}
                  onChange={(e) => updateRow(idx, 'taxRate', e.target.value)}
                  placeholder="18"
                />
                <div className="flex items-end justify-center pb-[3px] sm:pb-1.5">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    aria-label="Remove item"
                    title="Remove item"
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 disabled:opacity-40 dark:hover:bg-zinc-800"
                    disabled={rows.length === 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus size={14} /> Add Item
        </Button>
      </fieldset>

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={create.isPending || update.isPending} size="sm">
          {isEdit ? <><Pencil size={14} /> Save Changes</> : <><Plus size={14} /> Create Template</>}
        </Button>
      </div>
    </form>
  );
}

// ─── Template Card (mobile) ──────────────────────────────────────────────────

const CARD_BASE = 'rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800';

function TemplateCard({
  tpl,
  onGenerate,
  onEdit,
  onDelete,
  deleteDisabled,
}: {
  tpl: QuickInvoiceTemplate;
  onGenerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
}) {
  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{tpl.name}</span>
        <Badge variant={tpl.isActive ? 'success' : 'default'}>{tpl.isActive ? 'Active' : 'Inactive'}</Badge>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">{tpl.customerName ?? tpl.customerId}</p>
      <div className="mt-1 flex gap-3 text-xs text-zinc-500">
        <span>{tpl.items.length} products</span>
        <span>Net {tpl.paymentTermsDays}</span>
      </div>
      <div className="mt-2 flex gap-1">
        <Button size="sm" onClick={onGenerate}><Zap size={14} /> Generate</Button>
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil size={14} /> Edit</Button>
        <Button variant="outline" size="sm" onClick={onDelete} disabled={deleteDisabled}><Trash2 size={14} /> Delete</Button>
      </div>
    </div>
  );
}

// ─── Quick Templates List Page ────────────────────────────────────────────────

export function QuickTemplatesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuickTemplates();
  const deleteTemplate = useDeleteQuickTemplate();
  const { toast } = useToast();

  const templates = data?.data ?? [];

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await deleteTemplate.mutateAsync(id);
      toast('Template deleted', 'success');
    } catch {
      toast('Failed to delete template', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Quick Invoice Templates"
        breadcrumbs={[{ label: 'AR' }, { label: 'Quick Templates' }]}
        description="Save recurring invoice structures. Generate invoices by entering quantities."
        actions={
          <Button size="sm" onClick={() => navigate({ to: '/ar/quick-templates/new' })}>
            <Plus size={14} /> New Template
          </Button>
        }
      />

      {/* Mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))
          : templates.length === 0
            ? <p className="py-8 text-center text-sm text-zinc-500">No templates yet. Click 'New Template' to get started.</p>
            : templates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  onGenerate={() => navigate({ to: '/ar/quick-templates/$templateId/generate', params: { templateId: tpl.id } })}
                  onEdit={() => navigate({ to: '/ar/quick-templates/$templateId/edit', params: { templateId: tpl.id } })}
                  onDelete={() => handleDelete(tpl.id, tpl.name)}
                  deleteDisabled={deleteTemplate.isPending}
                />
              ))
        }
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Name</Th>
                  <Th>Customer</Th>
                  <Th align="right">Products</Th>
                  <Th>Payment Terms</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={4} cols={6} />
                ) : templates.length === 0 ? (
                  <TableEmpty
                    colSpan={6}
                    message="No templates yet. Click 'New Template' to get started."
                  />
                ) : (
                  templates.map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell className="font-medium">{tpl.name}</TableCell>
                      <TableCell className="text-zinc-500">{tpl.customerName ?? tpl.customerId}</TableCell>
                      <TableCell align="right" numeric>{tpl.items.length}</TableCell>
                      <TableCell>Net {tpl.paymentTermsDays}</TableCell>
                      <TableCell>
                        <Badge variant={tpl.isActive ? 'success' : 'default'}>
                          {tpl.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            onClick={() => navigate({ to: '/ar/quick-templates/$templateId/generate', params: { templateId: tpl.id } })}
                          >
                            <Zap size={14} /> Generate
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate({ to: '/ar/quick-templates/$templateId/edit', params: { templateId: tpl.id } })}
                          >
                            <Pencil size={14} /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(tpl.id, tpl.name)}
                            disabled={deleteTemplate.isPending}
                          >
                            <Trash2 size={14} /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── New Template Page ────────────────────────────────────────────────────────

export function QuickTemplateNewPage() {
  const navigate = useNavigate();
  const back = () => navigate({ to: '/ar/quick-templates' });

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="New Quick Invoice Template"
        breadcrumbs={[
          { label: 'AR' },
          { label: 'Quick Templates', href: '/ar/quick-templates' },
          { label: 'New' },
        ]}
      />
      <TemplateForm onClose={back} />
    </div>
  );
}

// ─── Edit Template Page ───────────────────────────────────────────────────────

export function QuickTemplateEditPage({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
  const back = () => navigate({ to: '/ar/quick-templates' });
  const { data, isLoading } = useQuickTemplate(templateId);
  const template = data?.data;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={template ? `Edit — ${template.name}` : 'Edit Template'}
        breadcrumbs={[
          { label: 'AR' },
          { label: 'Quick Templates', href: '/ar/quick-templates' },
          { label: template?.name ?? 'Edit' },
        ]}
      />
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ) : template ? (
        <TemplateForm template={template} onClose={back} />
      ) : (
        <p className="py-8 text-center text-sm text-zinc-500">Template not found.</p>
      )}
    </div>
  );
}

// ─── Generate Invoice Page ────────────────────────────────────────────────────

export function QuickTemplateGeneratePage({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
  const back = () => navigate({ to: '/ar/quick-templates' });
  const { data, isLoading } = useQuickTemplate(templateId);
  const template = data?.data;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={template ? `Generate — ${template.name}` : 'Generate Invoice'}
        breadcrumbs={[
          { label: 'AR' },
          { label: 'Quick Templates', href: '/ar/quick-templates' },
          { label: template?.name ?? 'Generate' },
        ]}
      />
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ) : template ? (
        <GenerateInvoiceModal template={template} onClose={back} />
      ) : (
        <p className="py-8 text-center text-sm text-zinc-500">Template not found.</p>
      )}
    </div>
  );
}
