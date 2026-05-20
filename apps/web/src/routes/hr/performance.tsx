import { Fragment, useEffect, useState } from 'react';
import { Target, Plus, Trash2, Sparkles, CheckCircle2, Search as SearchIcon } from 'lucide-react';
import {
  PageHeader, Badge, Button, Input, Textarea, Select, Modal, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import {
  usePerformanceCycles, useCreatePerformanceCycle, useUpdatePerformanceCycle, useDeletePerformanceCycle,
  usePerformanceGoals, useCreatePerformanceGoal, useUpdatePerformanceGoal, useDeletePerformanceGoal,
  useGeneratePerformanceGoals, useBulkPublishGoals,
  usePerformanceReviews, useCreatePerformanceReview, useSubmitManagerReview, useFinaliseReview,
} from '@/hooks/queries/use-hr-phase-next';
import { useDepartments, useDesignations, useEmployees } from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const CYCLE_VARIANT: Record<string, any> = {
  planned: 'outline', active: 'success', review: 'warning', closed: 'info',
};
const REVIEW_VARIANT: Record<string, any> = {
  pending: 'outline', self_submitted: 'info', manager_submitted: 'warning', finalised: 'success', acknowledged: 'success',
};

// Standard 1-5 rating anchors — shared yardstick for self + manager ratings.
const RATING_ANCHORS: { value: number; label: string }[] = [
  { value: 1, label: 'Below expectations' },
  { value: 2, label: 'Partially met' },
  { value: 3, label: 'Met expectations' },
  { value: 4, label: 'Exceeded expectations' },
  { value: 5, label: 'Outstanding' },
];

function RatingLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="font-semibold uppercase tracking-wide">Rating scale:</span>
      {RATING_ANCHORS.map((a) => (
        <span key={a.value}>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{a.value}</span> {a.label}
        </span>
      ))}
    </div>
  );
}

export function PerformancePage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [tab, setTab] = useState<'cycles' | 'goals' | 'reviews'>('cycles');
  const [focusedCycleId, setFocusedCycleId] = useState<string>('');
  const drillIn = (target: 'goals' | 'reviews', cycleId: string) => {
    setFocusedCycleId(cycleId);
    setTab(target);
  };
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Performance' }]}
        title="Performance"
        description="Cycles, goals (weighted), and review wrap-up."
        actions={
          <div className="flex gap-2">
            <Button variant={tab === 'cycles' ? 'primary' : 'outline'} onClick={() => setTab('cycles')}>Cycles</Button>
            <Button variant={tab === 'goals' ? 'primary' : 'outline'} onClick={() => setTab('goals')}>Goals</Button>
            <Button variant={tab === 'reviews' ? 'primary' : 'outline'} onClick={() => setTab('reviews')}>Reviews</Button>
          </div>
        }
      />
      {tab === 'cycles' && <CyclesTab readOnly={readOnly} toast={toast} onDrillIn={drillIn} />}
      {tab === 'goals' && <GoalsTab readOnly={readOnly} toast={toast} initialCycleId={focusedCycleId} />}
      {tab === 'reviews' && <ReviewsTab readOnly={readOnly} toast={toast} initialCycleId={focusedCycleId} />}
    </div>
  );
}

function CyclesTab({ readOnly, toast, onDrillIn }: { readOnly: boolean; toast: any; onDrillIn: (target: 'goals' | 'reviews', cycleId: string) => void }) {
  const { data, isLoading } = usePerformanceCycles();
  const create = useCreatePerformanceCycle();
  const update = useUpdatePerformanceCycle();
  const remove = useDeletePerformanceCycle();
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const cycles = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filteredCycles = cycles.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });
  return (
    <>
      {!readOnly && (<div className="mb-3"><Button onClick={() => setShow(true)}><Plus className="h-4 w-4 mr-1" />New cycle</Button></div>)}
      {cycles.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filteredCycles.length}
          noun="cycle"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'planned', label: 'Planned' },
              { value: 'active', label: 'Active' },
              { value: 'review', label: 'Review' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
        </ListToolbar>
      )}
      {isLoading ? <div className="text-sm text-slate-500">Loading…</div>
        : cycles.length === 0 ? <EmptyState icon={<Target className="h-10 w-10" />} title="No cycles" />
        : (
        <Table>
          <TableHeader><TableRow><Th>Name</Th><Th>Window</Th><Th>Status</Th><Th></Th></TableRow></TableHeader>
          <TableBody>
            {filteredCycles.length === 0 ? (
              <tr><td colSpan={4}><EmptyState icon={<Target className="h-10 w-10" />} title="No cycles match" description="Try a different search or filter." /></td></tr>
            ) : filteredCycles.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/40"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, select')) return;
                  onDrillIn('goals', c.id);
                }}
              >
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm">{c.startDate} → {c.endDate}</TableCell>
                <TableCell><Badge variant={CYCLE_VARIANT[c.status]}>{c.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => onDrillIn('goals', c.id)}>
                      Goals
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onDrillIn('reviews', c.id)}>
                      Reviews
                    </Button>
                    {!readOnly && (
                      <>
                        <Select value={c.status}
                          onChange={(e) => update.mutate({ id: c.id, status: e.target.value })}
                          options={['planned', 'active', 'review', 'closed'].map((s) => ({ value: s, label: s }))} />
                        <Button size="sm" variant="outline"
                          onClick={() => remove.mutate(c.id, { onSuccess: () => toast('Deleted', 'success') })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={show} onClose={() => setShow(false)} title="New cycle">
        <form onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, startDate: start, endDate: end }, {
            onSuccess: () => { setShow(false); setName(''); setStart(''); setEnd(''); toast('Cycle created', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }} className="space-y-3">
          <div><label className="text-sm">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm">Start</label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
            <div><label className="text-sm">End</label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShow(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function GoalsTab({ readOnly, toast, initialCycleId }: { readOnly: boolean; toast: any; initialCycleId?: string }) {
  const { data: cyclesData } = usePerformanceCycles();
  const cycles = cyclesData?.data ?? [];
  const [cycleId, setCycleId] = useState(initialCycleId ?? '');
  const [editGoal, setEditGoal] = useState<any | null>(null);
  const { data: empData } = useEmployees({ limit: 200 });
  const employees = empData?.data ?? [];
  const { data, isLoading } = usePerformanceGoals(cycleId ? { cycleId } : {});
  const create = useCreatePerformanceGoal();
  const update = useUpdatePerformanceGoal();
  const remove = useDeletePerformanceGoal();
  const [show, setShow] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [weight, setWeight] = useState('20');
  const [metric, setMetric] = useState('');

  const goals = data?.data ?? [];
  const draftGoals = goals.filter((g) => g.status === 'draft');
  const generate = useGeneratePerformanceGoals();
  const bulkPublish = useBulkPublishGoals();
  const [showGen, setShowGen] = useState(false);

  // Filters + search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  // Default: all employee cards collapsed. Set entries are the IDs the user
  // has expanded. Cleaner mental model than tracking "what's collapsed".
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filteredGoals = goals.filter((g: any) => {
    if (statusFilter && g.status !== statusFilter) return false;
    if (deptFilter && g.departmentName !== deptFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = `${g.firstName ?? ''} ${g.lastName ?? ''} ${g.employeeCode ?? ''} ${g.title ?? ''} ${g.departmentName ?? ''} ${g.designationName ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Group by employee
  const groupedByEmployee = new Map<string, { employee: { id: string; name: string; code: string; department?: string; designation?: string }; goals: any[] }>();
  for (const g of filteredGoals) {
    const key = g.employeeId;
    if (!groupedByEmployee.has(key)) {
      groupedByEmployee.set(key, {
        employee: {
          id: g.employeeId,
          name: [g.firstName, g.lastName].filter(Boolean).join(' '),
          code: g.employeeCode ?? '',
          department: g.departmentName ?? undefined,
          designation: g.designationName ?? undefined,
        },
        goals: [],
      });
    }
    groupedByEmployee.get(key)!.goals.push(g);
  }
  const groups = Array.from(groupedByEmployee.values());

  // Unique depts/statuses for filter chips
  const allDepts = Array.from(new Set(goals.map((g: any) => g.departmentName).filter(Boolean))) as string[];
  const allStatuses = ['draft', 'active', 'achieved', 'partially_achieved', 'not_achieved', 'dropped'];

  function toggleExpand(empId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  }
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.employee.id));
  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.employee.id)));
  }

  return (
    <>
      <div className="mb-3 flex gap-3 items-end flex-wrap">
        <div className="w-64">
          <label className="text-sm">Cycle</label>
          <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)}
            options={[{ value: '', label: 'All cycles' }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        {!readOnly && cycleId && (
          <>
            <Button onClick={() => setShow(true)}><Plus className="h-4 w-4 mr-1" />New goal</Button>
            <Button variant="outline" onClick={() => setShowGen(true)}>
              <Sparkles className="h-4 w-4 mr-1 text-teal-600" />Generate with AI
            </Button>
            {draftGoals.length > 0 && (
              <Button variant="outline" onClick={() => bulkPublish.mutate(draftGoals.map((g) => g.id), {
                onSuccess: (r) => toast(`Published ${r?.data?.published ?? 0} goals`, 'success'),
                onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
              })} disabled={bulkPublish.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Publish {draftGoals.length} draft{draftGoals.length === 1 ? '' : 's'}
              </Button>
            )}
          </>
        )}
      </div>
      {/* Search + filter bar */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, goal, role…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...allStatuses.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))]} />
        {allDepts.length > 0 && (
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
            options={[{ value: '', label: 'All departments' }, ...allDepts.map((d) => ({ value: d, label: d }))]} />
        )}
        {(search || statusFilter || deptFilter) && (
          <Button variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); setDeptFilter(''); }}>
            Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {groups.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          )}
          <div className="text-xs text-slate-500">
            {groups.length} employee{groups.length === 1 ? '' : 's'} · {filteredGoals.length} goal{filteredGoals.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      {goals.length > 0 && <div className="mb-3"><RatingLegend /></div>}

      {isLoading ? <div className="text-sm text-slate-500">Loading…</div>
        : goals.length === 0 ? <EmptyState icon={<Target className="h-10 w-10" />} title="No goals" />
        : groups.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-500">No goals match your filters.</div>
        )
        : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isExpanded = expanded.has(g.employee.id);
            const totalWeight = g.goals.reduce((s, x) => s + Number(x.weight ?? 0), 0);
            const hasDrafts = g.goals.some((x) => x.status === 'draft');
            const avg = (field: 'selfRating' | 'managerRating' | 'finalRating') => {
              const vals = g.goals.map((x) => x[field]).filter((v) => v != null) as number[];
              if (vals.length === 0) return null;
              return (vals.reduce((s, v) => s + Number(v), 0) / vals.length).toFixed(1);
            };
            return (
              <div key={g.employee.id} className={`rounded-lg border ${hasDrafts ? 'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-zinc-900'}`}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/40 rounded-t-lg"
                  onClick={() => toggleExpand(g.employee.id)}
                >
                  <div className="h-9 w-9 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 flex items-center justify-center font-semibold text-sm">
                    {g.employee.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {g.employee.name}
                      {g.employee.code && <span className="text-xs text-slate-500 font-normal">· {g.employee.code}</span>}
                      {hasDrafts && <Badge variant="warning">draft</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {[g.employee.department, g.employee.designation].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                    <div className="text-center">
                      <div className="font-semibold">{g.goals.length}</div>
                      <div className="text-slate-500 text-[10px] uppercase tracking-wide">goals</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-semibold ${totalWeight === 100 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{totalWeight}%</div>
                      <div className="text-slate-500 text-[10px] uppercase tracking-wide">weight</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{avg('selfRating') ?? '—'}</div>
                      <div className="text-slate-500 text-[10px] uppercase tracking-wide">self</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{avg('managerRating') ?? '—'}</div>
                      <div className="text-slate-500 text-[10px] uppercase tracking-wide">mgr</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{avg('finalRating') ?? '—'}</div>
                      <div className="text-slate-500 text-[10px] uppercase tracking-wide">final</div>
                    </div>
                  </div>
                  <span className="text-slate-400">{isExpanded ? '▾' : '▸'}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700">
                    <Table>
                      <TableHeader><TableRow>
                        <Th>Goal</Th><Th className="w-16">Weight</Th><Th className="w-28">Progress</Th><Th className="w-16">Self</Th><Th className="w-24">Mgr</Th><Th className="w-24">Final</Th><Th className="w-40">Status</Th><Th></Th>
                      </TableRow></TableHeader>
                      <TableBody>
                        {g.goals.map((goal: any) => (
                          <TableRow key={goal.id}>
                            <TableCell>
                              <div className="font-medium">{goal.title}</div>
                              {goal.targetMetric && <div className="text-xs text-slate-500">🎯 {goal.targetMetric}</div>}
                              {goal.description && <div className="text-xs text-slate-500 mt-0.5">{goal.description}</div>}
                            </TableCell>
                            <TableCell>{Number(goal.weight).toFixed(0)}%</TableCell>
                            <TableCell>
                              {(goal as any).progressPct != null ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                                    <div className="h-full bg-cyan-500" style={{ width: `${(goal as any).progressPct}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-500 tabular-nums">{(goal as any).progressPct}%</span>
                                </div>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </TableCell>
                            <TableCell>{goal.selfRating ?? '—'}</TableCell>
                            <TableCell>
                              {!readOnly ? (
                                <Input type="number" min={0} max={5} step={0.5} className="w-20"
                                  placeholder="0-5"
                                  defaultValue={goal.managerRating ?? ''} onBlur={(e) => {
                                    const v = e.target.value === '' ? null : Number(e.target.value);
                                    if (v !== Number(goal.managerRating ?? NaN)) update.mutate({ id: goal.id, managerRating: v ?? undefined });
                                  }} />
                              ) : (goal.managerRating ?? '—')}
                            </TableCell>
                            <TableCell>
                              {!readOnly ? (
                                <Input type="number" min={0} max={5} step={0.5} className="w-20"
                                  placeholder="0-5"
                                  defaultValue={goal.finalRating ?? ''} onBlur={(e) => {
                                    const v = e.target.value === '' ? null : Number(e.target.value);
                                    if (v !== Number(goal.finalRating ?? NaN)) update.mutate({ id: goal.id, finalRating: v ?? undefined });
                                  }} />
                              ) : (goal.finalRating ?? '—')}
                            </TableCell>
                            <TableCell>
                              {!readOnly ? (
                                <Select className="w-36" value={goal.status}
                                  onChange={(e) => update.mutate({ id: goal.id, status: e.target.value as any })}
                                  options={allStatuses.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))} />
                              ) : <Badge variant="outline">{goal.status}</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {!readOnly && (
                                  <Button size="sm" variant="outline" onClick={() => setEditGoal(goal)}>Edit</Button>
                                )}
                                {!readOnly && (
                                  <Button size="sm" variant="outline" onClick={() => remove.mutate(goal.id, { onSuccess: () => toast('Deleted', 'success') })}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cycleId && goals.length > 0 && (
        <div className="mt-3 rounded-md border border-cyan-200 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/30 px-3 py-2 text-xs text-cyan-800 dark:text-cyan-200">
          Set per-goal ratings + status here. When you're ready to sign off the overall review (overall rating, comments, finalise), open the <strong>Reviews</strong> tab.
        </div>
      )}

      <EditGoalModal goal={editGoal} onClose={() => setEditGoal(null)} update={update} toast={toast} />
      <GenerateGoalsModal
        open={showGen}
        cycleId={cycleId}
        cycleName={cycles.find((c) => c.id === cycleId)?.name ?? ''}
        employees={employees}
        onClose={() => setShowGen(false)}
        generate={generate}
        toast={toast}
      />

      <Modal open={show} onClose={() => setShow(false)} title="New goal" size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            cycleId, employeeId, title, description: desc || undefined,
            weight: Number(weight), targetMetric: metric || undefined,
          }, {
            onSuccess: () => { setShow(false); setTitle(''); setDesc(''); setMetric(''); toast('Goal added', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }} className="space-y-3">
          <div>
            <label className="text-sm">Employee</label>
            <Combobox options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }))}
              value={employeeId} onChange={setEmployeeId} placeholder="Select employee" />
          </div>
          <div><label className="text-sm">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><label className="text-sm">Description</label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm">Weight %</label><Input type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <div><label className="text-sm">Target metric</label><Input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="e.g. 95% on-time delivery" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShow(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !employeeId || !title}>{create.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ReviewsTab({ readOnly, toast, initialCycleId }: { readOnly: boolean; toast: any; initialCycleId?: string }) {
  const { data: cyclesData } = usePerformanceCycles();
  const cycles = cyclesData?.data ?? [];
  const [cycleId, setCycleId] = useState(initialCycleId ?? '');
  const { data: empData } = useEmployees({ limit: 200 });
  const employees = empData?.data ?? [];
  const { data } = usePerformanceReviews(cycleId ? { cycleId } : {});
  const startReview = useCreatePerformanceReview();
  const mgrSubmit = useSubmitManagerReview();
  const finalise = useFinaliseReview();

  const reviews = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const q = search.trim().toLowerCase();
  const filteredReviews = reviews.filter((r) => {
    const name = [r.firstName, r.lastName].filter(Boolean).join(' ').toLowerCase();
    if (q && !name.includes(q)) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <>
      <div className="mb-3 flex gap-3 items-end">
        <div className="w-64">
          <label className="text-sm">Cycle</label>
          <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)}
            options={[{ value: '', label: 'All' }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        {!readOnly && cycleId && (
          <Combobox options={employees.map((e) => ({ value: e.id, label: `Start review: ${e.firstName} ${e.lastName ?? ''}` }))}
            value="" onChange={(empId) => startReview.mutate({ cycleId, employeeId: empId }, {
              onSuccess: () => toast('Review started', 'success'),
              onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
            })}
            placeholder="Start review for…" />
        )}
      </div>
      {reviews.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by employee…"
          count={filteredReviews.length}
          noun="review"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'self_submitted', label: 'Self submitted' },
              { value: 'manager_submitted', label: 'Manager submitted' },
              { value: 'finalised', label: 'Finalised' },
              { value: 'acknowledged', label: 'Acknowledged' },
            ]}
          />
        </ListToolbar>
      )}
      {reviews.length > 0 && <div className="mb-3"><RatingLegend /></div>}
      {reviews.length === 0 ? <EmptyState icon={<Target className="h-10 w-10" />} title="No reviews" />
        : (
        <Table>
          <TableHeader><TableRow>
            <Th>Employee</Th><Th>Status</Th><Th>Self</Th><Th>Manager</Th><Th>Final</Th><Th></Th>
          </TableRow></TableHeader>
          <TableBody>
            {filteredReviews.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={<Target className="h-10 w-10" />} title="No reviews match" description="Try a different search or filter." /></td></tr>
            ) : filteredReviews.map((r) => {
              const computedMgr = r.computedManagerScore ?? null;
              const computedSelf = r.computedSelfScore ?? null;
              const selfDisplay = r.selfOverallRating ?? (computedSelf != null ? String(computedSelf) : null);
              const selfDerived = r.selfOverallRating == null && computedSelf != null;
              const mgrDisplay = r.managerOverallRating ?? (computedMgr != null ? String(computedMgr) : null);
              const mgrDerived = r.managerOverallRating == null && computedMgr != null;
              return (
              <Fragment key={r.id}>
              <TableRow>
                <TableCell>{[r.firstName, r.lastName].filter(Boolean).join(' ')}</TableCell>
                <TableCell><Badge variant={REVIEW_VARIANT[r.status]}>{r.status.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell>
                  <div>{selfDisplay ?? '—'}</div>
                  {selfDerived && <div className="text-[10px] text-slate-400">from goals</div>}
                </TableCell>
                <TableCell>
                  {!readOnly ? (
                    <>
                      <Input type="number" min={0} max={5} step={0.5} className="w-20"
                        defaultValue={r.managerOverallRating ?? ''} onBlur={(e) => {
                          const v = e.target.value === '' ? undefined : Number(e.target.value);
                          if (v !== undefined) mgrSubmit.mutate({ id: r.id, managerOverallRating: v });
                        }} />
                      {computedMgr != null && (
                        <div className="text-[10px] text-slate-400 mt-0.5">goals: {computedMgr}</div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>{mgrDisplay ?? '—'}</div>
                      {mgrDerived && <div className="text-[10px] text-slate-400">from goals</div>}
                    </>
                  )}
                </TableCell>
                <TableCell>{r.finalOverallRating ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {!readOnly && r.status !== 'finalised' && r.status !== 'acknowledged' && (
                    <Button size="sm" onClick={() => {
                      const suggested = computedMgr ?? r.managerOverallRating ?? '';
                      const v = window.prompt(
                        `Final overall rating (0-5)?\n\nSuggested from weighted goal ratings: ${computedMgr ?? '—'}`,
                        suggested === '' ? '' : String(suggested),
                      );
                      if (v) finalise.mutate({ id: r.id, finalOverallRating: Number(v) }, {
                        onSuccess: () => toast('Finalised', 'success'),
                        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                      });
                    }}>Finalise</Button>
                  )}
                </TableCell>
              </TableRow>
              {(r.managerComments || r.employeeAckComment) && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-slate-50 dark:bg-zinc-900/40">
                    <div className="space-y-1.5 py-1">
                      {r.managerComments && (
                        <div className="text-xs">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">Manager comments: </span>
                          <span className="text-slate-600 dark:text-slate-400">{r.managerComments}</span>
                        </div>
                      )}
                      {r.employeeAckComment && (
                        <div className="text-xs">
                          <span className="font-semibold text-green-700 dark:text-green-400">Employee acknowledged: </span>
                          <span className="text-slate-600 dark:text-slate-400">{r.employeeAckComment}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function GenerateGoalsModal({
  open, cycleId, cycleName, employees, onClose, generate, toast,
}: {
  open: boolean;
  cycleId: string;
  cycleName: string;
  employees: any[];
  onClose: () => void;
  generate: any;
  toast: any;
}) {
  const [scope, setScope] = useState<'single' | 'department' | 'designation' | 'all'>('all');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const { data: deptData } = useDepartments();
  const depts = (deptData as any)?.data ?? [];
  const { data: desigData } = useDesignations();
  const desigs = (desigData as any)?.data ?? [];

  function run() {
    if (scope === 'single' && !employeeId) { toast('Pick an employee', 'error'); return; }
    if (scope === 'department' && !departmentId) { toast('Pick a department', 'error'); return; }
    if (scope === 'designation' && !designationId) { toast('Pick a designation', 'error'); return; }
    generate.mutate({ cycleId, scope, employeeId: employeeId || undefined, departmentId: departmentId || undefined, designationId: designationId || undefined }, {
      onSuccess: (r: any) => {
        toast(`Generated ${r?.data?.generated ?? 0} draft goals for ${r?.data?.employees ?? 0} employee${r?.data?.employees === 1 ? '' : 's'}`, 'success');
        onClose();
      },
      onError: (e: any) => toast(e?.message ?? 'Generation failed', 'error'),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate goals with AI" size="lg">
      <div className="space-y-4">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          AI will create 3-5 weighted goals per employee based on their department, designation, and your company's industry. Goals start as <strong>drafts</strong> so you can review before publishing. Cycle: <strong>{cycleName}</strong>.
        </div>
        <div>
          <label className="text-sm font-medium">Scope</label>
          <div className="mt-2 space-y-2">
            <div className="flex items-start gap-2">
              <input id="scope-all" type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} className="mt-0.5 cursor-pointer" />
              <label htmlFor="scope-all" className="cursor-pointer">
                <div className="text-sm font-medium">All active employees</div>
                <div className="text-xs text-slate-500">Generate for everyone in the cycle who doesn't already have goals.</div>
              </label>
            </div>
            <div className="flex items-start gap-2">
              <input id="scope-dept" type="radio" name="scope" checked={scope === 'department'} onChange={() => setScope('department')} className="mt-0.5 cursor-pointer" />
              <div className="flex-1">
                <label htmlFor="scope-dept" className="text-sm font-medium cursor-pointer">By department</label>
                {scope === 'department' && (
                  <div className="mt-1.5">
                    <Combobox options={depts.map((d: any) => ({ value: d.id, label: d.name }))}
                      value={departmentId} onChange={setDepartmentId} placeholder="Select department" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <input id="scope-desig" type="radio" name="scope" checked={scope === 'designation'} onChange={() => setScope('designation')} className="mt-0.5 cursor-pointer" />
              <div className="flex-1">
                <label htmlFor="scope-desig" className="text-sm font-medium cursor-pointer">By designation</label>
                {scope === 'designation' && (
                  <div className="mt-1.5">
                    <Combobox options={desigs.map((d: any) => ({ value: d.id, label: d.name }))}
                      value={designationId} onChange={setDesignationId} placeholder="Select designation" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <input id="scope-single" type="radio" name="scope" checked={scope === 'single'} onChange={() => setScope('single')} className="mt-0.5 cursor-pointer" />
              <div className="flex-1">
                <label htmlFor="scope-single" className="text-sm font-medium cursor-pointer">Single employee</label>
                {scope === 'single' && (
                  <div className="mt-1.5">
                    <Combobox options={employees.map((e: any) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }))}
                      value={employeeId} onChange={setEmployeeId} placeholder="Select employee" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500 bg-slate-50 dark:bg-zinc-900/40 rounded p-2">
          Generation may take 10–30 seconds depending on the number of unique roles. Employees with the same (department + designation) share one inference.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={generate.isPending}>
            {generate.isPending ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditGoalModal({ goal, onClose, update, toast }: { goal: any | null; onClose: () => void; update: any; toast: any }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [weight, setWeight] = useState('0');
  const [metric, setMetric] = useState('');
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (!goal) return;
    setTitle(goal.title ?? '');
    setDesc(goal.description ?? '');
    setWeight(String(goal.weight ?? '0'));
    setMetric(goal.targetMetric ?? '');
    setComments(goal.comments ?? '');
  }, [goal]);

  if (!goal) return null;
  return (
    <Modal open={!!goal} onClose={onClose} title={`Edit goal — ${goal.firstName ?? ''} ${goal.lastName ?? ''}`} size="lg">
      <form onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          id: goal.id,
          title,
          description: desc || undefined,
          weight: Number(weight),
          targetMetric: metric || undefined,
          comments: comments || undefined,
        }, {
          onSuccess: () => { onClose(); toast('Goal updated', 'success'); },
          onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
        });
      }} className="space-y-3">
        <div><label className="text-sm">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
        <div><label className="text-sm">Description</label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm">Weight %</label><Input type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
          <div><label className="text-sm">Target metric</label><Input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="e.g. 95% on-time delivery" /></div>
        </div>
        <div><label className="text-sm">Manager comments</label><Textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Notes on what went well, areas to improve…" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={update.isPending || !title}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}
