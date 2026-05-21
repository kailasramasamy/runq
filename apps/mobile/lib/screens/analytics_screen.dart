import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/analytics_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'analytics/kpi_strip.dart';
import 'analytics/section_activity.dart';
import 'analytics/section_arap.dart';
import 'analytics/section_books.dart';
import 'analytics/section_cash.dart';
import 'analytics/section_gst.dart';
import 'analytics/section_performance.dart';

class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    invalidateAllAnalytics(ref);
    // Drive the indicator off one core metric; the rest will resolve in parallel.
    await ref.read(cashPositionProvider.future).catchError((_) => null);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: RT(context).brand,
          onRefresh: () => _refresh(ref),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: const [
              SliverToBoxAdapter(child: _Header()),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 18),
                sliver: SliverToBoxAdapter(child: AnalyticsKpiStrip()),
              ),
              _Section(title: 'Cash & liquidity', child: CashSection()),
              _Section(title: 'Receivables & payables', child: ArApSection()),
              _Section(title: 'Activity', child: ActivitySection()),
              _Section(title: 'Performance', subtitle: 'Last 12 months', child: PerformanceSection()),
              _Section(title: 'Books health', child: BooksSection()),
              _Section(title: 'GST compliance', subtitle: 'Previous filing period', child: GstSection()),
              SliverToBoxAdapter(child: SizedBox(height: 120)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 14),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Money status',
                    style: RunqText.body.copyWith(color: t.muted)),
                Text('Analytics', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  const _Section({required this.title, required this.child, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 18),
      sliver: SliverToBoxAdapter(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(title,
                      style: RunqText.h4.copyWith(color: t.ink)),
                  if (subtitle != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(subtitle!,
                          style: RunqText.caption.copyWith(color: t.muted2)),
                    ),
                  ],
                ],
              ),
            ),
            child,
          ],
        ),
      ),
    );
  }
}
