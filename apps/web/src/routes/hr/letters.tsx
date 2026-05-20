import { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, Wand2, Download, Share2 } from 'lucide-react';
import {
  PageHeader, Badge, Button, Input, Textarea, Select, Modal, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, ConfirmationDialog,
} from '@/components/ui';
import { EmptyState, ListToolbar, Select as FilterSelect } from '@/components/ar/primitives';
import {
  useLetterTemplates, useCreateLetterTemplate, useDeleteLetterTemplate,
  useLetters, useGenerateLetter, useIssueLetter, useRevokeLetter, useLetter,
  useFulfilLetterRequest, useDeleteLetter,
} from '@/hooks/queries/use-hr-phase-next';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

const KIND_OPTIONS = [
  'offer', 'appointment', 'confirmation', 'increment',
  'experience', 'relieving', 'salary_certificate', 'address_proof', 'other',
];

const STATUS_VARIANT: Record<string, any> = {
  requested: 'warning', draft: 'outline', issued: 'success', revoked: 'danger',
};
const STATUS_LABEL: Record<string, string> = {
  requested: 'Pending HR', draft: 'Draft', issued: 'Issued', revoked: 'Revoked',
};

export function LettersPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [tab, setTab] = useState<'letters' | 'templates'>('letters');
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Letters' }]}
        title="Letters"
        description="Offer, appointment, experience, salary certificate — generated from tokenised templates."
        actions={
          <div className="flex gap-2">
            <Button variant={tab === 'letters' ? 'primary' : 'outline'} onClick={() => setTab('letters')}>Letters</Button>
            <Button variant={tab === 'templates' ? 'primary' : 'outline'} onClick={() => setTab('templates')}>Templates</Button>
          </div>
        }
      />
      {tab === 'letters' ? <LettersTab readOnly={readOnly} toast={toast} /> : <TemplatesTab readOnly={readOnly} toast={toast} />}
    </div>
  );
}

function LettersTab({ readOnly, toast }: { readOnly: boolean; toast: any }) {
  const { data, isLoading } = useLetters();
  const { data: tplData } = useLetterTemplates();
  const { data: empData } = useEmployees({ limit: 200 });
  const generate = useGenerateLetter();
  const issue = useIssueLetter();
  const revoke = useRevokeLetter();
  const fulfil = useFulfilLetterRequest();
  const remove = useDeleteLetter();
  const [show, setShow] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [fulfilFor, setFulfilFor] = useState<any | null>(null);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const rows = data?.data ?? [];
  const templates = tplData?.data ?? [];
  const employees = empData?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((l) => {
    const name = [l.firstName, l.lastName].filter(Boolean).join(' ').toLowerCase();
    if (q && !name.includes(q) &&
      !(l.employeeCode ?? '').toLowerCase().includes(q) &&
      !(l.subject ?? '').toLowerCase().includes(q)) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });

  return (
    <>
      {!readOnly && (
        <div className="mb-3"><Button onClick={() => setShow(true)}><Plus className="h-4 w-4 mr-1" />Generate letter</Button></div>
      )}
      {rows.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by subject or employee…"
          count={filtered.length}
          noun="letter"
        >
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'requested', label: 'Pending HR' },
              { value: 'draft', label: 'Draft' },
              { value: 'issued', label: 'Issued' },
              { value: 'revoked', label: 'Revoked' },
            ]}
          />
        </ListToolbar>
      )}
      {isLoading ? <div className="text-sm text-slate-500">Loading…</div>
        : rows.length === 0 ? <EmptyState icon={<FileText className="h-10 w-10" />} title="No letters" />
        : (
        <Table>
          <TableHeader><TableRow>
            <Th>Subject</Th><Th>Employee</Th><Th>Kind</Th><Th>Status</Th><Th>Issued</Th><Th></Th>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={<FileText className="h-10 w-10" />} title="No letters match" description="Try a different search or filter." /></td></tr>
            ) : filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.subject ?? '—'}</TableCell>
                <TableCell>
                  {[l.firstName, l.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{l.employeeCode}</span>
                </TableCell>
                <TableCell>{l.kind.replace('_', ' ')}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status] ?? l.status}</Badge>
                  {l.status === 'requested' && l.requestedReason && (
                    <div className="text-xs text-slate-500 mt-1 max-w-[280px] line-clamp-2" title={l.requestedReason}>
                      "{l.requestedReason}"
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs">{l.issuedAt ? new Date(l.issuedAt).toLocaleDateString() : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {l.status !== 'requested' && (
                      <Button size="sm" variant="outline" onClick={() => setOpenId(l.id)}>View</Button>
                    )}
                    {!readOnly && l.status === 'requested' && (
                      <>
                        <Button size="sm" onClick={() => setFulfilFor(l)}>
                          <Wand2 className="h-3.5 w-3.5 mr-1" />Fulfil
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDiscardId(l.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {!readOnly && l.status === 'draft' && (
                      <Button size="sm" onClick={() => issue.mutate(l.id, {
                        onSuccess: () => toast('Letter issued', 'success'),
                        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                      })}>Issue</Button>
                    )}
                    {!readOnly && l.status === 'issued' && (
                      <Button size="sm" variant="outline" onClick={() => revoke.mutate(l.id, {
                        onSuccess: () => toast('Revoked', 'success'),
                      })}>Revoke</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={show} onClose={() => setShow(false)} title="Generate letter">
        <form onSubmit={(e) => {
          e.preventDefault();
          generate.mutate({ employeeId, templateId }, {
            onSuccess: () => { setShow(false); toast('Draft letter generated', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Template</label>
            <Combobox options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.kind})` }))}
              value={templateId} onChange={setTemplateId} placeholder="Select template" />
          </div>
          <div>
            <label className="text-sm font-medium">Employee</label>
            <Combobox options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }))}
              value={employeeId} onChange={setEmployeeId} placeholder="Select employee" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShow(false)}>Cancel</Button>
            <Button type="submit" disabled={!templateId || !employeeId || generate.isPending}>
              {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </form>
      </Modal>

      {openId && <LetterPreview id={openId} onClose={() => setOpenId(null)} />}

      <Modal open={!!fulfilFor} onClose={() => setFulfilFor(null)} title="Fulfil letter request" size="md">
        {fulfilFor && (
          <FulfilForm
            letter={fulfilFor}
            templates={templates}
            onCancel={() => setFulfilFor(null)}
            onDone={() => { setFulfilFor(null); toast('Draft generated — review and issue', 'success'); }}
            onError={(msg) => toast(msg, 'error')}
            fulfil={fulfil}
          />
        )}
      </Modal>

      <ConfirmationDialog
        open={!!discardId}
        onClose={() => setDiscardId(null)}
        onConfirm={() => {
          if (!discardId) return;
          remove.mutate(discardId, {
            onSuccess: () => { setDiscardId(null); toast('Request discarded', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }}
        title="Discard letter request?"
        description="The employee will see the request disappear. They can re-submit if needed."
        confirmLabel="Discard"
        variant="danger"
      />
    </>
  );
}

function FulfilForm({
  letter, templates, onCancel, onDone, onError, fulfil,
}: {
  letter: any;
  templates: any[];
  onCancel: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
  fulfil: ReturnType<typeof useFulfilLetterRequest>;
}) {
  const matching = templates.filter((t) => t.kind === letter.kind);
  const [templateId, setTemplateId] = useState<string>('');
  useEffect(() => {
    if (matching.length > 0 && !templateId) setTemplateId(matching[0].id);
  }, [matching, templateId]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!templateId) return;
        fulfil.mutate({ id: letter.id, templateId }, {
          onSuccess: () => onDone(),
          onError: (err: any) => onError(err?.message ?? 'Failed'),
        });
      }}
      className="space-y-3"
    >
      <div className="text-sm">
        <div className="font-medium">{[letter.firstName, letter.lastName].filter(Boolean).join(' ')} <span className="text-slate-500 text-xs">{letter.employeeCode}</span></div>
        <div className="text-slate-500">Requested: {letter.kind.replace('_', ' ')}</div>
      </div>
      {letter.requestedReason && (
        <div className="rounded-md bg-slate-50 dark:bg-slate-800 p-3 text-sm">
          <div className="text-xs text-slate-500 mb-1">Employee reason</div>
          <div>{letter.requestedReason}</div>
        </div>
      )}
      <div>
        <label className="text-sm font-medium">Template</label>
        {matching.length === 0 ? (
          <div className="text-sm text-red-600 mt-1">
            No template found for kind "{letter.kind.replace('_', ' ')}". Create one in the Templates tab first.
          </div>
        ) : (
          <Combobox
            options={matching.map((t) => ({ value: t.id, label: t.name }))}
            value={templateId}
            onChange={setTemplateId}
            placeholder="Select template"
          />
        )}
        <p className="text-xs text-slate-500 mt-1">Generates a draft. You can review and edit before issuing.</p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!templateId || fulfil.isPending}>
          {fulfil.isPending ? 'Generating…' : 'Generate draft'}
        </Button>
      </div>
    </form>
  );
}

function LetterPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data } = useLetter(id);
  const l = data?.data;
  const safeName = (l?.subject ?? l?.kind ?? 'letter').replace(/[^a-z0-9_\- ]/gi, '_');

  async function fetchPdfBlob(): Promise<Blob | null> {
    const token = localStorage.getItem('runq-token');
    const res = await fetch(`/api/v1/hr/letters/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return res.blob();
  }

  async function openPdf(action: 'view' | 'download') {
    const blob = await fetchPdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (action === 'view') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = `${safeName}.pdf`; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // Web Share API — supported on Chrome (Android/desktop on HTTPS) and
  // Safari (macOS 12.4+/iOS). Falls back to a download when unsupported.
  async function share() {
    const blob = await fetchPdfBlob();
    if (!blob) return;
    const file = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: l?.subject ?? 'Letter',
          text: l?.subject ?? 'Letter from your employer',
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') toast(err?.message ?? 'Share failed', 'error');
      }
      return;
    }
    // No Web Share — copy a shareable mailto link instead.
    toast('Sharing not supported in this browser — file will download', 'info');
    openPdf('download');
  }
  return (
    <Modal open onClose={onClose} title={l?.subject ?? 'Letter'} size="lg">
      {l ? (
        <>
          {l.status === 'issued' && (
            <div className="mb-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openPdf('view')}>
                <FileText className="h-4 w-4 mr-1" />View PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => openPdf('download')}>
                <Download className="h-4 w-4 mr-1" />Download
              </Button>
              <Button size="sm" onClick={share}>
                <Share2 className="h-4 w-4 mr-1" />Share
              </Button>
            </div>
          )}
          <div className="prose max-w-none whitespace-pre-wrap text-sm font-serif leading-relaxed">{l.renderedBody}</div>
        </>
      ) : 'Loading…'}
    </Modal>
  );
}

function TemplatesTab({ readOnly, toast }: { readOnly: boolean; toast: any }) {
  const { data, isLoading } = useLetterTemplates();
  const create = useCreateLetterTemplate();
  const remove = useDeleteLetterTemplate();
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('offer');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(
    `Dear {{employee.firstName}},\n\nWe are pleased to confirm your employment as of {{employee.joiningDate}}.\n\nRegards,\nHR`,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const templates = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.kind.toLowerCase().includes(q) ||
        (t.subject ?? '').toLowerCase().includes(q))
    : templates;

  return (
    <>
      {!readOnly && (
        <div className="mb-3"><Button onClick={() => setShow(true)}><Plus className="h-4 w-4 mr-1" />New template</Button></div>
      )}
      {templates.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name, kind or subject…"
          count={filtered.length}
          noun="template"
        />
      )}
      {isLoading ? <div className="text-sm text-slate-500">Loading…</div>
        : templates.length === 0 ? <EmptyState icon={<FileText className="h-10 w-10" />} title="No templates" />
        : (
        <Table>
          <TableHeader><TableRow><Th>Name</Th><Th>Kind</Th><Th>Subject</Th><Th></Th></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4}><EmptyState icon={<FileText className="h-10 w-10" />} title="No templates match" description="Try a different search term." /></td></tr>
            ) : filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.kind}</TableCell>
                <TableCell className="text-sm">{t.subject ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {!readOnly && <Button size="sm" variant="outline" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={show} onClose={() => setShow(false)} title="New template" size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, kind, subject: subject || undefined, body }, {
            onSuccess: () => { setShow(false); setName(''); setSubject(''); toast('Template saved', 'success'); },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">Kind</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}
                options={KIND_OPTIONS.map((k) => ({ value: k, label: k.replace('_', ' ') }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Subject (supports tokens)</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Offer of employment — {{employee.fullName}}" />
          </div>
          <div>
            <label className="text-sm font-medium">Body</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-sm" />
            <p className="text-xs text-slate-500 mt-1">
              Tokens: <code>{'{{employee.firstName}}'}</code>, <code>{'{{employee.fullName}}'}</code>,
              <code>{'{{employee.employeeCode}}'}</code>, <code>{'{{employee.joiningDate}}'}</code>,
              <code>{'{{employee.ctcAnnual}}'}</code>, <code>{'{{date.today}}'}</code>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShow(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !name || !body}>{create.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

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
        description="This will remove the template permanently."
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  );
}
