import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Pencil, Zap, Copy, Check } from 'lucide-react';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea, Combobox, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useItems } from '@/hooks/queries/use-items';
import type { Item } from '@/hooks/queries/use-items';
import {
  useQuickTemplates, useCreateQuickTemplate, useUpdateQuickTemplate,
  useDeleteQuickTemplate, useGenerateFromTemplate,
  type QuickInvoiceTemplate, type CreateQuickTemplateInput,
} from '@/hooks/queries/use-quick-templates';

// ─── Modal Shell ─────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, wide }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900`}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Template Form ────────────────────────────────────────────────────────────

interface TemplateLineRow {
  itemId: string;
  description: string;
  hsnSacCode: string;
  unitPrice: string;
  taxRate: string;
  defaultQuantity: string;
}

const EMPTY_ROW: TemplateLineRow = {
  itemId: '', description: '', hsnSacCode: '', unitPrice: '', taxRate: '0', defaultQuantity: '1',
};

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
          itemId: it.itemId,
          description: it.description,
          hsnSacCode: it.hsnSacCode ?? '',
          unitPrice: String(it.unitPrice),
          taxRate: String(it.taxRate ?? 0),
          defaultQuantity: String(it.defaultQuantity),
        }))
      : [{ ...EMPTY_ROW }],
  );

  function addRow() { setRows((p) => [...p, { ...EMPTY_ROW }]); }
  function removeRow(i: number) { setRows((p) => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, field: keyof TemplateLineRow, value: string) {
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function selectItem(idx: number, itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    setRows((p) => p.map((r, i) => i === idx ? {
      ...r,
      itemId,
      description: item?.name ?? r.description,
      hsnSacCode: item?.hsnSacCode ?? r.hsnSacCode,
      unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : r.unitPrice,
      taxRate: item?.gstRate != null ? String(item.gstRate) : r.taxRate,
    } : r));
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
      items: validRows.map((r) => ({
        itemId: r.itemId,
        description: r.description,
        ...(r.hsnSacCode ? { hsnSacCode: r.hsnSacCode } : {}),
        unitPrice: Number(r.unitPrice),
        ...(r.taxRate ? { taxRate: Number(r.taxRate) } : {}),
        defaultQuantity: Number(r.defaultQuantity) || 1,
      })),
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-400">
                <th className="pb-1 pr-2 font-medium">Item</th>
                <th className="pb-1 pr-2 font-medium w-20">Default Qty</th>
                <th className="pb-1 pr-2 font-medium w-28">Unit Price</th>
                <th className="pb-1 pr-2 font-medium w-20">GST %</th>
                <th className="pb-1 w-8" />
              </tr>
            </thead>
            <tbody className="space-y-1">
              {rows.map((row, idx) => (
                <tr key={idx} className="align-top">
                  <td className="pr-2 pb-2">
                    <Combobox
                      options={itemOptions}
                      value={row.itemId}
                      onChange={(v) => selectItem(idx, v)}
                      placeholder="Search items…"
                    />
                  </td>
                  <td className="pr-2 pb-2 w-20">
                    <Input
                      type="number"
                      value={row.defaultQuantity}
                      onChange={(e) => updateRow(idx, 'defaultQuantity', e.target.value)}
                      placeholder="1"
                      min={0}
                    />
                  </td>
                  <td className="pr-2 pb-2 w-28">
                    <Input
                      type="number"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(idx, 'unitPrice', e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="pr-2 pb-2 w-20">
                    <Input
                      type="number"
                      value={row.taxRate}
                      onChange={(e) => updateRow(idx, 'taxRate', e.target.value)}
                      placeholder="18"
                    />
                  </td>
                  <td className="pb-2 w-8">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="mt-1 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                      disabled={rows.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ─── Generate Invoice Modal ────────────────────────────────────────────────────

interface GenerateSuccessResult {
  invoiceNumber: string;
  invoiceId: string;
  shareUrl?: string;
}

function GenerateModal({ template, onClose }: { template: QuickInvoiceTemplate; onClose: () => void }) {
  const generate = useGenerateFromTemplate();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(template.items.map((it) => [it.itemId, String(it.defaultQuantity)])),
  );
  const [success, setSuccess] = useState<GenerateSuccessResult | null>(null);
  const [copied, setCopied] = useState(false);

  function setQty(itemId: string, value: string) {
    setQuantities((p) => ({ ...p, [itemId]: value }));
  }

  const lineSubtotals = template.items.map((it) => {
    const qty = Number(quantities[it.itemId] ?? it.defaultQuantity);
    const lineAmt = qty * it.unitPrice;
    const taxAmt = it.taxRate ? lineAmt * (it.taxRate / 100) : 0;
    return { lineAmt, taxAmt };
  });
  const subtotal = lineSubtotals.reduce((s, l) => s + l.lineAmt, 0);
  const totalTax = lineSubtotals.reduce((s, l) => s + l.taxAmt, 0);
  const total = subtotal + totalTax;

  async function handleGenerate() {
    try {
      const res = await generate.mutateAsync({
        id: template.id,
        data: {
          invoiceDate,
          quantities: template.items.map((it) => ({
            itemId: it.itemId,
            quantity: Number(quantities[it.itemId] ?? it.defaultQuantity),
          })),
        },
      });
      setSuccess({
        invoiceNumber: res.data.invoiceNumber,
        invoiceId: res.data.invoiceId,
        shareUrl: res.data.shareUrl,
      });
      toast(`Invoice ${res.data.invoiceNumber} created`, 'success');
    } catch {
      toast('Failed to generate invoice', 'error');
    }
  }

  async function copyLink() {
    if (!success?.shareUrl) return;
    await navigator.clipboard.writeText(success.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function whatsappShare() {
    if (!success) return;
    const msg = encodeURIComponent(`Invoice ${success.invoiceNumber}${success.shareUrl ? `\n${success.shareUrl}` : ''}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-1">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Invoice generated successfully</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{success.invoiceNumber}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {success.shareUrl && (
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={whatsappShare}>
            <Zap size={14} /> Send via WhatsApp
          </Button>
        </div>
        <Button size="sm" onClick={onClose}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {template.customerName ?? 'Customer'}
        </span>
        <DateInput
          label="Invoice Date"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
        />
      </div>

      {/* Line items */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-400 dark:border-zinc-800">
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 text-right font-medium">Unit Price</th>
              <th className="pb-2 text-center font-medium w-24">Quantity</th>
              <th className="pb-2 text-right font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {template.items.map((it) => {
              const qty = Number(quantities[it.itemId] ?? it.defaultQuantity);
              const lineTotal = qty * it.unitPrice;
              return (
                <tr key={it.itemId} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-200">
                    {it.description}
                    {it.hsnSacCode && (
                      <span className="ml-1 text-xs text-zinc-400">({it.hsnSacCode})</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-500">{formatINR(it.unitPrice)}</td>
                  <td className="py-2 pr-4 w-24">
                    <Input
                      type="number"
                      value={quantities[it.itemId] ?? String(it.defaultQuantity)}
                      onChange={(e) => setQty(it.itemId, e.target.value)}
                      min={0}
                    />
                  </td>
                  <td className="py-2 text-right font-medium">{formatINR(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="ml-auto w-56 space-y-1 text-sm">
        <div className="flex justify-between text-zinc-500">
          <span>Subtotal</span>
          <span>{formatINR(subtotal)}</span>
        </div>
        <div className="flex justify-between text-zinc-500">
          <span>GST</span>
          <span>{formatINR(totalTax)}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold dark:border-zinc-700">
          <span>Total</span>
          <span>{formatINR(total)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleGenerate} loading={generate.isPending}>
          <Zap size={14} /> Generate Invoice
        </Button>
      </div>
    </div>
  );
}

// ─── Quick Templates Page ─────────────────────────────────────────────────────

export function QuickTemplatesPage() {
  const { data, isLoading } = useQuickTemplates();
  const deleteTemplate = useDeleteQuickTemplate();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QuickInvoiceTemplate | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState<QuickInvoiceTemplate | null>(null);

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
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Template
          </Button>
        }
      />

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Quick Invoice Template" wide>
        <TemplateForm onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        title={editingTemplate ? `Edit — ${editingTemplate.name}` : ''}
        wide
      >
        {editingTemplate && (
          <TemplateForm
            key={editingTemplate.id}
            template={editingTemplate}
            onClose={() => setEditingTemplate(null)}
          />
        )}
      </Modal>

      {/* Generate modal */}
      <Modal
        open={!!generatingTemplate}
        onClose={() => setGeneratingTemplate(null)}
        title={generatingTemplate?.name ?? ''}
      >
        {generatingTemplate && (
          <GenerateModal
            key={generatingTemplate.id}
            template={generatingTemplate}
            onClose={() => setGeneratingTemplate(null)}
          />
        )}
      </Modal>

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
                          onClick={() => setGeneratingTemplate(tpl)}
                        >
                          <Zap size={14} /> Generate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingTemplate(tpl)}
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
  );
}
