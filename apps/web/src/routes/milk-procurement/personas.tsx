import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Droplets, Truck, Factory, User } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Combobox, Badge, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty,
} from '@/components/ui';
import { useFarmers, usePours, useFarmerLedger } from '@/hooks/queries/use-milk-procurement';
import type { LucideIcon } from 'lucide-react';

const ACCENT = '#0F7A5A';

export function MpPersonasPage() {
  const [farmerId, setFarmerId] = useState('');
  const { data: farmersData } = useFarmers({ limit: 500 });
  const farmers = farmersData?.data ?? [];

  return (
    <div>
      <PageHeader
        title="View as persona"
        description="Step into each Dhenu role to see and do their tasks. You stay signed in as owner."
        fullWidth
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <PersonaLink to="/milk-procurement/collection" icon={Droplets} label="VMCC operator" desc="Record collection" />
        <PersonaLink to="/milk-procurement/consignments" icon={Truck} label="CC operator" desc="Receive & dispatch" />
        <PersonaLink to="/milk-procurement/consignments" icon={Factory} label="PP operator" desc="Receive tankers" />
        <Card className="border-emerald-200">
          <CardContent className="flex items-center gap-3 py-4">
            <span className="rounded-lg p-2" style={{ background: `${ACCENT}15`, color: ACCENT }}><User className="h-5 w-5" /></span>
            <div><div className="text-sm font-semibold">Farmer</div><div className="text-xs text-zinc-500">Pick one below</div></div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>Farmer view — what a farmer sees in the Dhenu app</CardHeader>
        <CardContent className="space-y-4">
          <div className="w-80">
            <Combobox label="Farmer" value={farmerId} onChange={setFarmerId}
              options={farmers.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} placeholder="Select a farmer…" />
          </div>
          {farmerId && <FarmerView farmerId={farmerId} />}
        </CardContent>
      </Card>
    </div>
  );
}

function FarmerView({ farmerId }: { farmerId: string }) {
  const { data: poursData } = usePours({ farmerId, status: 'recorded', limit: 30 });
  const { data: ledgerData } = useFarmerLedger(farmerId);
  const pours = poursData?.data ?? [];
  const ledger = ledgerData?.data;
  const totalL = pours.reduce((s, p) => s + Number(p.qtyLitres), 0);
  const totalAmt = pours.reduce((s, p) => s + Number(p.lineAmount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Recent milk (L)" value={totalL} icon={Droplets} formatValue={(v) => `${v.toFixed(1)} L`} />
        <StatsCard title="Recent value" value={totalAmt} icon={Droplets} />
        <StatsCard title="Pours" value={pours.length} formatValue={(v) => String(v)} />
        <StatsCard title="Dues balance" value={ledger?.balance ?? 0} />
      </div>

      <Card>
        <CardHeader>Recent pours</CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><Th>Date</Th><Th>Shift</Th><Th>Qty</Th><Th>FAT/SNF</Th><Th>Grade</Th><Th align="right">₹</Th></TableRow></TableHeader>
            <TableBody>
              {pours.length === 0 ? (
                <TableEmpty colSpan={6} message="No pours yet." />
              ) : (
                pours.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.collectionDate}</TableCell>
                    <TableCell>{p.shift.toUpperCase()}</TableCell>
                    <TableCell>{p.qtyLitres}</TableCell>
                    <TableCell>{p.fat}/{p.snf}</TableCell>
                    <TableCell><Badge variant={p.qualityGrade === 'a' ? 'success' : 'default'}>{p.qualityGrade?.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-right">{p.lineAmount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PersonaLink({ to, icon: Icon, label, desc }: { to: string; icon: LucideIcon; label: string; desc: string }) {
  return (
    <Link to={to} className="block">
      <Card className="h-full transition hover:border-emerald-300 hover:shadow-sm">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="rounded-lg p-2" style={{ background: `${ACCENT}15`, color: ACCENT }}><Icon className="h-5 w-5" /></span>
          <div><div className="text-sm font-semibold">{label}</div><div className="text-xs text-zinc-500">{desc}</div></div>
        </CardContent>
      </Card>
    </Link>
  );
}
