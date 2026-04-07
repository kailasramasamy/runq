import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, X, Download, FileText, ArrowRight } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea, Combobox, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { HsnSacCombobox } from '@/components/ui/hsn-sac-combobox';
import { formatINR } from '@/lib/utils';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useItems } from '@/hooks/queries/use-items';
import { useNavigate } from '@tanstack/react-router';
import { Send, CheckCircle, XCircle, UserPlus } from 'lucide-react';
import {
  useQuotes, useQuote, useCreateQuote, useUpdateQuoteStatus, useConvertQuoteToInvoice, useConvertQuoteToOrder,
  type Quote, type QuoteStatus,
} from '@/hooks/queries/use-quotes';

type BadgeVariant = 'default' | 'info' | 'success' | 'danger' | 'outline' | 'primary' | 'warning' | 'cyan';

const STATUS_BADGE: Record<QuoteStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  sent: { variant: 'info', label: 'Sent' },
  accepted: { variant: 'success', label: 'Accepted' },
  rejected: { variant: 'danger', label: 'Rejected' },
  expired: { variant: 'outline', label: 'Expired' },
  converted: { variant: 'cyan', label: 'Converted' },
};

interface LineItemRow { itemId: string; description: string; hsnSacCode: string; qty: string; unitPrice: string; taxRate: string }

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateQuote();
  const { toast } = useToast();
  const { data: customersData } = useCustomers({ limit: 100 });
  const customerOptions = (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const { data: itemsData } = useItems({ limit: 100 });
  const allItems = itemsData?.data?.filter((i) => i.isActive) ?? [];
  const itemOptions = allItems.map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }));

  const [customerMode, setCustomerMode] = useState<'existing' | 'prospect'>('existing');
  const [customerId, setCustomerId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<LineItemRow[]>([{ itemId: '', description: '', hsnSacCode: '', qty: '1', unitPrice: '', taxRate: '0' }]);

  const EMPTY_ROW: LineItemRow = { itemId: '', description: '', hsnSacCode: '', qty: '1', unitPrice: '', taxRate: '0' };
  function addItem() { setItems((p) => [...p, { ...EMPTY_ROW }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, f: keyof LineItemRow, v: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [f]: v } : it)));
  }
  function selectItem(idx: number, itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    setItems((p) => p.map((it, i) => i === idx ? {
      ...it,
      itemId,
      description: item?.name ?? it.description,
      hsnSacCode: item?.hsnSacCode ?? it.hsnSacCode,
      unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : it.unitPrice,
      taxRate: item?.gstRate != null ? String(item.gstRate) : it.taxRate,
    } : it));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customerMode === 'existing' && !customerId) { toast('Please select a customer', 'error'); return; }
    if (customerMode === 'prospect' && !prospectName.trim()) { toast('Please enter prospect name', 'error'); return; }
    if (!items.some((it) => it.description && it.unitPrice)) { toast('Add at least one line item', 'error'); return; }
    try {
      const lineItems = items.map((it) => {
        const qty = Number(it.qty) || 0;
        const price = Number(it.unitPrice) || 0;
        const amount = qty * price;
        const tax = Number(it.taxRate) || 0;
        return {
          description: it.description,
          quantity: qty,
          unitPrice: price,
          amount,
          ...(it.hsnSacCode ? { hsnSacCode: it.hsnSacCode } : {}),
          ...(it.taxRate ? { taxRate: tax } : {}),
          ...(it.itemId ? { itemId: it.itemId } : {}),
        };
      });
      const subtotal = lineItems.reduce((s, l) => s + l.amount, 0);
      const taxAmount = lineItems.reduce((s, l) => s + l.amount * ((l.taxRate ?? 0) / 100), 0);
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
      await create.mutateAsync({
        ...(customerMode === 'existing' ? { customerId } : {}),
        ...(customerMode === 'prospect' ? {
          prospectName: prospectName.trim(),
          ...(prospectEmail ? { prospectEmail } : {}),
          ...(prospectPhone ? { prospectPhone } : {}),
        } : {}),
        quoteDate,
        ...(expiryDate ? { expiryDate } : {}),
        items: lineItems,
        subtotal,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount,
        ...(notes ? { notes } : {}),
        ...(terms ? { terms } : {}),
      });
      toast('Quote created', 'success');
      onClose();
    } catch {
      toast('Failed to create quote', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Sales Quote</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Select
            label="Customer Type"
            value={customerMode}
            onChange={(e) => { setCustomerMode(e.target.value as 'existing' | 'prospect'); setCustomerId(''); setProspectName(''); }}
            options={[{ value: 'existing', label: 'Existing Customer' }, { value: 'prospect', label: 'New Prospect' }]}
          />
          {customerMode === 'existing' ? (
            <Combobox label="Customer" options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Search customer…" required />
          ) : (
            <Input label="Prospect Name" value={prospectName} onChange={(e) => setProspectName(e.target.value)} required placeholder="Company or contact name" />
          )}
          <DateInput label="Quote Date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} required />
          <DateInput label="Expiry Date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
        {customerMode === 'prospect' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Email" type="email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)} placeholder="prospect@example.com" />
            <Input label="Phone" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Line Items</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="w-48 shrink-0">
                  <Combobox label="Item" options={itemOptions} value={item.itemId} onChange={(v) => selectItem(idx, v)} placeholder="Search item…" />
                </div>
                <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required placeholder="Description" />
                <div className="w-36 shrink-0">
                  <HsnSacCombobox label="HSN/SAC" value={item.hsnSacCode} onChange={(code, rate) => {
                    setItems((p) => p.map((it, i) => i === idx ? { ...it, hsnSacCode: code, taxRate: rate != null ? String(rate) : it.taxRate } : it));
                  }} placeholder="HSN…" />
                </div>
                <div className="w-20 shrink-0">
                  <Input label="Qty" type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} required />
                </div>
                <div className="w-28 shrink-0">
                  <Input label="Unit Price" type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} required placeholder="0.00" />
                </div>
                <div className="w-20 shrink-0">
                  <Input label="GST%" type="number" value={item.taxRate} onChange={(e) => updateItem(idx, 'taxRate', e.target.value)} placeholder="0" />
                </div>
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap pb-2">
                  {formatINR(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                </div>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={14} /></Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." />
          <Textarea label="Terms & Conditions" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms..." />
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Quote</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
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
      <div className="relative w-full max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function DetailView({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const navigate = useNavigate();
  const updateStatus = useUpdateQuoteStatus();
  const convertInvoice = useConvertQuoteToInvoice();
  const convertOrder = useConvertQuoteToOrder();
  const { toast } = useToast();
  const statusInfo = STATUS_BADGE[quote.status];
  const busy = updateStatus.isPending || convertInvoice.isPending || convertOrder.isPending;

  async function handleStatus(status: QuoteStatus, label: string) {
    try { await updateStatus.mutateAsync({ id: quote.id, status }); toast(`Quote ${label}`, 'success'); }
    catch { toast(`Failed to ${label.toLowerCase()} quote`, 'error'); }
  }
  async function handleConvertInvoice() {
    try { await convertInvoice.mutateAsync(quote.id); toast('Converted to invoice', 'success'); onClose(); }
    catch { toast('Failed to convert', 'error'); }
  }
  async function handleConvertOrder() {
    try { await convertOrder.mutateAsync(quote.id); toast('Converted to sales order', 'success'); onClose(); }
    catch { toast('Failed to convert', 'error'); }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-zinc-500">{quote.customerId ? 'Customer' : 'Prospect'}</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.customerName}</p></div>
        <div><p className="text-xs text-zinc-500">Quote Date</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.quoteDate}</p></div>
        <div><p className="text-xs text-zinc-500">Expiry</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.expiryDate ?? '-'}</p></div>
        <div><p className="text-xs text-zinc-500">Total</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{formatINR(quote.totalAmount)}</p></div>
      </div>
      {!quote.customerId && (quote.prospectEmail || quote.prospectPhone) && (
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {quote.prospectEmail && <div><p className="text-xs text-zinc-500">Email</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.prospectEmail}</p></div>}
          {quote.prospectPhone && <div><p className="text-xs text-zinc-500">Phone</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.prospectPhone}</p></div>}
        </div>
      )}
      <Table>
        <TableHeader><tr><Th>Description</Th><Th align="right">Qty</Th><Th align="right">Unit Price</Th><Th align="right">Amount</Th></tr></TableHeader>
        <TableBody>
          {(quote.items ?? []).map((li, i) => (
            <TableRow key={i}><TableCell>{li.description}</TableCell><TableCell align="right" numeric>{li.quantity}</TableCell><TableCell align="right" numeric>{formatINR(li.unitPrice)}</TableCell><TableCell align="right" numeric>{formatINR(li.amount)}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex flex-wrap gap-2">
        {quote.status === 'draft' && (
          <Button size="sm" onClick={() => handleStatus('sent', 'Sent')} disabled={busy}><Send size={14} /> Mark as Sent</Button>
        )}
        {(quote.status === 'draft' || quote.status === 'sent') && (
          <>
            <Button size="sm" variant="outline" onClick={() => handleStatus('accepted', 'Accepted')} disabled={busy}><CheckCircle size={14} /> Mark Accepted</Button>
            <Button size="sm" variant="outline" onClick={() => handleStatus('rejected', 'Rejected')} disabled={busy}><XCircle size={14} /> Mark Rejected</Button>
          </>
        )}
        {quote.status === 'accepted' && quote.customerId && (
          <>
            <Button size="sm" onClick={handleConvertInvoice} loading={convertInvoice.isPending} disabled={busy}><FileText size={14} /> Convert to Invoice</Button>
            <Button size="sm" variant="outline" onClick={handleConvertOrder} loading={convertOrder.isPending} disabled={busy}><ArrowRight size={14} /> Convert to Order</Button>
          </>
        )}
        {!quote.customerId && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams();
              params.set('quoteId', quote.id);
              if (quote.customerName) params.set('name', quote.customerName);
              if (quote.prospectEmail) params.set('email', quote.prospectEmail);
              if (quote.prospectPhone) params.set('phone', quote.prospectPhone);
              navigate({ to: `/ar/customers/new?${params.toString()}` as any });
            }}
          >
            <UserPlus size={14} /> Onboard as Customer
          </Button>
        )}
      </div>
    </>
  );
}

// ─── Quotes Page ─────────────────────────────────────────────────────────────

export function QuotesPage() {
  const { data, isLoading } = useQuotes();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const quotes = data?.data ?? [];
  const { data: selectedDetail } = useQuote(selectedId);
  const selected = selectedDetail?.data ?? null;

  return (
    <div>
      <PageHeader
        title="Sales Quotes"
        breadcrumbs={[{ label: 'AR' }, { label: 'Quotes' }]}
        description="Create and manage sales quotations for customers."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('quotes.csv', ['Quote#', 'Date', 'Customer', 'Amount', 'Status', 'Expiry'], quotes.map(q => [q.quoteNumber, q.quoteDate, q.customerName, String(q.totalAmount), q.status, q.expiryDate ?? '']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}><Plus size={14} /> New Quote</Button>
          </div>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? `${selected.quoteNumber} — ${STATUS_BADGE[selected.status].label}` : ''}
      >
        {selected && <DetailView quote={selected} onClose={() => setSelectedId(null)} />}
      </Modal>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr><Th>Quote#</Th><Th>Date</Th><Th>Customer</Th><Th align="right">Amount</Th><Th>Status</Th><Th>Expiry</Th><Th align="right">Actions</Th></tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : quotes.length === 0 ? (
                <TableEmpty colSpan={7} message="No quotes yet." />
              ) : (
                quotes.map((q) => {
                  const si = STATUS_BADGE[q.status];
                  return (
                    <TableRow key={q.id} className="cursor-pointer" onClick={() => setSelectedId(q.id)}>
                      <TableCell className="font-mono text-xs">{q.quoteNumber}</TableCell>
                      <TableCell className="text-zinc-500">{q.quoteDate}</TableCell>
                      <TableCell className="font-medium">{q.customerName}</TableCell>
                      <TableCell align="right" numeric>{formatINR(q.totalAmount)}</TableCell>
                      <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                      <TableCell className="text-zinc-500">{q.expiryDate ?? '-'}</TableCell>
                      <TableCell align="right">
                        {q.status === 'accepted' && (
                          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <Badge variant="success">Ready to convert</Badge>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
