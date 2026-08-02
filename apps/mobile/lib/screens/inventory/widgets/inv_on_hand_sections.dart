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

/// One rendered section — a bucket with at least one row.
typedef OnHandSection = ({String key, String label, List<InvOnHandRow> rows});

const List<({String key, String label})> _sectionOrder = [
  (key: classGroupFinished, label: 'Finished Goods'),
  (key: classGroupInputs, label: 'Raw Materials & Inputs'),
  (key: classGroupTrading, label: 'Trading Goods'),
  (key: classGroupOther, label: 'Consumables & Spares'),
];

/// Split rows into class-group sections, preserving the incoming row order
/// within each. Empty buckets are dropped so a tenant that only stocks
/// finished goods sees one section rather than three empty headers.
List<OnHandSection> groupOnHandRows(List<InvOnHandRow> rows) {
  final byGroup = <String, List<InvOnHandRow>>{};
  for (final r in rows) {
    byGroup.putIfAbsent(classGroupForItemClass(r.itemClass), () => []).add(r);
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
  final List<InvOnHandRow> rows;

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
