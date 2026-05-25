// Inventory class-group tab strip.
//
// Renders the 4 operational buckets — Finished / Inputs / Trading / Other —
// that mirror the `item_class_group` enum on the API side. Buckets with a
// count of zero are hidden so a pure-trading shop doesn't waste tab space
// on empty Finished / Inputs / Other pills.
//
// A leading "All" pill is always shown so the user has an escape hatch
// back to the unfiltered view; "All" doesn't get a count badge because
// it always equals the sum of the other buckets.
//
// Used by every inventory screen that lists or picks items: On-hand,
// Adjustment, Stock-take, GRN, Dispatch, Transfer. Each screen passes its
// per-screen default (e.g. Dispatch defaults to Finished, GRN to Inputs)
// and supplies a per-bucket count so the strip can hide empties + show
// quick counts.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

/// One of the 4 operational buckets plus 'all'. Mirrors the server enum.
/// String, not Dart enum, so it round-trips through repo query params
/// without a converter.
const String classGroupAll = 'all';
const String classGroupFinished = 'finished';
const String classGroupInputs = 'inputs';
const String classGroupTrading = 'trading';
const String classGroupOther = 'other';

/// Fall-through order used when a screen's preferred default bucket is
/// empty. Manufactured first, then trading, then inputs, then other —
/// keeps the user on a "things to sell" view whenever possible, falling
/// back to whatever the tenant actually stocks.
const List<String> _fallbackOrder = [
  classGroupFinished,
  classGroupTrading,
  classGroupInputs,
  classGroupOther,
];

/// Pick the bucket a screen should land on for this row set. If the
/// caller's preferred default has rows, keep it. Otherwise walk the
/// fallback order and return the first non-empty bucket. If everything
/// is empty (or the caller wanted 'all' anyway), fall to 'all'.
String resolveDefaultClassGroup(String preferred, Map<String, int> counts) {
  if (preferred == classGroupAll) return classGroupAll;
  if ((counts[preferred] ?? 0) > 0) return preferred;
  for (final g in _fallbackOrder) {
    if ((counts[g] ?? 0) > 0) return g;
  }
  return classGroupAll;
}

/// Compute per-bucket counts from any iterable of item-class strings.
/// Reusable across screens that map their domain rows to item_class values
/// before bucketing (on-hand rows, GRN lines, transfer lines, items).
Map<String, int> bucketCountsFor(Iterable<String?> classes) {
  final counts = <String, int>{};
  for (final c in classes) {
    final g = classGroupForItemClass(c);
    counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
}

/// item_class → bucket. Used by callers to bucket a list of rows when
/// the screen filters client-side or wants per-bucket counts.
String classGroupForItemClass(String? itemClass) {
  switch (itemClass) {
    case 'finished_good':
    case 'semi_finished':
      return classGroupFinished;
    case 'raw_material':
    case 'packaging':
      return classGroupInputs;
    case 'trading_good':
      return classGroupTrading;
    case 'consumable':
    case 'spare_part':
      return classGroupOther;
    default:
      return classGroupOther;
  }
}

class InvClassTabs extends StatelessWidget {
  const InvClassTabs({
    super.key,
    required this.selected,
    required this.onChanged,
    required this.counts,
  });

  /// Currently selected bucket. One of the classGroup* constants.
  final String selected;
  final ValueChanged<String> onChanged;

  /// Per-bucket counts (excluding 'all'). Buckets missing from the map
  /// or holding 0 are hidden from the strip — keeps the UI clean for
  /// tenants who don't use every class.
  final Map<String, int> counts;

  static const List<({String key, String label})> _buckets = [
    (key: classGroupFinished, label: 'Finished'),
    (key: classGroupInputs,   label: 'Inputs'),
    (key: classGroupTrading,  label: 'Trading'),
    (key: classGroupOther,    label: 'Other'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Hide-empty: only render buckets with at least one row. "All" is
    // always shown so the user can escape back to the full list.
    final visible = _buckets.where((b) => (counts[b.key] ?? 0) > 0).toList();
    final totalCount = counts.values.fold<int>(0, (a, b) => a + b);

    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        children: [
          _Pill(
            label: 'All',
            count: totalCount,
            showCount: false,
            active: selected == classGroupAll,
            onTap: () => onChanged(classGroupAll),
            t: t,
          ),
          ...visible.map((b) => Padding(
                padding: const EdgeInsets.only(left: 8),
                child: _Pill(
                  label: b.label,
                  count: counts[b.key] ?? 0,
                  showCount: true,
                  active: selected == b.key,
                  onTap: () => onChanged(b.key),
                  t: t,
                ),
              )),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.count,
    required this.showCount,
    required this.active,
    required this.onTap,
    required this.t,
  });
  final String label;
  final int count;
  final bool showCount;
  final bool active;
  final VoidCallback onTap;
  final RunqTokens t;

  @override
  Widget build(BuildContext context) {
    final brand = InvColors.brand(context);
    final bg = active ? brand.withValues(alpha: 0.12) : t.bgWarmer;
    final fg = active ? brand : t.ink;
    final border = active ? brand.withValues(alpha: 0.45) : t.hairlineSoft;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: RunqText.caption.copyWith(
                color: fg,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                fontSize: 13,
              ),
            ),
            if (showCount) ...[
              const SizedBox(width: 6),
              Text(
                '$count',
                style: RunqText.caption.copyWith(
                  color: fg.withValues(alpha: 0.75),
                  fontSize: 12,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
