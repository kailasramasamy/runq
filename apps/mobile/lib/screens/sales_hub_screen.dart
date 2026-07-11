import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/data_providers.dart';
import '../widgets/invoice_create_sheet.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/hub_header.dart';
import '../widgets/hub_quick_chip.dart';
import '../widgets/hub_section_tile.dart';
import '../widgets/section_head.dart';
import 'invoices_screen.dart' show InvoiceRow;

class SalesHubScreen extends ConsumerWidget {
  const SalesHubScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(invoiceSummaryProvider);
    ref.invalidate(invoicesProvider);
    await ref
        .read(invoiceSummaryProvider.future)
        .catchError((_) => throw 0);
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
              child: HubHeader(eyebrow: 'Money in', title: 'Sales'),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverToBoxAdapter(child: _SalesHero()),
            ),
            SliverToBoxAdapter(
              child: HubQuickChipRow(
                chips: [
                  HubQuickChip(
                    icon: Icons.add_rounded,
                    label: 'New invoice',
                    // Opens the same 4-option chooser as the FAB's Create
                    // Invoice — From PO / Quick / Blank / Upload — so the
                    // hub entry point doesn't shortcut into a single flow.
                    onTap: () => showInvoiceCreateSheet(context),
                  ),
                  HubQuickChip(
                    icon: Icons.inbox_outlined,
                    label: 'Customer orders',
                    onTap: () => context.push('/sales/orders'),
                  ),
                  HubQuickChip(
                    icon: Icons.notifications_active_outlined,
                    label: 'Send reminders',
                    onTap: () => context.push('/sales/collections'),
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
              sliver: SliverToBoxAdapter(child: _SalesGrid()),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: SectionHead(
                  title: 'Recent invoices',
                  action: 'See all',
                  onAction: () => context.push('/sales/invoices'),
                ),
              ),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 120),
              sliver: SliverToBoxAdapter(child: _RecentInvoices()),
            ),
          ],
        ),
      ),
    );
  }
}

class _SalesHero extends ConsumerWidget {
  const _SalesHero();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(invoiceSummaryProvider);
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
        loading: () => const _HeroSkeleton(),
        error: (_, __) => const _HeroSkeleton(),
        data: (s) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'OUTSTANDING',
              style: RunqText.label.copyWith(
                color: Colors.white.withValues(alpha: 0.65),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              formatINR(s.totalOutstanding),
              style: RunqText.display
                  .copyWith(color: Colors.white, height: 1.05),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _HeroStat(
                    label: 'Overdue',
                    value: formatINR(s.overdueAmount, compact: true),
                    caption: '${s.overdueCount} ${s.overdueCount == 1 ? 'invoice' : 'invoices'}',
                    accent: const Color(0xFFFCA5A5),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _HeroStat(
                    label: 'Received this month',
                    value: formatINR(s.receivedThisMonth, compact: true),
                    caption: 'collected',
                    accent: const Color(0xFFA7F3D0),
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

class _HeroStat extends StatelessWidget {
  final String label, value, caption;
  final Color accent;
  const _HeroStat({
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
                  .copyWith(color: Colors.white.withValues(alpha: 0.7))),
          const SizedBox(height: 4),
          Text(value, style: RunqText.tabular(size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(color: accent),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _HeroSkeleton extends StatelessWidget {
  const _HeroSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'OUTSTANDING',
          style: RunqText.label.copyWith(
            color: Colors.white.withValues(alpha: 0.65),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '—',
          style: RunqText.display
              .copyWith(color: Colors.white, height: 1.05),
        ),
        const SizedBox(height: 22),
      ],
    );
  }
}

class _SalesGrid extends ConsumerWidget {
  const _SalesGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(invoiceSummaryProvider);
    final t = RT(context);
    final overdueAmount =
        summary.maybeWhen(data: (s) => s.overdueAmount, orElse: () => 0.0);
    final overdueCount =
        summary.maybeWhen(data: (s) => s.overdueCount, orElse: () => 0);
    final draftCount =
        summary.maybeWhen(data: (s) => s.draftCount, orElse: () => 0);

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return HubSectionGrid(
      tiles: [
        HubSectionTile(
          icon: Icons.receipt_long_rounded,
          iconBg: isDark ? const Color(0xFF312E81) : const Color(0xFFE0E7FF),
          iconFg: isDark ? const Color(0xFFA5B4FC) : const Color(0xFF4338CA),
          title: 'INVOICES',
          metric: draftCount > 0 ? '$draftCount draft' : 'View all',
          caption: draftCount > 0 ? 'tap to send' : null,
          // Drafts is the actionable state — preselect that tab so tapping
          // "20 draft" lands the user on exactly that filtered list.
          onTap: () => context.push(
            draftCount > 0 ? '/sales/invoices?tab=draft' : '/sales/invoices',
          ),
        ),
        HubSectionTile(
          icon: Icons.notifications_active_rounded,
          iconBg: isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2),
          iconFg: isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C),
          title: 'AGING & COLLECTIONS',
          metric: overdueCount > 0
              ? formatINR(overdueAmount, compact: true)
              : 'All clear',
          caption: overdueCount > 0 ? '$overdueCount overdue' : 'no overdue',
          captionColor: overdueCount > 0 ? RunqColors.redInk : t.muted,
          onTap: () => context.push('/sales/collections'),
        ),
      ],
    );
  }
}

class _RecentInvoices extends ConsumerWidget {
  const _RecentInvoices();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoices = ref.watch(invoicesProvider(const InvoiceFilter()));
    return AsyncSlot(
      value: invoices,
      onRetry: () => ref.invalidate(invoicesProvider(const InvoiceFilter())),
      data: (page) {
        final items = page.data.take(5).toList();
        if (items.isEmpty) {
          return const EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'No invoices yet',
            subtitle: 'Create your first invoice from the + button.',
          );
        }
        return Column(
          children: [
            for (final inv in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InvoiceRow(
                  invoice: inv,
                  onAfterAction: () async {
                    ref.invalidate(invoiceSummaryProvider);
                    ref.invalidate(invoicesProvider);
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}
