import { useState } from 'react';
import { Plus, Star, X, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Input,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import {
  useVendorRatings,
  useCreateVendorRating,
} from '@/hooks/queries/use-vendor-management';
import { useVendors } from '@/hooks/queries/use-vendors';
import { Combobox } from '@/components/ui';

// ─── Score Display ───────────────────────────────────────────────────────────

function ScoreStars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < score
            ? 'fill-amber-400 text-amber-400'
            : 'text-zinc-300 dark:text-zinc-600'}
        />
      ))}
      <span className="ml-1 text-xs font-mono text-zinc-500">{score}</span>
    </span>
  );
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="rounded p-1 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20"
          >
            <Star
              size={20}
              className={n <= value
                ? 'fill-amber-400 text-amber-400'
                : 'text-zinc-300 dark:text-zinc-600'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateVendorRating();
  const { toast } = useToast();
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendorOptions = (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name }));
  const [vendorId, setVendorId] = useState('');
  const [period, setPeriod] = useState('');
  const [deliveryScore, setDeliveryScore] = useState(3);
  const [qualityScore, setQualityScore] = useState(3);
  const [pricingScore, setPricingScore] = useState(3);
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) { toast('Please select a vendor', 'error'); return; }
    try {
      await create.mutateAsync({
        vendorId,
        period,
        deliveryScore,
        qualityScore,
        pricingScore,
        notes: notes || undefined,
      });
      toast('Rating submitted', 'success');
      onClose();
    } catch {
      toast('Failed to submit rating', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rate Vendor</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Combobox label="Vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Search vendor..." required />
          <Input label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} required placeholder="Q4 2025" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ScoreInput label="Delivery" value={deliveryScore} onChange={setDeliveryScore} />
          <ScoreInput label="Quality" value={qualityScore} onChange={setQualityScore} />
          <ScoreInput label="Pricing" value={pricingScore} onChange={setPricingScore} />
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional feedback..." />
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Submit Rating</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Ratings Page ────────────────────────────────────────────────────────────

export function VendorRatingsPage() {
  const { data, isLoading } = useVendorRatings();
  const [showCreate, setShowCreate] = useState(false);
  const ratings = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Vendor Ratings"
        breadcrumbs={[{ label: 'Vendor Management' }, { label: 'Ratings' }]}
        description="Track vendor performance with periodic scorecards."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('vendor-ratings.csv', ['Vendor', 'Period', 'Delivery Score', 'Quality Score', 'Pricing Score', 'Overall Score'], ratings.map(r => [r.vendorId, r.period, String(r.deliveryScore ?? 0), String(r.qualityScore ?? 0), String(r.pricingScore ?? 0), String(Math.round(((r.deliveryScore ?? 0) + (r.qualityScore ?? 0) + (r.pricingScore ?? 0)) / 3))]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
              <Plus size={14} />
              Rate Vendor
            </Button>
          </div>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : ratings.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No vendor ratings yet.</p>
        ) : (
          ratings.map((r) => {
            const overall = Math.round(((r.deliveryScore ?? 0) + (r.qualityScore ?? 0) + (r.pricingScore ?? 0)) / 3);
            return (
              <div key={r.id} className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.vendorName ?? r.vendorId}</p>
                    <p className="text-xs text-zinc-500">{r.period}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-zinc-500">Overall</span>
                    <ScoreStars score={overall} />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-500">
                  <div>
                    <span className="block text-zinc-400">Delivery</span>
                    <ScoreStars score={r.deliveryScore ?? 0} />
                  </div>
                  <div>
                    <span className="block text-zinc-400">Quality</span>
                    <ScoreStars score={r.qualityScore ?? 0} />
                  </div>
                  <div>
                    <span className="block text-zinc-400">Pricing</span>
                    <ScoreStars score={r.pricingScore ?? 0} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Vendor</Th>
                  <Th>Period</Th>
                  <Th>Delivery</Th>
                  <Th>Quality</Th>
                  <Th>Pricing</Th>
                  <Th>Overall</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={6} />
                ) : ratings.length === 0 ? (
                  <TableEmpty colSpan={6} message="No vendor ratings yet." />
                ) : (
                  ratings.map((r) => {
                    const overall = Math.round(((r.deliveryScore ?? 0) + (r.qualityScore ?? 0) + (r.pricingScore ?? 0)) / 3);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">{r.vendorName ?? r.vendorId}</TableCell>
                        <TableCell className="font-medium">{r.period}</TableCell>
                        <TableCell><ScoreStars score={r.deliveryScore ?? 0} /></TableCell>
                        <TableCell><ScoreStars score={r.qualityScore ?? 0} /></TableCell>
                        <TableCell><ScoreStars score={r.pricingScore ?? 0} /></TableCell>
                        <TableCell><ScoreStars score={overall} /></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
