import { useState, useEffect } from 'react';
import { PageHeader, Card, CardContent, CardHeader, Button, Input, Combobox, useToast } from '@/components/ui';
import {
  useGlSettings, useUpsertGlSettings, useNodes, useUpdateNode,
  useRawMilkItems, useUpsertRawMilkItems,
  type MpGlSettings, type MpNode, type MpMilkType,
} from '@/hooks/queries/use-milk-procurement';
import { useItems } from '@/hooks/queries/use-items';
import { useWarehouses } from '@/hooks/queries/use-inventory';

const PAYOUT_MODES = [
  { value: 'direct_to_farmer', label: 'Direct to farmer' },
  { value: 'via_vmcc', label: 'Via VMCC (society redistributes)' },
];
// Per-VMCC override: blank value falls back to the tenant default above.
const VMCC_PAYOUT_MODES = [{ value: '', label: 'Use tenant default' }, ...PAYOUT_MODES];
const CYCLE_LENGTHS = [
  { value: '10', label: '10 days' },
  { value: '15', label: '15 days' },
  { value: '7', label: 'Weekly (7 days)' },
  { value: '30', label: 'Monthly (30 days)' },
];
const AUTO_MODES = [
  { value: 'off', label: 'Manual — generate cycles myself' },
  { value: 'on', label: 'Auto — generate each cycle when its period closes' },
];
const MILK_TYPES: { value: MpMilkType; label: string }[] = [
  { value: 'cow_a1', label: 'Cow (A1 / crossbred)' },
  { value: 'cow_a2', label: 'Cow (A2 / desi)' },
  { value: 'buffalo', label: 'Buffalo' },
  { value: 'mixed', label: 'Mixed / unsegregated' },
  { value: 'cow', label: 'Cow (legacy)' },
];

export function MpSettingsPage() {
  const { data } = useGlSettings();
  return (
    <div>
      <PageHeader title="Settings" description="Tenant-level milk-procurement configuration." fullWidth />
      <div className="grid max-w-xl gap-4">
        <PayoutCard settings={data?.data ?? null} />
        <VmccPayoutOverridesCard />
        <CycleCard settings={data?.data ?? null} />
        <RawMilkInventoryCard settings={data?.data ?? null} />
        <SupportCard settings={data?.data ?? null} />
      </div>
    </div>
  );
}

function PayoutCard({ settings }: { settings: MpGlSettings | null }) {
  const upsert = useUpsertGlSettings();
  const { toast } = useToast();
  const [mode, setMode] = useState('direct_to_farmer');
  useEffect(() => { if (settings?.defaultPayoutMode) setMode(settings.defaultPayoutMode); }, [settings]);

  const save = () => upsert.mutate(
    { defaultPayoutMode: mode as 'direct_to_farmer' | 'via_vmcc' },
    { onSuccess: () => toast('Settings saved', 'success'), onError: () => toast('Failed to save', 'error') },
  );

  return (
    <Card>
      <CardHeader>Payout</CardHeader>
      <CardContent className="space-y-3">
        <Combobox label="Default payout mode" value={mode} onChange={setMode} options={PAYOUT_MODES} />
        <p className="text-xs text-zinc-500">
          Overridable per VMCC. GL account mapping & journal posting are pending the chart-of-accounts sign-off.
        </p>
        <Button onClick={save} loading={upsert.isPending}>Save</Button>
      </CardContent>
    </Card>
  );
}

function VmccPayoutOverridesCard() {
  const { data } = useNodes({ nodeType: 'vmcc', limit: 200 });
  const vmccs = data?.data ?? [];
  return (
    <Card>
      <CardHeader>Who pays farmers (per VMCC)</CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-500">
          Per VMCC, choose whether the CC pays farmers directly or hands the bulk amount to the VMCC
          operator to redistribute. Left on default, the VMCC follows the tenant payout mode above.
        </p>
        {vmccs.length === 0 ? (
          <p className="text-sm text-zinc-500">No VMCCs yet.</p>
        ) : (
          vmccs.map((n) => <VmccPayoutRow key={n.id} node={n} />)
        )}
      </CardContent>
    </Card>
  );
}

function VmccPayoutRow({ node }: { node: MpNode }) {
  const update = useUpdateNode('vmcc');
  const { toast } = useToast();
  const [mode, setMode] = useState(node.payoutMode ?? '');
  useEffect(() => { setMode(node.payoutMode ?? ''); }, [node.payoutMode]);

  const onChange = (v: string) => {
    setMode(v);
    update.mutate(
      { id: node.id, data: { payoutMode: (v || null) as 'direct_to_farmer' | 'via_vmcc' | null } },
      { onSuccess: () => toast('Saved', 'success'), onError: () => toast('Failed to save', 'error') },
    );
  };

  return (
    <div className="grid grid-cols-2 items-center gap-2">
      <span className="text-sm">{node.name}</span>
      <Combobox value={mode} onChange={onChange} options={VMCC_PAYOUT_MODES} />
    </div>
  );
}

function CycleCard({ settings }: { settings: MpGlSettings | null }) {
  const upsert = useUpsertGlSettings();
  const { toast } = useToast();
  const [days, setDays] = useState('15');
  const [anchor, setAnchor] = useState('');
  const [auto, setAuto] = useState('off');

  useEffect(() => {
    if (!settings) return;
    if (settings.cycleDays) setDays(String(settings.cycleDays));
    if (settings.cycleAnchorDate) setAnchor(settings.cycleAnchorDate);
    setAuto(settings.autoGenerateCycle ? 'on' : 'off');
  }, [settings]);

  const save = () => {
    if (auto === 'on' && !anchor) { toast('Pick a cycle start date to auto-generate', 'error'); return; }
    upsert.mutate(
      { cycleDays: Number(days), cycleAnchorDate: anchor || null, autoGenerateCycle: auto === 'on' },
      { onSuccess: () => toast('Cycle settings saved', 'success'), onError: () => toast('Failed to save', 'error') },
    );
  };

  return (
    <Card>
      <CardHeader>Collection &amp; payout cycle</CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Combobox label="Cycle length" value={days} onChange={setDays} options={CYCLE_LENGTHS} />
          <Input label="Bill cycles from" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </div>
        <Combobox label="Generation" value={auto} onChange={setAuto} options={AUTO_MODES} />
        <p className="text-xs text-zinc-500">
          Cycles are calendar-aligned within each month — a 15-day cycle runs 1–15 and 16–end;
          a 10-day cycle runs 1–10, 11–20, 21–end. Cycles never cross months. Auto mode bills each
          cycle the morning after it closes, starting from the date above; you can still create one
          manually any time.
        </p>
        <Button onClick={save} loading={upsert.isPending}>Save</Button>
      </CardContent>
    </Card>
  );
}

function RawMilkInventoryCard({ settings }: { settings: MpGlSettings | null }) {
  const upsertGl = useUpsertGlSettings();
  const upsertItems = useUpsertRawMilkItems();
  const { toast } = useToast();
  const { data: whData } = useWarehouses();
  const { data: itemData } = useItems({ type: 'product', status: 'active', itemClassGroup: 'inputs', limit: 200 });
  const { data: mapData } = useRawMilkItems();

  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<Record<string, string>>({});

  useEffect(() => { setWarehouseId(settings?.rawMilkWarehouseId ?? ''); }, [settings]);
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const row of mapData?.data ?? []) m[row.milkType] = row.itemId;
    setItems(m);
  }, [mapData]);

  const whOptions = [{ value: '', label: '— none —' },
    ...(whData ?? []).map((w) => ({ value: w.id, label: w.name }))];
  const itemOptions = [{ value: '', label: '— not mapped —' },
    ...(itemData?.data ?? []).map((i) => ({ value: i.id, label: i.name }))];

  const save = async () => {
    const mappings = MILK_TYPES.filter((t) => items[t.value])
      .map((t) => ({ milkType: t.value, itemId: items[t.value]! }));
    try {
      await upsertGl.mutateAsync({ rawMilkWarehouseId: warehouseId || null });
      await upsertItems.mutateAsync(mappings);
      toast('Raw-milk inventory settings saved', 'success');
    } catch { toast('Failed to save', 'error'); }
  };

  return (
    <Card>
      <CardHeader>Raw-milk inventory</CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-500">
          When a tanker is received at a processing plant, Dhenu posts the milk into inventory so it
          feeds manufacturing. Pick the warehouse and the item per milk type; unmapped types are
          skipped. Valuation is zero for now — it's posted to the books at payout lock.
        </p>
        <Combobox label="Raw-milk warehouse" value={warehouseId} onChange={setWarehouseId} options={whOptions} />
        {MILK_TYPES.map((t) => (
          <Combobox key={t.value} label={t.label} value={items[t.value] ?? ''}
            onChange={(v) => setItems((p) => ({ ...p, [t.value]: v }))} options={itemOptions} />
        ))}
        <Button onClick={save} loading={upsertGl.isPending || upsertItems.isPending}>Save</Button>
      </CardContent>
    </Card>
  );
}

function SupportCard({ settings }: { settings: MpGlSettings | null }) {
  const upsert = useUpsertGlSettings();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    if (!settings) return;
    setPhone(settings.supportPhone ?? '');
    setEmail(settings.supportEmail ?? '');
    setWhatsapp(settings.supportWhatsapp ?? '');
  }, [settings]);

  const save = () => upsert.mutate(
    {
      supportPhone: phone.trim() || null,
      supportEmail: email.trim() || null,
      supportWhatsapp: whatsapp.trim() || null,
    },
    { onSuccess: () => toast('Support contacts saved', 'success'), onError: () => toast('Failed to save', 'error') },
  );

  return (
    <Card>
      <CardHeader>Support contacts</CardHeader>
      <CardContent className="space-y-3">
        <Input label="Support phone" type="tel" placeholder="+91 80000 00000"
          value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Support email" type="email" placeholder="support@yourdairy.in"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="WhatsApp number" type="tel" placeholder="918000000000 (digits only, with country code)"
          value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        <p className="text-xs text-zinc-500">
          Shown on the app's Help &amp; Support screen for every persona. Leave a field blank to fall back to
          the default Dhenu support desk. WhatsApp must be digits only with country code (e.g. 918000000000).
        </p>
        <Button onClick={save} loading={upsert.isPending}>Save</Button>
      </CardContent>
    </Card>
  );
}
