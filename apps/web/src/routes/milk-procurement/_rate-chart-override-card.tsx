import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Combobox, Button, useToast } from '@/components/ui';
import {
  useRateCharts, useUpdateNode, rateChartLabel, type MpNode,
} from '@/hooks/queries/use-milk-procurement';

/** Self-contained "assign a rate chart to this VMCC" card (Setup tab).
 *  Pour-time precedence: farmer override → this → node-scoped → tenant-wide. */
export function RateChartOverrideCard({ node }: { node: MpNode }) {
  const { data } = useRateCharts({ limit: 200 });
  const update = useUpdateNode('vmcc');
  const { toast } = useToast();
  const [chartId, setChartId] = useState(node.rateChartId ?? '');
  useEffect(() => setChartId(node.rateChartId ?? ''), [node.rateChartId]);

  // active charts, plus the currently-assigned one even if since deactivated
  const charts = (data?.data ?? []).filter((c) => c.isActive || c.id === node.rateChartId);
  const options = [
    { value: '', label: 'None — use node-scoped / tenant-wide chart' },
    ...charts.map((c) => ({ value: c.id, label: rateChartLabel(c) })),
  ];

  const save = () => update.mutate(
    { id: node.id, data: { rateChartId: chartId || null } },
    {
      onSuccess: () => toast('Rate chart override saved', 'success'),
      onError: (e) => toast(e instanceof Error ? e.message : 'Failed to save', 'error'),
    },
  );

  return (
    <Card>
      <CardHeader>Rate chart (node override)</CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Pours at this VMCC are priced with this chart unless the farmer has their own.
          The override is skipped automatically when the chart is inactive, outside its
          effective window, or doesn&apos;t match the pour&apos;s milk type or readings.
        </p>
        <div className="max-w-md">
          <Combobox label="Rate chart" value={chartId} onChange={setChartId} options={options} placeholder="None" />
        </div>
        <div className="mt-4">
          <Button onClick={save} loading={update.isPending}>Save override</Button>
        </div>
      </CardContent>
    </Card>
  );
}
