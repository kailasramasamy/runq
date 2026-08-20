import { Badge, useToast } from '@/components/ui';
import { useSetMpAppAccess, type MpAppAccessRow } from '@/hooks/queries/use-milk-procurement';

/**
 * Per-user Dhenu (milk procurement) mobile-app access.
 *
 * App sign-in resolves a phone against `mp_credentials`, a table only ever
 * written as a side effect of creating a farmer or an operator — so a tenant
 * owner was told "No Dhenu account for this phone" no matter how privileged
 * their web account was. This checkbox is the grant that fixes that.
 *
 * Farmers and operators are not shown as toggleable: their credential comes
 * from their own record, and revoking it here would contradict it.
 */
export function DhenuAccessCell({ row }: { row?: MpAppAccessRow }) {
  const set = useSetMpAppAccess();
  const { toast } = useToast();

  if (!row) return <span className="text-xs text-zinc-400">—</span>;

  // Already an app user through their farmer/operator record — state, not a switch.
  if (row.credentialRole && row.credentialRole !== 'admin') {
    return <Badge variant="default">{row.credentialRole.replace('_', ' ')}</Badge>;
  }
  if (!row.grantable) {
    return (
      <span className="text-xs text-zinc-400" title="Only owners and accountants can operate centres from the app">
        —
      </span>
    );
  }
  // Phone is the login handle: there is nothing to key a credential on without one.
  if (!row.phone) {
    return (
      <span className="text-xs text-zinc-400" title="Add a phone number for this user first — it is their Dhenu login">
        No phone
      </span>
    );
  }

  async function toggle(granted: boolean) {
    if (!row) return;
    try {
      await set.mutateAsync({ userId: row.userId, granted });
      toast(granted ? `${row.name} can now sign in to Dhenu` : `Dhenu access removed for ${row.name}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update Dhenu access', 'error');
    }
  }

  return (
    <label className={`flex items-center gap-2 ${set.isPending ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="rounded border-zinc-300"
        checked={row.granted}
        disabled={set.isPending}
        onChange={(e) => toggle(e.target.checked)}
      />
      <span className="text-xs text-zinc-500">{row.granted ? 'Allowed' : 'Off'}</span>
    </label>
  );
}
