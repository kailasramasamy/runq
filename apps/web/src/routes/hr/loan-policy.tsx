import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  PageHeader, Button, Input, useToast, Card,
} from '@/components/ui';
import { useLoanPolicy, useUpdateLoanPolicy, type LoanPolicy } from '@/hooks/queries/use-hr-phase-next';
import { useIsReadOnly } from '@/providers/auth-provider';

const KIND_OPTIONS = [
  { value: 'advance', label: 'Salary advance' },
  { value: 'personal', label: 'Personal loan' },
  { value: 'festival', label: 'Festival loan' },
  { value: 'education', label: 'Education loan' },
  { value: 'other', label: 'Other' },
];

export function LoanPolicyPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useLoanPolicy();
  const update = useUpdateLoanPolicy();
  const [draft, setDraft] = useState<LoanPolicy | null>(null);

  useEffect(() => {
    if (data?.data) setDraft(data.data);
  }, [data]);

  function patch(p: Partial<LoanPolicy>) {
    if (!draft) return;
    setDraft({ ...draft, ...p });
  }

  function toggleKind(k: string) {
    if (!draft) return;
    const current = draft.allowedKinds ?? KIND_OPTIONS.map((o) => o.value);
    const next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
    setDraft({ ...draft, allowedKinds: next.length === KIND_OPTIONS.length ? null : next });
  }

  function save() {
    if (!draft) return;
    update.mutate(draft, {
      onSuccess: () => toast('Policy saved', 'success'),
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  const effectiveAllowed = draft?.allowedKinds ?? KIND_OPTIONS.map((o) => o.value);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Loan policy' }]}
        title="Employee loan policy"
        description="Rules for the employee-initiated loan request flow in the mobile app."
      />

      {isLoading || !draft ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <div className="p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.employeeRequestsEnabled}
                  onChange={(e) => patch({ employeeRequestsEnabled: e.target.checked })}
                  className="mt-1"
                  disabled={readOnly}
                />
                <div>
                  <div className="font-medium">Allow employees to request loans from the app</div>
                  <div className="text-xs text-slate-500">When off, only HR can create loans (web only). Employees won't see the request button.</div>
                </div>
              </label>
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-4">
              <div className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Eligibility rules</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Minimum tenure (days)</label>
                  <Input
                    type="number" min={0} max={3650}
                    value={draft.minTenureDays}
                    onChange={(e) => patch({ minTenureDays: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                  <div className="text-xs text-slate-500 mt-1">180 = 6 months</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Max amount (% of monthly CTC)</label>
                  <Input
                    type="number" min={1} max={1000}
                    value={draft.maxPctOfMonthlyCtc}
                    onChange={(e) => patch({ maxPctOfMonthlyCtc: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                  <div className="text-xs text-slate-500 mt-1">e.g. 50 = half a month's CTC</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Max active or pending loans</label>
                  <Input
                    type="number" min={1} max={10}
                    value={draft.maxActiveLoans}
                    onChange={(e) => patch({ maxActiveLoans: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 mt-6 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.managerApprovalRequired}
                      onChange={(e) => patch({ managerApprovalRequired: e.target.checked })}
                      disabled={readOnly}
                    />
                    <span className="text-sm">Manager approval required before HR</span>
                  </label>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Allowed loan types</div>
                <div className="flex flex-wrap gap-2">
                  {KIND_OPTIONS.map((k) => {
                    const on = effectiveAllowed.includes(k.value);
                    return (
                      <button
                        key={k.value}
                        type="button"
                        onClick={() => toggleKind(k.value)}
                        disabled={readOnly}
                        className={`px-3 py-1.5 text-sm rounded-full border transition ${
                          on
                            ? 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500'
                            : 'bg-transparent text-slate-600 border-slate-300 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {k.label}
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-2">Deselected types won't appear in the employee request form.</div>
              </div>
            </div>
          </Card>

          {!readOnly && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save policy'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
