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
              _Section(title: 'GST compliance', subtitle: 'Previous filing period', child: GstSection()),
              // Trial balance, debits/credits, suspense — accountant territory,
              // collapsed by default and parked below the owner-facing metrics.
              _Section(
                title: 'For your accountant',
                collapsible: true,
                initiallyExpanded: false,
                child: BooksSection(),
              ),
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

class _Section extends StatefulWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  final bool collapsible;
  final bool initiallyExpanded;
  const _Section({
    required this.title,
    required this.child,
    this.subtitle,
    this.collapsible = false,
    this.initiallyExpanded = true,
  });

  @override
  State<_Section> createState() => _SectionState();
}

class _SectionState extends State<_Section> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final collapsible = widget.collapsible;
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
      child: Row(
        // A chevron has no text baseline, so center-align when collapsible;
        // keep baseline alignment for the subtitle'd sections.
        crossAxisAlignment: collapsible ? CrossAxisAlignment.center : CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(widget.title, style: RunqText.h4.copyWith(color: t.ink)),
          if (widget.subtitle != null) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(widget.subtitle!,
                  style: RunqText.caption.copyWith(color: t.muted2)),
            ),
          ] else if (collapsible)
            const Spacer(),
          if (collapsible)
            AnimatedRotation(
              turns: _expanded ? 0.5 : 0,
              duration: const Duration(milliseconds: 180),
              child: Icon(Icons.keyboard_arrow_down_rounded, color: t.muted2),
            ),
        ],
      ),
    );
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 18),
      sliver: SliverToBoxAdapter(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            collapsible
                ? GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: header,
                  )
                : header,
            if (!collapsible || _expanded) widget.child,
          ],
        ),
      ),
    );
  }
}
