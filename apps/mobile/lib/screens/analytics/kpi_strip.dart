import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class AnalyticsKpiStrip extends ConsumerWidget {
  const AnalyticsKpiStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cash = ref.watch(cashPositionProvider);
    final ar = ref.watch(arOutstandingProvider);
    final ap = ref.watch(apOutstandingProvider);
    final pnl = ref.watch(pnlSummaryProvider('fy'));

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _KpiTile(
              icon: Icons.account_balance_outlined,
              tone: _Tone.brand,
              label: 'Cash on hand',
              value: cash.maybeWhen(
                data: (d) => d == null ? '—' : formatINR(d.total, compact: true),
                orElse: () => '…',
              ),
              sub: cash.maybeWhen(
                data: (d) => d == null
                    ? ''
                    : '${d.byAccount.length} account${d.byAccount.length == 1 ? '' : 's'}',
                orElse: () => '',
              ),
              onTap: () => context.push('/money/banking'),
            )),
            const SizedBox(width: 10),
            Expanded(child: _KpiTile(
              icon: Icons.arrow_downward_rounded,
              tone: _Tone.info,
              label: 'Receivables',
              value: ar.maybeWhen(
                data: (d) => d == null ? '—' : formatINR(d.total, compact: true),
                orElse: () => '…',
              ),
              sub: ar.maybeWhen(
                data: (d) => d == null ? '' : '${d.invoiceCount} open',
                orElse: () => '',
              ),
              onTap: () => context.push('/sales/invoices'),
            )),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _KpiTile(
              icon: Icons.arrow_upward_rounded,
              tone: _Tone.amber,
              label: 'Payables',
              value: ap.maybeWhen(
                data: (d) => d == null ? '—' : formatINR(d.total, compact: true),
                orElse: () => '…',
              ),
              sub: ap.maybeWhen(
                data: (d) => d == null ? '' : '${d.invoiceCount} open',
                orElse: () => '',
              ),
              onTap: () => context.push('/purchases/bills'),
            )),
            const SizedBox(width: 10),
            Expanded(child: _KpiTile(
              icon: Icons.trending_up_rounded,
              tone: pnl.maybeWhen(
                data: (d) => (d?.netProfit ?? 0) >= 0 ? _Tone.green : _Tone.red,
                orElse: () => _Tone.green,
              ),
              label: 'Net profit · FY',
              value: pnl.maybeWhen(
                data: (d) => d == null ? '—' : formatINR(d.netProfit, compact: true),
                orElse: () => '…',
              ),
              sub: pnl.maybeWhen(
                data: (d) => d == null ? '' : '${d.period.from} → ${d.period.to}',
                orElse: () => '',
              ),
              onTap: () => context.push('/money/reports'),
            )),
          ],
        ),
      ],
    );
  }
}

enum _Tone { brand, info, amber, green, red }

class _KpiTile extends StatelessWidget {
  final IconData icon;
  final _Tone tone;
  final String label, value, sub;
  final VoidCallback onTap;
  const _KpiTile({
    required this.icon,
    required this.tone,
    required this.label,
    required this.value,
    required this.sub,
    required this.onTap,
  });

  (Color, Color) _palette(BuildContext context) {
    // Map our local KPI tone enum to the shared StatusTone so the same
    // alpha-bg + brightness-aware ink scheme applies — keeps tiles
    // readable in dark mode without rewriting per-callsite.
    final tone2 = switch (tone) {
      _Tone.brand => StatusTone.info,    // brand uses info (blue) family for the BG tint
      _Tone.info  => StatusTone.info,
      _Tone.amber => StatusTone.warn,
      _Tone.green => StatusTone.ok,
      _Tone.red   => StatusTone.neg,
    };
    return statusColors(context, tone2);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (bg, ink) = _palette(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(RunqRadii.card),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          decoration: BoxDecoration(
            color: t.surface,
            border: Border.all(color: t.hairline, width: 0.5),
            borderRadius: BorderRadius.circular(RunqRadii.card),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 14, color: ink),
              ),
              const SizedBox(height: 10),
              Text(label,
                  style: RunqText.caption.copyWith(
                      color: t.muted)),
              const SizedBox(height: 2),
              Text(value,
                  style: RunqText.tabular(
                      size: 20, w: FontWeight.w700, color: t.ink)),
              if (sub.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(color: t.muted2)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
