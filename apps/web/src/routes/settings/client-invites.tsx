import { useEffect, useState, useCallback } from 'react';
import { Copy, Mail, Plus, Check, UserPlus, Briefcase, Trash2, RefreshCw } from 'lucide-react';
import {
  Button, Card, CardContent, PageHeader, Input, Select, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, ConfirmationDialog,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { api } from '@/lib/api-client';

type InviteType = 'new_tenant' | 'join_tenant';
type InviteRole = 'accountant' | 'viewer';
type InviteStatus = 'pending' | 'accepted' | 'expired';

interface Invite {
  id: string;
  token: string;
  inviteType: InviteType;
  role: InviteRole;
  email: string | null;
  companyName: string | null;
  note: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitingUserName: string;
  status: InviteStatus;
}

interface CreateInviteResponse {
  data: {
    token: string;
    inviteType: InviteType;
    role: InviteRole;
    expiresAt: string;
    email: string | null;
    companyName: string | null;
    note: string | null;
    emailDelivery?: 'sent' | 'failed' | 'skipped';
  };
}

function inviteLinkFor(token: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/signup/invite/${token}`;
}

const FLOW_DESCRIPTIONS: Record<InviteType, { title: string; description: string; icon: typeof Briefcase }> = {
  new_tenant: {
    title: 'Bring a new client onto runQ',
    description: 'Generate a link for a prospect. They sign up, runQ creates their books, and you join as their accountant.',
    icon: Briefcase,
  },
  join_tenant: {
    title: 'Invite my CA (or a teammate) to my books',
    description: 'Generate a link for someone to join your existing tenant. They get access at the role you choose.',
    icon: UserPlus,
  },
};

export function ClientInvitesPage() {
  const { toast } = useToast();
  const [inviteType, setInviteType] = useState<InviteType | null>(null);
  const [role, setRole] = useState<InviteRole>('accountant');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [note, setNote] = useState('');
  const [autoEmail, setAutoEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Persisted invite list
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const refetch = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get<{ data: Invite[] }>('/auth/invites');
      setInvites(res.data);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to load invites';
      toast(msg, 'error');
    } finally {
      setListLoading(false);
    }
  }, [toast]);

  useEffect(() => { refetch(); }, [refetch]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteType) return;
    setLoading(true);
    try {
      const body: { inviteType: InviteType; role?: InviteRole; email?: string; companyName?: string; note?: string; sendEmail?: boolean } = { inviteType };
      if (inviteType === 'join_tenant') body.role = role;
      if (email.trim()) body.email = email.trim();
      if (inviteType === 'new_tenant' && companyName.trim()) body.companyName = companyName.trim();
      if (note.trim()) body.note = note.trim();
      if (autoEmail && email.trim()) body.sendEmail = true;
      const res = await api.post<CreateInviteResponse>('/auth/invites', body);
      setEmail('');
      setCompanyName('');
      setNote('');
      const delivery = res.data.emailDelivery;
      const msg = delivery === 'sent'
        ? `Invite sent to ${res.data.email}`
        : delivery === 'failed'
          ? 'Invite created — email delivery failed; copy the link manually'
          : 'Invite created';
      toast(msg, delivery === 'failed' ? 'error' : 'success');
      // Auto-copy the new link to clipboard so the user can paste it into wherever
      try {
        await navigator.clipboard.writeText(inviteLinkFor(res.data.token));
        setCopiedToken(res.data.token);
        setTimeout(() => setCopiedToken(null), 2000);
      } catch { /* clipboard may be denied; row still has copy button */ }
      await refetch();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to create invite';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(inviteLinkFor(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  async function handleRevoke(id: string) {
    try {
      await api.delete(`/auth/invites/${id}`);
      toast('Invite revoked', 'success');
      setRevokingId(null);
      await refetch();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to revoke invite';
      toast(msg, 'error');
    }
  }

  const flow = inviteType ? FLOW_DESCRIPTIONS[inviteType] : null;
  const FlowIcon = flow?.icon;

  return (
    <div>
      <PageHeader
        title="Invitations"
        description="Generate one-time links to invite a CA into your books, or onboard a new client."
      />

      {/* Flow picker */}
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['join_tenant', 'new_tenant'] as InviteType[]).map((t) => {
          const f = FLOW_DESCRIPTIONS[t];
          const Icon = f.icon;
          const active = inviteType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setInviteType(t)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                active
                  ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/30'
                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon size={16} className={active ? 'text-indigo-500' : 'text-zinc-500'} />
                <span className="text-sm font-medium">{f.title}</span>
              </div>
              <p className="text-xs text-zinc-500">{f.description}</p>
            </button>
          );
        })}
      </div>

      {/* Create form — only shown after a flow card is clicked */}
      {flow && FlowIcon && (
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <FlowIcon size={16} />
            {flow.title}
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            {inviteType === 'join_tenant' && (
              <div>
                <label className="mb-1 block text-sm font-medium">Their role in your tenant</label>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value as InviteRole)}
                  options={[
                    { value: 'accountant', label: 'Accountant — read & write' },
                    { value: 'viewer', label: 'Viewer — read only' },
                  ]}
                />
              </div>
            )}
            {inviteType === 'new_tenant' && (
              <div>
                <label className="mb-1 block text-sm font-medium">Client's company name</label>
                <Input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Pvt Ltd"
                  maxLength={255}
                />
                <p className="mt-1 text-xs text-zinc-500">Pre-fills the signup form so your client doesn't have to retype it.</p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">
                {inviteType === 'new_tenant' ? 'Client email (optional)' : 'CA email (optional)'}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={inviteType === 'new_tenant' ? 'rohit@acme.com' : 'priya@sharma-ca.in'}
              />
              <p className="mt-1 text-xs text-zinc-500">For your records, and used to send the invite if enabled below.</p>
              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={autoEmail}
                  onChange={(e) => setAutoEmail(e.target.checked)}
                  disabled={!email.trim()}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                Email the link to this address{!email.trim() ? ' (enter an email first)' : ''}
              </label>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Note (optional)</label>
              <Input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={inviteType === 'new_tenant' ? 'Acme Pvt Ltd onboarding' : 'GST filing access'}
                maxLength={500}
              />
            </div>
            <Button type="submit" variant="primary" loading={loading}>
              <Plus size={16} />
              Generate invite link
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      {/* Existing invites */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sent invitations</h2>
          <Button size="sm" variant="outline" onClick={refetch} loading={listLoading}>
            <RefreshCw size={13} />
            Refresh
          </Button>
        </div>

        <Card>
          {(invites ?? []).length === 0 && !listLoading ? (
            <CardContent>
              <div className="py-6 text-center text-sm text-zinc-500">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">No invitations yet</p>
                <p className="mt-1 text-xs">Generate a link above to bring a CA into your books or onboard a new client.</p>
              </div>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Type</Th>
                  <Th>Sent to</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Expires</Th>
                  <Th>Actions</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invites ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {inv.inviteType === 'new_tenant' ? <Briefcase size={12} /> : <UserPlus size={12} />}
                        {inv.inviteType === 'new_tenant' ? 'New client' : 'Join my books'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {inv.companyName ? <span className="font-medium">{inv.companyName}</span> : null}
                        {inv.companyName && inv.email ? <span className="text-zinc-400"> · </span> : null}
                        {inv.email ?? (inv.companyName ? null : <span className="text-zinc-400">—</span>)}
                      </div>
                      {inv.note && <div className="truncate text-xs text-zinc-500">{inv.note}</div>}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs uppercase">{inv.role}</span>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={inv.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-zinc-500">{new Date(inv.expiresAt).toLocaleDateString()}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {inv.status === 'pending' && (
                          <button
                            onClick={() => handleCopy(inv.token)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            title="Copy invite link"
                          >
                            {copiedToken === inv.token ? <Check size={12} /> : <Copy size={12} />}
                            {copiedToken === inv.token ? 'Copied' : 'Copy link'}
                          </button>
                        )}
                        {inv.status === 'pending' && inv.email && (
                          <a
                            href={`mailto:${inv.email}?subject=runQ%20invite&body=${encodeURIComponent(`Hi,\n\nUse this link to ${inv.inviteType === 'new_tenant' ? 'sign up for runQ' : 'join my runQ books'}:\n${inviteLinkFor(inv.token)}\n\nThe link expires on ${new Date(inv.expiresAt).toLocaleDateString()}.\n`)}`}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            title={`Email ${inv.email}`}
                          >
                            <Mail size={12} />
                            Email
                          </a>
                        )}
                        {inv.status !== 'accepted' && (
                          <button
                            onClick={() => setRevokingId(inv.id)}
                            className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                            title="Revoke this invite"
                          >
                            <Trash2 size={12} />
                            Revoke
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {revokingId && (
        <ConfirmationDialog
          open
          onClose={() => setRevokingId(null)}
          onConfirm={() => handleRevoke(revokingId)}
          title="Revoke this invite?"
          description="The link will stop working immediately. Anyone holding it will see an error. If the invite was already accepted, the existing access is unaffected."
          confirmLabel="Revoke"
          variant="danger"
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: InviteStatus }) {
  const variant: Parameters<typeof Badge>[0]['variant'] =
    status === 'accepted' ? 'success' : status === 'pending' ? 'info' : 'default';
  const label = status === 'accepted' ? 'Accepted' : status === 'pending' ? 'Pending' : 'Expired';
  return <Badge variant={variant}>{label}</Badge>;
}
