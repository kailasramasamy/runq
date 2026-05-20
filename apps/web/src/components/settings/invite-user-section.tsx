import { useState } from 'react';
import { Plus, Mail, Copy, Check, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Select,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableEmpty,
  ConfirmationDialog,
  useToast,
} from '@/components/ui';
import {
  useInvites,
  useCreateInvite,
  useRevokeInvite,
  inviteLinkFor,
  type Invite,
  type InviteRole,
  type InviteStatus,
} from '@/hooks/queries/use-invites';
import { INVITE_ROLE_OPTIONS } from './roles';

function errMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'message' in err
    ? String((err as { message: unknown }).message)
    : fallback;
}

function StatusPill({ status }: { status: InviteStatus }) {
  const variant = status === 'accepted' ? 'success' : status === 'pending' ? 'info' : 'default';
  const label = status === 'accepted' ? 'Accepted' : status === 'pending' ? 'Pending' : 'Expired';
  return <Badge variant={variant}>{label}</Badge>;
}

function InviteRow({
  invite,
  copied,
  onCopy,
  onRevoke,
}: {
  invite: Invite;
  copied: boolean;
  onCopy: (token: string) => void;
  onRevoke: (id: string) => void;
}) {
  const mailHref = invite.email
    ? `mailto:${invite.email}?subject=runQ%20invite&body=${encodeURIComponent(
        `Hi,\n\nUse this link to join my runQ books:\n${inviteLinkFor(invite.token)}\n\n` +
          `The link expires on ${new Date(invite.expiresAt).toLocaleDateString()}.\n`,
      )}`
    : undefined;

  return (
    <TableRow>
      <TableCell>
        <div className="text-sm text-zinc-900 dark:text-zinc-100">
          {invite.email ?? <span className="text-zinc-400">No email</span>}
        </div>
        {invite.note && <div className="truncate text-xs text-zinc-500">{invite.note}</div>}
      </TableCell>
      <TableCell>
        <span className="text-xs uppercase text-zinc-600 dark:text-zinc-400">{invite.role}</span>
      </TableCell>
      <TableCell>
        <StatusPill status={invite.status} />
      </TableCell>
      <TableCell className="text-xs text-zinc-500">
        {new Date(invite.expiresAt).toLocaleDateString()}
      </TableCell>
      <TableCell align="right">
        <div className="flex items-center justify-end gap-2">
          {invite.status === 'pending' && (
            <button
              type="button"
              onClick={() => onCopy(invite.token)}
              className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              title="Copy invite link"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          )}
          {invite.status === 'pending' && mailHref && (
            <a
              href={mailHref}
              className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              title={`Email ${invite.email}`}
            >
              <Mail size={12} />
              Email
            </a>
          )}
          {invite.status !== 'accepted' && (
            <button
              type="button"
              onClick={() => onRevoke(invite.id)}
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
  );
}

// Section 2 of the Users page — invite someone by email. They click the link
// and set their own password; used for an external CA or a collaborator.
export function InviteUserSection() {
  const { toast } = useToast();
  const { data, isLoading } = useInvites();
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('accountant');
  const [note, setNote] = useState('');
  const [autoEmail, setAutoEmail] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Only join_tenant invites belong here — new_tenant lives on the Invitations
  // page, since that onboards a brand-new client tenant, not a user.
  const invites = (data?.data ?? []).filter((i) => i.inviteType === 'join_tenant');

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLinkFor(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      /* clipboard denied — the row still shows a copy button to retry */
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await createInvite.mutateAsync({
        inviteType: 'join_tenant',
        role,
        email: email.trim() || undefined,
        note: note.trim() || undefined,
        sendEmail: autoEmail && !!email.trim() ? true : undefined,
      });
      setEmail('');
      setNote('');
      const delivery = res.data.emailDelivery;
      toast(
        delivery === 'sent'
          ? `Invite sent to ${res.data.email}`
          : delivery === 'failed'
            ? 'Invite created — email failed; copy the link below'
            : 'Invite link created',
        delivery === 'failed' ? 'error' : 'success',
      );
      await copyLink(res.data.token);
    } catch (err: unknown) {
      toast(errMessage(err, 'Failed to create invite'), 'error');
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeInvite.mutateAsync(id);
      toast('Invite revoked', 'success');
    } catch (err: unknown) {
      toast(errMessage(err, 'Failed to revoke invite'), 'error');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card className="mb-4">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Invite a User
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Send an email invite link — the person sets their own password. Use this for an
              external CA or a collaborator.
            </p>
          </div>
          {!open && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={14} />
              Invite
            </Button>
          )}
        </div>

        {open && (
          <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="priya@sharma-ca.in"
            />
            <Select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
              options={INVITE_ROLE_OPTIONS}
            />
            <div className="sm:col-span-2">
              <Input
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. GST filing access"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 sm:col-span-2">
              <input
                type="checkbox"
                checked={autoEmail}
                onChange={(e) => setAutoEmail(e.target.checked)}
                disabled={!email.trim()}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              Email the invite link to this address{!email.trim() ? ' (enter an email first)' : ''}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:col-span-2">
              <Button type="submit" loading={createInvite.isPending} size="sm">
                <Plus size={14} />
                Generate invite link
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {(isLoading || invites.length > 0) && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Pending & past invites
            </p>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Sent to</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Expires</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableEmpty colSpan={5} message="Loading invites…" />
                  ) : (
                    invites.map((inv) => (
                      <InviteRow
                        key={inv.id}
                        invite={inv}
                        copied={copiedToken === inv.token}
                        onCopy={copyLink}
                        onRevoke={setRevokingId}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmationDialog
        open={!!revokingId}
        onClose={() => setRevokingId(null)}
        onConfirm={() => revokingId && handleRevoke(revokingId)}
        title="Revoke this invite?"
        description="The link stops working immediately. If it was already accepted, existing access is unaffected."
        confirmLabel="Revoke"
        variant="danger"
        loading={revokeInvite.isPending}
      />
    </Card>
  );
}
