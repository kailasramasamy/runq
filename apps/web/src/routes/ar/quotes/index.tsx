import { useState } from 'react';
import { Plus, Trash2, X, Download, FileText, ArrowRight } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Textarea, Combobox, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useCustomers } from '@/hooks/queries/use-customers';
import {
  useQuotes, useCreateQuote, useConvertQuoteToInvoice, useConvertQuoteToOrder,
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

interface LineItemRow { description: string; qty: string; unitPrice: string }

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateQuote();
  const { toast } = useToast();
  const { data: customersData } = useCustomers({ limit: 200 });
  const customerOptions = (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const [customerId, setCustomerId] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<LineItemRow[]>([{ description: '', qty: '1', unitPrice: '' }]);

  function addItem() { setItems((p) => [...p, { description: '', qty: '1', unitPrice: '' }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, f: keyof LineItemRow, v: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [f]: v } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        customerId,
        quoteDate,
        ...(expiryDate ? { expiryDate } : {}),
        lineItems: items.map((it) => ({
          description: it.description,
          quantity: Number(it.qty),
          unitPrice: Number(it.unitPrice),
        })),
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Combobox label="Customer" options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Select customer..." />
          <DateInput label="Quote Date" value={quoteDate} onChange={setQuoteDate} required />
          <DateInput label="Expiry Date" value={expiryDate} onChange={setExpiryDate} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Line Items</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required placeholder="Item description" />
                <Input label="Qty" type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} required />
                <Input label="Unit Price" type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} required placeholder="0.00" />
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

// ─── Detail View ─────────────────────────────────────────────────────────────

function DetailView({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const convertInvoice = useConvertQuoteToInvoice();
  const convertOrder = useConvertQuoteToOrder();
  const { toast } = useToast();
  const statusInfo = STATUS_BADGE[quote.status];

  async function handleConvertInvoice() {
    try { await convertInvoice.mutateAsync(quote.id); toast('Converted to invoice', 'success'); onClose(); }
    catch { toast('Failed to convert', 'error'); }
  }
  async function handleConvertOrder() {
    try { await convertOrder.mutateAsync(quote.id); toast('Converted to sales order', 'success'); onClose(); }
    catch { toast('Failed to convert', 'error'); }
  }

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {quote.quoteNumber} <Badge variant={statusInfo.variant} className="ml-2">{statusInfo.label}</Badge>
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"><X size={14} /></button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-zinc-500">Customer</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.customerName}</p></div>
        <div><p className="text-xs text-zinc-500">Quote Date</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.quoteDate}</p></div>
        <div><p className="text-xs text-zinc-500">Expiry</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.expiryDate ?? '-'}</p></div>
        <div><p className="text-xs text-zinc-500">Total</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{formatINR(quote.totalAmount)}</p></div>
      </div>
      <Table>
        <TableHeader><tr><Th>Description</Th><Th align="right">Qty</Th><Th align="right">Unit Price</Th><Th align="right">Amount</Th></tr></TableHeader>
        <TableBody>
          {(quote.lineItems ?? []).map((li, i) => (
            <TableRow key={i}><TableCell>{li.description}</TableCell><TableCell align="right" numeric>{li.quantity}</TableCell><TableCell align="right" numeric>{formatINR(li.unitPrice)}</TableCell><TableCell align="right" numeric>{formatINR(li.amount)}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      {quote.status === 'accepted' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleConvertInvoice} loading={convertInvoice.isPending}><FileText size={14} /> Convert to Invoice</Button>
          <Button size="sm" variant="outline" onClick={handleConvertOrder} loading={convertOrder.isPending}><ArrowRight size={14} /> Convert to Order</Button>
        </div>
      )}
    </div>
  );
}

// ─── Quotes Page ─────────────────────────────────────────────────────────────

export function QuotesPage() {
  const { data, isLoading } = useQuotes();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const quotes = data?.data ?? [];
  const selected = selectedId ? quotes.find((q) => q.id === selectedId) : null;

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
      {selected && <DetailView quote={selected} onClose={() => setSelectedId(null)} />}

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
