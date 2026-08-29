// Category sectioning for the Stock on Hand list.
//
// Unsectioned, the list interleaves everything the godown holds, which reads
// as noise — so rows are split by their category tree: the parent category
// heads a section, the leaf sub-heads a band inside it. Item class is the
// filter strip above the list rather than a second nesting level, so a
// section never nests more than two headings deep.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
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
  String? get itemClass => lead.itemClass;
  String get warehouseName => lead.warehouseName;
  double? get reorderLevel => lead.reorderLevel;

  double get qty => batches.fold<double>(0, (a, r) => a + r.qty);
  double get value => batches.fold<double>(0, (a, r) => a + r.value);

  /// Low is a position-level judgement: the reorder level compares against
  /// total on-hand, not against whichever batch happens to be smallest.
  bool get isLow =>
      reorderLevel != null && reorderLevel! > 0 && qty <= reorderLevel!;

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

/// A leaf band inside a category section. [label] is null for items filed
/// directly on the parent category — they render straight under the section
/// header rather than under a sub-heading that repeats it.
typedef OnHandSubSection = ({String? label, List<OnHandGroup> rows});

/// One rendered section: a parent category, every row under it (for the
/// header subtotal), and its leaf bands.
typedef OnHandSection = ({
  String key,
  String label,
  List<OnHandGroup> rows,
  List<OnHandSubSection> subs,
});

/// Bucket for rows with no category at all. Sorted last — an unfiled tail
/// shouldn't head the list.
const String kUncategorised = 'Uncategorised';

/// Parent category an item is filed under. `categoryGroup` is null when the
/// item sits directly on a top-level category, in which case the leaf *is*
/// the parent.
String onHandCategoryOf(InvOnHandRow r) =>
    r.categoryGroup ?? r.categoryName ?? kUncategorised;

/// Leaf label, or null when the item sits directly on its parent — repeating
/// the parent as its own sub-heading says nothing.
String? onHandSubcategoryOf(InvOnHandRow r) {
  final leaf = r.categoryName;
  if (leaf == null || leaf == onHandCategoryOf(r)) return null;
  return leaf;
}

/// Split groups into category sections, each with its leaf bands.
///
/// Categories sort alphabetically with the unfiled tail last; inside a
/// section, rows filed directly on the parent come first, then leaves
/// alphabetically. Row order within a band is the incoming order.
List<OnHandSection> groupOnHandRows(List<OnHandGroup> rows) {
  final byParent = <String, List<OnHandGroup>>{};
  for (final r in rows) {
    byParent.putIfAbsent(onHandCategoryOf(r.lead), () => []).add(r);
  }
  final parents = byParent.keys.toList()
    ..sort((a, b) {
      if (a == kUncategorised) return 1;
      if (b == kUncategorised) return -1;
      return a.toLowerCase().compareTo(b.toLowerCase());
    });
  return [
    for (final parent in parents)
      (
        key: parent,
        label: parent,
        rows: byParent[parent]!,
        subs: _leafBands(byParent[parent]!),
      ),
  ];
}

List<OnHandSubSection> _leafBands(List<OnHandGroup> rows) {
  final direct = <OnHandGroup>[];
  final byLeaf = <String, List<OnHandGroup>>{};
  for (final r in rows) {
    final leaf = onHandSubcategoryOf(r.lead);
    if (leaf == null) {
      direct.add(r);
    } else {
      byLeaf.putIfAbsent(leaf, () => []).add(r);
    }
  }
  final leaves = byLeaf.keys.toList()
    ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
  return [
    if (direct.isNotEmpty) (label: null, rows: direct),
    for (final leaf in leaves) (label: leaf, rows: byLeaf[leaf]!),
  ];
}

/// Section header — category name on the left, row count and total value on
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

/// Leaf band heading — one step down from [InvGroupHeader]: sentence case,
/// lighter ink, and a rule running out from the label so a band reads as
/// part of the section above it rather than as a section of its own.
class InvSubGroupHeader extends StatelessWidget {
  const InvSubGroupHeader({super.key, required this.label, required this.rows});
  final String label;
  final List<OnHandGroup> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final value = rows.fold<double>(0, (a, r) => a + r.value);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 10, 2, 2),
      child: Row(
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.ink2)),
          const SizedBox(width: 8),
          Expanded(
            child: Divider(height: 1, thickness: 0.5, color: t.hairline),
          ),
          const SizedBox(width: 8),
          Text(
            '${rows.length} · ${compactINR(value)}',
            style: RunqText.micro.copyWith(color: t.muted2),
          ),
        ],
      ),
    );
  }
}
