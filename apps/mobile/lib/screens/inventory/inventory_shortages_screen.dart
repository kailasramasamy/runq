// Goods that were billed and never left.
//
// Auto-dispatch has always parked the uncovered remainder of a short line on
// a draft delivery note. The parking worked; the finding did not — the
// shortage announced itself once, in a toast, to whoever happened to be
// issuing the invoice, and after that it was a draft indistinguishable from
// every other draft in the system.
//
// The column that makes this list work is "on hand". The shortfall was
// measured the night the van left, and by morning the shelf has usually
// changed: a row stock has caught up on needs nothing but a tap to post, and
// those are pulled to the top because they are the whole morning's work.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/sales_dispatch_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class InventoryShortagesScreen extends ConsumerStatefulWidget {
  const InventoryShortagesScreen({super.key});
  @override
  ConsumerState<InventoryShortagesScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryShortagesScreen> {
  bool _coverableOnly = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(invShortagesProvider(_coverableOnly));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(title: 'Shortages', onBack: () => context.pop()),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load shortages: $e',
                style: RunqText.body.copyWith(color: t.muted),
                textAlign: TextAlign.center),
          ),
        ),
        data: (page) {
          final rows = _ordered(page.rows);
          return RefreshIndicator(
            onRefresh: () async =>
                ref.invalidate(invShortagesProvider(_coverableOnly)),
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                _FilterRow(
                  total: page.total,
                  coverableOnly: _coverableOnly,
                  onToggle: (v) => setState(() => _coverableOnly = v),
                ),
                const SizedBox(height: 12),
                if (rows.isEmpty)
                  _Empty(coverableOnly: _coverableOnly)
                else
                  for (final r in rows) ...[
                    _ShortageCard(row: r),
                    const SizedBox(height: 8),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }

  /// Coverable rows first — they are the ones that can be cleared right now.
  /// Within each group the server's oldest-first order stands, because age is
  /// how long a customer has been waiting.
  List<InvShortageLine> _ordered(List<InvShortageLine> rows) {
    final ready = rows.where((r) => r.coverable).toList();
    final waiting = rows.where((r) => !r.coverable).toList();
    return [...ready, ...waiting];
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.total,
    required this.coverableOnly,
    required this.onToggle,
  });
  final int total;
  final bool coverableOnly;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            '$total line${total == 1 ? '' : 's'} owed',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ),
        FilterChip(
          selected: coverableOnly,
          onSelected: onToggle,
          label: Text('Ready to post',
              style: RunqText.caption.copyWith(
                color: coverableOnly ? Colors.white : t.ink,
              )),
          selectedColor: InvColors.brand(context),
          backgroundColor: t.surface,
          checkmarkColor: Colors.white,
          side: BorderSide(color: coverableOnly ? Colors.transparent : t.hairline),
        ),
      ],
    );
  }
}

class _ShortageCard extends StatelessWidget {
  const _ShortageCard({required this.row});
  final InvShortageLine row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      onTap: () => context.push('/inventory/delivery/${row.dnId}'),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(row.itemName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 8),
              Text('${_n(row.shortQty)} ${row.uom ?? ''}'.trim(),
                  style: RunqText.bodyStrong.copyWith(color: InvColors.error)),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            [
              if (row.customerName != null) row.customerName!,
              if (row.invoiceNumber != null) row.invoiceNumber!,
            ].join(' · '),
            style: RunqText.caption.copyWith(color: t.muted),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 7),
          Wrap(
            spacing: 5,
            runSpacing: 4,
            children: [
              _Pill(
                label: row.coverable ? 'Stock arrived' : 'On hand ${_n(row.availableQty)}',
                color: row.coverable ? InvColors.success : InvColors.error,
              ),
              _Pill(label: _age(row.ageDays), color: _ageColor(row.ageDays)),
              if (!row.coverable && row.substituteCount > 0)
                _Pill(
                  label: '${row.substituteCount} substitute'
                      '${row.substituteCount == 1 ? '' : 's'}',
                  color: InvColors.info,
                ),
            ],
          ),
        ],
      ),
    );
  }

  static String _age(int days) => switch (days) {
        <= 0 => 'Today',
        1 => '1 day',
        _ => '$days days',
      };

  /// Age is the customer's wait, so it earns colour once it stops being today.
  static Color _ageColor(int days) => switch (days) {
        <= 0 => InvColors.info,
        1 || 2 => InvColors.orangeAlert,
        _ => InvColors.error,
      };
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: RunqText.caption.copyWith(color: color)),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.coverableOnly});
  final bool coverableOnly;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          Icon(Icons.inventory_2_outlined, size: 34, color: t.muted2),
          const SizedBox(height: 10),
          Text(coverableOnly ? 'Nothing ready to post' : 'Nothing short',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              coverableOnly
                  ? 'No shortfall has been covered by stock yet.'
                  : 'Every invoiced line has been covered by stock or sent.',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

String _n(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
