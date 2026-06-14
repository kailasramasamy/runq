import { useState, useEffect } from 'react';
import { PageHeader, Card, CardContent, CardHeader, Button, Combobox, useToast } from '@/components/ui';
import { useGlSettings, useUpsertGlSettings } from '@/hooks/queries/use-milk-procurement';

const PAYOUT_MODES = [
  { value: 'direct_to_farmer', label: 'Direct to farmer' },
  { value: 'via_vmcc', label: 'Via VMCC (society redistributes)' },
];

export function MpSettingsPage() {
  const { data } = useGlSettings();
  const upsert = useUpsertGlSettings();
  const { toast } = useToast();
  const [mode, setMode] = useState('direct_to_farmer');

  useEffect(() => {
    if (data?.data?.defaultPayoutMode) setMode(data.data.defaultPayoutMode);
  }, [data]);

  const save = () => {
    upsert.mutate(
      { defaultPayoutMode: mode as 'direct_to_farmer' | 'via_vmcc' },
      { onSuccess: () => toast('Settings saved', 'success'), onError: () => toast('Failed to save', 'error') },
    );
  };

  return (
    <div>
      <PageHeader title="Settings" description="Tenant-level milk-procurement configuration." fullWidth />
      <Card className="max-w-xl">
        <CardHeader>Payout</CardHeader>
        <CardContent className="space-y-3">
          <Combobox label="Default payout mode" value={mode} onChange={setMode} options={PAYOUT_MODES} />
          <p className="text-xs text-zinc-500">
            Overridable per VMCC. GL account mapping & journal posting are pending the chart-of-accounts sign-off.
          </p>
          <Button onClick={save} loading={upsert.isPending}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}
