// Class-group sectioning for the Stock on Hand list.
//
// The on-hand screen defaults to "All" so the floor sees one complete
// picture of the godown. Unsectioned, that list interleaves finished goods
// with the raw material they were made from, which reads as noise — so when
// no single bucket is selected we split the rows into labelled sections in
// the same order as the class-tab strip.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_class_tabs.dart';
import 'inv_primitives.dart';

/// One item at one warehouse, with every batch of it rolled up. Batch-per-
/// row was unusable for raw milk, where each consignment opens its own batch
/// and one item filled the screen with a receipt log. The batch breakdown
/// lives on the item screen; the list states the position.
class OnHandGroup {
  OnHandGroup(this.lead, this.batches);

  /// First batch row seen for this (item, warehouse) — carries the item and
  /// warehouse fields, which are identical across the group.
  final InvOnHandRow lead;
  final List<InvOnHandRow> batches;

  String get itemId => lead.itemId;
  String get itemName => lead.itemName;
  String? get itemSku => lead.itemSku;
  String? get itemUnit => lead.itemUnit;
  String get warehouseName => lead.warehouseName;
  double? get reorderLevel => lead.reorderLevel;

  double get qty => batches.fold<double>(0, (a, r) => a + r.qty);
  double get value => batches.fold<double>(0, (a, r) => a + r.value);

  /// Low is a position-level judgement: the reorder level compares against
  /// total on-hand, not against whichever batch happens to be smallest.
  bool get isLow => reorderLevel != null && reorderLevel! > 0 && qty <= reorderLevel!;

  /// Earliest expiry across the batches — the one the floor must clear first.
  String? get earliestExpiry {
    String? best;
    for (final r in batches) {
      final d = r.expiryDate;
      if (d == null) continue;
      if (best == null || d.compareTo(best) < 0) best = d;
    }
    return best;
  }
}

/// Roll batch rows up to one entry per (item, warehouse), preserving the
/// incoming order of first appearance. Warehouses stay separate: the same
/// item in two godowns is two positions, not one.
List<OnHandGroup> collapseOnHandRows(List<InvOnHandRow> rows) {
  final byKey = <String, OnHandGroup>{};
  for (final r in rows) {
    final key = '${r.itemId}|${r.warehouseId}';
    final g = byKey[key];
    if (g == null) {
      byKey[key] = OnHandGroup(r, [r]);
    } else {
      g.batches.add(r);
    }
  }
  return byKey.values.toList();
}

/// One rendered section — a bucket with at least one group.
typedef OnHandSection = ({String key, String label, List<OnHandGroup> rows});

const List<({String key, String label})> _sectionOrder = [
  (key: classGroupFinished, label: 'Finished Goods'),
  (key: classGroupInputs, label: 'Raw Materials & Inputs'),
  (key: classGroupTrading, label: 'Trading Goods'),
  (key: classGroupOther, label: 'Consumables & Spares'),
];

/// Split groups into class-group sections, preserving the incoming order
/// within each. Empty buckets are dropped so a tenant that only stocks
/// finished goods sees one section rather than three empty headers.
List<OnHandSection> groupOnHandRows(List<OnHandGroup> rows) {
  final byGroup = <String, List<OnHandGroup>>{};
  for (final r in rows) {
    byGroup.putIfAbsent(classGroupForItemClass(r.lead.itemClass), () => []).add(r);
  }
  return [
    for (final s in _sectionOrder)
      if ((byGroup[s.key] ?? const []).isNotEmpty)
        (key: s.key, label: s.label, rows: byGroup[s.key]!),
  ];
}

/// Section header — bucket name on the left, row count and total value on
/// the right, so each section states its own subtotal instead of forcing a
/// mental tally down the list.
class InvGroupHeader extends StatelessWidget {
  const InvGroupHeader({super.key, required this.label, required this.rows});
  final String label;
  final List<OnHandGroup> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final value = rows.fold<double>(0, (a, r) => a + r.value);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 16, 2, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted),
            ),
          ),
          Text(
            '${rows.length} · ${compactINR(value)}',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ],
      ),
    );
  }
}
