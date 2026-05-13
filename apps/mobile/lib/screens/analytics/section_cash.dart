import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class CashSection extends ConsumerWidget {
  const CashSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _CashForecastCard(value: ref.watch(cashForecastProvider)),
        const SizedBox(height: 12),
        _RunwayCard(
          runway: ref.watch(cashRunwayProvider),
          cashFlow: ref.watch(cashFlowSummaryProvider),
        ),
      ],
    );
  }
}

class _CashForecastCard extends StatelessWidget {
  final AsyncValue<CashForecast?> value;
  const _CashForecastCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<CashForecast>(
      title: 'Cash forecast',
      subtitle: 'Projected from open AR / AP due dates',
      value: value,
      onTap: () => context.push('/money/banking'),
      footerLabel: 'View banking',
      builder: (d) {
        final negSoon = d.projectedAt7d < 0 || d.projectedAt30d < 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber(formatINR(d.cashOnHand), size: 22),
            const SizedBox(height: 2),
            Text('Cash on hand today',
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 14),
            _ForecastWindow(label: 'In 7 days', win: d.next7d, projected: d.projectedAt7d),
            const SizedBox(height: 8),
            _ForecastWindow(label: 'In 30 days', win: d.next30d, projected: d.projectedAt30d),
            const SizedBox(height: 12),
            if (negSoon)
              const StatusPill('Cash may go negative', tone: StatusTone.warn)
            else
              const StatusPill('Positive across both windows', tone: StatusTone.ok),
          ],
        );
      },
    );
  }
}

class _ForecastWindow extends StatelessWidget {
  final String label;
  final CashForecastWindow win;
  final double projected;
  const _ForecastWindow({
    required this.label,
    required this.win,
    required this.projected,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final negative = projected < 0;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label.toUpperCase(),
                    style: RunqText.label
                        .copyWith(color: t.muted, fontSize: 10)),
                const SizedBox(height: 6),
                Row(children: [
                  Text('+${formatINR(win.inflow, compact: true)}',
                      style: RunqText.caption.copyWith(
                          color: statusInk(context, StatusTone.ok), fontSize: 11.5)),
                  const SizedBox(width: 8),
                  Text('−${formatINR(win.outflow, compact: true)}',
                      style: RunqText.caption
                          .copyWith(color: statusInk(context, StatusTone.neg), fontSize: 11.5)),
                  const SizedBox(width: 8),
                  Text('${win.receivableCount} in · ${win.payableCount} out',
                      style: RunqText.caption
                          .copyWith(color: t.muted2, fontSize: 11)),
                ]),
              ],
            ),
          ),
          Text(
            '${projected < 0 ? '−' : ''}${formatINR(projected.abs(), compact: true)}',
            style: RunqText.tabular(
                size: 14,
                w: FontWeight.w700,
                color: negative ? statusInk(context, StatusTone.neg) : t.ink),
          ),
        ],
      ),
    );
  }
}

class _RunwayCard extends StatelessWidget {
  final AsyncValue<CashRunway?> runway;
  final AsyncValue<CashFlowSummary?> cashFlow;
  const _RunwayCard({required this.runway, required this.cashFlow});

  @override
  Widget build(BuildContext context) {
    return MetricCard<CashRunway>(
      title: 'Runway & cash flow',
      subtitle: 'Burn rate and FY-to-date flow',
      value: runway,
      onTap: () => context.push('/money/cash-flow'),
      footerLabel: 'View statement',
      builder: (r) {
        final months = r.runwayMonths;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: _runwayTile(
                context, 'Runway',
                months == null ? '∞' : '${months.toStringAsFixed(0)} mo',
                months == null ? 'Cash-positive 30d+' : 'At current burn',
                ok: months == null,
              )),
              const SizedBox(width: 10),
              Expanded(child: _runwayTile(
                context, 'Net burn 30d',
                '${r.netBurn30d >= 0 ? '+' : ''}${formatINR(r.netBurn30d, compact: true)}',
                'Cash: ${formatINR(r.cashOnHand, compact: true)}',
                ok: r.netBurn30d >= 0,
              )),
            ]),
            const SizedBox(height: 12),
            cashFlow.maybeWhen(
              data: (c) => c == null ? const SizedBox.shrink() : Column(
                children: [
                  StatRow(
                    label: 'Operating',
                    value: formatINR(c.operating, compact: true),
                    valueColor: c.operating < 0 ? statusInk(context, StatusTone.neg) : statusInk(context, StatusTone.ok),
                  ),
                  StatRow(
                    label: 'Investing',
                    value: formatINR(c.investing, compact: true),
                    valueColor: c.investing < 0 ? statusInk(context, StatusTone.neg) : statusInk(context, StatusTone.ok),
                  ),
                  StatRow(
                    label: 'Financing',
                    value: formatINR(c.financing, compact: true),
                  ),
                  const _Divider(),
                  StatRow(
                    label: 'Net cash flow',
                    value: '${c.netChange >= 0 ? '+' : ''}${formatINR(c.netChange, compact: true)}',
                    emphasize: true,
                    valueColor: c.netChange >= 0 ? statusInk(context, StatusTone.ok) : statusInk(context, StatusTone.neg),
                  ),
                ],
              ),
              orElse: () => const SizedBox.shrink(),
            ),
          ],
        );
      },
    );
  }

  Widget _runwayTile(BuildContext context, String label, String value, String sub,
      {required bool ok}) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted, fontSize: 10)),
          const SizedBox(height: 6),
          Text(value,
              style: RunqText.tabular(
                  size: 16,
                  w: FontWeight.w700,
                  color: ok ? statusInk(context, StatusTone.ok) : t.ink)),
          const SizedBox(height: 2),
          Text(sub,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11)),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Container(height: 0.5, color: RT(context).hairline),
      );
}
