// "Awaiting dispatch" — issued invoices whose goods haven't left the
// warehouse yet. Tapping a row opens the confirm screen, where FEFO batches
// are pre-picked and one tap posts the stock movement.
//
// This is the invoice-driven lane into the delivery note; the hand-keyed
// lane is the existing "+ New Dispatch" sheet. Both post the same document.
//
// Rows are grouped by invoice date into one card per day, oldest day first —
// the queue is worked front-to-back, so the day that has waited longest sits
// at the top. Amounts show in full (₹1,23,456) rather than compact: this is a
// list you reconcile against a customer's invoice, and "₹1.2L" doesn't match.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/sales_dispatch_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/list_filter_kit.dart';
import 'widgets/inv_colors.dart';
import 'widgets/queue_actions_sheet.dart';
import 'widgets/inv_primitives.dart';

class InventoryPendingDispatchScreen extends ConsumerStatefulWidget {
  const InventoryPendingDispatchScreen({super.key});
  @override
  ConsumerState<InventoryPendingDispatchScreen> createState() => _State();
}

/// One invoice date and the invoices raised on it.
typedef _DayGroup = ({DateTime day, List<InvPendingDispatch> rows});

class _State extends ConsumerState<InventoryPendingDispatchScreen> {
  String _search = '';
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<InvPendingDispatch> _filter(List<InvPendingDispatch> all) {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return all;
    return all
        .where((r) =>
            r.invoiceNumber.toLowerCase().contains(q) ||
            r.customerName.toLowerCase().contains(q))
        .toList();
  }

  /// Preserves the server's oldest-first order within each day, and orders
  /// the days the same way. Rows with an unparseable date fall to the end
  /// rather than vanishing.
  List<_DayGroup> _group(List<InvPendingDispatch> rows) {
    final byDay = <String, List<InvPendingDispatch>>{};
    for (final r in rows) {
      byDay.putIfAbsent(r.invoiceDate, () => []).add(r);
    }
    final keys = byDay.keys.toList()..sort();
    return [
      for (final k in keys)
        if (DateTime.tryParse(k) case final d?) (day: d, rows: byDay[k]!),
    ];
  }

  Future<void> _refresh() async {
    ref.invalidate(invPendingDispatchProvider);
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = ref.watch(invPendingDispatchProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Awaiting dispatch',
        onBack: () => context.pop(),
        // Both actions work the server-side queue, not the rows on screen —
        // the count behind this list runs well past the 100 it loads.
        trailing: switch (rows.valueOrNull?.total ?? 0) {
          0 => null,
          final total => _QueueMenu(total: total),
        },
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: _refresh,
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Failed to load: $e',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
            ),
          ),
          data: (page) {
            final list = page.rows;
            final filtered = _filter(list);
            final groups = _group(filtered);
            return CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: InvSearchBar(
                      controller: _searchCtrl,
                      onChanged: (v) => setState(() => _search = v),
                      hint: 'Invoice number or customer…',
                    ),
                  ),
                ),
                if (groups.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: InvEmptyState(
                      icon: Icons.inventory_2_outlined,
                      title: list.isEmpty ? 'Nothing awaiting dispatch' : 'No matches',
                      subtitle: list.isEmpty
                          ? 'Every issued invoice has had its goods sent'
                          : 'Try a different search',
                    ),
                  )
                else ...[
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                    sliver: SliverList.separated(
                      itemCount: groups.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 16),
                      itemBuilder: (_, i) => _DaySection(group: groups[i]),
                    ),
                  ),
                  // The request is capped, so say what isn't on screen rather
                  // than let the last row imply the queue ends there.
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                      child: Text(
                        page.total > list.length
                            ? 'Showing the oldest ${list.length} of ${page.total} — '
                                'dispatch these to see the rest'
                            : '${list.length} invoice${list.length == 1 ? '' : 's'} waiting',
                        textAlign: TextAlign.center,
                        style: RunqText.micro.copyWith(color: t.muted2),
                      ),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// A date header plus one merged card holding that day's invoices, hairline-
/// separated. Cheaper to scan than a card per invoice when a customer raises
/// six invoices on the same morning.
class _DaySection extends StatelessWidget {
  const _DaySection({required this.group});
  final _DayGroup group;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = group.rows;
    final dayTotal = rows.fold<double>(0, (s, r) => s + r.totalAmount);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(listDayLabel(group.day), style: RunqText.h4.copyWith(color: t.ink)),
              const SizedBox(width: 8),
              Text('${rows.length} invoice${rows.length == 1 ? '' : 's'}',
                  style: RunqText.caption.copyWith(color: t.muted2)),
              const Spacer(),
              Text(indianINR(dayTotal), style: RunqText.caption.copyWith(color: t.muted2)),
            ],
          ),
        ),
        InvCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 1, color: t.hairlineSoft),
                _InvoiceRow(row: rows[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({required this.row});
  final InvPendingDispatch row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push(
          row.openDraftDnId != null
              ? '/inventory/delivery/${row.openDraftDnId}'
              : '/inventory/dispatch-invoice/${row.id}',
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.invoiceNumber, style: RunqText.bodyStrong),
                    const SizedBox(height: 2),
                    Text(row.customerName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(height: 6),
                    _RowChips(row: row),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(indianINR(row.totalAmount), style: RunqText.bodyStrong),
                  const SizedBox(height: 4),
                  Icon(Icons.chevron_right, size: 16, color: t.muted2),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RowChips extends StatelessWidget {
  const _RowChips({required this.row});
  final InvPendingDispatch row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // The washes are alpha over the card surface so they work in both
    // themes; the inks have to flip, or dark-on-dark swallows the label.
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('${row.stockableCount}/${row.lineCount} stockable',
            style: RunqText.micro.copyWith(color: t.muted2)),
        if (row.unmappedCount > 0)
          _Chip(
            label: '${row.unmappedCount} unmapped',
            ink: dark ? InvColors.amberLight : InvColors.amberDeep,
            bg: InvColors.amberSubtle,
          ),
        if (row.dispatchedCount > 0)
          _Chip(
            label: 'Part sent',
            ink: dark ? const Color(0xFF93C5FD) : InvColors.info,
            bg: InvColors.infoBg,
          ),
        if (row.openDraftDnId != null)
          _Chip(label: 'Draft open', ink: t.muted2, bg: t.hairlineSoft),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.ink, required this.bg});
  final String label;
  final Color ink;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: RunqText.micro.copyWith(color: ink)),
    );
  }
}

/// Opens the queue actions — see [showQueueActionsSheet] for why the two
/// live behind one entry point rather than sitting on the app bar.
class _QueueMenu extends ConsumerWidget {
  const _QueueMenu({required this.total});
  final int total;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      icon: Icon(Icons.more_vert, color: InvColors.brand(context)),
      tooltip: 'Queue actions',
      onPressed: () => showQueueActionsSheet(context, ref, pendingTotal: total),
    );
  }
}
