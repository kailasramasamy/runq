// One batch, end to end: where it came from, how much of it is left, and
// every movement that touched it.
//
// Reached by tapping a batch in a raw-material pool. The pool row answers
// "which of these do I open"; this answers "what exactly is this" — the
// consignment behind it, the shift it was collected on, the QC readings, and
// what has already been drawn out of it.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_movement_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_expiry.dart';
import '../../utils/format_qty.dart';
import 'widgets/batch_pool.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/movement_row.dart';

/// Everything the sheet needs about the batch itself. Passed in rather than
/// re-fetched: the caller already has the on-hand row in hand.
class BatchDetailArgs {
  const BatchDetailArgs({
    required this.itemId,
    required this.itemName,
    required this.batchNo,
    required this.qty,
    this.unit,
    this.value,
    this.expiryDate,
    this.warehouseName,
    this.origin,
  });

  final String itemId;
  final String itemName;
  final String batchNo;
  final double qty;
  final String? unit;
  final double? value;
  final String? expiryDate;
  final String? warehouseName;
  final BatchOrigin? origin;

  double? get receivedQty => origin?.receivedQty;
  double? get drawnQty {
    final received = receivedQty;
    return received == null ? null : (received - qty).clamp(0, received);
  }
}

Future<void> showBatchDetailSheet(BuildContext context, BatchDetailArgs args) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BatchDetailSheet(args: args),
    );

class BatchDetailSheet extends ConsumerWidget {
  const BatchDetailSheet({super.key, required this.args});
  final BatchDetailArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: t.bgWarm,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: Column(children: [
          _Grabber(),
          _Header(args: args),
          Expanded(
            child: ListView(
              controller: scrollController,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                _OriginCard(args: args),
                const SizedBox(height: 12),
                _BalanceCard(args: args),
                const SizedBox(height: 12),
                Text(
                  'MOVEMENTS',
                  style: RunqText.label.copyWith(color: t.muted),
                ),
                const SizedBox(height: 6),
                _Movements(args: args),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

class _Grabber extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Container(
          width: 36,
          height: 4,
          decoration: BoxDecoration(
            color: RT(context).hairline,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
      );
}

class _Header extends StatelessWidget {
  const _Header({required this.args});
  final BatchDetailArgs args;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final o = args.origin;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Row(children: [
        Icon(batchOriginIcon(o?.kind), size: 20, color: batchOriginColor(context, o?.kind)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              o?.label ?? args.batchNo,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700),
            ),
            Text(
              args.itemName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// The provenance block. Every field is what somebody would otherwise have to
/// chase through the consignment register to find.
class _OriginCard extends StatelessWidget {
  const _OriginCard({required this.args});
  final BatchDetailArgs args;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final o = args.origin;
    final rows = <(String, String)>[
      ('Batch', args.batchNo.isEmpty ? '—' : args.batchNo),
      if (o?.refNo != null) ('Document', o!.refNo!),
      if (o?.date != null) ('Source date', prettyShortDate(o!.date!)),
      if (o?.shift != null) ('Shift', o!.shift!.toUpperCase()),
      if (o?.milkType != null) ('Milk type', o!.milkType!),
      if (args.warehouseName != null) ('Warehouse', args.warehouseName!),
      if (o?.detail != null) ('Details', o!.detail!),
      // The origin document accounts for part of the batch only — say how
      // much, or the provenance above overstates itself.
      if (o?.hasMixedIntake == true)
        ('From this source', '${formatItemQty(o!.originQtyOrZero, null, unit: args.unit)}'
            '${args.unit != null ? ' ${args.unit}' : ''}'),
      if (o?.hasMixedIntake == true)
        ('Added separately', '${formatItemQty(o!.addedQty!, null, unit: args.unit)}'
            '${args.unit != null ? ' ${args.unit}' : ''}'
            '${o.addedAt != null ? ' · ${prettyShortDate(o.addedAt!)}' : ''}'),
      if (args.expiryDate != null)
        ('Expiry', '${prettyShortDate(args.expiryDate!)} · ${shortExpiry(args.expiryDate)}'),
    ];

    return InvCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(
                width: 96,
                child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
              ),
              Expanded(
                child: Text(
                  value,
                  style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w600),
                ),
              ),
            ]),
          ),
      ]),
    );
  }
}

/// Received → drawn → left. The three numbers that separate a full batch from
/// yesterday's balance.
class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.args});
  final BatchDetailArgs args;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unit = args.unit;
    final received = args.receivedQty;
    final drawn = args.drawnQty;
    return InvCard(
      child: Row(children: [
        _Stat(
          label: 'Received',
          value: received == null ? '—' : formatItemQty(received, null, unit: unit),
          unit: unit,
        ),
        _statDivider(t),
        _Stat(
          label: 'Drawn',
          value: drawn == null ? '—' : formatItemQty(drawn, null, unit: unit),
          unit: unit,
          tone: (drawn ?? 0) > 0 ? InvColors.error : null,
        ),
        _statDivider(t),
        _Stat(
          label: 'Left',
          value: formatItemQty(args.qty, null, unit: unit),
          unit: unit,
          tone: InvColors.success,
          // Absent value means the caller does not deal in money — the
          // Manufacturing pool opens this sheet for provenance, and a
          // "not costed" line there is an answer to a question nobody asked.
          sub: args.value == null
              ? null
              : (args.value! > 0 ? compactINR(args.value!) : 'not costed'),
        ),
      ]),
    );
  }

  Widget _statDivider(RunqTokens t) =>
      Container(width: 1, height: 30, color: t.hairlineSoft);
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.unit, this.tone, this.sub});
  final String label;
  final String value;
  final String? unit;
  final Color? tone;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Column(children: [
        Text(label, style: RunqText.micro.copyWith(color: t.muted)),
        const SizedBox(height: 3),
        Text(
          unit != null && unit!.isNotEmpty ? '$value $unit' : value,
          style: RunqText.body.copyWith(color: tone ?? t.ink, fontWeight: FontWeight.w700),
        ),
        if (sub != null)
          Text(sub!, style: RunqText.micro.copyWith(color: t.muted2)),
      ]),
    );
  }
}

/// The batch's own audit trail — the ledger narrowed to this batch, so a
/// part-used balance can be traced to the run that opened it.
class _Movements extends ConsumerWidget {
  const _Movements({required this.args});
  final BatchDetailArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final query = InvMovementQuery(itemId: args.itemId, batchNo: args.batchNo);
    final async = ref.watch(invItemMovementsProvider(query));

    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => InvCard(
        child: Text(
          'Could not load this batch’s movements.\n$e',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      ),
      data: (page) {
        if (page.rows.isEmpty) {
          return InvCard(
            child: Text(
              'No movements recorded against this batch.',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          );
        }
        return InvCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (final r in page.rows) InvMovementListRow(row: r, unit: args.unit),
            if (page.hasMore)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      context.push('/inventory/items/${args.itemId}/movements');
                    },
                    child: const Text('See the full trail'),
                  ),
                ),
              ),
          ]),
        );
      },
    );
  }
}
