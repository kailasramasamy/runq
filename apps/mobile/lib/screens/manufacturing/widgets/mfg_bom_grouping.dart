// Grouping BOMs by what they make: the output product's category, then its
// subcategory. Shared by the BOM list and the record-production picker so
// both section the same way and agree on what "uncategorised" means.
//
// Bucketing only — the two screens render groups differently (cards vs a
// flat picker list), so the widgets stay with their screens. The one thing
// shared beyond the buckets is [MfgCategoryHeader], since a header that
// looked different in the picker would read as a different concept.

import 'package:flutter/material.dart';
import '../../../api/manufacturing_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';

const kBomUncategorised = 'Uncategorised';

/// One subcategory bucket. A product filed straight on a root category has
/// no subcategory, so [subcategory] is null and the rows belong directly
/// under the category header.
class BomGroup {
  const BomGroup({required this.category, required this.subcategory, required this.rows});
  final String category;
  final String? subcategory;
  final List<BomListRow> rows;
}

/// Bucket rows into category → subcategory, preserving the order they arrive
/// in. The server sorts by the category tree, so preserving that order is
/// what keeps a category from appearing twice in the list.
List<BomGroup> groupBomsByCategory(List<BomListRow> rows) {
  final byCategory = <String, Map<String, List<BomListRow>>>{};
  for (final r in rows) {
    final cat = (r.outputCategory?.trim().isNotEmpty == true)
        ? r.outputCategory!.trim()
        : kBomUncategorised;
    final sub = r.outputSubcategory?.trim() ?? '';
    byCategory.putIfAbsent(cat, () => {}).putIfAbsent(sub, () => []).add(r);
  }
  return [
    for (final cat in byCategory.entries)
      for (final sub in cat.value.entries)
        BomGroup(
          category: cat.key,
          subcategory: sub.key.isEmpty ? null : sub.key,
          rows: sub.value,
        ),
  ];
}

/// Total rows under a category, for the count on its header.
int bomCategoryCount(List<BomGroup> groups, String category) => groups
    .where((g) => g.category == category)
    .fold(0, (n, g) => n + g.rows.length);

class MfgCategoryHeader extends StatelessWidget {
  const MfgCategoryHeader({
    super.key,
    required this.label,
    required this.count,
    this.nested = false,
  });

  final String label;
  final int count;
  final bool nested;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: nested
          ? const EdgeInsets.fromLTRB(10, 6, 2, 4)
          : const EdgeInsets.fromLTRB(2, 12, 2, 6),
      child: Row(
        children: [
          Expanded(
            child: nested
                ? Text(label, style: RunqText.caption.copyWith(color: t.muted2))
                : Text(label.toUpperCase(),
                    style: RunqText.label.copyWith(color: t.muted)),
          ),
          Text('$count', style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}
