import { useState } from 'react';
import {
  Modal, Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, Button, Input,
  EmptyState, Skeleton, useToast, ConfirmationDialog,
} from '@/components/ui';
import { Receipt, Trash2 } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import {
  usePours, useCorrectPour, useReversePour, useFarmers, useConsignments, useEditReceipt,
  type MpPour, type MpConsignment,
} from '@/hooks/queries/use-milk-procurement';

/**
 * Correct a day's recorded pours (operator mistakes). Lists the pours behind a
 * history row — one per shift/milk-type — with editable readings. Saving a row
 * reverses that pour and inserts a re-priced replacement server-side, so rate
 * and amount update after save; the original is kept as an audit trail. Blocked
 * when the shift is closed (the server returns a clear message).
 */
export function DayPoursEditModal({ filter, title, onClose }: {
  filter: { nodeId?: string; farmerId?: string; collectionDate: string };
  title: string;
  onClose: () => void;
}) {
  const { data, isLoading } = usePours({ ...filter, status: 'recorded', limit: 100 });
  // Node-level edit (no fixed farmer) spans farmers, so name each row.
  const showFarmer = !filter.farmerId;
  const { data: farmersData } = useFarmers({ limit: 500 });
  const farmerName = (id: string) => farmersData?.data.find((x) => x.id === id)?.name ?? id.slice(0, 8);
  const pours = (data?.data ?? []).slice()
    .sort((a, b) => (a.farmerId !== b.farmerId ? farmerName(a.farmerId).localeCompare(farmerName(b.farmerId))
      : a.shift === b.shift ? a.milkType.localeCompare(b.milkType) : a.shift.localeCompare(b.shift)));

  // A bulk VMCC has no farmer pours — its milk is the CC's direct receipts. When
  // there are no pours, those receipts ARE the day's data, so edit them instead.
  const { data: consData, isLoading: consLoading } = useConsignments({
    fromNodeId: filter.nodeId, collectionDate: filter.collectionDate,
    kind: 'vmcc_to_cc', status: 'received', limit: 100,
  });
  const receipts = (pours.length > 0 || filter.farmerId ? [] : (consData?.data ?? []))
    .slice().sort((a, b) => (a.shift ?? '').localeCompare(b.shift ?? ''));
  const loading = isLoading || (pours.length === 0 && !filter.farmerId && consLoading);
  const empty = pours.length === 0 && receipts.length === 0;
  return (
    <Modal open onClose={onClose} title={title} size="lg">
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full rounded" />)}</div>
      ) : empty ? (
        <EmptyState icon={Receipt} title="No recorded collection for this day." />
      ) : receipts.length > 0 ? (
        <>
          <p className="mb-2 text-xs text-zinc-500">
            This VMCC supplies the centre directly — correct the received quantity and quality here.
            Amounts are re-priced from the rate chart at billing.
          </p>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Shift</Th><Th>Container</Th><Th align="right">Qty (L)</Th>
                  <Th align="right">FAT</Th><Th align="right">SNF</Th><Th align="right">Water</Th><Th align="right">Action</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((c) => <ReceiptEditRow key={c.id} c={c} />)}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-zinc-500">
            Fix a mistaken reading and Save — the pour is re-priced from the rate chart, and the
            original is kept for audit. Delete removes an entry that should never have been
            recorded. A closed shift must be reopened first.
          </p>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {showFarmer && <Th>Farmer</Th>}
                  <Th>Shift</Th><Th>Type</Th><Th align="right">Qty (L)</Th>
                  <Th align="right">FAT</Th><Th align="right">SNF</Th><Th align="right">CLR</Th><Th align="right">Water</Th>
                  <Th align="right">₹/L</Th><Th align="right">Amount</Th><Th align="right">Action</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pours.map((p) => (
                  <PourEditRow key={p.id} pour={p}
                    farmer={showFarmer ? farmerName(p.farmerId) : undefined} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Modal>
  );
}

function ReceiptEditRow({ c }: { c: MpConsignment }) {
  const edit = useEditReceipt();
  const { toast } = useToast();
  const [f, setF] = useState({
    qty: c.receiptQty ?? '', fat: c.receiptFat ?? '', snf: c.receiptSnf ?? '',
    water: c.receiptWater == null ? '' : String(c.receiptWater),
  });
  const num = (s: string) => (s === '' ? null : Number(s));
  const dirty = f.qty !== (c.receiptQty ?? '') || (f.fat || '') !== (c.receiptFat ?? '')
    || (f.snf || '') !== (c.receiptSnf ?? '') || f.water !== (c.receiptWater == null ? '' : String(c.receiptWater));
  const save = () => {
    edit.mutate(
      { id: c.id, data: { receiptQty: Number(f.qty), receiptFat: num(f.fat), receiptSnf: num(f.snf), receiptWater: num(f.water) } },
      {
        onSuccess: () => toast('Receipt corrected', 'success'),
        onError: (e) => toast(e instanceof Error ? e.message : 'Could not correct the receipt', 'error'),
      },
    );
  };
  const inp = (v: string, on: (s: string) => void) => (
    <Input type="number" value={v} onChange={(e) => on(e.target.value)} className="w-20 text-right" />
  );
  return (
    <TableRow>
      <TableCell><Badge>{(c.shift ?? 'day').toUpperCase()}</Badge></TableCell>
      <TableCell className="text-xs text-zinc-500">{c.containerNo ?? '—'}</TableCell>
      <TableCell align="right">{inp(f.qty, (s) => setF({ ...f, qty: s }))}</TableCell>
      <TableCell align="right">{inp(f.fat, (s) => setF({ ...f, fat: s }))}</TableCell>
      <TableCell align="right">{inp(f.snf, (s) => setF({ ...f, snf: s }))}</TableCell>
      <TableCell align="right">{inp(f.water, (s) => setF({ ...f, water: s }))}</TableCell>
      <TableCell align="right">
        <Button size="sm" onClick={save} loading={edit.isPending} disabled={!dirty || Number(f.qty) <= 0}>Save</Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Remove a pour that should never have been recorded (wrong farmer, duplicate
 * entry). The server soft-reverses it, so it drops out of collection and
 * billing while staying visible as an audit trail. Closed shifts are rejected.
 */
function DeletePourButton({ pour, label }: { pour: MpPour; label: string }) {
  const remove = useReversePour();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const del = () => {
    remove.mutate(pour.id, {
      onSuccess: () => { setOpen(false); toast('Entry removed', 'success'); },
      onError: (e) => toast(e instanceof Error ? e.message : 'Could not remove the entry', 'error'),
    });
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}
        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        aria-label="Delete entry">
        <Trash2 size={14} />
      </Button>
      <ConfirmationDialog
        open={open} onClose={() => setOpen(false)} onConfirm={del}
        title="Remove this milk entry?"
        description={`${label} — ${pour.qtyLitres} L will be removed from collection and billing. The entry stays in the audit trail.`}
        confirmLabel="Remove" loading={remove.isPending}
      />
    </>
  );
}

function PourEditRow({ pour, farmer }: { pour: MpPour; farmer?: string }) {
  const correct = useCorrectPour();
  const { toast } = useToast();
  // A lactometer pour prices on CLR; an analyzer pour on FAT/SNF. Keep the row
  // in whichever mode the original was captured — a correction fixes readings,
  // it doesn't switch how a node measures.
  const isClr = pour.clr != null;
  const [f, setF] = useState({
    qty: pour.qtyLitres, fat: pour.fat ?? '', snf: pour.snf ?? '',
    clr: pour.clr ?? '', water: pour.water == null ? '' : String(pour.water),
  });
  const num = (s: string) => (s === '' ? null : Number(s));
  const dirty = f.qty !== pour.qtyLitres || (f.fat || '') !== (pour.fat ?? '')
    || (f.snf || '') !== (pour.snf ?? '') || (f.clr || '') !== (pour.clr ?? '')
    || f.water !== (pour.water == null ? '' : String(pour.water));

  const valid = Number(f.qty) > 0 && (isClr ? f.clr !== '' : (f.fat !== '' && f.snf !== ''));

  const save = () => {
    correct.mutate(
      { id: pour.id, data: {
        qtyLitres: Number(f.qty),
        ...(isClr ? { clr: num(f.clr) } : { fat: num(f.fat), snf: num(f.snf) }),
        water: num(f.water),
      } },
      {
        onSuccess: () => toast('Pour corrected', 'success'),
        onError: (e) => toast(e instanceof Error ? e.message : 'Could not correct the pour', 'error'),
      },
    );
  };

  const cell = (v: string, on: (s: string) => void, disabled = false) => (
    <Input type="number" value={v} disabled={disabled}
      onChange={(e) => on(e.target.value)} className="w-20 text-right" />
  );

  return (
    <TableRow>
      {farmer !== undefined && <TableCell className="text-xs">{farmer}</TableCell>}
      <TableCell><Badge>{pour.shift.toUpperCase()}</Badge></TableCell>
      <TableCell className="text-xs text-zinc-500">{pour.milkType}</TableCell>
      <TableCell align="right">{cell(f.qty, (s) => setF({ ...f, qty: s }))}</TableCell>
      <TableCell align="right">{cell(f.fat, (s) => setF({ ...f, fat: s }), isClr)}</TableCell>
      <TableCell align="right">{cell(f.snf, (s) => setF({ ...f, snf: s }), isClr)}</TableCell>
      <TableCell align="right">{cell(f.clr, (s) => setF({ ...f, clr: s }), !isClr)}</TableCell>
      <TableCell align="right">{cell(f.water, (s) => setF({ ...f, water: s }))}</TableCell>
      <TableCell align="right" numeric>{pour.ratePerLitre}</TableCell>
      <TableCell align="right" numeric>{formatINR(Number(pour.lineAmount))}</TableCell>
      <TableCell align="right">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" onClick={save} loading={correct.isPending} disabled={!dirty || !valid}>Save</Button>
          <DeletePourButton pour={pour}
            label={`${farmer ? `${farmer} · ` : ''}${pour.shift.toUpperCase()} ${pour.milkType}`} />
        </div>
      </TableCell>
    </TableRow>
  );
}
