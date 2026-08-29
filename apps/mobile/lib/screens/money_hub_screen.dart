import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/data_providers.dart';
import '../providers/spends_feed_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/hub_header.dart';
import '../widgets/hub_section_tile.dart';
import '../widgets/section_head.dart';
import '../widgets/sparkline.dart';

class MoneyHubScreen extends ConsumerWidget {
  const MoneyHubScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(dashboardSummaryProvider);
    ref.invalidate(cashTrendProvider);
    ref.invalidate(bankAccountsProvider);
    await ref.read(dashboardSummaryProvider.future).catchError((_) => throw 0);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: RT(context).brand,
        onRefresh: () => _refresh(ref),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            const SliverToBoxAdapter(
              child: HubHeader(eyebrow: 'Money status', title: 'Money'),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverToBoxAdapter(child: _MoneyHero()),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              sliver: SliverToBoxAdapter(child: SectionHead(title: 'Insights')),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 120),
              sliver: SliverToBoxAdapter(child: _MoneyGrid()),
            ),
          ],
        ),
      ),
    );
  }
}

class _MoneyHero extends ConsumerWidget {
  const _MoneyHero();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(dashboardSummaryProvider);
    final trend = ref.watch(cashTrendProvider);
    final accounts = ref.watch(bankAccountsProvider);
    final accountCount =
        accounts.maybeWhen(data: (l) => l.length, orElse: () => 0);
    final spark = trend.maybeWhen(data: (t) => t.spark, orElse: () => const <double>[]);
    final delta = trend.maybeWhen(data: (t) => t.weeklyDelta, orElse: () => 0.0);
    final cash = trend.maybeWhen(
      data: (t) => t.cashPosition,
      orElse: () => summary.maybeWhen(data: (s) => s.cashPosition, orElse: () => 0.0),
    );
    final loaded = summary.hasValue || trend.hasValue;
    final hasMovement = spark.length >= 2 && spark.any((v) => v != spark.first);

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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CASH POSITION',
                      style: RunqText.label.copyWith(
                        color: Colors.white.withValues(alpha: 0.65),
                      ),
                    ),
                    const Spacer(),
                    if (accountCount > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '$accountCount ${accountCount == 1 ? 'account' : 'accounts'}',
                          style: RunqText.caption.copyWith(
                            color: Colors.white,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  loaded ? formatINR(cash) : '—',
                  style: RunqText.display
                      .copyWith(color: Colors.white, height: 1.05),
                ),
                const SizedBox(height: 6),
                if (trend.hasValue)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        delta >= 0
                            ? Icons.arrow_upward_rounded
                            : Icons.arrow_downward_rounded,
                        size: 14,
                        color: Colors.white.withValues(alpha: 0.78),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${delta >= 0 ? '+' : '−'}${formatINR(delta.abs())} this week',
                        style: RunqText.body.copyWith(
                          color: Colors.white.withValues(alpha: 0.78),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          if (hasMovement)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
              child: SizedBox(
                height: 64,
                child: Sparkline(
                  data: spark,
                  stroke: Colors.white,
                  fill: const Color(0x33FFFFFF),
                  height: 64,
                ),
              ),
            )
          else
            const SizedBox(height: 18),
        ],
      ),
    );
  }
}

class _MoneyGrid extends ConsumerWidget {
  const _MoneyGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(bankAccountsProvider);
    final summary = ref.watch(dashboardSummaryProvider);
    final t = RT(context);

    final accountCount =
        accounts.maybeWhen(data: (l) => l.length, orElse: () => 0);
    final totalBalance = accounts.maybeWhen(
      data: (l) => l.fold<double>(0, (s, a) => s + a.currentBalance),
      orElse: () => 0.0,
    );
    final receivables = summary.maybeWhen(
      data: (s) => s.outstandingReceivables,
      orElse: () => 0.0,
    );
    final spends = ref.watch(spendsLast30Provider);
    final readiness = ref.watch(gstReadinessProvider);
    final gstMetric = readiness.maybeWhen(
      data: (g) => g == null ? 'Set up' : '${g.score}% ready',
      orElse: () => '—',
    );
    final gstCaption = readiness.maybeWhen(
      data: (g) {
        if (g == null) return 'add GSTIN to begin';
        final days = g.daysToGstr1;
        if (days == null) return g.periodLabel.toLowerCase();
        if (days < 0) return 'overdue · ${g.periodLabel.toLowerCase()}';
        return 'GSTR-1 due in $days ${days == 1 ? 'day' : 'days'}';
      },
      orElse: () => 'filing readiness',
    );

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return HubSectionGrid(
      tiles: [
        HubSectionTile(
          icon: Icons.account_balance_rounded,
          iconBg: isDark ? const Color(0xFF312E81) : const Color(0xFFE0E7FF),
          iconFg: isDark ? const Color(0xFFA5B4FC) : const Color(0xFF4338CA),
          title: 'BANKING',
          metric: accountCount > 0
              ? formatINR(totalBalance, compact: true)
              : 'Add account',
          caption: accountCount > 0
              ? '$accountCount ${accountCount == 1 ? 'account' : 'accounts'}'
              : 'no accounts yet',
          onTap: () => context.push('/money/banking'),
        ),
        HubSectionTile(
          icon: Icons.show_chart_rounded,
          iconBg: isDark ? const Color(0xFF064E3B) : const Color(0xFFD1FAE5),
          iconFg: isDark ? const Color(0xFF6EE7B7) : const Color(0xFF047857),
          title: 'CASH FLOW',
          metric: '90 days',
          caption: 'projection & forecast',
          onTap: () => context.push('/money/cash-flow'),
        ),
        HubSectionTile(
          icon: Icons.insights_rounded,
          iconBg: isDark ? const Color(0xFF4C1D95) : const Color(0xFFEDE9FE),
          iconFg: isDark ? const Color(0xFFC4B5FD) : const Color(0xFF6D28D9),
          title: 'ANALYTICS',
          metric: 'Live',
          caption: 'cash · AR/AP · GST · books',
          onTap: () => context.push('/money/analytics'),
        ),
        HubSectionTile(
          icon: Icons.bar_chart_rounded,
          iconBg: isDark ? const Color(0xFF1E3A8A) : const Color(0xFFDBEAFE),
          iconFg: isDark ? const Color(0xFF93C5FD) : const Color(0xFF1E40AF),
          title: 'P&L REPORTS',
          metric: 'This month',
          caption: 'revenue · expenses',
          onTap: () => context.push('/money/reports'),
        ),
        HubSectionTile(
          icon: Icons.handshake_outlined,
          iconBg: isDark ? const Color(0xFF78350F) : const Color(0xFFFEF3C7),
          iconFg: isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E),
          title: 'RECEIVABLES',
          metric: formatINR(receivables, compact: true),
          caption: 'outstanding from customers',
          captionColor: t.muted,
          onTap: () => context.push('/sales/collections'),
        ),
        HubSectionTile(
          icon: Icons.trending_down_rounded,
          iconBg: isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2),
          iconFg: isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C),
          title: 'SPENDS',
          metric: spends.maybeWhen(
            data: (s) => formatINR(s.grandTotal, compact: true),
            orElse: () => '—',
          ),
          caption: 'paid out · last 30 days',
          captionColor: t.muted,
          onTap: () => context.push('/money/spends'),
        ),
        HubSectionTile(
          icon: Icons.receipt_long_outlined,
          iconBg: isDark ? const Color(0xFF1E3A8A) : const Color(0xFFDBEAFE),
          iconFg: isDark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8),
          title: 'GST FILING',
          metric: gstMetric,
          caption: gstCaption,
          onTap: () => context.push('/gst'),
        ),
        HubSectionTile(
          icon: Icons.savings_outlined,
          iconBg: isDark ? const Color(0xFF581C87) : const Color(0xFFF3E8FF),
          iconFg: isDark ? const Color(0xFFD8B4FE) : const Color(0xFF7C3AED),
          title: 'EXPENSES',
          metric: 'Reimbursements',
          caption: 'out-of-pocket spends',
          onTap: () => context.push('/expenses'),
        ),
      ],
    );
  }
}
