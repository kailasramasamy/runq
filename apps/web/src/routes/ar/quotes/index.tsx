import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Download, FileText, ArrowRight } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Button, Badge, Input, Select, Textarea, Combobox, DateInput,
  TableSkeleton, useToast,
} from '@/components/ui';
import {
  PageHeader, Button as ArButton, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, formatDate,
} from '@/components/ar/primitives';
import { formatINRShort } from '@/lib/utils';
import { HsnSacCombobox } from '@/components/ui/hsn-sac-combobox';
import { formatINR } from '@/lib/utils';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useItems } from '@/hooks/queries/use-items';
import { resolvePrice, type PriceSource } from '@/hooks/queries/use-price-lists';
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

interface LineItemRow { itemId: string; description: string; hsnSacCode: string; qty: string; unitPrice: string; taxRate: string; priceSource?: PriceSource; priceListName?: string | null }

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  customer: 'Customer pricing',
  customer_group: 'Group pricing',
  all: 'Standard pricing',
  item_default: 'Item default',
};

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
  async function selectItem(idx: number, itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    setItems((p) => p.map((it, i) => i === idx ? {
      ...it,
      itemId,
      description: item?.name ?? it.description,
      hsnSacCode: item?.hsnSacCode ?? it.hsnSacCode,
      unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : it.unitPrice,
      taxRate: item?.gstRate != null ? String(item.gstRate) : it.taxRate,
      priceSource: undefined,
      priceListName: null,
    } : it));

    // Quotes can be tied to an existing customer (customerMode='existing')
    // OR a prospect with no customerId — only resolve when we have one.
    if (customerMode === 'existing' && customerId && itemId) {
      try {
        const qty = parseFloat(items[idx]?.qty ?? '1') || 1;
        const resolved = await resolvePrice({ customerId, itemId, quantity: qty });
        if (resolved) {
          setItems((p) => p.map((it, i) => i === idx ? {
            ...it,
            unitPrice: String(resolved.effectiveRate),
            priceSource: resolved.source,
            priceListName: resolved.priceListName,
          } : it));
        }
      } catch {
        // ignore — keep the item default
      }
    }
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
              <div key={idx} className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Combobox label="Item" options={itemOptions} value={item.itemId} onChange={(v) => selectItem(idx, v)} placeholder="Search item…" />
                  <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required placeholder="Description" />
                  <HsnSacCombobox label="HSN/SAC" value={item.hsnSacCode} onChange={(code, rate) => {
                    setItems((p) => p.map((it, i) => i === idx ? { ...it, hsnSacCode: code, taxRate: rate != null ? String(rate) : it.taxRate } : it));
                  }} placeholder="HSN…" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input label="Qty" type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} required />
                    <Input label="Unit Price" type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} required placeholder="0.00" />
                    <Input label="GST%" type="number" value={item.taxRate} onChange={(e) => updateItem(idx, 'taxRate', e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {formatINR(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                    </div>
                    {item.priceSource && item.priceSource !== 'item_default' && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {PRICE_SOURCE_LABEL[item.priceSource]}
                        {item.priceListName ? ` · ${item.priceListName}` : ''}
                      </span>
                    )}
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={14} /></Button>
                  )}
                </div>
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

// ─── Quote Card (mobile) ─────────────────────────────────────────────────────

const CARD_BASE = 'cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800';

function QuoteCard({ q, onClick }: { q: Quote; onClick: () => void }) {
  const si = STATUS_BADGE[q.status];
  return (
    <div className={CARD_BASE} onClick={onClick}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-500">{q.quoteNumber}</span>
        <Badge variant={si.variant}>{si.label}</Badge>
      </div>
      <p className="mt-1 truncate font-medium text-zinc-900 dark:text-zinc-100">{q.customerName}</p>
      <div className="mt-1 flex items-center">
        <span className="text-xs text-zinc-500">{q.quoteDate}</span>
        <span className="ml-auto font-mono text-sm">{formatINR(q.totalAmount)}</span>
      </div>
      {q.status === 'accepted' && (
        <div className="mt-1">
          <Badge variant="success">Ready to convert</Badge>
        </div>
      )}
    </div>
  );
}

// ─── Quotes section (used by /ar/quotes and the combined Quotes & Orders page) ─

export function useQuotesKpis() {
  const { data } = useQuotes();
  const quotes = data?.data ?? [];
  const openCount = quotes.filter((q) => ['draft', 'sent'].includes(q.status)).length;
  const openTotal = quotes.filter((q) => ['draft', 'sent'].includes(q.status)).reduce((a, q) => a + q.totalAmount, 0);
  const acceptedCount = quotes.filter((q) => q.status === 'accepted').length;
  const convertedCount = quotes.filter((q) => q.status === 'converted').length;
  const winRate = quotes.length > 0
    ? Math.round(((acceptedCount + convertedCount) / quotes.length) * 100)
    : 0;
  return { quotes, openCount, openTotal, acceptedCount, convertedCount, winRate };
}

export function QuotesSection({
  showCreate, setShowCreate,
}: {
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuotes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const quotes = data?.data ?? [];
  const { data: selectedDetail } = useQuote(selectedId);
  const selected = selectedDetail?.data ?? null;

  return (
    <>
      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? `${selected.quoteNumber} — ${STATUS_BADGE[selected.status].label}` : ''}
      >
        {selected && <DetailView quote={selected} onClose={() => setSelectedId(null)} />}
      </Modal>

      <Table>
        <TableHeader>
          <tr>
            <Th>Quote #</Th>
            <Th>Customer</Th>
            <Th>Issued</Th>
            <Th>Valid till</Th>
            <Th align="right">Total</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : quotes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<FileText size={18} />}
                  title="No quotes yet"
                  description="Create your first sales quote to track customer enquiries."
                  action={<ArButton size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>New quote</ArButton>}
                />
              </td>
            </tr>
          ) : quotes.map((q) => (
            <TableRow key={q.id} onClick={() => setSelectedId(q.id)}>
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>{q.quoteNumber}</span>
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>{q.customerName}</span>
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(q.quoteDate)}</TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>
                {q.expiryDate ? formatDate(q.expiryDate) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell align="right" numeric className="font-semibold">{formatINR(q.totalAmount)}</TableCell>
              <TableCell><StatusBadge status={q.status} /></TableCell>
              <TableCell align="right">
                {q.status === 'accepted' && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <ArButton size="sm" variant="outline" icon={<ArrowRight size={12} />} onClick={() => setSelectedId(q.id)}>
                      Convert
                    </ArButton>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

// Stand-alone Quotes page (when accessed via /ar/quotes directly)
export function QuotesPage() {
  const { quotes, openCount, openTotal, acceptedCount, convertedCount, winRate } = useQuotesKpis();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <PageHeader
        title="Sales quotes"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Quotes' }]}
        description="Pre-invoice documents — track what's quoted, accepted, and converted."
        actions={
          <>
            <ArButton variant="outline" size="sm" icon={<Download size={13} />} onClick={() => downloadCSV('quotes.csv', ['Quote#', 'Date', 'Customer', 'Amount', 'Status', 'Expiry'], quotes.map(q => [q.quoteNumber, q.quoteDate, q.customerName, String(q.totalAmount), q.status, q.expiryDate ?? '']))}>
              Export
            </ArButton>
            <ArButton size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate((v) => !v)}>New quote</ArButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open quotes" value={openCount} sub={formatINRShort(openTotal)} />
        <StatTile label="Accepted" value={acceptedCount} sub="Ready to convert" tone="pos" />
        <StatTile label="Converted" value={convertedCount} sub="Became invoice / order" />
        <StatTile label="Win rate" value={`${winRate}%`} sub="Of quotes accepted" tone={winRate >= 50 ? 'pos' : 'neutral'} />
      </div>

      <QuotesSection showCreate={showCreate} setShowCreate={setShowCreate} />
    </div>
  );
}
