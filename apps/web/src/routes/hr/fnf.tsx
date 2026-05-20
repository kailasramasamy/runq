import { useState } from 'react';
import { LogOut, Plus } from 'lucide-react';
import {
  PageHeader, Badge, Button, Input, Modal, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useFnfList, useCreateFnf, useApproveFnf, usePayFnf,
} from '@/hooks/queries/use-hr-phase-next';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'outline', approved: 'success', paid: 'info', cancelled: 'danger',
};
function fmt(n: string | number) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function FnfPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useFnfList();
  const create = useCreateFnf();
  const approve = useApproveFnf();
  const pay = usePayFnf();

  const [showAdd, setShowAdd] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [lwd, setLwd] = useState('');
  const [resignation, setResignation] = useState('');
  const [lastMonth, setLastMonth] = useState('');
  const [encash, setEncash] = useState('0');
  const [gratuity, setGratuity] = useState('0');
  const [bonus, setBonus] = useState('0');
  const [noticeRec, setNoticeRec] = useState('0');
  const [loanRec, setLoanRec] = useState('0');
  const [tds, setTds] = useState('0');

  const { data: empData } = useEmployees({ limit: 200 });
  const employees = empData?.data ?? [];
  const rows = data?.data ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      employeeId,
      resignationDate: resignation || undefined,
      lastWorkingDate: lwd,
      lastMonthSalary: Number(lastMonth || 0),
      leaveEncashment: Number(encash || 0),
      gratuity: Number(gratuity || 0),
      bonusPayable: Number(bonus || 0),
      noticeRecovery: Number(noticeRec || 0),
      loanRecovery: Number(loanRec || 0),
      tds: Number(tds || 0),
    }, {
      onSuccess: () => {
        setShowAdd(false);
        toast('FNF drafted', 'success');
      },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Full & final' }]}
        title="Full & final settlements"
        description="Exit settlements: leave encashment, gratuity, dues − recoveries."
        actions={!readOnly && (
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" />New FNF</Button>
        )}
      />
      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<LogOut className="h-10 w-10" />} title="No FNFs" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Employee</Th><Th>Last working</Th><Th>Gross</Th><Th>Deductions</Th>
              <Th>Net payable</Th><Th>Status</Th><Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">
                  {[f.firstName, f.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{f.employeeCode}</span>
                </TableCell>
                <TableCell>{f.lastWorkingDate}</TableCell>
                <TableCell>₹{fmt(f.grossEarnings)}</TableCell>
                <TableCell>₹{fmt(f.totalDeductions)}</TableCell>
                <TableCell className="font-semibold">₹{fmt(f.netPayable)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {!readOnly && f.status === 'draft' && (
                    <Button size="sm" onClick={() => approve.mutate(f.id, {
                      onSuccess: () => toast('FNF approved & employee marked terminated', 'success'),
                      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                    })}>Approve</Button>
                  )}
                  {!readOnly && f.status === 'approved' && (
                    <Button size="sm" variant="outline" onClick={() => pay.mutate(f.id, {
                      onSuccess: () => toast('Marked paid', 'success'),
                      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                    })}>Mark paid</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New FNF" size="lg">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Employee</label>
            <Combobox
              options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }))}
              value={employeeId} onChange={setEmployeeId} placeholder="Select employee" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Resignation date</label>
              <Input type="date" value={resignation} onChange={(e) => setResignation(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Last working date</label>
              <Input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} required />
            </div>
          </div>
          <fieldset className="border rounded p-3">
            <legend className="text-sm font-semibold px-1">Earnings</legend>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm">Last month salary</label>
                <Input type="number" value={lastMonth} onChange={(e) => setLastMonth(e.target.value)} /></div>
              <div><label className="text-sm">Leave encashment</label>
                <Input type="number" value={encash} onChange={(e) => setEncash(e.target.value)} /></div>
              <div><label className="text-sm">Gratuity</label>
                <Input type="number" value={gratuity} onChange={(e) => setGratuity(e.target.value)} /></div>
              <div><label className="text-sm">Bonus payable</label>
                <Input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} /></div>
            </div>
          </fieldset>
          <fieldset className="border rounded p-3">
            <legend className="text-sm font-semibold px-1">Deductions</legend>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-sm">Notice recovery</label>
                <Input type="number" value={noticeRec} onChange={(e) => setNoticeRec(e.target.value)} /></div>
              <div><label className="text-sm">Loan recovery</label>
                <Input type="number" value={loanRec} onChange={(e) => setLoanRec(e.target.value)} /></div>
              <div><label className="text-sm">TDS</label>
                <Input type="number" value={tds} onChange={(e) => setTds(e.target.value)} /></div>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !employeeId || !lwd}>
              {create.isPending ? 'Saving…' : 'Save draft'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
