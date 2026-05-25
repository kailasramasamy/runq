import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle, ExternalLink } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Badge,
  Button,
  EmptyState,
  TableSkeleton,
  useToast,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Textarea,
} from '@/components/ui';
import { usePendingApprovals, useApprovalDecision } from '@/hooks/queries/use-workflows';
import type { ApprovalInstance } from '@runq/types';

const ENTITY_LABELS: Record<string, string> = {
  purchase_invoice: 'Bill',
  payment: 'Payment',
  invoice: 'Invoice',
  receipt: 'Receipt',
  journal_entry: 'Journal Entry',
  purchase_requisition: 'Purchase Requisition',
};

function getEntityLink(entityType: string, entityId: string): string | null {
  const routes: Record<string, string> = {
    purchase_invoice: `/ap/bills/${entityId}`,
    payment: `/ap/payments/${entityId}`,
    invoice: `/ar/invoices/${entityId}`,
    receipt: `/ar/receipts/${entityId}`,
    journal_entry: `/finance/gl/journal-entries/${entityId}`,
    purchase_requisition: `/ap/queue/${entityId}`,
  };
  return routes[entityType] ?? null;
}

function getActiveStep(instance: ApprovalInstance) {
  return instance.steps.find((s) => s.status === 'pending') ?? null;
}

interface RejectDialogState {
  instanceId: string;
  stepId: string;
  comment: string;
}

export function ApprovalsPage() {
  const { data, isLoading } = usePendingApprovals();
  const decide = useApprovalDecision();
  const { toast } = useToast();
  const [rejectState, setRejectState] = useState<RejectDialogState | null>(null);

  const items = data?.data ?? [];

  async function handleApprove(instanceId: string, stepId: string) {
    try {
      await decide.mutateAsync({ stepId, instanceId, decision: 'approved' });
      toast('Approved successfully', 'success');
    } catch {
      toast('Failed to approve', 'error');
    }
  }

  async function handleReject() {
    if (!rejectState) return;
    try {
      await decide.mutateAsync({
        stepId: rejectState.stepId,
        instanceId: rejectState.instanceId,
        decision: 'rejected',
        comment: rejectState.comment || undefined,
      });
      toast('Rejected', 'success');
      setRejectState(null);
    } catch {
      toast('Failed to reject', 'error');
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Pending Approvals"
        breadcrumbs={[{ label: 'Workflows' }, { label: 'Pending Approvals' }]}
        description="Review and action items awaiting your approval."
      />

      {rejectState && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <p className="mb-2 text-sm font-medium text-red-800 dark:text-red-200">Add a rejection comment (optional)</p>
          <Textarea
            value={rejectState.comment}
            onChange={(e) => setRejectState((s) => s && { ...s, comment: e.target.value })}
            placeholder="Reason for rejection..."
            rows={2}
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" loading={decide.isPending} onClick={handleReject}>
              Confirm Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejectState(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <>
          {/* Mobile skeleton */}
          <div className="space-y-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))}
          </div>
          {/* Desktop skeleton */}
          <table className="hidden w-full md:table"><tbody><TableSkeleton rows={4} cols={5} /></tbody></table>
        </>
      ) : items.length === 0 ? (
        <EmptyState icon={CheckCircle} title="No pending approvals" description="All caught up! Approvals will appear here when submitted." />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {items.map((instance) => {
              const step = getActiveStep(instance);
              const link = getEntityLink(instance.entityType, instance.entityId);
              const shortId = instance.entityId.slice(0, 8);
              return (
                <div key={instance.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="info">
                          {ENTITY_LABELS[instance.entityType] ?? instance.entityType}
                        </Badge>
                        {step && (
                          <Badge variant="warning">Step {step.stepOrder} — {step.assignedRole}</Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                        <span className="font-mono">
                          {link ? (
                            <Link to={link} className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                              {shortId}
                              <ExternalLink size={10} />
                            </Link>
                          ) : (
                            shortId
                          )}
                        </span>
                        <span>{new Date(instance.requestedAt).toLocaleDateString('en-IN')}</span>
                      </div>
                    </div>
                    {step && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={decide.isPending}
                          onClick={() => handleApprove(instance.id, step.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectState({ instanceId: instance.id, stepId: step.id, comment: '' })}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Type</Th>
                    <Th>Reference</Th>
                    <Th>Current Step</Th>
                    <Th>Requested</Th>
                    <Th>Actions</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {items.map((instance) => {
                    const step = getActiveStep(instance);
                    const link = getEntityLink(instance.entityType, instance.entityId);
                    const shortId = instance.entityId.slice(0, 8);
                    return (
                      <TableRow key={instance.id}>
                        <TableCell>
                          <Badge variant="info">
                            {ENTITY_LABELS[instance.entityType] ?? instance.entityType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {link ? (
                            <Link
                              to={link}
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {shortId}
                              <ExternalLink size={12} />
                            </Link>
                          ) : (
                            shortId
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                          {step ? `Step ${step.stepOrder} — ${step.assignedRole}` : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-500">
                          {new Date(instance.requestedAt).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell>
                          {step ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="primary"
                                loading={decide.isPending}
                                onClick={() => handleApprove(instance.id, step.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setRejectState({ instanceId: instance.id, stepId: step.id, comment: '' })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-zinc-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
