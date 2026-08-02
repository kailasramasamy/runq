import { useState } from 'react';
import { useNavigate, useParams, useSearch, Link } from '@tanstack/react-router';
import { AlertTriangle, Link2, Truck } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Input, Combobox, Button, useToast, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableSkeleton, EmptyState,
} from '@/components/ui';
import {
  useDispatchPreview, useCreateDispatchFromInvoice, useSaveItemAlias,
  type DispatchPreviewLine,
} from '@/hooks/queries/use-sales-dispatch';
import { useWarehouses, useAutoSelectWarehouse, useDispatchDn } from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';

/** Per-line operator overrides on top of the server's suggestion. */
interface LineEdit { qty: number | ''; batchNo: string; include: boolean }

export function DispatchFromInvoicePage() {
  const { id: invoiceId } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as { warehouse?: string };
  const navigate = useNavigate();
  const { toast } = useToast();

  const [warehouseId, setWarehouseId] = useState(search.warehouse ?? '');
  useAutoSelectWarehouse(warehouseId, setWarehouseId);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});

  const { data: warehouses = [] } = useWarehouses();
  const { data: preview, isLoading } = useDispatchPreview(invoiceId, warehouseId);
  const createDraft = useCreateDispatchFromInvoice();
  const dispatchDn = useDispatchDn();
  const busy = createDraft.isPending || dispatchDn.isPending;

  const lines = preview?.lines ?? [];
  const shippable = lines.filter((l) => isShippable(l));
  const blocked = lines.filter((l) => l.resolution === 'unmapped');

  function editFor(line: DispatchPreviewLine): LineEdit {
    return edits[line.invoiceLineId] ?? {
      qty: line.remainingQty,
      batchNo: line.suggestedBatchNo ?? '',
      include: true,
    };
  }
  function patch(lineId: string, p: Partial<LineEdit>, base: LineEdit) {
    setEdits((prev) => ({ ...prev, [lineId]: { ...base, ...p } }));
  }

  async function submit() {
    const payload = shippable
      .map((l) => ({ line: l, edit: editFor(l) }))
      .filter(({ edit }) => edit.include && Number(edit.qty) > 0)
      .map(({ line, edit }) => ({
        itemId: line.itemId!,
        invoiceLineId: line.invoiceLineId,
        qty: Number(edit.qty),
        batchNo: edit.batchNo || null,
        uom: line.uom,
      }));
    if (payload.length === 0) return toast('Nothing selected to dispatch', 'error');

    try {
      // Two steps on purpose: if the ledger rejects a line for short stock the
      // draft survives, so the operator fixes a batch instead of re-keying.
      const dn = await createDraft.mutateAsync({
        invoiceId,
        body: { warehouseId, dispatchDate, vehicleNo: vehicleNo || null, lrNo: lrNo || null, lines: payload },
      });
      try {
        await dispatchDn.mutateAsync(dn.id);
        toast(`${dn.dnNo} dispatched — stock updated`, 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not post stock', 'error');
      }
      navigate({ to: '/inventory/delivery/$id', params: { id: dn.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create dispatch', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title={preview ? `Dispatch against ${preview.invoice.invoiceNumber}` : 'Dispatch against invoice'}
        description={preview ? `${preview.invoice.customerName} · invoiced ${preview.invoice.invoiceDate}` : 'Loading…'}
        fullWidth
        actions={
          <Button variant="primary" onClick={submit} disabled={busy || shippable.length === 0}>
            <Truck size={16} /> {busy ? 'Posting…' : 'Confirm dispatch'}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Warehouse">
              <Combobox
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                value={warehouseId}
                onChange={setWarehouseId}
                placeholder="Pick a warehouse"
              />
            </Field>
            <Field label="Dispatch date">
              <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
            </Field>
            <Field label="Vehicle no">
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="KA01AB1234" />
            </Field>
            <Field label="LR no">
              <Input value={lrNo} onChange={(e) => setLrNo(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </CardContent>
      </Card>

      {blocked.length > 0 && (
        <UnmappedNotice lines={blocked} invoiceId={invoiceId} />
      )}

      {!warehouseId ? (
        <EmptyState icon={Truck} title="Pick a warehouse" description="Stock availability and batches depend on it." />
      ) : isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : lines.length === 0 ? (
        <EmptyState icon={Truck} title="Nothing on this invoice" description="It has no lines to dispatch." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Line</Th>
              <Th className="text-right">Invoiced</Th>
              <Th className="text-right">Already sent</Th>
              <Th className="text-right">Dispatch now</Th>
              <Th>Batch</Th>
              <Th className="text-right">On hand</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <LineRow
                key={l.invoiceLineId}
                line={l}
                edit={editFor(l)}
                onPatch={(p) => patch(l.invoiceLineId, p, editFor(l))}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function LineRow({ line, edit, onPatch }: {
  line: DispatchPreviewLine;
  edit: LineEdit;
  onPatch: (p: Partial<LineEdit>) => void;
}) {
  const shippable = isShippable(line);
  const short = shippable && Number(edit.qty) > line.availableQty;
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{line.itemName ?? line.description}</div>
        <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          {line.description}
          {line.resolution === 'alias' && <span className="ml-1.5">· matched by name</span>}
        </div>
        {!shippable && <ResolutionBadge resolution={line.resolution} />}
      </TableCell>
      <TableCell className="text-right tabular-nums">{line.invoicedQty} {line.uom ?? ''}</TableCell>
      <TableCell className="text-right tabular-nums">{line.dispatchedQty}</TableCell>
      <TableCell className="text-right">
        {shippable ? (
          <Input
            type="number"
            min={0}
            max={line.remainingQty}
            step="0.001"
            value={edit.qty}
            onChange={(e) => onPatch({ qty: e.target.value === '' ? '' : Number(e.target.value) })}
            className="h-8 w-24 py-0 text-right text-[12.5px]"
          />
        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
      </TableCell>
      <TableCell>
        {shippable && line.trackBatches ? (
          <Input
            value={edit.batchNo}
            onChange={(e) => onPatch({ batchNo: e.target.value })}
            placeholder="FEFO"
            className="h-8 w-36 py-0 text-[12.5px]"
          />
        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {shippable ? (
          <span style={short ? { color: 'var(--danger-text)' } : undefined}>
            {line.availableQty}
          </span>
        ) : '—'}
      </TableCell>
    </TableRow>
  );
}

/**
 * Ad-hoc lines that never resolved to an item. Mapping one here writes an
 * alias, so every future invoice with the same wording resolves by itself.
 */
function UnmappedNotice({ lines, invoiceId }: { lines: DispatchPreviewLine[]; invoiceId: string }) {
  const { toast } = useToast();
  const saveAlias = useSaveItemAlias();
  const itemsRes = useItems({ status: 'active', limit: 500 });
  const opts = (itemsRes.data?.data ?? [])
    .filter((i) => i.type === 'product')
    .map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}` }));

  async function map(sourceName: string, itemId: string) {
    if (!itemId) return;
    try {
      await saveAlias.mutateAsync({ sourceName, itemId });
      toast(`"${sourceName}" mapped — future invoices will match automatically`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save mapping', 'error');
    }
  }

  return (
    <Card className="mb-4">
      <CardContent>
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
          <AlertTriangle size={14} style={{ color: 'var(--warning-text)' }} />
          {lines.length} line{lines.length > 1 ? 's' : ''} not linked to an item
        </div>
        <p className="mb-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
          These won't move stock. Map one to an item and it stays mapped for
          every future invoice using the same description.
        </p>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.invoiceLineId} className="flex flex-wrap items-center gap-2">
              <span className="min-w-52 flex-1 text-[12.5px]">{l.description}</span>
              <div className="w-72">
                <Combobox
                  options={opts}
                  value=""
                  onChange={(v) => map(l.description, v)}
                  placeholder="Map to item…"
                  inputClassName="h-8 py-0 text-[12.5px]"
                />
              </div>
            </div>
          ))}
        </div>
        <Link
          to="/inventory/delivery/from-invoice/$id"
          params={{ id: invoiceId }}
          className="mt-3 inline-flex items-center gap-1 text-[12px] hover:underline"
          style={{ color: 'var(--accent-text)' }}
        >
          <Link2 size={12} /> Reload after mapping
        </Link>
      </CardContent>
    </Card>
  );
}

function ResolutionBadge({ resolution }: { resolution: DispatchPreviewLine['resolution'] }) {
  if (resolution === 'not_stocked') {
    return <Badge variant="default">Not stocked</Badge>;
  }
  return <Badge variant="warning">Unmapped</Badge>;
}

function isShippable(l: DispatchPreviewLine) {
  return (l.resolution === 'item' || l.resolution === 'alias') && l.remainingQty > 0;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
