import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Wand2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Input, Combobox, useToast,
} from '@/components/ui';
import { useCreateRateChart, useRateChart, type MilkType } from '@/hooks/queries/use-milk-procurement';
import type { CreateRateChartInput } from '@runq/validators';

const MILK_TYPES = [
  { value: 'cow_a1', label: 'Cow A1 (regular)' },
  { value: 'cow_a2', label: 'Cow A2 (desi)' },
  { value: 'buffalo', label: 'Buffalo' },
  { value: 'mixed', label: 'Mixed' },
];
const PRICING_MODES = [
  { value: 'matrix', label: 'Matrix (FAT × SNF grid)' },
  { value: 'flat', label: 'Flat per-litre' },
  { value: 'clr', label: 'CLR breakpoints (lactometer)' },
];

const gkey = (fat: number, snf: number) => `${fat.toFixed(1)}|${snf.toFixed(1)}`;

function deriveGrade(fat: number, snf: number): 'a' | 'b' | 'c' {
  if (fat >= 4.0 && snf >= 8.5) return 'a';
  if (fat >= 3.5 && snf >= 8.0) return 'b';
  return 'c';
}

/** One quarterly bonus tier being edited: FAT floor → ₹/L. */
type TierRow = { fatMin: string; bonus: string };

const sortTiers = (t: TierRow[]) =>
  [...t].sort((a, b) => Number(b.fatMin) - Number(a.fatMin));

/** Tiers ready to save: both fields numeric. */
function validTiers(rows: TierRow[]): { fatMin: number; bonus: number }[] {
  return sortTiers(rows)
    .filter((r) => r.fatMin !== '' && r.bonus !== ''
      && !Number.isNaN(Number(r.fatMin)) && !Number.isNaN(Number(r.bonus)))
    .map((r) => ({ fatMin: Number(r.fatMin), bonus: Number(r.bonus) }));
}

/** The bonus a pour's FAT earns — mirrors the server's tier lookup. */
function tierFor(tiers: { fatMin: number; bonus: number }[], fat: number): number {
  return tiers.find((t) => fat >= t.fatMin)?.bonus ?? 0;
}

export function MpRateChartNewPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { from?: string };
  const from = search.from;
  const create = useCreateRateChart();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const back = () => navigate({ to: '/milk-procurement/rate-charts' });

  const [name, setName] = useState('');
  const [milkType, setMilkType] = useState('cow_a1');
  const [pricingMode, setPricingMode] = useState('matrix');
  const [flatRate, setFlatRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [gradeABonus, setGradeABonus] = useState('');
  const [snfGateMin, setSnfGateMin] = useState('');
  const [referenceSnf, setReferenceSnf] = useState('');
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [fatOnly, setFatOnly] = useState(false);

  const [fats, setFats] = useState<number[]>([]);
  const [snfs, setSnfs] = useState<number[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [g, setG] = useState({ fatLo: '3.2', fatHi: '5.0', snfLo: '6.5', snfHi: '9.0', priceLo: '35', priceHi: '52', step: '0.1' });
  // CLR breakpoints: sorted by clr ascending
  const [clrRows, setClrRows] = useState<{ clr: string; rate: string }[]>([{ clr: '', rate: '' }]);

  // duplicate: prefill from a source chart
  const { data: srcData } = useRateChart(from ?? '');
  useEffect(() => {
    const ch = srcData?.data;
    if (!ch) return;
    setName(`${ch.name} (copy)`);
    setMilkType(ch.milkType);
    setPricingMode(ch.pricingMode);
    setFlatRate(ch.flatRatePerLitre ?? '');
    const bonus = ch.rules.find((r) => r.ruleType === 'quality_bonus' && r.grade === 'a');
    setGradeABonus(bonus ? bonus.bonusPerLitre : '');
    setSnfGateMin(ch.snfGateMin ?? '');
    setReferenceSnf(ch.referenceSnf ?? '');
    // Duplicating is how a chart is "edited" — charts are immutable, so this
    // carries the tiers forward for the new effective window.
    setTiers(ch.rules
      .filter((r) => r.ruleType === 'quarterly_fat_bonus' && r.fatMin != null)
      .sort((a, b) => Number(b.fatMin) - Number(a.fatMin))
      .map((r) => ({ fatMin: String(Number(r.fatMin)), bonus: String(Number(r.bonusPerLitre)) })));
    if (ch.pricingMode === 'clr') {
      const rows = ch.cells
        .filter((c) => c.clr != null)
        .sort((a, b) => Number(a.clr) - Number(b.clr))
        .map((c) => ({ clr: String(Number(c.clr)), rate: String(Number(c.ratePerLitre)) }));
      setClrRows(rows.length ? rows : [{ clr: '', rate: '' }]);
    } else {
      const fs = [...new Set(ch.cells.map((c) => Number(c.fat)))].sort((a, b) => a - b);
      const ss = [...new Set(ch.cells.map((c) => Number(c.snf)))].sort((a, b) => a - b);
      const r: Record<string, string> = {};
      for (const c of ch.cells) r[gkey(Number(c.fat), Number(c.snf))] = String(Number(c.ratePerLitre));
      setFats(fs); setSnfs(ss); setRates(r);
      setFatOnly(ss.length === 1 && ss[0] === 0);
    }
  }, [srcData]);

  const generate = () => {
    const st = Math.max(1, Math.round((Number(g.step) || 0.1) * 10));
    const fLo = Math.round(Number(g.fatLo) * 10), fHi = Math.round(Number(g.fatHi) * 10);
    const sLo = Math.round(Number(g.snfLo) * 10), sHi = Math.round(Number(g.snfHi) * 10);
    if (fHi < fLo || (!fatOnly && sHi < sLo)) { toast('Check the FAT / SNF ranges', 'error'); return; }
    const nf: number[] = [];
    for (let f = fLo; f <= fHi; f += st) nf.push(f / 10);
    // FAT-only: a single SNF-0 row. Nearest-floor then matches every SNF
    // reading, so the rate keys on FAT alone.
    const ns: number[] = [];
    if (fatOnly) ns.push(0);
    else for (let s = sLo; s <= sHi; s += st) ns.push(s / 10);
    const fatSpan = (fHi - fLo) / 10 || 1, snfSpan = (sHi - sLo) / 10 || 1;
    const pLo = Number(g.priceLo), pHi = Number(g.priceHi);
    const r: Record<string, string> = {};
    for (const fat of nf) for (const snf of ns) {
      const frac = fatOnly
        ? (fat - fLo / 10) / fatSpan
        : ((fat - fLo / 10) / fatSpan + (snf - sLo / 10) / snfSpan) / 2;
      r[gkey(fat, snf)] = String(Math.round((pLo + (pHi - pLo) * frac) * 10) / 10);
    }
    setFats(nf); setSnfs(ns); setRates(r);
  };

  const setRate = (fat: number, snf: number, v: string) => setRates((prev) => ({ ...prev, [gkey(fat, snf)]: v }));

  const matrixCells: { fat: number; snf: number; ratePerLitre: number }[] = [];
  for (const fat of fats) for (const snf of snfs) {
    const v = rates[gkey(fat, snf)];
    if (v !== undefined && v !== '' && !Number.isNaN(Number(v))) matrixCells.push({ fat, snf, ratePerLitre: Number(v) });
  }
  const clrCells = clrRows.filter((r) => r.clr !== '' && r.rate !== '' && !Number.isNaN(Number(r.clr)) && !Number.isNaN(Number(r.rate)));

  const valid = !!name && (
    pricingMode === 'flat' ? Number(flatRate) > 0
    : pricingMode === 'clr' ? clrCells.length > 0
    : matrixCells.length > 0
  );

  const save = () => {
    const rules: CreateRateChartInput['rules'] = [];
    if (gradeABonus && Number(gradeABonus) > 0) {
      rules.push({ ruleType: 'quality_bonus', grade: 'a', bonusPerLitre: Number(gradeABonus) });
    }
    for (const t of validTiers(tiers)) {
      rules.push({ ruleType: 'quarterly_fat_bonus', fatMin: t.fatMin, bonusPerLitre: t.bonus });
    }
    let cells: CreateRateChartInput['cells'] = [];
    if (pricingMode === 'matrix') cells = matrixCells;
    else if (pricingMode === 'clr') cells = clrCells.map((r) => ({ clr: Number(r.clr), ratePerLitre: Number(r.rate) }));
    const payload: CreateRateChartInput = {
      name, milkType: milkType as MilkType, pricingMode: pricingMode as 'matrix' | 'flat' | 'clr',
      flatRatePerLitre: pricingMode === 'flat' ? Number(flatRate) : null,
      // charts are independent now — who uses one is set on the CC / VMCC / farmer
      scopeNodeId: null,
      snfGateMin: snfGateMin !== '' && !Number.isNaN(Number(snfGateMin)) ? Number(snfGateMin) : null,
      referenceSnf: referenceSnf !== '' && !Number.isNaN(Number(referenceSnf)) ? Number(referenceSnf) : null,
      effectiveFrom, effectiveTo: effectiveTo || null, cells, rules,
    };
    create.mutate(payload, {
      onSuccess: () => { toast('Rate chart created', 'success'); back(); },
      onError: () => toast('Failed — matrix needs ≥1 cell, flat needs a rate, CLR needs ≥1 row', 'error'),
    });
  };

  return (
    <div>
      <PageHeader
        title={from ? 'Duplicate rate chart' : 'New rate chart'}
        description="Effective-dated FAT/SNF matrix, CLR breakpoints, or flat per-litre rate."
        fullWidth
        actions={<Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" />Back</Button>}
      />

      <div className="max-w-5xl space-y-4">
        <Card>
          <CardContent className="space-y-3 py-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <div className="grid grid-cols-2 gap-2">
              <Combobox label="Milk type" value={milkType} onChange={setMilkType} options={MILK_TYPES} />
              <Combobox label="Pricing mode" value={pricingMode} onChange={setPricingMode} options={PRICING_MODES} />
              <Input label="Effective from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              <Input label="Effective to (optional)" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </div>
            {effectiveTo !== '' && effectiveTo < effectiveFrom && (
              <p className="text-xs text-red-600 dark:text-red-400">Effective to is before effective from.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Input label="Grade-A quality bonus (₹/L, optional)" type="number" value={gradeABonus} onChange={(e) => setGradeABonus(e.target.value)} />
              <Input
                label="Anti-dilution SNF floor (optional)"
                type="number"
                placeholder="e.g. 7.20 — blank leaves the gate off"
                value={snfGateMin}
                onChange={(e) => setSnfGateMin(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="SNF shown on the chart (optional)"
                type="number"
                placeholder="e.g. 8.2 — printed on every row, never priced on"
                value={referenceSnf}
                onChange={(e) => setReferenceSnf(e.target.value)}
              />
            </div>
            {referenceSnf !== '' && snfGateMin !== '' && Number(referenceSnf) > Number(snfGateMin) && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                The chart shows {referenceSnf} SNF but only gates below {snfGateMin}. Farmers between
                the two are paid in full — make sure that is what you intend to publish.
              </p>
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Below the SNF floor a pour prices down the sub-3.5 taper however good its FAT looks, and
              forfeits the quarter&apos;s bonus. Set it well under the quality watch band — that band
              colour-codes milk, and using it here would gate a quarter of normal supply.
            </p>
            {/* Scope used to live here, which meant a chart both defined rates
                and decided who got them. Charts are now independent: set who
                uses one on Rate charts (defaults), or on a CC / VMCC / farmer. */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              A chart just defines rates. Choose who it prices on the Rate charts page (per-milk-type
              defaults), or override it on a CC, VMCC, or farmer.
            </p>
          </CardContent>
        </Card>

        {pricingMode === 'flat' ? (
          <Card><CardContent className="py-4"><Input label="Flat rate (₹/L)" type="number" value={flatRate} onChange={(e) => setFlatRate(e.target.value)} /></CardContent></Card>
        ) : pricingMode === 'clr' ? (
          <Card>
            <CardHeader>CLR breakpoints (₹/L) — sorted by CLR ascending</CardHeader>
            <CardContent className="py-4">
              <ClrEditor rows={clrRows} onChange={setClrRows} />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>Generate grid</CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <Input label="FAT from" type="number" value={g.fatLo} onChange={(e) => setG({ ...g, fatLo: e.target.value })} />
                  <Input label="FAT to" type="number" value={g.fatHi} onChange={(e) => setG({ ...g, fatHi: e.target.value })} />
                  <Input label="Step" type="number" value={g.step} onChange={(e) => setG({ ...g, step: e.target.value })} />
                  <Input label="SNF from" type="number" value={g.snfLo} disabled={fatOnly} onChange={(e) => setG({ ...g, snfLo: e.target.value })} />
                  <Input label="SNF to" type="number" value={g.snfHi} disabled={fatOnly} onChange={(e) => setG({ ...g, snfHi: e.target.value })} />
                  <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input type="checkbox" checked={fatOnly} onChange={(e) => setFatOnly(e.target.checked)} className="h-4 w-4" />
                    Price on FAT only
                  </label>
                  <Input label="₹/L at min" type="number" value={g.priceLo} onChange={(e) => setG({ ...g, priceLo: e.target.value })} />
                  <Input label="₹/L at max" type="number" value={g.priceHi} onChange={(e) => setG({ ...g, priceHi: e.target.value })} />
                  <div className="flex items-end"><Button type="button" className="w-full" onClick={generate}><Wand2 className="h-4 w-4" />Generate</Button></div>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {fatOnly
                    ? '₹/L scales linearly across the FAT range and SNF is ignored — one row per FAT step. The top FAT row acts as the cap. Tweak any cell before saving.'
                    : '₹/L scales linearly from min (low FAT+SNF) to max (high FAT+SNF). Generates into the editable grid below — tweak any cell before saving.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                Rate matrix (₹/L) — editable · {matrixCells.length} cells
                {snfs.length === 1 && snfs[0] === 0 ? ' · FAT-only' : ''}
              </CardHeader>
              <CardContent className="p-3">
                {snfs.length === 1 && snfs[0] === 0 && (
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    FAT-only chart: cells sit at SNF 0, so every SNF reading matches and the rate keys
                    on FAT alone. The highest FAT row acts as the cap.
                  </p>
                )}
                <GridEditor fats={fats} snfs={snfs} rates={rates} onRate={setRate} />
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>Quarterly bonus tiers — optional</CardHeader>
          <CardContent className="py-4">
            <TierEditor rows={tiers} onChange={setTiers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Test a reading</CardHeader>
          <CardContent>
            <TestBox
              matrixCells={matrixCells} clrRows={clrRows} pricingMode={pricingMode}
              flatRate={flatRate} gradeABonus={gradeABonus}
              tiers={validTiers(tiers)} snfGateMin={snfGateMin}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pb-8">
          <Button variant="ghost" onClick={back}>Cancel</Button>
          <Button onClick={save} loading={create.isPending} disabled={!valid}>Create rate chart</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Quarterly bonus tiers, read from each pour's own FAT. Each row is a FAT floor;
 * the band runs up to the next floor less 0.01, shown alongside so nobody
 * publishes a chart reading "3.80 → ₹6.00" and then argues with a farmer whose
 * pour measured 3.79.
 */
function TierEditor({ rows, onChange }: { rows: TierRow[]; onChange: (r: TierRow[]) => void }) {
  const setRow = (i: number, field: keyof TierRow, v: string) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  const sorted = sortTiers(rows);
  const bandFor = (r: TierRow): string => {
    const f = Number(r.fatMin);
    if (r.fatMin === '' || Number.isNaN(f)) return '—';
    const i = sorted.findIndex((x) => Number(x.fatMin) === f);
    const above = i > 0 ? Number(sorted[i - 1]!.fatMin) : null;
    return above == null ? `${f.toFixed(2)} and above` : `${f.toFixed(2)} – ${(above - 0.01).toFixed(2)}`;
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1.2fr_auto] gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <span>FAT floor</span><span>Bonus ₹ / litre</span><span>Band shown to farmers</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1.2fr_auto] items-center gap-2">
          <input type="number" step="0.01" placeholder="e.g. 3.70" value={r.fatMin}
            onChange={(e) => setRow(i, 'fatMin', e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-sm tabular-nums focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:text-zinc-100" />
          <input type="number" step="0.01" placeholder="e.g. 6.00" value={r.bonus}
            onChange={(e) => setRow(i, 'bonus', e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-sm tabular-nums focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:text-zinc-100" />
          <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{bandFor(r)}</span>
          <Button variant="ghost" size="sm" type="button" onClick={() => onChange(rows.filter((_, x) => x !== i))}>×</Button>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="py-3 text-sm text-zinc-500">
          No quarterly bonus on this chart. Add tiers, or import a file with a bonus column.
        </p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Each pour earns its own bonus from its own FAT, fixed at capture, and the quarter&apos;s
        total is paid as one lump sum. Nothing is recomputed later, so the daily receipt and the
        cheque always agree.
      </p>
      <Button variant="ghost" size="sm" type="button" onClick={() => onChange([...rows, { fatMin: '', bonus: '' }])}>
        + Add tier
      </Button>
    </div>
  );
}

function ClrEditor({ rows, onChange }: {
  rows: { clr: string; rate: string }[];
  onChange: (rows: { clr: string; rate: string }[]) => void;
}) {
  const addRow = () => onChange([...rows, { clr: '', rate: '' }]);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const setRow = (i: number, field: 'clr' | 'rate', v: string) =>
    onChange(rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <span>CLR (corrected lactometer reading)</span>
        <span>₹ / litre</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <input
            type="number"
            placeholder="e.g. 28"
            value={r.clr}
            onChange={(e) => setRow(i, 'clr', e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-sm tabular-nums focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
          <input
            type="number"
            placeholder="e.g. 38"
            value={r.rate}
            onChange={(e) => setRow(i, 'rate', e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-sm tabular-nums focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
          <Button variant="ghost" size="sm" type="button" onClick={() => removeRow(i)} disabled={rows.length === 1}>
            ×
          </Button>
        </div>
      ))}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Each row is a floor: pour gets the rate of the highest CLR row it meets or exceeds. Top row acts as a skimming cap.
      </p>
      <Button variant="ghost" size="sm" type="button" onClick={addRow}>+ Add row</Button>
    </div>
  );
}

function GridEditor({ fats, snfs, rates, onRate }: {
  fats: number[]; snfs: number[]; rates: Record<string, string>;
  onRate: (fat: number, snf: number, v: string) => void;
}) {
  if (!fats.length || !snfs.length) {
    return <p className="py-8 text-center text-sm text-zinc-500">Generate a grid above to start editing rates.</p>;
  }
  return (
    <div className="max-h-[440px] overflow-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 bg-zinc-50 px-2 py-1 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-800">FAT \ SNF</th>
            {snfs.map((s) => (
              <th key={s} className="sticky top-0 z-10 bg-zinc-50 px-1 py-1 text-center text-xs font-medium text-zinc-500 tabular-nums dark:bg-zinc-800">{s.toFixed(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fats.map((fat) => (
            <tr key={fat}>
              <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium tabular-nums dark:bg-zinc-900">{fat.toFixed(1)}</th>
              {snfs.map((snf) => (
                <td key={snf} className="p-0.5">
                  <input
                    type="number"
                    value={rates[gkey(fat, snf)] ?? ''}
                    onChange={(e) => onRate(fat, snf, e.target.value)}
                    className="w-14 rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-right text-xs tabular-nums focus:border-emerald-400 focus:outline-none dark:border-zinc-700"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TestBox({ matrixCells, clrRows, pricingMode, flatRate, gradeABonus, tiers, snfGateMin }: {
  matrixCells: { fat: number; snf: number; ratePerLitre: number }[];
  clrRows: { clr: string; rate: string }[];
  pricingMode: string; flatRate: string; gradeABonus: string;
  tiers: { fatMin: number; bonus: number }[]; snfGateMin: string;
}) {
  const [t, setT] = useState({ fat: '', snf: '', clr: '' });

  if (pricingMode === 'clr') {
    const tc = Number(t.clr);
    const ready = t.clr !== '' && !Number.isNaN(tc);
    let result: { ok: boolean; text: string } | null = null;
    if (ready) {
      const sorted = clrRows
        .filter((r) => r.clr !== '' && r.rate !== '' && !Number.isNaN(Number(r.clr)))
        .sort((a, b) => Number(a.clr) - Number(b.clr));
      const match = [...sorted].reverse().find((r) => tc >= Number(r.clr));
      if (!match) result = { ok: false, text: 'Below the lowest CLR breakpoint — would be rejected.' };
      else result = { ok: true, text: `CLR ${tc} → breakpoint ≥${match.clr} → ₹${match.rate}/L` };
    }
    return (
      <div className="flex items-end gap-2">
        <div className="w-28"><Input label="CLR reading" type="number" value={t.clr} onChange={(e) => setT({ ...t, clr: e.target.value })} /></div>
        <div className={`flex-1 pb-2 text-sm ${result && !result.ok ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {result ? result.text : <span className="text-zinc-400">Enter CLR to preview the rate</span>}
        </div>
      </div>
    );
  }

  const tf = Number(t.fat), ts = Number(t.snf);
  const ready = t.fat !== '' && t.snf !== '' && !Number.isNaN(tf) && !Number.isNaN(ts);
  let result: { ok: boolean; text: string } | null = null;
  if (ready) {
    // Mirrors resolveRate: a gated pour prices as if FAT were just under 3.5.
    const gate = Number(snfGateMin);
    const gated = pricingMode === 'matrix' && snfGateMin !== '' && !Number.isNaN(gate) && ts < gate;
    const pricingFat = gated ? Math.min(tf, 3.49) : tf;
    let base: number | null = null, label = '';
    if (pricingMode === 'flat') { base = Number(flatRate) || null; label = 'flat'; }
    else {
      const m = matrixCells.filter((c) => c.fat <= pricingFat && c.snf <= ts).sort((a, b) => b.fat - a.fat || b.snf - a.snf)[0];
      if (m) { base = m.ratePerLitre; label = `${m.fat} × ${m.snf}`; }
    }
    if (base == null) result = { ok: false, text: 'Below the lowest cell — would be rejected.' };
    else {
      const grade = deriveGrade(tf, ts);
      const bonus = grade === 'a' && Number(gradeABonus) > 0 ? Number(gradeABonus) : 0;
      const daily = base + bonus;
      // Banked per pour but settled after the quarter, never inside the daily
      // rate — shown as a separate line so the two are never conflated.
      const tier = gated ? 0 : tierFor(tiers, tf);
      const parts = [`cell ${label} → ₹${base}/L`];
      if (bonus) parts.push(`grade ${grade.toUpperCase()} +₹${bonus}`);
      parts.push(`daily ₹${daily.toFixed(2)}/L`);
      if (tiers.length) {
        parts.push(gated
          ? 'quarterly bonus forfeited (SNF gate)'
          : `+ quarterly ₹${tier.toFixed(2)} = ₹${(daily + tier).toFixed(2)}/L all-in`);
      }
      result = { ok: !gated, text: `${gated ? 'SNF GATED · ' : ''}${parts.join(' · ')}` };
    }
  }
  return (
    <div className="flex items-end gap-2">
      <div className="w-24"><Input label="FAT %" type="number" value={t.fat} onChange={(e) => setT({ ...t, fat: e.target.value })} /></div>
      <div className="w-24"><Input label="SNF %" type="number" value={t.snf} onChange={(e) => setT({ ...t, snf: e.target.value })} /></div>
      <div className={`flex-1 pb-2 text-sm ${result && !result.ok ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
        {result ? result.text : <span className="text-zinc-400">Enter FAT &amp; SNF to preview the rate</span>}
      </div>
    </div>
  );
}
