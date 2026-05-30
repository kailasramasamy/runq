import { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createCreditNoteSchema } from '@runq/validators';
import type { CreateCreditNoteInput } from '@runq/validators';
import { useCustomers } from '../../hooks/queries/use-customers';
import { useInvoices } from '../../hooks/queries/use-invoices';
import { useItems } from '../../hooks/queries/use-items';
import { formatINR } from '../../lib/utils';
import {
  Button, Card, CardHeader, CardContent, CardFooter,
  Input, DateInput, Select, Textarea, Combobox, HsnSacCombobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';

interface Props {
  onSubmit: (data: CreateCreditNoteInput) => void;
  isLoading: boolean;
  // Optional doc-type override for re-using this form for customer debit notes.
  docLabel?: { title: string; submitButton: string };
}

interface LineItem {
  itemId: string;
  description: string;
  hsnSacCode: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

const EMPTY_LINE: LineItem = { itemId: '', description: '', hsnSacCode: '', quantity: '1', unitPrice: '', taxRate: '0' };
const TAX_RATES = ['0', '5', '12', '18', '28'];
// Indian state-code map for place-of-supply selector.
const STATE_CODES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
];

function lineAmount(l: LineItem): number {
  return (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
}

function lineTax(l: LineItem, isInterState: boolean): { taxable: number; cgst: number; sgst: number; igst: number; total: number } {
  const taxable = lineAmount(l);
  const rate = parseFloat(l.taxRate) || 0;
  const tax = (taxable * rate) / 100;
  if (isInterState) return { taxable, cgst: 0, sgst: 0, igst: tax, total: taxable + tax };
  return { taxable, cgst: tax / 2, sgst: tax / 2, igst: 0, total: taxable + tax };
}

export function CreditNoteForm({ onSubmit, isLoading, docLabel }: Props) {
  const label = docLabel ?? { title: 'Credit Note Details', submitButton: 'Save Credit Note' };

  const { data: customersData } = useCustomers({ limit: 200 });
  const customers = customersData?.data?.filter((c) => c.isActive) ?? [];
  const { data: itemsData } = useItems({ limit: 200 });
  const allItems = itemsData?.data?.filter((i) => i.isActive) ?? [];
  const itemOptions = allItems.map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }));

  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState('');
  const [amendsInvoiceNumber, setAmendsInvoiceNumber] = useState('');
  const [amendsInvoiceDate, setAmendsInvoiceDate] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: invoicesData } = useInvoices(customerId ? { customerId } : undefined);
  const invoices = invoicesData?.data ?? [];

  const customer = customers.find((c) => c.id === customerId);
  const customerStateCode = (customer?.gstin?.slice(0, 2)) ?? '';
  const effectivePos = placeOfSupplyCode || customerStateCode;
  // For Vrindavan Dairy (and any tenant), intra-state when POS matches customer's
  // home state. A more accurate check would use tenant GSTIN; using customer
  // state is the common case for the v1 form.
  const isInterState = effectivePos !== '' && customerStateCode !== '' && effectivePos !== customerStateCode;

  const totals = useMemo(() => {
    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    for (const l of lines) {
      const t = lineTax(l, isInterState);
      taxable += t.taxable; cgst += t.cgst; sgst += t.sgst; igst += t.igst;
    }
    return { taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
  }, [lines, isInterState]);

  function updateLine(idx: number, field: keyof LineItem, val: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }
  function addLine() { setLines((p) => [...p, { ...EMPTY_LINE }]); }
  function removeLine(idx: number) { setLines((p) => p.filter((_, i) => i !== idx)); }
  function onItemPick(idx: number, itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) { updateLine(idx, 'itemId', ''); return; }
    setLines((p) => p.map((l, i) => i === idx ? {
      ...l,
      itemId,
      description: item.name,
      hsnSacCode: item.hsnSacCode ?? '',
      taxRate: String(item.gstRate ?? 0),
      unitPrice: l.unitPrice || String(item.defaultSellingPrice ?? ''),
    } : l));
  }

  // Auto-populate amends_invoice_* when an invoice is selected.
  function onPickInvoice(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) {
      setAmendsInvoiceNumber(inv.invoiceNumber);
      setAmendsInvoiceDate(inv.invoiceDate);
      // Also infer place-of-supply from invoice if available
      if ('placeOfSupplyCode' in inv && inv.placeOfSupplyCode) {
        setPlaceOfSupplyCode(inv.placeOfSupplyCode as string);
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const items = lines
      .filter((l) => parseFloat(l.quantity) > 0 && parseFloat(l.unitPrice) >= 0 && l.description.trim())
      .map((l) => {
        const t = lineTax(l, isInterState);
        const rate = parseFloat(l.taxRate) || 0;
        return {
          itemId: l.itemId || null,
          description: l.description,
          quantity: parseFloat(l.quantity),
          unitPrice: parseFloat(l.unitPrice),
          amount: Math.round(t.taxable * 100) / 100,
          hsnSacCode: l.hsnSacCode || null,
          taxCategory: 'taxable' as const,
          taxRate: rate,
          cgstRate: isInterState ? 0 : rate / 2,
          cgstAmount: Math.round(t.cgst * 100) / 100,
          sgstRate: isInterState ? 0 : rate / 2,
          sgstAmount: Math.round(t.sgst * 100) / 100,
          igstRate: isInterState ? rate : 0,
          igstAmount: Math.round(t.igst * 100) / 100,
          cessRate: 0, cessAmount: 0,
          packSizeValue: 1,
        };
      });

    const parsed = createCreditNoteSchema.safeParse({
      customerId,
      invoiceId: invoiceId || null,
      issueDate,
      reason,
      placeOfSupply: effectivePos ? STATE_CODES.find((s) => s.code === effectivePos)?.name ?? null : null,
      placeOfSupplyCode: effectivePos || null,
      isInterState,
      amendsInvoiceNumber: amendsInvoiceNumber || null,
      amendsInvoiceDate: amendsInvoiceDate || null,
      items,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((err) => { errs[err.path.join('.')] = err.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const customerOptions = [
    { value: '', label: 'Select customer…' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];
  const invoiceOptions = [
    { value: '', label: 'No linked invoice (standalone)' },
    ...invoices.map((i) => ({ value: i.id, label: `${i.invoiceNumber} — ${formatINR(Number(i.totalAmount))}` })),
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader title={label.title} />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 max-w-md">
              <Combobox label="Customer" required options={customerOptions} value={customerId} error={errors.customerId} placeholder="Search customer…" onChange={(v) => { setCustomerId(v); setInvoiceId(''); }} />
            </div>
            <div className="sm:col-span-2 max-w-md">
              <Combobox label="Linked Invoice (optional)" options={invoiceOptions} value={invoiceId} placeholder="Search invoice…" disabled={!customerId} onChange={onPickInvoice} />
            </div>
            <DateInput label="Issue Date" required value={issueDate} error={errors.issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            <Select label="Place of Supply" value={effectivePos} onChange={(e) => setPlaceOfSupplyCode(e.target.value)} options={[{ value: '', label: '— select —' }, ...STATE_CODES.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` }))]} />
            <Input label="Amends Invoice Number (original)" value={amendsInvoiceNumber} onChange={(e) => setAmendsInvoiceNumber(e.target.value)} placeholder="e.g. 260130" />
            <DateInput label="Amends Invoice Date (original)" value={amendsInvoiceDate} onChange={(e) => setAmendsInvoiceDate(e.target.value)} />
            <div className="sm:col-span-2">
              <Textarea label="Reason" required placeholder="Why this note?" value={reason} onChange={(e) => setReason(e.target.value)} />
              {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Line Items" />
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Item / Description</Th>
                <Th>HSN</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Unit Price</Th>
                <Th className="text-right">Tax %</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => {
                const t = lineTax(l, isInterState);
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Combobox options={[{ value: '', label: '— ad-hoc line —' }, ...itemOptions]} value={l.itemId} placeholder="Search item…" onChange={(v) => onItemPick(idx, v)} />
                        <Input value={l.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} placeholder="Description" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <HsnSacCombobox value={l.hsnSacCode} onChange={(v) => updateLine(idx, 'hsnSacCode', v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={0} step={0.001} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className="text-right" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={0} step={0.01} value={l.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} className="text-right" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Select value={l.taxRate} onChange={(e) => updateLine(idx, 'taxRate', e.target.value)} options={TAX_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(t.total)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" onClick={() => removeLine(idx)} disabled={lines.length === 1}><Trash2 size={14} /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Button type="button" variant="ghost" onClick={addLine} className="mt-2"><Plus size={14} className="mr-1" /> Add line</Button>
          {errors.items && <p className="mt-2 text-xs text-red-600">{errors.items}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex justify-end">
            <div className="w-full max-w-sm flex flex-col gap-1 text-sm">
              <div className="flex justify-between"><span>Taxable Value</span><span className="tabular-nums">{formatINR(totals.taxable)}</span></div>
              {!isInterState && <>
                <div className="flex justify-between text-zinc-600"><span>CGST</span><span className="tabular-nums">{formatINR(totals.cgst)}</span></div>
                <div className="flex justify-between text-zinc-600"><span>SGST</span><span className="tabular-nums">{formatINR(totals.sgst)}</span></div>
              </>}
              {isInterState && <div className="flex justify-between text-zinc-600"><span>IGST</span><span className="tabular-nums">{formatINR(totals.igst)}</span></div>}
              <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total</span><span className="tabular-nums">{formatINR(totals.total)}</span></div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={isLoading} disabled={!customerId || !reason || totals.total <= 0}>{label.submitButton}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
