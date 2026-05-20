import { useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { Card, CardContent, Button, Input, Select, Combobox, useToast } from '@/components/ui';
import { useCreateUser, useEligibleEmployees } from '@/hooks/queries/use-settings';
import { ROLE_OPTIONS } from './roles';
import type { UserRole } from '@runq/types';

function errMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'message' in err
    ? String((err as { message: unknown }).message)
    : fallback;
}

// Section 1 of the Users page — turn an existing HR employee into a login
// account. The email is taken straight from the employee record, so the
// account links to that employee with no chance of a typo.
export function AddEmployeeSection() {
  const [open, setOpen] = useState(false);
  const create = useCreateUser();
  const { data: eligibleData, isLoading: loadingEmployees } = useEligibleEmployees();
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');

  const employees = eligibleData?.data ?? [];
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.designation ? `${e.name} — ${e.designation}` : e.name,
  }));

  function reset() {
    setEmployeeId('');
    setName('');
    setEmail('');
    setPassword('');
    setRole('viewer');
  }

  function handleEmployeeChange(value: string) {
    setEmployeeId(value);
    const emp = employees.find((e) => e.id === value);
    setName(emp?.name ?? '');
    setEmail(emp?.email ?? '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ name, email, password, role });
      toast(`${name} added as a user`, 'success');
      reset();
      setOpen(false);
    } catch (err: unknown) {
      toast(errMessage(err, 'Failed to add user'), 'error');
    }
  }

  return (
    <Card className="mb-4">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Add Employee as User
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Give an existing HR employee a login. You set their password — they can sign in
              right away.
            </p>
          </div>
          {!open && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={14} />
              Add
            </Button>
          )}
        </div>

        {open && (
          <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Combobox
                label="Employee"
                value={employeeId}
                onChange={handleEmployeeChange}
                options={employeeOptions}
                placeholder={
                  loadingEmployees
                    ? 'Loading employees…'
                    : employeeOptions.length
                      ? 'Search and select an employee…'
                      : 'No employees without an account yet'
                }
                required
              />
            </div>
            <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} disabled />
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Min. 8 characters"
            />
            <Select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              options={ROLE_OPTIONS}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:col-span-2">
              <Button
                type="submit"
                loading={create.isPending}
                size="sm"
                disabled={!employeeId || !password}
              >
                <UserPlus size={14} />
                Add User
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
