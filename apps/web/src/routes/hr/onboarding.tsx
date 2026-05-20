import { useState } from 'react';
import { UserPlus, Plus, Trash2, CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { documentDownloadUrl } from '@/hooks/queries/use-employee-documents';
import {
  PageHeader, Badge, Button, Input, Textarea, Modal, Combobox, Select,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import {
  useOnboardingTemplates, useCreateOnboardingTemplate, useDeleteOnboardingTemplate,
  useOnboardingTemplate,
  useOnboardingWorkflows, useStartOnboarding, useDeleteOnboardingWorkflow,
  useOnboardingWorkflow, useCompleteOnboardingItem,
} from '@/hooks/queries/use-hr-phase-next';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<string, any> = {
  in_progress: 'warning', completed: 'success', cancelled: 'danger',
};

type TemplateItemDraft = {
  title: string;
  kind: string;
  assignedRole: string;
  documentKind?: string;
};

const ITEM_KIND_OPTIONS = [
  { value: 'document_upload', label: 'Document upload' },
  { value: 'acknowledgement', label: 'Acknowledgement' },
  { value: 'task', label: 'Task' },
  { value: 'asset_issue', label: 'Asset issue' },
  { value: 'induction', label: 'Induction' },
];

const ASSIGNED_ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee (mobile)' },
  { value: 'hr', label: 'HR' },
];

// Comprehensive HR document kinds (mirrors employeeDocumentKindSchema in
// @runq/validators — keep in sync).
const DOCUMENT_KIND_OPTIONS = [
  { value: 'aadhaar', label: 'Aadhaar card' },
  { value: 'pan', label: 'PAN card' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_license', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'bank_passbook', label: 'Bank passbook / cancelled cheque' },
  { value: 'photo_id_card', label: 'Photo ID card' },
  { value: 'offer_letter', label: 'Offer letter' },
  { value: 'employment_contract', label: 'Employment contract' },
  { value: 'educational_certificate', label: 'Educational certificate' },
  { value: 'experience_letter', label: 'Experience letter' },
  { value: 'relieving_letter', label: 'Relieving letter (previous employer)' },
  { value: 'appraisal_letter', label: 'Appraisal letter' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_TEMPLATE_ITEMS: TemplateItemDraft[] = [
  { title: 'Upload Aadhaar card', kind: 'document_upload', assignedRole: 'employee', documentKind: 'aadhaar' },
  { title: 'Upload PAN card', kind: 'document_upload', assignedRole: 'employee', documentKind: 'pan' },
  { title: 'Upload address proof', kind: 'document_upload', assignedRole: 'employee', documentKind: 'address_proof' },
  { title: 'Upload bank passbook / cancelled cheque', kind: 'document_upload', assignedRole: 'employee', documentKind: 'bank_passbook' },
  { title: 'Upload educational certificate', kind: 'document_upload', assignedRole: 'employee', documentKind: 'educational_certificate' },
  { title: 'Upload relieving letter (previous employer)', kind: 'document_upload', assignedRole: 'employee', documentKind: 'relieving_letter' },
  { title: 'Sign offer letter acknowledgement', kind: 'acknowledgement', assignedRole: 'employee' },
  { title: 'Issue laptop & ID card', kind: 'asset_issue', assignedRole: 'hr' },
  { title: 'Compliance induction', kind: 'induction', assignedRole: 'hr' },
];

export function OnboardingPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [tab, setTab] = useState<'workflows' | 'templates'>('workflows');

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Onboarding' }]}
        title="Onboarding"
        description="Checklists for new hires — documents, induction, asset issue."
        actions={
          <div className="flex gap-2">
            <Button variant={tab === 'workflows' ? 'primary' : 'outline'} onClick={() => setTab('workflows')}>Workflows</Button>
            <Button variant={tab === 'templates' ? 'primary' : 'outline'} onClick={() => setTab('templates')}>Templates</Button>
          </div>
        }
      />
      {tab === 'workflows' ? <WorkflowsTab readOnly={readOnly} toast={toast} /> : <TemplatesTab readOnly={readOnly} toast={toast} />}
    </div>
  );
}

function WorkflowsTab({ readOnly, toast }: { readOnly: boolean; toast: (m: string, t: any) => void }) {
  const { data, isLoading } = useOnboardingWorkflows();
  const start = useStartOnboarding();
  const removeWorkflow = useDeleteOnboardingWorkflow();
  const [deleteWfId, setDeleteWfId] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const { data: empData } = useEmployees({ limit: 200 });
  const employees = empData?.data ?? [];
  const { data: tplData } = useOnboardingTemplates();
  const templates = tplData?.data ?? [];
  const [openWf, setOpenWf] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const workflows = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = workflows.filter((w) => {
    const name = [w.firstName, w.lastName].filter(Boolean).join(' ').toLowerCase();
    if (q && !name.includes(q) && !(w.employeeCode ?? '').toLowerCase().includes(q)) return false;
    if (statusFilter && w.status !== statusFilter) return false;
    return true;
  });

  return (
    <>
      {!readOnly && (
        <div className="mb-3"><Button onClick={() => setShowStart(true)}><Plus className="h-4 w-4 mr-1" />Start onboarding</Button></div>
      )}
      {workflows.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by employee name or code…"
          count={filtered.length}
          noun="workflow"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </ListToolbar>
      )}
      {isLoading ? <div className="text-sm text-slate-500">Loading…</div>
        : workflows.length === 0 ? <EmptyState icon={<UserPlus className="h-10 w-10" />} title="No onboarding in progress" />
        : (
        <Table>
          <TableHeader><TableRow><Th>Employee</Th><Th>Status</Th><Th>Started</Th><Th>Completed</Th><Th></Th></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5}><EmptyState icon={<UserPlus className="h-10 w-10" />} title="No workflows match" description="Try a different search or filter." /></td></tr>
            ) : filtered.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/hr/employees/$employeeId"
                    params={{ employeeId: w.employeeId }}
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {[w.firstName, w.lastName].filter(Boolean).join(' ')}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">{w.employeeCode}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1.5">
                    <Badge variant={STATUS_VARIANT[w.status]}>{w.status.replace('_', ' ')}</Badge>
                    {(w.totalCount ?? 0) > 0 && (() => {
                      const done = w.completedCount ?? 0;
                      const total = w.totalCount ?? 0;
                      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
                      const isDone = done === total;
                      return (
                        <div className="w-32">
                          <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
                            <span>{done}/{total} tasks</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-cyan-600 dark:bg-cyan-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{new Date(w.startedAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-xs">{w.completedAt ? new Date(w.completedAt).toLocaleDateString() : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setOpenWf(w.id)}>Open</Button>
                    {!readOnly && (
                      <Button size="sm" variant="outline" onClick={() => setDeleteWfId(w.id)} title="Delete workflow">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={showStart} onClose={() => setShowStart(false)} title="Start onboarding">
        <form onSubmit={(e) => {
          e.preventDefault();
          start.mutate({ employeeId, templateId: templateId || undefined }, {
            onSuccess: () => { setShowStart(false); toast('Onboarding started', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Employee</label>
            <Combobox options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }))}
              value={employeeId} onChange={setEmployeeId} placeholder="Select employee" />
          </div>
          <div>
            <label className="text-sm font-medium">Template (optional)</label>
            <Combobox options={[{ value: '', label: 'Default template' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
              value={templateId} onChange={setTemplateId} placeholder="Default" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowStart(false)}>Cancel</Button>
            <Button type="submit" disabled={start.isPending || !employeeId}>{start.isPending ? 'Starting…' : 'Start'}</Button>
          </div>
        </form>
      </Modal>

      {openWf && <WorkflowDetailModal id={openWf} onClose={() => setOpenWf(null)} toast={toast} />}

      <ConfirmationDialog
        open={!!deleteWfId}
        onClose={() => setDeleteWfId(null)}
        onConfirm={() => {
          if (!deleteWfId) return;
          removeWorkflow.mutate(deleteWfId, {
            onSuccess: () => { setDeleteWfId(null); toast('Workflow deleted', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Delete failed', 'error'),
          });
        }}
        title="Delete onboarding workflow?"
        description="The employee's checklist will be removed. Any documents they've already uploaded stay in their Documents tab."
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  );
}

function WorkflowDetailModal({ id, onClose, toast }: { id: string; onClose: () => void; toast: any }) {
  const { data } = useOnboardingWorkflow(id);
  const complete = useCompleteOnboardingItem();
  const wf = data?.data;
  return (
    <Modal open onClose={onClose} title={wf ? 'Onboarding checklist' : 'Loading…'} size="lg">
      {wf ? (
        <div className="space-y-3">
          <div className="text-sm text-slate-500">Status: <Badge variant={STATUS_VARIANT[wf.status]}>{wf.status.replace('_', ' ')}</Badge></div>
          <ul className="space-y-2">
            {(wf.items ?? []).map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 rounded border p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{it.sequence + 1}. {it.title}</div>
                  {it.instructions && <div className="text-xs text-slate-500 mt-1">{it.instructions}</div>}
                  <div className="text-xs text-slate-400 mt-1">{it.kind} · {it.assignedRole}</div>
                  {it.attachmentId && it.attachmentFileName && (
                    <AttachmentRow id={it.attachmentId} fileName={it.attachmentFileName} />
                  )}
                </div>
                {it.isCompleted ? (
                  <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1 inline" />Done</Badge>
                ) : (
                  <Button size="sm" onClick={() => complete.mutate({ id: it.id }, {
                    onSuccess: () => toast('Item completed', 'success'),
                    onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                  })}>Mark done</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : <div className="text-sm text-slate-500">Loading…</div>}
    </Modal>
  );
}

function AttachmentRow({ id, fileName }: { id: string; fileName: string }) {
  async function open() {
    const token = localStorage.getItem('runq-token');
    const res = await fetch(documentDownloadUrl(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return (
    <button
      type="button"
      onClick={open}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
    >
      <FileText className="h-3 w-3" />
      <span className="max-w-[280px] truncate">{fileName}</span>
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

function TemplatesTab({ readOnly, toast }: { readOnly: boolean; toast: any }) {
  const { data, isLoading } = useOnboardingTemplates();
  const create = useCreateOnboardingTemplate();
  const remove = useDeleteOnboardingTemplate();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [items, setItems] = useState<TemplateItemDraft[]>(DEFAULT_TEMPLATE_ITEMS);
  const [openTpl, setOpenTpl] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const templates = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q))
    : templates;

  return (
    <>
      {!readOnly && (
        <div className="mb-3"><Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" />New template</Button></div>
      )}
      {templates.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name…"
          count={filtered.length}
          noun="template"
        />
      )}
      {isLoading ? <div className="text-sm text-slate-500">Loading…</div>
        : templates.length === 0 ? <EmptyState icon={<UserPlus className="h-10 w-10" />} title="No templates" />
        : (
        <Table>
          <TableHeader><TableRow><Th>Name</Th><Th>Description</Th><Th>Default</Th><Th></Th></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4}><EmptyState icon={<UserPlus className="h-10 w-10" />} title="No templates match" description="Try a different search term." /></td></tr>
            ) : filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-sm text-slate-500">{t.description ?? '—'}</TableCell>
                <TableCell>{t.isDefault ? <Badge variant="info">Default</Badge> : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setOpenTpl(t.id)}>Preview</Button>
                    {!readOnly && <Button size="sm" variant="outline" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New template" size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name, description: desc,
            isDefault: templates.length === 0,
            items: items.map((it, i) => ({
              sequence: i,
              title: it.title,
              kind: it.kind,
              assignedRole: it.assignedRole,
              ...(it.kind === 'document_upload' && it.documentKind ? { documentKind: it.documentKind } : {}),
            })),
          }, {
            onSuccess: () => { setShowAdd(false); setName(''); setDesc(''); toast('Template created', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Items</label>
            <p className="text-xs text-slate-500 mb-2">Tasks assigned to "Employee" show up in their mobile app. Document-upload tasks ask the employee to upload the specified document type.</p>
            <ul className="mt-1 space-y-2">
              {items.map((it, i) => (
                <li key={i} className="space-y-1 border border-slate-200 dark:border-slate-700 rounded-md p-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Item title"
                      value={it.title}
                      onChange={(e) => {
                        const next = [...items]; next[i] = { ...it, title: e.target.value }; setItems(next);
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className={`grid gap-2 ${it.kind === 'document_upload' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <Select
                      value={it.kind}
                      onChange={(e) => {
                        const next = [...items]; next[i] = { ...it, kind: e.target.value }; setItems(next);
                      }}
                      options={ITEM_KIND_OPTIONS}
                    />
                    <Select
                      value={it.assignedRole}
                      onChange={(e) => {
                        const next = [...items]; next[i] = { ...it, assignedRole: e.target.value }; setItems(next);
                      }}
                      options={ASSIGNED_ROLE_OPTIONS}
                    />
                    {it.kind === 'document_upload' && (
                      <Select
                        value={it.documentKind ?? ''}
                        onChange={(e) => {
                          const next = [...items]; next[i] = { ...it, documentKind: e.target.value || undefined }; setItems(next);
                        }}
                        options={[{ value: '', label: 'Document type…' }, ...DOCUMENT_KIND_OPTIONS]}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="mt-2"
              onClick={() => setItems([...items, { title: '', kind: 'task', assignedRole: 'employee' }])}>Add item</Button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !name}>{create.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {openTpl && <TemplatePreview id={openTpl} onClose={() => setOpenTpl(null)} />}

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, {
            onSuccess: () => { setDeleteId(null); toast('Template deleted', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Delete failed', 'error'),
          });
        }}
        title="Delete template?"
        description="This will remove the template and its items."
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  );
}

function TemplatePreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useOnboardingTemplate(id);
  const t = data?.data;
  return (
    <Modal open onClose={onClose} title={t?.name ?? 'Template'}>
      {t ? (
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          {(t.items ?? []).map((it) => (
            <li key={it.id}>
              <span className="font-medium">{it.title}</span>
              <span className="text-xs text-slate-500 ml-2">{it.kind} · {it.assignedRole}</span>
            </li>
          ))}
        </ol>
      ) : 'Loading…'}
    </Modal>
  );
}
