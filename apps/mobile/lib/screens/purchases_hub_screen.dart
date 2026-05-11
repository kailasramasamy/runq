import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/data_providers.dart';
import '../services/bill_intake.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/hub_header.dart';
import '../widgets/hub_quick_chip.dart';
import '../widgets/hub_section_tile.dart';
import '../widgets/section_head.dart';
import 'bills_screen.dart' show BillRow;

class PurchasesHubScreen extends ConsumerWidget {
  const PurchasesHubScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(billsSummaryProvider);
    ref.invalidate(billsProvider(const BillFilter()));
    await ref.read(billsSummaryProvider.future).catchError((_) => throw 0);
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
              child: HubHeader(eyebrow: 'Money out', title: 'Purchases'),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverToBoxAdapter(child: _PurchasesHero()),
            ),
            SliverToBoxAdapter(
              child: HubQuickChipRow(
                chips: [
                  HubQuickChip(
                    icon: Icons.add_rounded,
                    label: 'New bill',
                    // Same Scan / Photos / Files chooser as the FAB's
                    // Add a bill action so the two entry points behave
                    // identically.
                    onTap: () => startBillIntake(context),
                  ),
                  HubQuickChip(
                    icon: Icons.payments_outlined,
                    label: 'Pay runs',
                    onTap: () => context.push('/purchases/pay-runs'),
                  ),
                ],
              ),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 24, 16, 8),
              sliver: SliverToBoxAdapter(child: SectionHead(title: 'Manage')),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverToBoxAdapter(child: _PurchasesGrid()),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: SectionHead(
                  title: 'Recent bills',
                  action: 'See all',
                  onAction: () => context.push('/purchases/bills'),
                ),
              ),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 120),
              sliver: SliverToBoxAdapter(child: _RecentBills()),
            ),
          ],
        ),
      ),
    );
  }
}

class _PurchasesHero extends ConsumerWidget {
  const _PurchasesHero();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(billsSummaryProvider);
    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: const [
          BoxShadow(color: Color(0x331E1B4B), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: summary.when(
        loading: () => const _Skeleton(),
        error: (_, __) => const _Skeleton(),
        data: (s) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'TO PAY',
              style: RunqText.label.copyWith(
                color: Colors.white.withValues(alpha: 0.65),
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              formatINR(s.totalOutstanding),
              style: RunqText.display
                  .copyWith(color: Colors.white, fontSize: 32, height: 1.05),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _Stat(
                    label: 'Overdue',
                    value: formatINR(s.overdueAmount, compact: true),
                    caption:
                        '${s.overdueCount} ${s.overdueCount == 1 ? 'bill' : 'bills'}',
                    accent: const Color(0xFFFCA5A5),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Stat(
                    label: 'Awaiting approval',
                    value: '${s.pendingApprovalCount}',
                    caption: 'pending sign-off',
                    accent: const Color(0xFFFCD34D),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label, value, caption;
  final Color accent;
  const _Stat({
    required this.label,
    required this.value,
    required this.caption,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
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
              style: RunqText.caption
                  .copyWith(color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
          const SizedBox(height: 4),
          Text(value,
              style: RunqText.tabular(size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(color: accent, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'TO PAY',
          style: RunqText.label.copyWith(
            color: Colors.white.withValues(alpha: 0.65),
            fontSize: 11,
          ),
        ),
        const SizedBox(height: 8),
        Text('—',
            style: RunqText.display
                .copyWith(color: Colors.white, fontSize: 32, height: 1.05)),
        const SizedBox(height: 22),
      ],
    );
  }
}

class _PurchasesGrid extends ConsumerWidget {
  const _PurchasesGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(billsSummaryProvider);
    final t = RT(context);
    final overdueCount =
        summary.maybeWhen(data: (s) => s.overdueCount, orElse: () => 0);
    final pendingApproval =
        summary.maybeWhen(data: (s) => s.pendingApprovalCount, orElse: () => 0);

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return HubSectionGrid(
      tiles: [
        HubSectionTile(
          icon: Icons.description_rounded,
          iconBg: isDark ? const Color(0xFF312E81) : const Color(0xFFE0E7FF),
          iconFg: isDark ? const Color(0xFFA5B4FC) : const Color(0xFF4338CA),
          title: 'BILLS',
          metric: pendingApproval > 0 ? '$pendingApproval pending' : 'View all',
          caption: pendingApproval > 0 ? 'awaiting approval' : null,
          captionColor: pendingApproval > 0 ? const Color(0xFF92400E) : t.muted,
          onTap: () => context.push(
            pendingApproval > 0
                ? '/purchases/bills?tab=to_approve'
                : '/purchases/bills',
          ),
        ),
        HubSectionTile(
          icon: Icons.payments_rounded,
          iconBg: isDark ? const Color(0xFF4C1D95) : const Color(0xFFEDE9FE),
          iconFg: isDark ? const Color(0xFFC4B5FD) : const Color(0xFF6D28D9),
          title: 'PAY RUNS',
          metric: overdueCount > 0 ? '$overdueCount overdue' : 'Schedule',
          caption: overdueCount > 0 ? 'tap to release' : 'batch payments',
          captionColor: overdueCount > 0 ? RunqColors.redInk : t.muted,
          onTap: () => context.push('/purchases/pay-runs'),
        ),
      ],
    );
  }
}

class _RecentBills extends ConsumerWidget {
  const _RecentBills();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bills = ref.watch(billsProvider(const BillFilter()));
    return AsyncSlot(
      value: bills,
      onRetry: () => ref.invalidate(billsProvider(const BillFilter())),
      data: (page) {
        final items = page.data.take(5).toList();
        if (items.isEmpty) {
          return const EmptyState(
            icon: Icons.description_outlined,
            title: 'No bills yet',
            subtitle: 'Scan a bill from the + button to get started.',
          );
        }
        return Column(
          children: [
            for (final b in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: BillRow(
                  bill: b,
                  onAfterAction: () async {
                    ref.invalidate(billsSummaryProvider);
                    ref.invalidate(billsProvider(const BillFilter()));
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}
