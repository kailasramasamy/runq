import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/section_head.dart';
import '../bills_screen.dart' show BillRow;
import '../invoices_screen.dart' show InvoiceRow;

/// Top-3 recent invoices + bills for the dashboard, each with a "See all"
/// link to the full list. Kept compact so the dashboard stays scannable —
/// power users can drill in via the section header.
class RecentInvoicesSection extends ConsumerWidget {
  const RecentInvoicesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const filter = InvoiceFilter();
    final invoices = ref.watch(invoicesProvider(filter));
    return _Section(
      title: 'Recent invoices',
      seeAllPath: '/sales/invoices',
      child: AsyncSlot(
        value: invoices,
        loading: const _Skeleton(),
        onRetry: () => ref.invalidate(invoicesProvider(filter)),
        data: (page) {
          final items = page.data.take(3).toList();
          if (items.isEmpty) {
            return const _Empty(label: 'No invoices yet');
          }
          final t = RT(context);
          return RunqCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  InvoiceRow(
                    invoice: items[i],
                    compact: true,
                    onAfterAction: () async {
                      ref.invalidate(invoiceSummaryProvider);
                      ref.invalidate(invoicesProvider);
                    },
                  ),
                  if (i < items.length - 1)
                    Padding(
                      padding: const EdgeInsets.only(left: 60),
                      child: Divider(height: 1, thickness: 0.6, color: t.hairline),
                    ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class RecentBillsSection extends ConsumerWidget {
  const RecentBillsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const filter = BillFilter();
    final bills = ref.watch(billsProvider(filter));
    return _Section(
      title: 'Recent bills',
      seeAllPath: '/purchases/bills',
      child: AsyncSlot(
        value: bills,
        loading: const _Skeleton(),
        onRetry: () => ref.invalidate(billsProvider(filter)),
        data: (page) {
          final items = page.data.take(3).toList();
          if (items.isEmpty) {
            return const _Empty(label: 'No bills yet');
          }
          final t = RT(context);
          return RunqCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  BillRow(
                    bill: items[i],
                    compact: true,
                    onAfterAction: () async {
                      ref.invalidate(billsSummaryProvider);
                      ref.invalidate(billsProvider);
                    },
                  ),
                  if (i < items.length - 1)
                    Padding(
                      padding: const EdgeInsets.only(left: 60),
                      child: Divider(height: 1, thickness: 0.6, color: t.hairline),
                    ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String seeAllPath;
  final Widget child;
  const _Section({
    required this.title,
    required this.seeAllPath,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHead(
            title: title,
            action: 'See all',
            onAction: () => context.push(seeAllPath),
          ),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      children: List.generate(
        3,
        (_) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Container(
            height: 56,
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final String label;
  const _Empty({required this.label});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Center(
        child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
      ),
    );
  }
}
