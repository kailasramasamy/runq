import {
  Card, CardHeader, CardContent, Combobox, Badge, useToast,
} from '@/components/ui';
import {
  useRateCharts, useEffectiveAssignments, useAssignRateChart, useUnassignRateChart,
  rateChartLabel, milkTypeLabel,
  type MilkType, type RateScope, type PricingFamily, type AssignmentSource,
} from '@/hooks/queries/use-milk-procurement';

/** The reading a chart prices from. A scope can need one of each: an analyzer
 *  VMCC supplies fat/SNF, a lactometer VMCC supplies CLR. */
const FAMILIES: { key: PricingFamily; label: string }[] = [
  { key: 'fat_snf', label: 'FAT / SNF' },
  { key: 'clr', label: 'CLR (lactometer)' },
];

const SOURCE_LABEL: Record<AssignmentSource, string> = {
  own: 'Set here',
  node: 'From VMCC',
  parent: 'From CC',
  tenant: 'From default',
};

/**
 * Assign rate charts for a scope — tenant defaults, a CC, a VMCC, or a farmer.
 * Precedence at pour time: farmer → VMCC → CC → tenant default.
 *
 * Every slot shows what prices it today and where that came from, so an
 * inherited chart reads as inherited rather than as an empty box. Nothing is
 * copied down: clearing an override returns the slot to whatever it inherits,
 * and moving a default moves every scope that hasn't overridden it.
 */
export function RateChartAssignmentsCard({
  scopeType, scopeId, milkTypes, title, subtitle,
}: {
  scopeType: RateScope;
  /** Omitted for tenant defaults. */
  scopeId?: string;
  /** Slots to show — a node's allowed milk types, or every type in use. */
  milkTypes: MilkType[];
  title: string;
  subtitle: string;
}) {
  const { data: chartsData } = useRateCharts({ limit: 200 });
  const { data: effData, isLoading } = useEffectiveAssignments(scopeType, scopeId);
  const assign = useAssignRateChart();
  const unassign = useUnassignRateChart();
  const { toast } = useToast();

  const charts = (chartsData?.data ?? []).filter((c) => c.isActive);
  const effective = effData?.data ?? [];
  const at = (milkType: MilkType, family: PricingFamily) =>
    effective.find((e) => e.milkType === milkType && e.pricingFamily === family);

  const onChange = (milkType: MilkType, family: PricingFamily, chartId: string) => {
    const done = {
      onSuccess: () => toast('Rate chart updated', 'success'),
      onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Failed to save', 'error'),
    };
    if (chartId) assign.mutate({ scopeType, scopeId, rateChartId: chartId }, done);
    else unassign.mutate({ scopeType, scopeId, milkType, pricingFamily: family }, done);
  };

  // Only offer charts that fit the slot — a chart carries its own milk type and
  // family, so anything else would be filed away and silently never apply.
  const optionsFor = (milkType: MilkType, family: PricingFamily) => [
    {
      value: '',
      label: scopeType === 'tenant' ? 'None — no default' : 'Inherit',
    },
    ...charts
      .filter((c) => c.milkType === milkType
        && (family === 'clr' ? c.pricingMode === 'clr' : c.pricingMode !== 'clr'))
      .map((c) => ({ value: c.id, label: rateChartLabel(c) })),
  ];

  return (
    <Card>
      <CardHeader>{title}</CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        {isLoading ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : milkTypes.length === 0 ? (
          <p className="text-xs text-zinc-500">No milk types configured here.</p>
        ) : (
          <div className="space-y-4">
            {milkTypes.map((mt) => (
              <div key={mt}>
                <div className="mb-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {milkTypeLabel(mt)}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FAMILIES.map((f) => {
                    const eff = at(mt, f.key);
                    // "Set here" only counts as this scope's own row.
                    const own = eff?.source === 'own';
                    return (
                      <div key={f.key}>
                        <Combobox
                          label={f.label}
                          value={own ? eff!.rateChartId : ''}
                          onChange={(v) => onChange(mt, f.key, v)}
                          options={optionsFor(mt, f.key)}
                          placeholder={eff && !own ? eff.chartName : 'Not priced'}
                        />
                        <div className="mt-1 flex items-center gap-2">
                          {eff ? (
                            <>
                              <Badge variant={own ? 'primary' : 'default'}>
                                {SOURCE_LABEL[eff.source]}
                              </Badge>
                              {!eff.chartActive && <Badge variant="warning">chart inactive</Badge>}
                            </>
                          ) : (
                            <span className="text-xs text-amber-600 dark:text-amber-500">
                              No chart — pours in this slot fall back to any active chart, or fail to price.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
