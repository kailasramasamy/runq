import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Trash2, Truck, Upload, Sparkles, FileText, X } from 'lucide-react';
import {
  PageHeader, Button, Card, CardHeader, CardContent, CardSkeleton,
  Input, DateInput, Textarea, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  useToast, EmptyState,
} from '@/components/ui';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import {
  useReceiveTemplate,
  useReceiveAgainstPo,
  useScanPreview,
  type ReceiveTemplateLine,
  type ScanPreviewResult,
} from '@/hooks/queries/use-po-receive';
import { PoScanReceivePanel } from '@/components/forms/po-scan-receive-panel';
import { formatINR } from '@/lib/utils';

interface Props { poId: string }

interface ReceiveRowUI {
  poLineId: string;
  catalogItemId: string;
  description: string;
  hsnSacCode: string | null;
  inventoryItemId: string | null;
  qtyOpen: number;
  unitRate: number;
  qty: string;
  batchNo: string;
  expiryDate: string;
  serialNos: string;
}

function rowFromTemplate(t: ReceiveTemplateLine): ReceiveRowUI {
  return {
    poLineId: t.poLineId,
    catalogItemId: t.catalogItemId ?? '',
    description: t.description,
    hsnSacCode: t.hsnSacCode,
    inventoryItemId: t.inventoryItemId,
    qtyOpen: t.qtyOpen,
    unitRate: t.unitRate,
    qty: String(t.qtyOpen),
    batchNo: '', expiryDate: '', serialNos: '',
  };
}

export function ReceiveAgainstPoPage({ poId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: templateRes, isLoading, isError } = useReceiveTemplate(poId);
  const { data: warehouses = [] } = useWarehouses();
  const warehouseOptions = [
    { value: '', label: 'Select warehouse…' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const tpl = templateRes?.data;
  // A PO no longer carries pricing, so "post at PO rate" would value the GRN
  // at zero. Only legacy priced POs may take the manual lane; everything else
  // must attach the vendor invoice so the bill supplies the rate.
  const priced = !!tpl?.lines.some((l) => l.unitRate > 0);
  const [warehouseId, setWarehouseId] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ReceiveRowUI[]>([]);
  const [scanPreview, setScanPreview] = useState<ScanPreviewResult | null>(null);
  const [attachedName, setAttachedName] = useState<string | null>(null);
  const mutation = useReceiveAgainstPo();

  useEffect(() => {
    if (tpl) setRows(tpl.lines.map(rowFromTemplate));
  }, [tpl]);

  function updateRow(idx: number, field: keyof ReceiveRowUI, val: string | number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-4">
        <CardSkeleton /><CardSkeleton />
      </div>
    );
  }
  if (isError || !tpl) return <p className="text-sm text-red-500">PO not found or not receivable.</p>;

  if (rows.length === 0 && tpl.lines.length === 0) {
    return (
      <div>
        <PageHeader
          title={`Receive against ${tpl.poNumber}`}
          breadcrumbs={[
            { label: 'Purchase', href: '/purchase' },
            { label: 'Purchase Orders', href: '/purchase/pos' },
            { label: tpl.poNumber, href: `/purchase/pos/${poId}` },
            { label: 'Receive' },
          ]}
        />
        <EmptyState
          icon={Truck}
          title="Nothing left to receive"
          description="All PO lines have been fully received. Close the PO if no more shipments are expected."
        />
      </div>
    );
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!priced) {
      toast('Attach the vendor invoice — this PO has no rate', 'error');
      return;
    }
    if (!warehouseId) { toast('Pick a warehouse', 'error'); return; }
    const lines = rows
      .filter((r) => parseFloat(r.qty) > 0 && r.catalogItemId)
      .map((r) => {
        const serials = r.serialNos.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        return {
          poLineId: r.poLineId,
          catalogItemId: r.catalogItemId,
          qty: parseFloat(r.qty),
          unitCost: r.unitRate,
          batchNo: r.batchNo || null,
          expiryDate: r.expiryDate || null,
          serialNos: serials.length > 0 ? serials : null,
          notes: null,
        };
      });
    if (lines.length === 0) {
      toast('Every row needs qty > 0', 'error');
      return;
    }
    mutation.mutate(
      { poId, data: { warehouseId, receivedDate, vehicleNo: vehicleNo || null, lrNo: lrNo || null, notes: notes || null, lines } },
      {
        onSuccess: (res) => {
          const r = (res as { data?: { grnNo?: string } })?.data;
          toast(`GRN ${r?.grnNo ?? ''} posted at PO rate`, 'success');
          navigate({ to: '/purchase/pos/$poId', params: { poId } });
        },
        onError: (err) => toast((err as Error).message || 'Failed to receive', 'error'),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title={`Receive against ${tpl.poNumber}`}
        description={`Vendor: ${tpl.vendorName}`}
        breadcrumbs={[
          { label: 'Purchase', href: '/purchase' },
          { label: 'Purchase Orders', href: '/purchase/pos' },
          { label: tpl.poNumber, href: `/purchase/pos/${poId}` },
          { label: 'Receive' },
        ]}
      />

      <InvoiceAttachCard
        poId={poId}
        required={!priced}
        preview={scanPreview}
        attachedName={attachedName}
        onAttached={(file, p) => {
          setAttachedName(file.name);
          setScanPreview(p);
        }}
        onRemove={() => { setScanPreview(null); setAttachedName(null); }}
      />

      {scanPreview ? (
        <PoScanReceivePanel
          poId={poId}
          poNumber={tpl.poNumber}
          vendorName={tpl.vendorName}
          preview={scanPreview}
          templateLines={tpl.lines.map((l) => ({
            poLineId: l.poLineId, catalogItemId: l.catalogItemId, description: l.description,
          }))}
          warehouseOptions={warehouseOptions}
          // Controlled at this level so the pick survives mode swaps in
          // either direction (manual → scan or scan → manual).
          warehouseId={warehouseId}
          onWarehouseChange={setWarehouseId}
          onChangeInvoice={() => { setScanPreview(null); setAttachedName(null); }}
          onRemoveInvoice={() => { setScanPreview(null); setAttachedName(null); }}
        />
      ) : (
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Receipt info" />
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-3xl">
                <Combobox
                  label="Warehouse" required
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="Pick warehouse…"
                />
                <DateInput
                  label="Received date" required
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
                <Input label="Vehicle no (optional)" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
                <Input label="LR / docket no (optional)" value={lrNo} onChange={(e) => setLrNo(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-visible">
            <CardHeader title="Items received" />
            <CardContent className="p-0 overflow-visible">
              <Table noOverflow>
                <TableHeader>
                  <tr>
                    <Th>Item (from PO)</Th>
                    <Th align="right">Open</Th>
                    <Th align="right">Qty</Th>
                    <Th>Batch</Th>
                    <Th>Expiry</Th>
                    <Th>Serials</Th>
                    <Th className="w-[40px]" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const tracked = !!row.inventoryItemId;
                    return (
                      <TableRow key={row.poLineId}>
                        <TableCell>
                          <div className="text-[12.5px]">{row.description}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                            {row.hsnSacCode ? `HSN ${row.hsnSacCode} · ` : ''}
                            {priced ? `Rate ${formatINR(row.unitRate)}` : 'Rate from invoice'}
                            {!tracked && ' · not stock-tracked'}
                          </div>
                        </TableCell>
                        <TableCell align="right" numeric>{row.qtyOpen}</TableCell>
                        <TableCell align="right">
                          <Input type="number" min="0" step="0.001" value={row.qty}
                            onChange={(e) => updateRow(idx, 'qty', e.target.value)} className="text-right" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.batchNo} disabled={!tracked}
                            onChange={(e) => updateRow(idx, 'batchNo', e.target.value)}
                            placeholder={tracked ? '—' : 'n/a'} />
                        </TableCell>
                        <TableCell>
                          <DateInput value={row.expiryDate} disabled={!tracked}
                            onChange={(e) => updateRow(idx, 'expiryDate', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Textarea value={row.serialNos} disabled={!tracked} rows={1}
                            onChange={(e) => updateRow(idx, 'serialNos', e.target.value)}
                            placeholder={tracked ? 'One per line' : 'n/a'} />
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline"
              onClick={() => navigate({ to: '/purchase/pos/$poId', params: { poId } })}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!priced}>
              {priced ? 'Post receipt at PO rate' : 'Attach invoice to receive'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Step 1 of the receive flow: vendor invoice attachment. Always visible.
// Empty → upload zone with a clear nudge. Loaded → compact summary with
// AI confidence + a way to swap or remove. Drives whether the form below
// uses vendor numbers (scan-commit) or PO numbers (manual receive).
// ────────────────────────────────────────────────────────────────────────

interface InvoiceAttachProps {
  poId: string;
  /// True when the PO has no rate to fall back on — the invoice is then the
  /// only source of cost, so the manual lane below is disabled.
  required: boolean;
  preview: ScanPreviewResult | null;
  attachedName: string | null;
  onAttached: (file: File, preview: ScanPreviewResult) => void;
  onRemove: () => void;
}

function InvoiceAttachCard({ poId, required, preview, attachedName, onAttached, onRemove }: InvoiceAttachProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewM = useScanPreview();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    previewM.mutate(
      { poId, file: f },
      {
        onSuccess: (res) => onAttached(f, res.data),
        onError: (err) => toast((err as Error).message || 'Scan failed', 'error'),
      },
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const confidencePct = preview ? Math.round((preview.extracted.confidence ?? 0) * 100) : null;
  const filled = !!preview;

  return (
    <Card className="mb-4">
      <CardContent>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={handleFile}
          className="hidden"
        />
        {filled ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-violet-600 dark:text-violet-400" />
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {attachedName ?? preview!.extracted.invoiceNumber}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  <span>Invoice #{preview!.extracted.invoiceNumber}</span>
                  <span>·</span>
                  <span>{preview!.extracted.invoiceDate}</span>
                  <span>·</span>
                  <span>Total ₹{Number(preview!.extracted.totalAmount).toLocaleString('en-IN')}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-px font-medium text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                    <Sparkles size={10} /> AI · {confidencePct}%
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={13} className="mr-1" /> Replace
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                <X size={13} className="mr-1" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-violet-50 p-2 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                <FileText size={18} />
              </div>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {required ? 'Attach the vendor invoice to receive' : 'Step 1 · Attach the vendor invoice'}
                </div>
                <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                  {required
                    ? "This PO carries no rate, so the bill is the only source of cost. Qty + rate + tax come from the vendor's invoice and a single GRN + Bill posts together."
                    : "Without it, we'll receive at the PO rate. With it, qty + rate + tax come from the vendor's bill and a single GRN + Bill posts together."}
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => fileInputRef.current?.click()} loading={previewM.isPending}>
              {!previewM.isPending && <Upload size={14} className="mr-1" />}
              {previewM.isPending ? 'Processing invoice…' : 'Attach invoice'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
