import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, Copy, CheckCircle, XCircle, Factory, Trash2 } from 'lucide-react';
import {
  PageHeader, Button, Card, CardHeader, CardContent, CardSkeleton,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  ConfirmationDialog, useToast,
} from '@/components/ui';
import { Link } from '@tanstack/react-router';
import {
  useBom, useActivateBom, useDeactivateBom, useCloneBom, useDeleteBom,
} from '@/hooks/queries/use-boms';
import { useWorkOrders } from '@/hooks/queries/use-work-orders';

const ACCENT = '#E11D48';

const WO_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', in_progress: 'In Progress', completed: 'Completed',
  closed: 'Closed', cancelled: 'Cancelled',
};
const WO_STATUS_BG: Record<string, string> = {
  draft: 'var(--surface-2)',
  in_progress: 'rgba(234, 88, 12, 0.10)',
  completed: 'rgba(22, 163, 74, 0.10)',
  closed: 'rgba(225, 29, 72, 0.10)',
  cancelled: 'rgba(220, 38, 38, 0.08)',
};
const WO_STATUS_FG: Record<string, string> = {
  draft: 'var(--text-2)',
  in_progress: '#ea580c',
  completed: '#16a34a',
  closed: '#e11d48',
  cancelled: '#dc2626',
};

interface Props { bomId: string }

export function BomDetailPage({ bomId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = useBom(bomId);
  const { data: wosData } = useWorkOrders({ bomId, limit: 5 });
  const activateM = useActivateBom();
  const deactivateM = useDeactivateBom();
  const cloneM = useCloneBom();
  const deleteM = useDeleteBom();

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const bom = data?.data;
  const recentWOs = wosData?.data ?? [];

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (isError || !bom) {
    return <p className="text-sm text-red-500">BOM not found.</p>;
  }

  function handleClone() {
    cloneM.mutate(bomId, {
      onSuccess: (res) => {
        const id = (res as { data?: { id?: string } })?.data?.id;
        toast('BOM cloned', 'success');
        if (id) navigate({ to: '/manufacturing/boms/$bomId', params: { bomId: id } });
      },
      onError: (e) => toast((e as Error).message || 'Clone failed', 'error'),
    });
  }

  function handleActivate() {
    activateM.mutate(bomId, {
      onSuccess: () => { toast('BOM activated', 'success'); setShowActivate(false); },
      onError: (e) => toast((e as Error).message || 'Failed', 'error'),
    });
  }

  function handleDeactivate() {
    deactivateM.mutate(bomId, {
      onSuccess: () => { toast('BOM deactivated', 'success'); setShowDeactivate(false); },
      onError: (e) => toast((e as Error).message || 'Failed', 'error'),
    });
  }

  function handleDelete() {
    deleteM.mutate(bomId, {
      onSuccess: () => {
        toast('BOM deleted', 'success');
        setShowDelete(false);
        navigate({ to: '/manufacturing/boms' });
      },
      // 409 from the API carries the "used by N WOs" guidance — surface it.
      onError: (e) => toast((e as Error).message || 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'BOMs', href: '/manufacturing/boms' },
          { label: bom.bomCode },
        ]}
        title={bom.bomCode}
        titleBadge={
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={
              bom.isActive
                ? { background: 'rgba(225, 29, 72, 0.12)', color: ACCENT }
                : { background: 'var(--surface-2)', color: 'var(--text-2)' }
            }
          >
            {bom.isActive ? 'Active' : 'Inactive'}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => navigate({ to: '/manufacturing/boms/$bomId/edit', params: { bomId } })}
            >
              <Pencil size={13} className="mr-1" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={handleClone} loading={cloneM.isPending}>
              <Copy size={13} className="mr-1" /> Clone
            </Button>
            {bom.isActive ? (
              <Button variant="outline" size="sm" onClick={() => setShowDeactivate(true)}>
                <XCircle size={13} className="mr-1" /> Deactivate
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowActivate(true)}>
                <CheckCircle size={13} className="mr-1" /> Activate
              </Button>
            )}
            <Button
              variant="outline" size="sm"
              onClick={() => setShowDelete(true)}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
            >
              <Trash2 size={13} className="mr-1" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Header card */}
          <Card>
            <CardHeader title="BOM details" />
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <dt style={{ color: 'var(--text-3)' }}>Name</dt>
                <dd className="font-medium">{bom.name}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Output item</dt>
                <dd className="font-medium">{bom.outputItemName}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Output qty</dt>
                <dd className="font-mono">{bom.outputQty} {bom.outputUom}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Version</dt>
                <dd>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono dark:bg-zinc-800">
                    v{bom.version}
                  </span>
                </dd>
                {bom.allowAutoRepack && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Made on demand</dt>
                    <dd>
                      Yes — a short delivery note runs this recipe at dispatch,
                      so {bom.outputItemName} holds no stock of its own.
                    </dd>
                  </>
                )}
                {bom.effectiveFrom && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Effective from</dt>
                    <dd>{bom.effectiveFrom}</dd>
                  </>
                )}
                {bom.notes && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Notes</dt>
                    <dd className="whitespace-pre-line">{bom.notes}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Input lines table */}
          <Card>
            <CardHeader title={`Input lines (${bom.lines.length})`} />
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>#</Th>
                    <Th>Input item</Th>
                    <Th align="right">Qty / output</Th>
                    <Th>UOM</Th>
                    <Th align="right">Scrap %</Th>
                    <Th>Also accepts</Th>
                    <Th>Optional</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {bom.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell numeric style={{ color: 'var(--text-3)' }}>{l.lineNo}</TableCell>
                      <TableCell>{l.inputItemName}</TableCell>
                      <TableCell align="right" numeric>{l.qtyPerOutput}</TableCell>
                      <TableCell>{l.inputUom}</TableCell>
                      <TableCell align="right" numeric>{l.scrapPct}%</TableCell>
                      <TableCell>
                        {l.substitutes.length > 0 ? (
                          <span
                            className="text-[11px]"
                            style={{ color: 'var(--text-2)' }}
                            title="This line's qty may be drawn from any of these instead"
                          >
                            {l.substitutes.map((sub) => sub.itemName).join(', ')}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {l.isOptional ? (
                          <span className="text-[11px] text-amber-600">Optional</span>
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Linked WOs sidebar */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Linked work orders"
              action={
                wosData && (
                  <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {wosData.meta?.total ?? 0} total
                  </span>
                )
              }
            />
            <CardContent className="p-0">
              {recentWOs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                  <Factory size={28} style={{ color: 'var(--text-3)' }} />
                  <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                    No work orders yet for this BOM.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate({ to: '/manufacturing/wos/new' })}
                  >
                    Create WO
                  </Button>
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {recentWOs.map((wo) => (
                    <li key={wo.id}>
                      <Link
                        to="/manufacturing/wos/$woId"
                        params={{ woId: wo.id }}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      >
                        <div>
                          <p className="text-[12.5px] font-mono font-semibold">{wo.woNumber}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                            {wo.scheduledFor} · {wo.plannedQty} {wo.outputItemName}
                          </p>
                        </div>
                        <span
                          className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: WO_STATUS_BG[wo.status] ?? 'var(--surface-2)',
                            color: WO_STATUS_FG[wo.status] ?? 'var(--text-2)',
                          }}
                        >
                          {WO_STATUS_LABEL[wo.status] ?? wo.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(wosData?.meta?.total ?? 0) > 5 && (
                <div className="border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                  <Link
                    to="/manufacturing/wos"
                    className="text-[12px] font-medium hover:underline"
                    style={{ color: ACCENT }}
                  >
                    View all {wosData?.meta?.total} work orders →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationDialog
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={handleDeactivate}
        title="Deactivate this BOM?"
        description="This BOM will be marked inactive. In-progress work orders using it will not be affected, but no new work orders can be created against it."
        confirmLabel="Deactivate"
        loading={deactivateM.isPending}
      />

      <ConfirmationDialog
        open={showActivate}
        onClose={() => setShowActivate(false)}
        onConfirm={handleActivate}
        title="Activate this BOM?"
        description="This will become the active BOM for its output item. Any currently active BOM for the same item will be deactivated."
        confirmLabel="Activate"
        loading={activateM.isPending}
      />

      <ConfirmationDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete this BOM permanently?"
        description="The BOM and its input lines will be removed. If any work orders reference this BOM, deletion is blocked — deactivate it instead to preserve audit history."
        confirmLabel="Delete"
        loading={deleteM.isPending}
      />
    </div>
  );
}
