import React, { useState } from 'react';
import { Plus, Award } from 'lucide-react';
import {
  Card, CardContent, PageHeader, Button, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import { useRewards, type Reward, type RewardStatus } from '@/hooks/queries/use-rewards';
import {
  RewardFormModal, RewardDetailModal, RejectModal, PayModal,
} from './_rewards-modals';

type BadgeVariant = 'default' | 'info' | 'success' | 'danger' | 'outline' | 'primary' | 'warning' | 'cyan';

const STATUS_BADGE: Record<RewardStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  submitted: { variant: 'info', label: 'Submitted' },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'danger', label: 'Rejected' },
  posted: { variant: 'cyan', label: 'Posted' },
  paid: { variant: 'primary', label: 'Paid' },
};

function amountCell(r: Reward) {
  if (r.kind === 'recognition') return '—';
  if (r.kind === 'points') return `${Number(r.amount)} pts`;
  // monetary with pointsUsed = redemption
  if (r.pointsUsed != null) return `↺ ${r.pointsUsed} pts → ${formatINR(Number(r.amount))}`;
  if (Number(r.amount) === 0) return '—';
  return formatINR(Number(r.amount));
}

export function RewardsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editReward, setEditReward] = useState<Reward | null>(null);
  const [rejectReward, setRejectReward] = useState<Reward | null>(null);
  const [payReward, setPayReward] = useState<Reward | null>(null);

  const { data, isLoading } = useRewards(statusFilter ? { status: statusFilter as RewardStatus } : undefined);
  const rewards = data?.data ?? [];

  const q = search.trim().toLowerCase();
  const filtered = rewards.filter((r) => {
    if (q && !r.rewardNumber.toLowerCase().includes(q) && !r.employeeName.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
    return true;
  });

  const selectedReward = selectedId ? rewards.find((r) => r.id === selectedId) ?? null : null;

  function handleDetailClose() {
    setSelectedId(null);
  }

  function handleEdit(r: Reward) {
    setSelectedId(null);
    setEditReward(r);
  }

  function handleReject(r: Reward) {
    setSelectedId(null);
    setRejectReward(r);
  }

  function handlePay(r: Reward) {
    setSelectedId(null);
    setPayReward(r);
  }

  return (
    <div>
      <PageHeader
        fullWidth
        title="Rewards & Spot Bonuses"
        breadcrumbs={[{ label: 'Rewards' }]}
        description="Initiate, approve, and pay out employee rewards and spot bonuses."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Initiate reward</Button>
        }
      />

      {showCreate && <RewardFormModal onClose={() => setShowCreate(false)} />}
      {editReward && <RewardFormModal existing={editReward} onClose={() => setEditReward(null)} />}
      {selectedReward && (
        <RewardDetailModal
          reward={selectedReward}
          onClose={handleDetailClose}
          onEdit={handleEdit}
          onReject={handleReject}
          onPay={handlePay}
        />
      )}
      {rejectReward && <RejectModal reward={rejectReward} onClose={() => setRejectReward(null)} />}
      {payReward && <PayModal reward={payReward} onClose={() => setPayReward(null)} />}

      {rewards.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by #, employee, or title…"
          count={filtered.length}
          noun="reward"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'draft', label: 'Draft' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'posted', label: 'Posted' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
        </ListToolbar>
      )}

      {/* Mobile card view */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : rewards.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No rewards yet.</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No rewards match your search.</p>
        ) : (
          filtered.map((r) => {
            const si = STATUS_BADGE[r.status];
            return (
              <div
                key={r.id}
                className="cursor-pointer rounded-lg border bg-white p-3 active:bg-zinc-50 dark:bg-zinc-900 dark:active:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                onClick={() => setSelectedId(r.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.title}</p>
                    <p className="font-mono text-xs text-zinc-500">{r.rewardNumber} · {r.employeeName}</p>
                  </div>
                  <Badge variant={si.variant}>{si.label}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{r.awardDate} · {r.typeName}</span>
                  <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{amountCell(r)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Reward#</Th>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>Title</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Award date</Th>
                  <Th>Initiated by</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={8} />
                ) : rewards.length === 0 ? (
                  <TableEmpty colSpan={8} message="No rewards yet." />
                ) : filtered.length === 0 ? (
                  <TableEmpty colSpan={8} message="No rewards match your search." />
                ) : (
                  filtered.map((r) => {
                    const si = STATUS_BADGE[r.status];
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedId(r.id)}>
                        <TableCell className="font-mono text-xs">{r.rewardNumber}</TableCell>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell className="text-zinc-500">{r.typeName}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.title}</TableCell>
                        <TableCell align="right" numeric>{amountCell(r)}</TableCell>
                        <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                        <TableCell className="text-zinc-500">{r.awardDate}</TableCell>
                        <TableCell className="text-zinc-500">{r.initiatorName}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
