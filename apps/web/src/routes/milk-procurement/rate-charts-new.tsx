import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Wand2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Input, Combobox, useToast,
} from '@/components/ui';
import { useCreateRateChart, useRateChart, useNodes, type MilkType } from '@/hooks/queries/use-milk-procurement';
import type { CreateRateChartInput } from '@runq/validators';

const MILK_TYPES = [
  { value: 'cow', label: 'Cow' },
  { value: 'buffalo', label: 'Buffalo' },
  { value: 'mixed', label: 'Mixed' },
];
const PRICING_MODES = [
  { value: 'matrix', label: 'Matrix (FAT × SNF grid)' },
  { value: 'flat', label: 'Flat per-litre' },
];

const gkey = (fat: number, snf: number) => `${fat.toFixed(1)}|${snf.toFixed(1)}`;

function deriveGrade(fat: number, snf: number): 'a' | 'b' | 'c' {
  if (fat >= 4.0 && snf >= 8.5) return 'a';
  if (fat >= 3.5 && snf >= 8.0) return 'b';
  return 'c';
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
  const [milkType, setMilkType] = useState('cow');
  const [pricingMode, setPricingMode] = useState('matrix');
  const [flatRate, setFlatRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [gradeABonus, setGradeABonus] = useState('');
  const [scopeNodeId, setScopeNodeId] = useState('');
  const { data: nodesData } = useNodes({ nodeType: 'vmcc', limit: 300 });
  const vmccs = nodesData?.data ?? [];

  const [fats, setFats] = useState<number[]>([]);
  const [snfs, setSnfs] = useState<number[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [g, setG] = useState({ fatLo: '3.2', fatHi: '5.0', snfLo: '6.5', snfHi: '9.0', priceLo: '35', priceHi: '52', step: '0.1' });

  // duplicate: prefill from a source chart
  const { data: srcData } = useRateChart(from ?? '');
  useEffect(() => {
    const ch = srcData?.data;
    if (!ch) return;
    setName(`${ch.name} (copy)`);
    setMilkType(ch.milkType);
    setPricingMode(ch.pricingMode);
    setFlatRate(ch.flatRatePerLitre ?? '');
    setScopeNodeId(ch.scopeNodeId ?? '');
    const bonus = ch.rules.find((r) => r.ruleType === 'quality_bonus' && r.grade === 'a');
    setGradeABonus(bonus ? bonus.bonusPerLitre : '');
    const fs = [...new Set(ch.cells.map((c) => Number(c.fat)))].sort((a, b) => a - b);
    const ss = [...new Set(ch.cells.map((c) => Number(c.snf)))].sort((a, b) => a - b);
    const r: Record<string, string> = {};
    for (const c of ch.cells) r[gkey(Number(c.fat), Number(c.snf))] = String(Number(c.ratePerLitre));
    setFats(fs); setSnfs(ss); setRates(r);
  }, [srcData]);

  const generate = () => {
    const st = Math.max(1, Math.round((Number(g.step) || 0.1) * 10));
    const fLo = Math.round(Number(g.fatLo) * 10), fHi = Math.round(Number(g.fatHi) * 10);
    const sLo = Math.round(Number(g.snfLo) * 10), sHi = Math.round(Number(g.snfHi) * 10);
    if (fHi < fLo || sHi < sLo) { toast('Check the FAT / SNF ranges', 'error'); return; }
    const nf: number[] = [], ns: number[] = [];
    for (let f = fLo; f <= fHi; f += st) nf.push(f / 10);
    for (let s = sLo; s <= sHi; s += st) ns.push(s / 10);
    const fatSpan = (fHi - fLo) / 10 || 1, snfSpan = (sHi - sLo) / 10 || 1;
    const pLo = Number(g.priceLo), pHi = Number(g.priceHi);
    const r: Record<string, string> = {};
    for (const fat of nf) for (const snf of ns) {
      const frac = ((fat - fLo / 10) / fatSpan + (snf - sLo / 10) / snfSpan) / 2;
      r[gkey(fat, snf)] = String(Math.round((pLo + (pHi - pLo) * frac) * 10) / 10);
    }
    setFats(nf); setSnfs(ns); setRates(r);
  };

  const setRate = (fat: number, snf: number, v: string) => setRates((prev) => ({ ...prev, [gkey(fat, snf)]: v }));

  const cells: { fat: number; snf: number; ratePerLitre: number }[] = [];
  for (const fat of fats) for (const snf of snfs) {
    const v = rates[gkey(fat, snf)];
    if (v !== undefined && v !== '' && !Number.isNaN(Number(v))) cells.push({ fat, snf, ratePerLitre: Number(v) });
  }

  const valid = !!name && (pricingMode === 'flat' ? Number(flatRate) > 0 : cells.length > 0);

  const save = () => {
    const rules = gradeABonus && Number(gradeABonus) > 0
      ? [{ ruleType: 'quality_bonus' as const, grade: 'a' as const, bonusPerLitre: Number(gradeABonus) }]
      : [];
    const payload: CreateRateChartInput = {
      name, milkType: milkType as MilkType, pricingMode: pricingMode as 'matrix' | 'flat',
      flatRatePerLitre: pricingMode === 'flat' ? Number(flatRate) : null,
      scopeNodeId: scopeNodeId || null,
      effectiveFrom, cells: pricingMode === 'matrix' ? cells : [], rules,
    };
    create.mutate(payload, {
      onSuccess: () => { toast('Rate chart created', 'success'); back(); },
      onError: () => toast('Failed — matrix needs ≥1 cell, flat needs a rate', 'error'),
    });
  };

  return (
    <div>
      <PageHeader
        title={from ? 'Duplicate rate chart' : 'New rate chart'}
        description="Effective-dated FAT/SNF matrix or flat per-litre rate."
        fullWidth
        actions={<Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" />Back</Button>}
      />

      <div className="max-w-5xl space-y-4">
        <Card>
          <CardContent className="space-y-3 py-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <div className="grid grid-cols-3 gap-2">
              <Combobox label="Milk type" value={milkType} onChange={setMilkType} options={MILK_TYPES} />
              <Combobox label="Pricing mode" value={pricingMode} onChange={setPricingMode} options={PRICING_MODES} />
              <Input label="Effective from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Combobox
                label="Scope"
                value={scopeNodeId}
                onChange={setScopeNodeId}
                options={[{ value: '', label: 'All VMCCs (tenant-wide)' }, ...vmccs.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]}
                placeholder="All VMCCs (tenant-wide)"
              />
              <Input label="Grade-A quality bonus (₹/L, optional)" type="number" value={gradeABonus} onChange={(e) => setGradeABonus(e.target.value)} />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              A VMCC-scoped chart wins over a tenant-wide one for pours at that VMCC. Leave as tenant-wide to apply everywhere.
            </p>
          </CardContent>
        </Card>

        {pricingMode === 'flat' ? (
          <Card><CardContent className="py-4"><Input label="Flat rate (₹/L)" type="number" value={flatRate} onChange={(e) => setFlatRate(e.target.value)} /></CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader>Generate grid</CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <Input label="FAT from" type="number" value={g.fatLo} onChange={(e) => setG({ ...g, fatLo: e.target.value })} />
                  <Input label="FAT to" type="number" value={g.fatHi} onChange={(e) => setG({ ...g, fatHi: e.target.value })} />
                  <Input label="Step" type="number" value={g.step} onChange={(e) => setG({ ...g, step: e.target.value })} />
                  <Input label="SNF from" type="number" value={g.snfLo} onChange={(e) => setG({ ...g, snfLo: e.target.value })} />
                  <Input label="SNF to" type="number" value={g.snfHi} onChange={(e) => setG({ ...g, snfHi: e.target.value })} />
                  <div />
                  <Input label="₹/L at min" type="number" value={g.priceLo} onChange={(e) => setG({ ...g, priceLo: e.target.value })} />
                  <Input label="₹/L at max" type="number" value={g.priceHi} onChange={(e) => setG({ ...g, priceHi: e.target.value })} />
                  <div className="flex items-end"><Button type="button" className="w-full" onClick={generate}><Wand2 className="h-4 w-4" />Generate</Button></div>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  ₹/L scales linearly from min (low FAT+SNF) to max (high FAT+SNF). Generates into the editable grid below — tweak any cell before saving.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>Rate matrix (₹/L) — editable · {cells.length} cells</CardHeader>
              <CardContent className="p-3">
                <GridEditor fats={fats} snfs={snfs} rates={rates} onRate={setRate} />
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>Test a reading</CardHeader>
          <CardContent><TestBox cells={cells} pricingMode={pricingMode} flatRate={flatRate} gradeABonus={gradeABonus} /></CardContent>
        </Card>

        <div className="flex justify-end gap-2 pb-8">
          <Button variant="ghost" onClick={back}>Cancel</Button>
          <Button onClick={save} loading={create.isPending} disabled={!valid}>Create rate chart</Button>
        </div>
      </div>
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

function TestBox({ cells, pricingMode, flatRate, gradeABonus }: {
  cells: { fat: number; snf: number; ratePerLitre: number }[];
  pricingMode: string; flatRate: string; gradeABonus: string;
}) {
  const [t, setT] = useState({ fat: '', snf: '' });
  const tf = Number(t.fat), ts = Number(t.snf);
  const ready = t.fat !== '' && t.snf !== '' && !Number.isNaN(tf) && !Number.isNaN(ts);
  let result: { ok: boolean; text: string } | null = null;
  if (ready) {
    let base: number | null = null, label = '';
    if (pricingMode === 'flat') { base = Number(flatRate) || null; label = 'flat'; }
    else {
      const m = cells.filter((c) => c.fat <= tf && c.snf <= ts).sort((a, b) => b.fat - a.fat || b.snf - a.snf)[0];
      if (m) { base = m.ratePerLitre; label = `${m.fat} × ${m.snf}`; }
    }
    if (base == null) result = { ok: false, text: 'Below the lowest cell — would be rejected.' };
    else {
      const grade = deriveGrade(tf, ts);
      const bonus = grade === 'a' && Number(gradeABonus) > 0 ? Number(gradeABonus) : 0;
      result = { ok: true, text: `cell ${label} → ₹${base}/L · grade ${grade.toUpperCase()}${bonus ? ` (+₹${bonus})` : ''} = ₹${(base + bonus).toFixed(2)}/L` };
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
