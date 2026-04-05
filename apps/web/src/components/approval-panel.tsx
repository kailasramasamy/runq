import { useState } from 'react';
import { Card, CardHeader, CardContent, Badge, Button, Textarea, useToast } from '@/components/ui';
import {
  useApprovalInstance,
  useSubmitForApproval,
  useApprovalDecision,
} from '@/hooks/queries/use-workflows';
import { useAuth } from '@/providers/auth-provider';

interface ApprovalPanelProps {
  entityType: string;
  entityId: string;
  amount: number;
}

const STEP_STATUS_VARIANT = {
  pending: 'warning' as const,
  approved: 'success' as const,
  rejected: 'error' as const,
  skipped: 'default' as const,
};

export function ApprovalPanel({ entityType, entityId, amount }: ApprovalPanelProps) {
  const { user } = useAuth();
  const { data, isLoading, error } = useApprovalInstance(entityType, entityId);
  const submit = useSubmitForApproval();
  const decide = useApprovalDecision();
  const { toast } = useToast();
  const [rejectComment, setRejectComment] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null); // stepId

  const instance = data?.data ?? null;
  const notFound = !isLoading && (error || !instance);

  async function handleSubmit() {
    try {
      await submit.mutateAsync({ entityType, entityId, amount });
      toast('Submitted for approval', 'success');
    } catch {
      toast('Failed to submit for approval', 'error');
    }
  }

  async function handleDecide(stepId: string, instanceId: string, decision: 'approved' | 'rejected') {
    try {
      await decide.mutateAsync({
        stepId,
        instanceId,
        decision,
        comment: decision === 'rejected' ? rejectComment || undefined : undefined,
      });
      toast(decision === 'approved' ? 'Approved' : 'Rejected', 'success');
      setShowRejectInput(null);
      setRejectComment('');
    } catch {
      toast('Failed to record decision', 'error');
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>Approval Status</CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>Approval Status</CardHeader>
      <CardContent>
        {notFound && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">No approval required yet.</p>
            <Button size="sm" loading={submit.isPending} onClick={handleSubmit}>
              Submit for Approval
            </Button>
          </div>
        )}

        {instance?.status === 'approved' && (
          <div className="flex items-center gap-2">
            <Badge variant="success">Approved</Badge>
            <span className="text-sm text-zinc-500">This item has been fully approved.</span>
          </div>
        )}

        {instance?.status === 'rejected' && (
          <div>
            <Badge variant="error">Rejected</Badge>
            {instance.steps.find((s) => s.status === 'rejected' && s.comment) && (
              <p className="mt-1 text-sm text-zinc-500">
                {instance.steps.find((s) => s.status === 'rejected')?.comment}
              </p>
            )}
          </div>
        )}

        {instance?.status === 'pending' && (
          <div className="space-y-2">
            {instance.steps.map((step) => {
              const isActionable = step.status === 'pending' && step.assignedRole === user?.role;
              return (
                <div
                  key={step.id}
                  className="rounded border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {step.stepOrder}
                      </span>
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {step.assignedRole}
                      </span>
                      <Badge variant={STEP_STATUS_VARIANT[step.status] ?? 'default'}>
                        {step.status}
                      </Badge>
                    </div>
                    {isActionable && showRejectInput !== step.id && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={decide.isPending}
                          onClick={() => handleDecide(step.id, instance.id, 'approved')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowRejectInput(step.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {isActionable && showRejectInput === step.id && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        placeholder="Rejection reason (optional)..."
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          loading={decide.isPending}
                          onClick={() => handleDecide(step.id, instance.id, 'rejected')}
                        >
                          Confirm Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowRejectInput(null);
                            setRejectComment('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {step.decidedBy && (
                    <p className="mt-1 text-xs text-zinc-400">
                      By {step.decidedBy}
                      {step.decidedAt && ` on ${new Date(step.decidedAt).toLocaleDateString('en-IN')}`}
                      {step.comment && ` — "${step.comment}"`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
