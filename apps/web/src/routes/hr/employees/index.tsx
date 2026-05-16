import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Download, Users, Search, ChevronRight, Trash2 } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  PageHeader, Button, Badge, Input, Select, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState,
} from '@/components/ar/primitives';
import { EmployeeAvatar } from '@/components/hr/employee-avatar';
import { ConfirmationDialog } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';
import {
  useEmployees, useDeleteEmployee, useDepartments, useDesignations,
  type EmployeeStatus, type EmploymentType,
} from '@/hooks/queries/use-hr';

const LIMIT = 25;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'terminated', label: 'Terminated' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'permanent', label: 'Permanent' },
  { value: 'contract', label: 'Contract' },
  { value: 'wage', label: 'Wage' },
  { value: 'intern', label: 'Intern' },
  { value: 'consultant', label: 'Consultant' },
];

const STATUS_BADGE: Record<EmployeeStatus, { variant: any; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'outline', label: 'Inactive' },
  on_leave: { variant: 'warning', label: 'On leave' },
  terminated: { variant: 'danger', label: 'Terminated' },
};

export function EmployeeListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | EmployeeStatus>('');
  const [type, setType] = useState<'' | EmploymentType>('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: deptData } = useDepartments();
  const { data: desigData } = useDesignations();
  const { data, isLoading } = useEmployees({
    search: search || undefined,
    status: (status || undefined) as EmployeeStatus | undefined,
    employmentType: (type || undefined) as EmploymentType | undefined,
    departmentId: departmentId || undefined,
    page,
    limit: LIMIT,
  });
  const deleteMutation = useDeleteEmployee();

  const employees = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;
  const activeCount = employees.filter((e) => e.status === 'active').length;
  const onLeaveCount = employees.filter((e) => e.status === 'on_leave').length;

  function handleView(id: string) {
    navigate({ to: '/hr/employees/$employeeId', params: { employeeId: id } });
  }
  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  }

  const departments = deptData?.data ?? [];
  const designations = desigData?.data ?? [];
  const deptOptions = [{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))];
  const deptById = new Map(departments.map((d) => [d.id, d.name]));
  const desigById = new Map(designations.map((d) => [d.id, d.name]));

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Employees' }]}
        title="Employees"
        description="Manage your workforce — IDs, statutory info, bank, department."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'employees.csv',
                  ['Code', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Joining', 'Status'],
                  employees.map((e) => [
                    e.employeeCode,
                    `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`,
                    e.email ?? '', e.phone ?? '',
                    e.departmentName ?? (e.departmentId ? deptById.get(e.departmentId) ?? '' : ''),
                    e.designationName ?? (e.designationId ? desigById.get(e.designationId) ?? '' : ''),
                    e.joiningDate,
                    STATUS_BADGE[e.status]?.label ?? e.status,
                  ]),
                )
              }
            >
              Export CSV
            </Button>
            {!readOnly && (
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/hr/employees/new' })}>
                New employee
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total employees" value={total} sub={`${activeCount} active in view`} />
        <StatTile label="On leave" value={onLeaveCount} sub="In current view" />
        <StatTile label="Departments" value={departments.length} sub="Configured" />
        <StatTile label="Employees shown" value={employees.length} sub={`Page ${page} of ${totalPages}`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search by name, code, email, phone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select options={STATUS_OPTIONS} value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }} />
        <Select options={TYPE_OPTIONS} value={type} onChange={(e) => { setType(e.target.value as any); setPage(1); }} />
        <Select options={deptOptions} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }} />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {total} employee{total === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee</Th>
            <Th>Department</Th>
            <Th>Designation</Th>
            <Th>Contact</Th>
            <Th>Joining</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[140px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : employees.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <EmptyState
                  icon={<Users size={18} />}
                  title={search ? 'No employees match' : 'No employees yet'}
                  description={search ? 'Try a different search term.' : 'Add your first employee to get started.'}
                  action={!search && !readOnly && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/hr/employees/new' })}>
                      New employee
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : employees.map((e) => {
            const name = `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`;
            const statusBadge = STATUS_BADGE[e.status];
            return (
              <TableRow key={e.id} onClick={() => handleView(e.id)}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <EmployeeAvatar employeeId={e.id} name={name} photoKey={e.photoUrl ?? null} size={28} />
                    <div className="min-w-0">
                      <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{name}</div>
                      <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{e.employeeCode}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>
                  {e.departmentName ?? (e.departmentId ? deptById.get(e.departmentId) : null) ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                </TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>
                  {e.designationName ?? (e.designationId ? desigById.get(e.designationId) : null) ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                </TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>
                  {e.email && <div className="text-[12.5px]">{e.email}</div>}
                  {e.phone && <div className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{e.phone}</div>}
                  {!e.email && !e.phone && <span style={{ color: 'var(--text-3)' }}>—</span>}
                </TableCell>
                <TableCell style={{ color: 'var(--text-2)' }} className="num">{e.joiningDate}</TableCell>
                <TableCell>
                  <Badge variant="default">{e.employmentType.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadge?.variant ?? 'default'}>{statusBadge?.label ?? e.status}</Badge>
                </TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-0.5" onClick={(ev) => ev.stopPropagation()}>
                    {!readOnly && (
                      <button
                        className="rounded p-1 hover:bg-[var(--surface-2)]"
                        style={{ color: 'var(--text-3)' }}
                        onClick={() => setDeleteId(e.id)}
                        aria-label="Delete employee"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </div>
      )}

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete employee?"
        description="The employee will be soft-deleted and removed from active lists."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
