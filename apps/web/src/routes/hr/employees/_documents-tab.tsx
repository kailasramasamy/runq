import { useRef, useState } from 'react';
import {
  Upload, Trash2, Eye, Download, FileText, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { useToast } from '@/components/ui';
import type { DocumentAttachment, EmployeeDocumentKind } from '@runq/types';
import {
  useEmployeeDocuments, useUploadEmployeeDocument, useDeleteEmployeeDocument,
  documentDownloadUrl,
} from '@/hooks/queries/use-employee-documents';

/** Doc kind metadata — label, section grouping, single vs multi expected. */
const KIND_META: Record<EmployeeDocumentKind, { label: string; section: 'identity' | 'employment' | 'other' }> = {
  aadhaar: { label: 'Aadhaar', section: 'identity' },
  pan: { label: 'PAN', section: 'identity' },
  passport: { label: 'Passport', section: 'identity' },
  driving_license: { label: 'Driving Licence', section: 'identity' },
  voter_id: { label: 'Voter ID', section: 'identity' },
  address_proof: { label: 'Address Proof', section: 'identity' },
  bank_passbook: { label: 'Bank Passbook / Cancelled Cheque', section: 'identity' },
  photo_id_card: { label: 'Photo ID Card', section: 'identity' },
  offer_letter: { label: 'Offer Letter', section: 'employment' },
  employment_contract: { label: 'Employment Contract', section: 'employment' },
  educational_certificate: { label: 'Educational Certificate', section: 'employment' },
  experience_letter: { label: 'Experience Letter', section: 'employment' },
  relieving_letter: { label: 'Relieving Letter', section: 'employment' },
  appraisal_letter: { label: 'Appraisal Letter', section: 'employment' },
  other: { label: 'Other', section: 'other' },
};

const IDENTITY_KINDS: EmployeeDocumentKind[] = [
  'aadhaar', 'pan', 'passport', 'driving_license', 'voter_id',
  'address_proof', 'bank_passbook', 'photo_id_card',
];

const EMPLOYMENT_KINDS: EmployeeDocumentKind[] = [
  'offer_letter', 'employment_contract', 'educational_certificate',
  'experience_letter', 'relieving_letter', 'appraisal_letter',
];

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useEmployeeDocuments(employeeId);
  const docs = data ?? [];
  const byKind = new Map<string, DocumentAttachment[]>();
  for (const d of docs) {
    const k = d.documentKind ?? 'other';
    const arr = byKind.get(k) ?? [];
    arr.push(d);
    byKind.set(k, arr);
  }

  if (isLoading) {
    return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Loading documents…</div>;
  }

  const otherDocs = byKind.get('other') ?? [];

  return (
    <div className="space-y-6">
      <DocsSection
        title="Identity & Address"
        kinds={IDENTITY_KINDS}
        byKind={byKind}
        employeeId={employeeId}
      />
      <DocsSection
        title="Employment Documents"
        kinds={EMPLOYMENT_KINDS}
        byKind={byKind}
        employeeId={employeeId}
      />
      <OtherDocsSection
        employeeId={employeeId}
        docs={otherDocs}
      />
    </div>
  );
}

function DocsSection({
  title, kinds, byKind, employeeId,
}: {
  title: string;
  kinds: EmployeeDocumentKind[];
  byKind: Map<string, DocumentAttachment[]>;
  employeeId: string;
}) {
  return (
    <section>
      <div
        className="mb-2.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kinds.map((kind) => (
          <KindCard
            key={kind}
            kind={kind}
            employeeId={employeeId}
            docs={byKind.get(kind) ?? []}
          />
        ))}
      </div>
    </section>
  );
}

function KindCard({
  kind, employeeId, docs,
}: {
  kind: EmployeeDocumentKind;
  employeeId: string;
  docs: DocumentAttachment[];
}) {
  const meta = KIND_META[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadEmployeeDocument(employeeId);
  const remove = useDeleteEmployeeDocument(employeeId);
  const { toast } = useToast();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    upload.mutate({ file, kind }, {
      onSuccess: () => toast(`${meta.label} uploaded`, 'success'),
      onError: (err: any) => toast(err?.message ?? 'Upload failed', 'error'),
    });
    e.target.value = '';
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return;
    remove.mutate(id, {
      onSuccess: () => toast('Document removed', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Delete failed', 'error'),
    });
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
          {meta.label}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[color:var(--surface-2)]"
          style={{ color: 'var(--accent-text)' }}
        >
          {upload.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {docs.length > 0 ? 'Add' : 'Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {docs.length === 0 ? (
        <div className="rounded-md border border-dashed py-3 text-center text-[11px]"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}>
          No file uploaded
        </div>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} onDelete={() => handleDelete(d.id)} deleting={remove.isPending} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocRow({
  doc, onDelete, deleting,
}: {
  doc: DocumentAttachment;
  onDelete: () => void;
  deleting: boolean;
}) {
  const isImage = doc.mimeType.startsWith('image/');
  const Icon = isImage ? ImageIcon : FileText;

  // Download/view via the API endpoint. Since the route requires a bearer
  // token in headers, we can't just put the URL in an <a href> — fetch as a
  // blob and trigger a download or open in a new tab.
  async function open(action: 'view' | 'download') {
    const token = localStorage.getItem('runq-token');
    const res = await fetch(documentDownloadUrl(doc.id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (action === 'view') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-[color:var(--surface-2)]"
      style={{ color: 'var(--text-1)' }}>
      <Icon size={14} style={{ color: 'var(--text-3)' }} />
      <span className="min-w-0 flex-1 truncate" title={doc.fileName}>{doc.fileName}</span>
      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{bytes(doc.fileSize)}</span>
      <button type="button" onClick={() => open('view')} title="View" className="rounded p-0.5 hover:bg-[color:var(--surface-2)]" style={{ color: 'var(--text-2)' }}>
        <Eye size={13} />
      </button>
      <button type="button" onClick={() => open('download')} title="Download" className="rounded p-0.5 hover:bg-[color:var(--surface-2)]" style={{ color: 'var(--text-2)' }}>
        <Download size={13} />
      </button>
      <button type="button" onClick={onDelete} disabled={deleting} title="Delete" className="rounded p-0.5 hover:bg-[color:var(--surface-2)]" style={{ color: 'var(--neg)' }}>
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function OtherDocsSection({
  employeeId, docs,
}: {
  employeeId: string;
  docs: DocumentAttachment[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadEmployeeDocument(employeeId);
  const remove = useDeleteEmployeeDocument(employeeId);
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    upload.mutate({ file, kind: 'other' }, {
      onSuccess: () => toast('Document uploaded', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Upload failed', 'error'),
    });
  }

  return (
    <section>
      <div
        className="mb-2.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-3)' }}
      >
        Other Documents
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
        }}
        className="rounded-xl border-2 border-dashed p-4 transition-colors"
        style={{
          borderColor: dragOver ? 'var(--accent)' : 'var(--border-soft)',
          background: dragOver ? 'var(--accent-soft)' : 'transparent',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
            Drop a file here, or
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="ml-1 font-semibold underline"
              style={{ color: 'var(--accent-text)' }}
            >
              browse
            </button>
            <span className="ml-1" style={{ color: 'var(--text-3)' }}>
              · PDF, PNG, JPG, WEBP · 10 MB max
            </span>
          </div>
          {upload.isPending && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {docs.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
            {docs.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                onDelete={() => {
                  if (!confirm('Delete this document?')) return;
                  remove.mutate(d.id, {
                    onSuccess: () => toast('Document removed', 'success'),
                    onError: (err: any) => toast(err?.message ?? 'Delete failed', 'error'),
                  });
                }}
                deleting={remove.isPending}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
