import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PageHeader, Button, useToast } from '@/components/ui';
import type { ApiSuccess } from '@runq/types';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { useHrMe, useEmployee } from '@/hooks/queries/use-hr';
import { OverviewTab, SectionLabel, Field } from './hr/employees/_employee-tabs';
import { ResumeTab } from './hr/employees/_resume-tab';

const CARD = 'rounded-xl border p-4';
const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' } as const;

export function ProfilePage() {
  const { data: meData, isLoading: meLoading } = useHrMe();
  const employeeId = meData?.data?.employee?.id ?? null;
  const { data: empData } = useEmployee(employeeId);
  const employee = empData?.data ?? null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="My Profile" description="Your account, details and resume." />

      <div className="flex flex-col gap-5">
        <AccountCard />
        <ChangePasswordCard />

        {employee && (
          <section>
            <SectionLabel>My details</SectionLabel>
            <div className="mt-2">
              <OverviewTab employee={employee} />
            </div>
          </section>
        )}

        {employeeId && (
          <section>
            <SectionLabel>Resume</SectionLabel>
            <div className="mt-2">
              <ResumeTab employeeId={employeeId} selfService />
            </div>
          </section>
        )}

        {!employeeId && !meLoading && (
          <div
            className="rounded-lg border border-dashed p-4 text-[13px]"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}
          >
            No employee record is linked to your account. Your personal details
            and resume will appear here once HR sets up your employee profile.
          </div>
        )}
      </div>
    </div>
  );
}

function AccountCard() {
  const { user } = useAuth();
  return (
    <section className={CARD} style={cardStyle}>
      <SectionLabel>Account</SectionLabel>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Name" value={user?.name} />
        <Field label="Email" value={user?.email} />
        <Field label="Role" value={user?.role ? user.role.replace('_', ' ') : null} />
      </div>
    </section>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<ApiSuccess<{ success: boolean }>>('/auth/change-password', body),
    onSuccess: () => {
      toast('Password changed', 'success');
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (e: any) => toast(e?.message ?? 'Could not change password', 'error'),
  });

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 && next.length >= 8 && next === confirm && !mutation.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) mutation.mutate({ currentPassword: current, newPassword: next });
  }

  return (
    <section className={CARD} style={cardStyle}>
      <SectionLabel>Change password</SectionLabel>
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PwField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PwField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PwField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {(tooShort || mismatch) && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--neg)' }}>
            {tooShort
              ? 'New password must be at least 8 characters.'
              : 'New password and confirmation do not match.'}
          </p>
        )}
        <Button size="sm" disabled={!canSubmit} className="mt-3">
          {mutation.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </section>
  );
}

function PwField({
  label, value, onChange, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
      />
    </label>
  );
}
