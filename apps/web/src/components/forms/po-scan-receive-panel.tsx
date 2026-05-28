import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles, AlertTriangle, Trash2 } from 'lucide-react';
import {
  Button, Card, CardHeader, CardContent,
  Input, DateInput, Textarea, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';
import {
  useScanCommit,
  type ScanPreviewResult, type ScanSuggestedLine,
} from '@/hooks/queries/use-po-receive';
import type { ScanReceiveAgainstPoInput } from '@runq/validators';
import { formatINR } from '@/lib/utils';

/**
 * Form-body for the "vendor invoice attached" mode of PO receive. Owns the
 * editable vendor header, receipt info, and per-line review. Upload itself
 * happens upstream in receive.tsx via InvoiceAttachCard — this component
 * always renders with a populated `preview`.
 */

interface Props {
  poId: string;
  poNumber: string;
  vendorName: string;
  preview: ScanPreviewResult;
  templateLines: Array<{ poLineId: string; catalogItemId: string | null; description: string }>;
  warehouseOptions: Array<{ value: string; label: string }>;
  /** Controlled — lifted to receive.tsx so the pick survives a mode swap. */
  warehouseId: string;
  onWarehouseChange: (id: string) => void;
  /** "Use a different invoice" — clears the scan so user can re-upload. */
  onChangeInvoice: () => void;
  /** Remove the invoice entirely and revert to manual PO-rate receive. */
  onRemoveInvoice: () => void;
}

interface ScanRow {
  poLineId: string | null;
  catalogItemId: string;
  description: string;
  qty: string;
  unitRate: string;
  taxRate: string;
  hsnSacCode: string;
  batchNo: string;
  expiryDate: string;
  serialNos: string;
  isOffPo: boolean;
  poQty: number | null;
  poRate: number | null;
}

function rowFromSuggestion(s: ScanSuggestedLine, fallbackCatalog: string | null): ScanRow {
  return {
    poLineId: s.poLineId,
    catalogItemId: s.catalogItemId ?? fallbackCatalog ?? '',
    description: s.catalogDescription,
    qty: String(s.vendorQty),
    unitRate: String(s.vendorRate),
    taxRate: s.vendorTaxRate != null ? String(s.vendorTaxRate) : '',
    hsnSacCode: s.vendorHsnSacCode ?? '',
    batchNo: '', expiryDate: '', serialNos: '',
    isOffPo: s.isOffPo,
    poQty: s.poQty, poRate: s.poRate,
  };
}

export function PoScanReceivePanel({
  poId, poNumber: _poNumber, vendorName, preview, templateLines,
  warehouseOptions, warehouseId, onWarehouseChange,
  onChangeInvoice, onRemoveInvoice,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const commitM = useScanCommit();

  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [notes, setNotes] = useState('');

  // Vendor invoice header — editable post-scan.
  const [invNum, setInvNum] = useState('');
  const [invDate, setInvDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isInterState, setIsInterState] = useState(false);
  const [reverseCharge, setReverseCharge] = useState(false);

  const [rows, setRows] = useState<ScanRow[]>([]);

  // Re-hydrate when a new preview is passed in (re-scan). We deliberately
  // do NOT mirror the AI-extracted subtotal/tax/total — those header numbers
  // get mangled by Indian-comma layouts (₹3,67,009.50 → ₹36,70,009.50) often
  // enough that we treat line math as the source of truth and surface the
  // AI's parse as a reference hint only.
  useEffect(() => {
    setInvNum(preview.extracted.invoiceNumber);
    setInvDate(preview.extracted.invoiceDate);
    setDueDate(preview.extracted.dueDate ?? '');
    setRows(preview.suggestedLines.map((s) => {
      const tplLine = s.poLineId ? templateLines.find((t) => t.poLineId === s.poLineId) : null;
      return rowFromSuggestion(s, tplLine?.catalogItemId ?? null);
    }));
  }, [preview, templateLines]);

  function updateRow(idx: number, field: keyof ScanRow, val: string | boolean) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function buildCommitPayload(): ScanReceiveAgainstPoInput | null {
    if (!warehouseId) { toast('Pick a warehouse', 'error'); return null; }
    if (!invNum.trim()) { toast('Vendor invoice number is required', 'error'); return null; }
    if (!invDate) { toast('Vendor invoice date is required', 'error'); return null; }
    // Drop rows with no qty or no description (a description is needed for
    // off-PO lines so the server can mint a catalog row). PO-matched rows
    // inherit description from the catalog suggestion, so they always pass.
    const lines = rows
      .filter((r) => parseFloat(r.qty) > 0 && (r.catalogItemId || r.description.trim().length > 0))
      .map((r) => {
        const serials = r.serialNos.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        return {
          poLineId: r.poLineId,
          catalogItemId: r.catalogItemId || null,
          qty: parseFloat(r.qty),
          unitRate: parseFloat(r.unitRate) || 0,
          taxRate: r.taxRate ? parseFloat(r.taxRate) : null,
          hsnSacCode: r.hsnSacCode || null,
          description: r.description || null,
          batchNo: r.batchNo || null,
          expiryDate: r.expiryDate || null,
          serialNos: serials.length > 0 ? serials : null,
          notes: null,
        };
      });
    if (lines.length === 0) { toast('Every row needs qty > 0 and a description', 'error'); return null; }
    if (!lines.some((l) => l.poLineId)) {
      toast('At least one line must match a PO line — pure off-PO bills don\'t belong here', 'error');
      return null;
    }
    // Totals come from line math, not the AI-extracted header — see the
    // useEffect comment above for why.
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitRate, 0);
    const taxAmount = lines.reduce(
      (s, l) => s + l.qty * l.unitRate * ((l.taxRate ?? 0) / 100), 0,
    );
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    return {
      warehouseId,
      receivedDate,
      vehicleNo: vehicleNo || null,
      lrNo: lrNo || null,
      notes: notes || null,
      vendorInvoice: {
        invoiceNumber: invNum.trim(),
        invoiceDate: invDate,
        dueDate: dueDate || null,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount,
        isInterState,
        reverseCharge,
      },
      lines,
      extractionId: preview.extractionId,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildCommitPayload();
    if (!payload) return;
    commitM.mutate({ poId, data: payload }, {
      onSuccess: (res) => {
        const r = res?.data;
        toast(`GRN ${r?.grnNo} + Bill ${r?.billNumber} posted${r?.offPoLineCount ? ` (${r.offPoLineCount} off-PO line${r.offPoLineCount === 1 ? '' : 's'})` : ''}`, 'success');
        navigate({ to: '/purchase/pos/$poId', params: { poId } });
      },
      onError: (err) => toast((err as Error).message || 'Failed to post', 'error'),
    });
  }

  const confidencePct = Math.round((preview.extracted.confidence ?? 0) * 100);
  const offPoCount = rows.filter((r) => r.isOffPo).length;

  // Totals derived live from the editable rows. AI-extracted header total
  // is shown as a reference only — it's frequently mis-parsed on Indian-
  // comma invoices, so line math is authoritative.
  const subtotalLive = rows.reduce(
    (s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.unitRate) || 0), 0,
  );
  const taxLive = rows.reduce((s, r) => {
    const amt = (parseFloat(r.qty) || 0) * (parseFloat(r.unitRate) || 0);
    return s + amt * (parseFloat(r.taxRate) || 0) / 100;
  }, 0);
  const totalLive = subtotalLive + taxLive;
  const aiTotal = preview.extracted.totalAmount ?? 0;
  const aiTotalMismatch = aiTotal > 0 && Math.abs(totalLive - aiTotal) > 1;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {preview.vendorMismatch && (
        <Card>
          <CardContent>
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
              <AlertTriangle size={18} className="mt-0.5 flex-none text-amber-600 dark:text-amber-400" />
              <div className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>
                Vendor on the scanned invoice (<strong>{preview.extracted.vendorName}</strong>) does not match the PO vendor (<strong>{vendorName}</strong>). Posting will still link the bill to {vendorName}; verify before confirming.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Vendor invoice"
          action={
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
              <Sparkles size={11} /> AI · {confidencePct}% confidence
            </span>
          }
        />
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 max-w-4xl">
            <Input label="Invoice #" required value={invNum} onChange={(e) => setInvNum(e.target.value)} />
            <DateInput label="Invoice date" required value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            <DateInput label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} />
              <span>Inter-state supply (IGST)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} />
              <span>Reverse charge</span>
            </label>
          </div>
          <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Subtotal, tax, and total are computed live from the line items below — see the totals
            strip at the foot of the table.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Receipt info" />
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-3xl">
            <Combobox
              label="Warehouse" required
              options={warehouseOptions}
              value={warehouseId}
              onChange={onWarehouseChange}
              placeholder="Pick warehouse…"
            />
            <DateInput label="Received date" required value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            <Input label="Vehicle no (optional)" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
            <Input label="LR / docket no (optional)" value={lrNo} onChange={(e) => setLrNo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader
          title="Line items"
          action={offPoCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {offPoCount} off-PO line{offPoCount === 1 ? '' : 's'}
            </span>
          ) : null}
        />
        <CardContent className="p-0 overflow-visible">
          <Table noOverflow>
            <TableHeader>
              <tr>
                <Th>Item</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Tax %</Th>
                <Th align="right">Amount</Th>
                <Th>HSN</Th>
                <Th>Batch</Th>
                <Th>Expiry</Th>
                <Th className="w-[40px]" />
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => {
                const rateDelta = row.poRate != null && parseFloat(row.unitRate) !== row.poRate;
                const qtyDelta = row.poQty != null && parseFloat(row.qty) !== row.poQty;
                const lineAmount = (parseFloat(row.qty) || 0) * (parseFloat(row.unitRate) || 0);
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="text-[12.5px]">{row.description}</div>
                      <div className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {row.isOffPo ? (
                          <span className="rounded bg-amber-100 px-1.5 py-px text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">off-PO</span>
                        ) : (
                          <>
                            {qtyDelta && <span>PO qty {row.poQty}</span>}
                            {qtyDelta && rateDelta && <span>·</span>}
                            {rateDelta && <span>PO ₹{row.poRate}</span>}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell align="right">
                      <Input type="number" min="0" step="0.001"
                        value={row.qty}
                        onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                        className="text-right" />
                    </TableCell>
                    <TableCell align="right">
                      <Input type="number" min="0" step="0.01"
                        value={row.unitRate}
                        onChange={(e) => updateRow(idx, 'unitRate', e.target.value)}
                        className="text-right" />
                    </TableCell>
                    <TableCell align="right">
                      <Input type="number" min="0" max="100" step="0.01"
                        value={row.taxRate}
                        onChange={(e) => updateRow(idx, 'taxRate', e.target.value)}
                        className="text-right" />
                    </TableCell>
                    <TableCell align="right" numeric>{formatINR(lineAmount)}</TableCell>
                    <TableCell>
                      <Input value={row.hsnSacCode}
                        onChange={(e) => updateRow(idx, 'hsnSacCode', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.batchNo}
                        onChange={(e) => updateRow(idx, 'batchNo', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <DateInput value={row.expiryDate}
                        onChange={(e) => updateRow(idx, 'expiryDate', e.target.value)} />
                    </TableCell>
                    <TableCell align="right">
                      <Button type="button" variant="ghost" size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => removeRow(idx)}>
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex flex-col items-end gap-1 border-t border-zinc-200 px-4 py-3 text-[12.5px] dark:border-zinc-800">
            <TotalsRow label="Subtotal" value={formatINR(subtotalLive)} />
            <TotalsRow label="Tax" value={formatINR(taxLive)} />
            <TotalsRow
              label="Total"
              value={formatINR(totalLive)}
              bold
              hint={aiTotalMismatch
                ? `AI read this as ${formatINR(aiTotal)} — ignored; line math wins`
                : undefined}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardContent>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onChangeInvoice}>
          Use a different invoice
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onRemoveInvoice}>
          Remove invoice — receive at PO rate
        </Button>
        <Button type="submit" loading={commitM.isPending}>
          Post GRN + Bill
        </Button>
      </div>
    </form>
  );
}

function TotalsRow({ label, value, bold, hint }: { label: string; value: string; bold?: boolean; hint?: string }) {
  return (
    <div className="flex w-72 flex-col gap-0.5">
      <div className="flex items-center justify-between gap-4">
        <span style={{ color: 'var(--text-3)' }}>{label}</span>
        <span
          className={bold ? 'font-mono font-semibold tabular-nums' : 'font-mono tabular-nums'}
          style={{ color: bold ? 'var(--text-1)' : 'var(--text-2)' }}
        >
          {value}
        </span>
      </div>
      {hint && (
        <div className="text-[11px] text-right text-amber-700 dark:text-amber-400">{hint}</div>
      )}
    </div>
  );
}
