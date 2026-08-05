import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

part '_analytics_widgets.dart';
part '_analytics_risk.dart';

/// Inventory analytics — the phone-sized slice of the web page.
///
/// The web version is a wide comparison surface; a phone can't carry that,
/// so this keeps the parts you'd act on standing at the rack: the
/// scorecard, where the value is sitting, what is out or nearly out, and
/// what to reorder. The wide ABC/turnover tables stay on web.
///
/// Every number comes from the same endpoints as web — the two can never
/// disagree because neither computes anything locally.
class InventoryAnalyticsScreen extends ConsumerWidget {
  const InventoryAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final window = ref.watch(invAnalyticsWindowProvider);
    final health = ref.watch(invHealthProvider);
    final perf = ref.watch(invPerformanceProvider);
    final risk = ref.watch(invStockRiskProvider);
    final forecast = ref.watch(invForecastProvider);
    final trend = ref.watch(invTrendProvider);

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const InvPlainAppBar(title: 'Analytics'),
            Expanded(
              child: RefreshIndicator(
                color: InvColors.amber,
                onRefresh: () async {
                  ref.invalidate(invHealthProvider);
                  ref.invalidate(invPerformanceProvider);
                  ref.invalidate(invStockRiskProvider);
                  ref.invalidate(invForecastProvider);
                  ref.invalidate(invTrendProvider);
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                  children: [
                    _WindowChips(
                      selected: window,
                      onSelect: (v) =>
                          ref.read(invAnalyticsWindowProvider.notifier).state = v,
                    ),
                    const SizedBox(height: 14),
                    health.when(
                      loading: () => const _ScoreSkeleton(),
                      error: (e, _) => _ErrorCard(message: '$e'),
                      data: (h) => _Scorecard(health: h),
                    ),
                    const SizedBox(height: 14),
                    trend.when(
                      loading: () => const _ChartSkeleton(label: 'Stock value'),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (points) => _ValueTrendCard(points: points),
                    ),
                    const SizedBox(height: 14),
                    perf.when(
                      loading: () => const _ChartSkeleton(label: 'Where value sits'),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (rows) => _VelocityCard(rows: rows),
                    ),
                    const SizedBox(height: 14),
                    risk.when(
                      loading: () => const _ChartSkeleton(label: 'Stock at risk'),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (r) => _RiskCard(risk: r),
                    ),
                    const SizedBox(height: 14),
                    forecast.when(
                      loading: () => const _ChartSkeleton(label: 'Running out next'),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (f) => _ForecastCard(forecast: f),
                    ),
                    const SizedBox(height: 14),
                    health.maybeWhen(
                      data: (h) => _FootNote(health: h),
                      orElse: () => const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Trailing-period selector. Same options as web so a user moving between
/// the two doesn't have to re-learn the vocabulary.
class _WindowChips extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onSelect;
  const _WindowChips({required this.selected, required this.onSelect});

  static const _options = <int, String>{
    30: '30 days',
    90: '90 days',
    180: '6 months',
    365: '12 months',
  };

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final e in _options.entries) ...[
          _Chip(
            label: e.value,
            active: selected == e.key,
            onTap: () => onSelect(e.key),
          ),
          if (e.key != 365) const SizedBox(width: 6),
        ],
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Chip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Material(
        color: active ? InvColors.amber : t.surface,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: active ? InvColors.amber : t.hairline),
            ),
            child: Text(
              label,
              style: RunqText.caption.copyWith(
                color: active ? Colors.white : t.muted,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
