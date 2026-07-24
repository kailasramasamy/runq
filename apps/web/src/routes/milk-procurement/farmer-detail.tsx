import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ApiClientError } from '@/lib/api-client';
import {
  PageHeader, Card, CardContent, Button, Badge, Input, useToast,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import { useFarmer, useNode, useUpdateFarmer } from '@/hooks/queries/use-milk-procurement';
import { FarmerPhotoUpload } from '@/components/milk-procurement/farmer-photo-upload';
import { RateChartAssignmentsCard } from './_rate-chart-assignments-card';
import { SELECTABLE_MILK_TYPES } from './_node-shared';
import {
  Section, SocietyToggle, IdentityFields, HerdFields, PaymentFields,
  initForm, formToPayload, type FarmerFormState,
} from './_farmer-form';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'payment', label: 'Payment' },
  { id: 'photo', label: 'Photo' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function MpFarmerDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useFarmer(id);
  const farmer = data?.data ?? null;
  // The farmer's primary VMCC bounds which milk types they can supply.
  const { data: nodeData } = useNode(farmer?.primaryNodeId ?? '');
  const allowedTypes = nodeData?.data?.allowedMilkTypes ?? [];
  const update = useUpdateFarmer();

  const [tab, setTab] = useState<TabId>('details');
  // Seed the editable form once the farmer loads. Later background refetches
  // (e.g. after a rate-chart save invalidates the list) must not clobber edits.
  const [f, setF] = useState<FarmerFormState | null>(null);
  useEffect(() => {
    if (farmer && !f) setF(initForm(farmer));
  }, [farmer, f]);

  if (isLoading || !f) return <PageHeader title={isLoading ? 'Loading…' : 'Farmer not found'} fullWidth />;
  if (!farmer) return <PageHeader title="Farmer not found" fullWidth />;

  const patch = (p: Partial<FarmerFormState>) => setF((prev) => (prev ? { ...prev, ...p } : prev));
  const hasAadhaarError = f.aadhaar !== '' && !/^\d{12}$/.test(f.aadhaar);

  const save = () => {
    if (hasAadhaarError || !f.name || f.suppliedMilkTypes.length === 0) return;
    update.mutate(
      { id: farmer.id, data: formToPayload(f) },
      {
        onSuccess: () => toast('Farmer saved', 'success'),
        onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Failed to save farmer', 'error'),
      },
    );
  };

  // Pricing and Photo tabs persist through their own instant-save widgets, so the
  // header Save applies only to the text form (Details + Payment).
  const showSave = tab === 'details' || tab === 'payment';

  return (
    <div>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/milk-procurement/farmers' })}>
          <ArrowLeft className="h-4 w-4" />Back to farmers
        </Button>
      </div>

      <PageHeader
        title={farmer.name}
        titleBadge={
          <div className="flex items-center gap-2">
            <Badge>{farmer.code}</Badge>
            {farmer.isSociety && <Badge>Society</Badge>}
            {farmer.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}
          </div>
        }
        fullWidth
        actions={
          showSave ? (
            <Button onClick={save} loading={update.isPending} disabled={!f.name || hasAadhaarError || f.suppliedMilkTypes.length === 0}>Save</Button>
          ) : undefined
        }
      />

      <Tabs active={tab} onChange={setTab} tabs={TABS as unknown as { id: TabId; label: string }[]} />

      {tab === 'details' && (
        <Card>
          <CardContent className="space-y-6 py-6">
            <Section title="Basics">
              <Input label="Name" value={f.name} onChange={(e) => patch({ name: e.target.value })} required />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Farmer code" value={farmer.code} disabled />
                <Input label="Phone" value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />
              </div>
              <SocietyToggle checked={f.isSociety} onChange={(v) => patch({ isSociety: v })} />
            </Section>

            <IdentityFields f={f} setF={patch} />
            <HerdFields f={f} setF={patch} allowedTypes={allowedTypes} />

            {farmer.lat != null && farmer.lng != null && (
              <Section title="Location (GPS)" hint="Captured by the app">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Latitude" value={String(farmer.lat)} disabled />
                  <Input label="Longitude" value={String(farmer.lng)} disabled />
                </div>
              </Section>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'pricing' && (
        <RateChartAssignmentsCard
          scopeType="farmer"
          scopeId={farmer.id}
          milkTypes={f.suppliedMilkTypes.length > 0 ? f.suppliedMilkTypes : SELECTABLE_MILK_TYPES}
          title="Rate charts"
          subtitle="Set a chart per milk type only when this farmer is priced differently from their VMCC — e.g. a flat A1 rate alongside the VMCC's matrix chart. Leave a slot inheriting to follow the VMCC, then the CC, then the tenant default. Changes save instantly."
        />
      )}

      {tab === 'payment' && (
        <Card>
          <CardContent className="py-6">
            <PaymentFields f={f} setF={patch} />
          </CardContent>
        </Card>
      )}

      {tab === 'photo' && (
        <Card>
          <CardContent className="py-6">
            <Section title="Profile photo">
              <FarmerPhotoUpload farmerId={farmer.id} currentPhotoUrl={farmer.profilePhotoUrl} />
            </Section>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
