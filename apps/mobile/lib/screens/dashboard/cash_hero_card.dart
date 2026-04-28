import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/models.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../utils/format_inr.dart';
import '../../widgets/sparkline.dart';

class CashHeroCard extends ConsumerWidget {
  const CashHeroCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(dashboardSummaryProvider);
    final trend = ref.watch(cashTrendProvider);
    final accounts = ref.watch(bankAccountsProvider);
    final accountCount = accounts.maybeWhen(data: (l) => l.length, orElse: () => 0);
    final sparkData = trend.maybeWhen(data: (t) => t.spark, orElse: () => const <double>[]);
    final weeklyDelta = trend.maybeWhen(data: (t) => t.weeklyDelta, orElse: () => 0.0);
    final cashPosition = trend.maybeWhen(
      data: (t) => t.cashPosition,
      orElse: () => summary.maybeWhen(data: (s) => s.cashPosition, orElse: () => 0.0),
    );

    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: const [
          BoxShadow(color: Color(0x331E1B4B), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 16, 0),
            child: _HeroBody(
              cashPosition: cashPosition,
              loaded: summary.hasValue || trend.hasValue,
              accountCount: accountCount,
              weeklyDelta: weeklyDelta,
              hasTrend: trend.hasValue,
            ),
          ),
          if (_hasMovement(sparkData))
            _SparkSection(data: sparkData)
          else
            const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
            child: Row(
              children: [
                Expanded(child: _MiniStat(summary: summary, kind: _Kind.ar)),
                const SizedBox(width: 10),
                Expanded(child: _MiniStat(summary: summary, kind: _Kind.ap)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

bool _hasMovement(List<double> data) {
  if (data.length < 2) return false;
  final first = data.first;
  for (final v in data) {
    if (v != first) return true;
  }
  return false;
}

class _HeroBody extends StatelessWidget {
  final double cashPosition;
  final bool loaded;
  final int accountCount;
  final double weeklyDelta;
  final bool hasTrend;
  const _HeroBody({
    required this.cashPosition,
    required this.loaded,
    required this.accountCount,
    required this.weeklyDelta,
    required this.hasTrend,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'CASH POSITION',
                style: RunqText.label.copyWith(
                  color: Colors.white.withValues(alpha: 0.65),
                  fontSize: 11,
                ),
              ),
            ),
            const Spacer(),
            if (accountCount > 0) _AccountsPill(count: accountCount),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          loaded ? formatINR(cashPosition) : '—',
          style: RunqText.display.copyWith(color: Colors.white, fontSize: 32, height: 1.05),
        ),
        const SizedBox(height: 6),
        if (hasTrend) _TrendChip(delta: weeklyDelta),
      ],
    );
  }
}

class _AccountsPill extends StatelessWidget {
  final int count;
  const _AccountsPill({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$count ${count == 1 ? 'account' : 'accounts'}',
        style: RunqText.caption.copyWith(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _TrendChip extends StatelessWidget {
  final double delta;
  const _TrendChip({required this.delta});

  @override
  Widget build(BuildContext context) {
    final positive = delta >= 0;
    final tint = Colors.white.withValues(alpha: 0.78);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          positive ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
          size: 14, color: tint,
        ),
        const SizedBox(width: 4),
        Text(
          '${positive ? '+' : '−'}${formatINR(delta.abs())} this week',
          style: RunqText.caption.copyWith(color: tint, fontSize: 13, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }
}

class _SparkSection extends StatelessWidget {
  final List<double> data;
  const _SparkSection({required this.data});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
      child: Column(
        children: [
          SizedBox(
            height: 64,
            child: Sparkline(
              data: data,
              stroke: Colors.white,
              fill: const Color(0x33FFFFFF),
              height: 64,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('14 days ago',
                    style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.55), fontSize: 11)),
                Text('today',
                    style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.55), fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum _Kind { ar, ap }

class _MiniStat extends StatelessWidget {
  final AsyncValue<DashboardSummary> summary;
  final _Kind kind;
  const _MiniStat({required this.summary, required this.kind});

  @override
  Widget build(BuildContext context) {
    final isAr = kind == _Kind.ar;
    final label = isAr ? 'To collect (AR)' : 'To pay (AP)';
    String value = '—';
    String caption = '';
    Color captionColor = const Color(0xFFFCD34D);
    summary.whenData((s) {
      final amount = isAr ? s.outstandingReceivables : s.outstandingPayables;
      value = formatINR(amount, compact: true);
      if (isAr) {
        caption = '${s.overdueCount} overdue';
        captionColor = const Color(0xFFFCA5A5);
      } else {
        caption = '${s.upcomingCount} due this week';
        captionColor = const Color(0xFFFCD34D);
      }
    });
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
          const SizedBox(height: 4),
          Text(value, style: RunqText.tabular(size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(color: captionColor, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
