import { Input, Combobox } from '@/components/ui';
import { BreedCountEditor } from '@/components/milk-procurement/breed-count-editor';
import { type MilkType, type MpFarmer, type CattleBreedCount, milkTypeLabel } from '@/hooks/queries/use-milk-procurement';
import { SELECTABLE_MILK_TYPES } from './_node-shared';

// Shared farmer-form building blocks, used by both the create modal (farmers.tsx)
// and the detail page (farmer-detail.tsx) so the two stay in lockstep.

export function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-zinc-200 pb-1.5 dark:border-zinc-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h3>
        {hint && <span className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function SocietyToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      This is a society / sub-collector
    </label>
  );
}

// ── shared form state ─────────────────────────────────────────────────────────

export interface FarmerFormState {
  name: string; phone: string; isSociety: boolean;
  defaultMilkType: string; suppliedMilkTypes: MilkType[];
  village: string; address: string; aadhaar: string;
  cattleBreeds: CattleBreedCount[]; inMilkCount: string;
  bankAccountName: string; bankAccountNumber: string; bankIfsc: string; bankName: string; upiId: string;
}

export function initForm(f?: MpFarmer): FarmerFormState {
  // Legacy rows may lack the supplied list — fall back to the single default.
  const supplied = f?.suppliedMilkTypes?.length
    ? f.suppliedMilkTypes
    : (f?.defaultMilkType ? [f.defaultMilkType] : []);
  return {
    name: f?.name ?? '',
    phone: f?.phone ?? '',
    isSociety: f?.isSociety ?? false,
    defaultMilkType: f?.defaultMilkType ?? 'cow_a1',
    suppliedMilkTypes: supplied,
    village: f?.village ?? '',
    address: f?.address ?? '',
    aadhaar: f?.aadhaar ?? '',
    cattleBreeds: f?.cattleBreeds ?? [],
    inMilkCount: f?.inMilkCount != null ? String(f.inMilkCount) : '',
    bankAccountName: f?.bankAccountName ?? '',
    bankAccountNumber: f?.bankAccountNumber ?? '',
    bankIfsc: f?.bankIfsc ?? '',
    bankName: f?.bankName ?? '',
    upiId: f?.upiId ?? '',
  };
}

export function formToPayload(f: FarmerFormState) {
  const aadhaarValid = /^\d{12}$/.test(f.aadhaar);
  return {
    name: f.name,
    phone: f.phone || null,
    isSociety: f.isSociety,
    defaultMilkType: f.defaultMilkType as MilkType,
    suppliedMilkTypes: f.suppliedMilkTypes,
    village: f.village || null,
    address: f.address || null,
    aadhaar: aadhaarValid ? f.aadhaar : null,
    cattleBreeds: f.cattleBreeds.length > 0 ? f.cattleBreeds : null,
    inMilkCount: f.inMilkCount !== '' ? parseInt(f.inMilkCount) : null,
    bankAccountName: f.bankAccountName || null,
    bankAccountNumber: f.bankAccountNumber || null,
    bankIfsc: f.bankIfsc || null,
    bankName: f.bankName || null,
    upiId: f.upiId || null,
  };
}

export type FarmerSetF = (p: Partial<FarmerFormState>) => void;

// ── field sections ────────────────────────────────────────────────────────────

export function IdentityFields({ f, setF }: { f: FarmerFormState; setF: FarmerSetF }) {
  const aadhaarError = f.aadhaar && !/^\d{12}$/.test(f.aadhaar) ? 'Must be exactly 12 digits' : undefined;
  return (
    <Section title="Identity">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Village" value={f.village} onChange={(e) => setF({ village: e.target.value })} />
        <Input
          label="Aadhaar number"
          value={f.aadhaar}
          onChange={(e) => setF({ aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) })}
          placeholder="12-digit number"
          error={aadhaarError}
          maxLength={12}
        />
      </div>
      <Input label="Address" value={f.address} onChange={(e) => setF({ address: e.target.value })} />
    </Section>
  );
}

/**
 * Herd section. `allowedTypes` is the primary VMCC's accepted milk types — the
 * farmer can only supply a subset of them; when the VMCC accepts none explicitly
 * (legacy) we fall back to all selectable types. The primary type is the one
 * pre-selected at pour entry and must stay within the supplied set.
 */
export function HerdFields({ f, setF, allowedTypes }: {
  f: FarmerFormState; setF: FarmerSetF; allowedTypes: MilkType[];
}) {
  const options = allowedTypes.length > 0 ? allowedTypes : SELECTABLE_MILK_TYPES;
  const toggle = (t: MilkType) => {
    const next = f.suppliedMilkTypes.includes(t)
      ? f.suppliedMilkTypes.filter((x) => x !== t)
      : [...f.suppliedMilkTypes, t];
    const patch: Partial<FarmerFormState> = { suppliedMilkTypes: next };
    // Keep the primary type valid: if it's no longer supplied, retarget it.
    if (!next.includes(f.defaultMilkType as MilkType)) patch.defaultMilkType = next[0] ?? '';
    setF(patch);
  };
  const primaryOptions = (f.suppliedMilkTypes.length > 0 ? f.suppliedMilkTypes : options)
    .map((t) => ({ value: t, label: milkTypeLabel(t) }));

  return (
    <Section title="Herd">
      <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Milk types supplied</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {allowedTypes.length > 0 ? 'Limited to the types the VMCC accepts.' : 'Pick every type this farmer pours.'}
        </p>
        <div className="grid grid-cols-2 gap-1">
          {options.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={f.suppliedMilkTypes.includes(t)} onChange={() => toggle(t)} />
              {milkTypeLabel(t)}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Combobox label="Primary milk type" value={f.defaultMilkType} onChange={(v) => setF({ defaultMilkType: v })} options={primaryOptions} placeholder="Pick a supplied type" />
        <Input
          label="In-milk count"
          type="number"
          min={0}
          value={f.inMilkCount}
          onChange={(e) => setF({ inMilkCount: e.target.value })}
          placeholder="0"
        />
      </div>
      <BreedCountEditor value={f.cattleBreeds} onChange={(cattleBreeds) => setF({ cattleBreeds })} />
    </Section>
  );
}

export function PaymentFields({ f, setF }: { f: FarmerFormState; setF: FarmerSetF }) {
  return (
    <Section title="Payment" hint="For payouts">
      <Input label="Account holder name" value={f.bankAccountName} onChange={(e) => setF({ bankAccountName: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Bank A/C no." value={f.bankAccountNumber} onChange={(e) => setF({ bankAccountNumber: e.target.value })} />
        <Input label="IFSC" value={f.bankIfsc} onChange={(e) => setF({ bankIfsc: e.target.value.toUpperCase() })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Bank name" value={f.bankName} onChange={(e) => setF({ bankName: e.target.value })} />
        <Input label="UPI ID" value={f.upiId} onChange={(e) => setF({ upiId: e.target.value })} />
      </div>
    </Section>
  );
}
