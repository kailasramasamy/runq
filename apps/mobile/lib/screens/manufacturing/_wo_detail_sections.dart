// WO detail — the sections below the hero.
//
// These used to be four text-heavy cards: Materials (expected, with a "—" in
// the actual column), Actuals (the same inputs again as small grey lines, plus
// output), Costing as label/value rows, and a vertical four-row stepper. On a
// posted run that is the same numbers written twice and a screen you have to
// read rather than scan.
//
// Restructured to one row per fact: materials merge expected *into* actual,
// output gets its own block, costing is three tiles, and the lifecycle is a
// single horizontal rail.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/inventory_models.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Trims trailing zeros: 14.5000 → "14.5", 29 → "29". The API sends four
/// decimals for everything; a plant floor does not read four decimals.
String woQty(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v
      .toStringAsFixed(3)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

/// What the run needs and what it actually took, in one row per input.
///
/// Draft runs are the exception: nothing has been consumed, so the useful
/// comparison is against stock on hand instead.
class WoMaterialsCard extends ConsumerWidget {
  const WoMaterialsCard({super.key, required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    if (wo.isDraft) return _draftCard(context, ref, t);

    final rows = ref.watch(woConsumptionProvider(wo.id)).asData?.value ??
        const <WoConsumptionRow>[];
    final byItem = <String, List<WoConsumptionRow>>{};
    for (final r in rows) {
      byItem.putIfAbsent(r.inputItemId, () => []).add(r);
    }

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _CardHeader(label: 'Consumed', hint: 'vs expected'),
        const SizedBox(height: 12),
        for (var i = 0; i < wo.expectedLines.length; i++) ...[
          if (i > 0) Divider(color: t.hairline, height: 20),
          _ConsumedRow(
            name: wo.expectedLines[i].inputItemName,
            expected: wo.expectedLines[i].expectedQty(wo.plannedQty),
            uom: wo.expectedLines[i].inputUom,
            actual: byItem.remove(wo.expectedLines[i].inputItemId),
          ),
        ],
        // Anything consumed that the BOM didn't call for — a substitution the
        // operator made at the line. Never silently dropped.
        for (final extra in byItem.values) ...[
          Divider(color: t.hairline, height: 20),
          _ConsumedRow(
            name: extra.first.inputItemName,
            expected: null,
            uom: extra.first.uom,
            actual: extra,
          ),
        ],
        if (wo.expectedLines.isEmpty && byItem.isEmpty)
          Text('Nothing consumed.', style: RunqText.caption.copyWith(color: t.muted)),
      ]),
    );
  }

  Widget _draftCard(BuildContext context, WidgetRef ref, RunqTokens t) {
    final stock = ref
            .watch(invOnHandProvider((
              warehouseId: wo.warehouseId,
              lowOnly: false,
              itemClassGroup: 'inputs',
            )))
            .asData
            ?.value ??
        const <InvOnHandRow>[];
    final available = <String, double>{};
    for (final r in stock) {
      available[r.itemId] = (available[r.itemId] ?? 0) + r.qty;
    }
    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _CardHeader(label: 'Materials', hint: 'vs stock on hand'),
        const SizedBox(height: 12),
        if (wo.expectedLines.isEmpty)
          Text('This BOM has no input lines, so nothing will be consumed.',
              style: RunqText.caption.copyWith(color: t.muted))
        else
          for (final (i, row) in _materialRows(available).indexed) ...[
            if (i > 0) Divider(color: t.hairline, height: 20),
            _RequiredRow(row: row),
          ],
      ]),
    );
  }

  /// Materials as the recipe states them: one row per line, with the stock
  /// behind it counting anything the line accepts instead of its own item —
  /// otherwise a line that takes any raw milk reads as short on one type while
  /// the tank is full of another.
  List<_MaterialNeed> _materialRows(Map<String, double> available) {
    return [
      for (final line in wo.expectedLines)
        _MaterialNeed(
          name: line.inputItemName,
          detail: line.substitutes.isEmpty
              ? '${woQty(line.qtyPerOutput)} ${line.inputUom}/output'
              : 'or ${line.substitutes.map((s) => s.itemName).join(' / ')}',
          uom: line.inputUom,
          need: line.expectedQty(wo.plannedQty),
          have: [line.inputItemId, ...line.substitutes.map((s) => s.itemId)]
              .fold(0.0, (sum, itemId) => sum + (available[itemId] ?? 0)),
        ),
    ];
  }
}

/// One input on a posted run: what went in, from which batches, against plan.
class _ConsumedRow extends StatelessWidget {
  const _ConsumedRow({
    required this.name,
    required this.expected,
    required this.uom,
    required this.actual,
  });
  final String name;
  final double? expected;
  final String uom;
  final List<WoConsumptionRow>? actual;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = actual ?? const <WoConsumptionRow>[];
    final took = rows.fold<double>(0, (s, r) => s + r.qty);
    final delta = expected == null ? 0.0 : took - expected!;
    final off = delta.abs() > 0.0005;

    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name,
              style: RunqText.bodyStrong.copyWith(color: t.ink),
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
          if (rows.any((r) => r.batchNo != null)) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final r in rows.where((r) => r.batchNo != null))
                  _Tag(label: r.batchNo!),
              ],
            ),
          ],
        ]),
      ),
      const SizedBox(width: 12),
      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${woQty(took)} $uom',
            style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(height: 2),
        Text(
          expected == null
              ? 'not in BOM'
              : off
                  ? '${delta > 0 ? '+' : '−'}${woQty(delta.abs())} vs plan'
                  : 'as planned',
          style: RunqText.micro.copyWith(
            color: expected == null || off ? MfgColors.orangeAlert : t.muted,
          ),
        ),
      ]),
    ]);
  }
}

/// One material requirement — a BOM line, or a pool of interchangeable ones.
class _MaterialNeed {
  const _MaterialNeed({
    required this.name,
    required this.detail,
    required this.uom,
    required this.need,
    required this.have,
  });
  final String name;
  final String detail;
  final String uom;
  final double need;
  final double have;
}

/// Draft view of one requirement: needed vs on hand, with a shortfall call-out.
class _RequiredRow extends StatelessWidget {
  const _RequiredRow({required this.row});
  final _MaterialNeed row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final short = row.need - row.have;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(row.name,
              style: RunqText.bodyStrong.copyWith(color: t.ink),
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(row.detail, style: RunqText.micro.copyWith(color: t.muted2)),
        ]),
      ),
      const SizedBox(width: 12),
      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${woQty(row.need)} ${row.uom}',
            style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(height: 2),
        Text(
          short > 0.0005 ? 'short ${woQty(short)}' : '${woQty(row.have)} on hand',
          style: RunqText.micro.copyWith(
            color: short > 0.0005 ? MfgColors.error : t.muted,
          ),
        ),
      ]),
    ]);
  }
}

/// What came out — the batch that now exists in stock because of this run.
class WoOutputCard extends ConsumerWidget {
  const WoOutputCard({super.key, required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows =
        ref.watch(woOutputProvider(wo.id)).asData?.value ?? const <WoOutputRow>[];
    if (rows.isEmpty) return const SizedBox.shrink();

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _CardHeader(label: 'Produced'),
        const SizedBox(height: 12),
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) Divider(color: t.hairline, height: 20),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(rows[i].outputItemName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  _Tag(label: rows[i].batchNo),
                  if (rows[i].expiryDate != null)
                    _Tag(
                      label: 'exp ${mfgPrettyDate(rows[i].expiryDate!)}',
                      icon: Icons.event_busy_outlined,
                    ),
                ]),
              ]),
            ),
            const SizedBox(width: 12),
            Text('${woQty(rows[i].qty)} ${rows[i].uom}',
                style: RunqText.bodyStrong.copyWith(color: MfgColors.brand(context))),
          ]),
        ],
      ]),
    );
  }
}

/// Costing as three tiles. The old version spelled each number out as a
/// label/value sentence; the numbers are the point, so they lead.
class WoCostingStrip extends StatelessWidget {
  const WoCostingStrip({super.key, required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (wo.consumedValue == 0 && wo.outputValue == 0 && wo.yieldVariance == 0) {
      return const SizedBox.shrink();
    }
    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _CostTile(label: 'Consumed', value: wo.consumedValue)),
          Container(width: 1, height: 34, color: t.hairline),
          Expanded(child: _CostTile(label: 'Output', value: wo.outputValue)),
          Container(width: 1, height: 34, color: t.hairline),
          Expanded(
            child: _CostTile(
              label: 'Variance',
              value: wo.yieldVariance,
              tint: wo.yieldVariance != 0 ? MfgColors.orangeAlert : null,
            ),
          ),
        ]),
        if (wo.jeId != null) ...[
          const SizedBox(height: 10),
          Row(children: [
            Icon(Icons.check_circle_outline, size: 13, color: MfgColors.success),
            const SizedBox(width: 5),
            Text('GL entry posted',
                style: RunqText.micro.copyWith(color: MfgColors.success)),
          ]),
        ],
      ]),
    );
  }
}

class _CostTile extends StatelessWidget {
  const _CostTile({required this.label, required this.value, this.tint});
  final String label;
  final double value;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(children: [
      Text(value == 0 ? '—' : mfgIndianINR(value),
          style: RunqText.bodyStrong.copyWith(color: tint ?? t.ink),
          maxLines: 1,
          overflow: TextOverflow.ellipsis),
      const SizedBox(height: 3),
      Text(label, style: RunqText.micro.copyWith(color: t.muted)),
    ]);
  }
}

/// Lifecycle as one horizontal rail instead of four stacked rows.
class WoProgressStrip extends StatelessWidget {
  const WoProgressStrip({super.key, required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (wo.isCancelled) {
      return MfgCard(
        child: Row(children: [
          Icon(Icons.cancel_outlined, size: 16, color: MfgColors.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Cancelled — stock movements reversed',
                style: RunqText.caption.copyWith(color: t.ink)),
          ),
        ]),
      );
    }
    final steps = <(String, String?)>[
      ('Created', wo.createdAt.isNotEmpty ? wo.createdAt : null),
      ('Started', wo.startedAt),
      ('Done', wo.completedAt),
      ('Closed', wo.closedAt),
    ];
    return MfgCard(
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  color: steps[i].$2 != null ? MfgColors.success : t.hairline,
                ),
              ),
            _Step(label: steps[i].$1, at: steps[i].$2),
          ],
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.label, required this.at});
  final String label;
  final String? at;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final done = at != null;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(
        done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
        size: 16,
        color: done ? MfgColors.success : t.muted2,
      ),
      const SizedBox(height: 4),
      Text(label,
          style: RunqText.micro.copyWith(color: done ? t.ink : t.muted2)),
      if (done)
        Text(mfgPrettyDate(at!), style: RunqText.micro.copyWith(color: t.muted2)),
    ]);
  }
}

class _CardHeader extends StatelessWidget {
  const _CardHeader({required this.label, this.hint});
  final String label;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(children: [
      Text(label, style: RunqText.label),
      const Spacer(),
      if (hint != null)
        Text(hint!, style: RunqText.micro.copyWith(color: t.muted2)),
    ]);
  }
}

/// Batch / expiry marker. Batch numbers are long, so they get a container of
/// their own rather than being run into the item name with a middot.
class _Tag extends StatelessWidget {
  const _Tag({required this.label, this.icon});
  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[
          Icon(icon, size: 11, color: t.muted2),
          const SizedBox(width: 4),
        ],
        Text(label,
            style: RunqText.micro.copyWith(color: t.muted),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      ]),
    );
  }
}
