// The class-filter pill strip on the Items screen, and the filter vocabulary
// behind it. Split out of the screen so the list body and the filter model
// can be read — and changed — without scrolling past each other.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';

import 'inv_primitives.dart';

// Class filters shown as a pill strip, each with its live count.
//
// One pill per item_class rather than the 4 operational buckets: the buckets
// hid exactly the distinctions the floor works in — raw material vs packaging
// vs consumable are stored, counted and reordered by different people, and
// 'Inputs' collapsed the first two into one number nobody could act on. The
// only group left is Finished, which stays a group so packed goods lead the
// strip; semi-finished gets its own pill right after the classes it is made
// from.
//
// 'other' is the leftover pill: items carrying no item_class at all (services,
// and products created before classification shipped).
const itemClassFilters = <({String key, String label, ItemFilterKind kind})>[
  (key: 'all', label: 'All', kind: ItemFilterKind.all),
  (key: 'finished', label: 'Finished', kind: ItemFilterKind.group),
  (key: 'trading_good', label: 'Trading', kind: ItemFilterKind.itemClass),
  (key: 'raw_material', label: 'Raw material', kind: ItemFilterKind.itemClass),
  (key: 'packaging', label: 'Packaging', kind: ItemFilterKind.itemClass),
  (key: 'consumable', label: 'Consumable', kind: ItemFilterKind.itemClass),
  (
    key: 'semi_finished',
    label: 'Semi-packaged',
    kind: ItemFilterKind.itemClass,
  ),
  (key: 'spare_part', label: 'Spare part', kind: ItemFilterKind.itemClass),
  (key: 'other', label: 'Other', kind: ItemFilterKind.unclassified),
  // Not an item_class — a property of the SKU's BOM. It shares the strip
  // because to the person looking at the list it answers the same kind of
  // question ("show me only these"), and because these rows sit permanently
  // at zero and are the ones most often misread.
  (
    key: 'made_on_dispatch',
    label: 'Made on dispatch',
    kind: ItemFilterKind.madeOnDispatch,
  ),
  // Deactivated items are hidden from every picker in the app, so this is
  // the only place left to find one — and the only way to reactivate it.
  (key: 'inactive', label: 'Inactive', kind: ItemFilterKind.inactive),
];

enum ItemFilterKind {
  all,
  group,
  itemClass,
  unclassified,
  inactive,
  madeOnDispatch,
}

/// The item_class values a group pill stands for. Mirrors the server's
/// ITEM_CLASS_GROUP_MEMBERS — a locally-filtered list must select exactly
/// what the server would have returned, or the same pill would mean two
/// different things depending on catalogue size.
const itemClassGroupMembers = <String, List<String>>{
  'finished': ['finished_good', 'semi_finished'],
};

/// The wire filters one pill stands for. Every caller that lists items under
/// a class pill needs the same four arguments derived the same way; deriving
/// them twice is how a pill comes to mean two things.
typedef ItemClassQuery = ({
  String? itemClassGroup,
  String? itemClass,
  bool unclassified,
  String? status,
  bool? madeOnDispatch,
});

ItemClassQuery itemClassQuery(String filterKey) {
  final kind = itemFilterKindOf(filterKey);
  return (
    itemClassGroup: kind == ItemFilterKind.group ? filterKey : null,
    itemClass: kind == ItemFilterKind.itemClass ? filterKey : null,
    unclassified: kind == ItemFilterKind.unclassified,
    status: kind == ItemFilterKind.inactive ? 'inactive' : null,
    madeOnDispatch: kind == ItemFilterKind.madeOnDispatch ? true : null,
  );
}

/// Whether [itemClass] belongs in the [filterKey] pill. Mirrors the server
/// filter in [ItemService.list] so in-memory filtering matches the wire.
bool itemClassMatches(String? itemClass, String filterKey) {
  switch (itemFilterKindOf(filterKey)) {
    case ItemFilterKind.all:
      return true;
    case ItemFilterKind.group:
      return itemClass != null &&
          (itemClassGroupMembers[filterKey] ?? const []).contains(itemClass);
    case ItemFilterKind.itemClass:
      return itemClass == filterKey;
    case ItemFilterKind.unclassified:
      return itemClass == null;
    case ItemFilterKind.inactive:
      // Inactive items are never in the cached catalogue, so this pill can
      // only be answered by the server.
      return false;
    case ItemFilterKind.madeOnDispatch:
      // Not a class question at all — [itemMatchesFilter] handles it, since
      // it needs the whole row rather than just the class.
      return true;
  }
}

/// Whether [row] belongs under [filterKey]. Wraps [itemClassMatches] so the
/// one pill that asks about something other than item_class has somewhere to
/// live, and so callers filtering in memory have a single entry point.
bool itemMatchesFilter(InvItemListRow row, String filterKey) {
  if (itemFilterKindOf(filterKey) == ItemFilterKind.madeOnDispatch) {
    return row.madeOnDispatch;
  }
  return itemClassMatches(row.itemClass, filterKey);
}

/// Bucket keys that other screens still deep-link with (`?classGroup=`), mapped
/// to the pill that now carries that stock. 'inputs' lands on Raw material —
/// the Home "raw material available" strip is what sends it.
const Map<String, String> legacyItemGroupAliases = {
  'inputs': 'raw_material',
  'trading': 'trading_good',
};

ItemFilterKind itemFilterKindOf(String key) => itemClassFilters
    .firstWhere((f) => f.key == key, orElse: () => itemClassFilters.first)
    .kind;

/// Count shown on a pill. Groups sum their member classes; 'All' sums
/// everything including the unclassified leftovers.
int itemClassCount(String key, Map<String, int> byClass) {
  switch (itemFilterKindOf(key)) {
    case ItemFilterKind.all:
      return byClass.values.fold(0, (a, b) => a + b);
    case ItemFilterKind.group:
      // 'finished' is the only group left, and it means packed goods —
      // semi-finished has its own pill, so it must not be counted twice.
      return byClass['finished_good'] ?? 0;
    case ItemFilterKind.itemClass:
      return byClass[key] ?? 0;
    case ItemFilterKind.unclassified:
      return byClass['unclassified'] ?? 0;
    case ItemFilterKind.inactive:
    case ItemFilterKind.madeOnDispatch:
      // Neither is an item_class, so the class-counts aggregate has no number
      // for them. A bare pill beats a wrong one.
      return -1;
  }
}

class ItemClassStrip extends StatelessWidget {
  const ItemClassStrip({
    super.key,
    required this.selected,
    required this.counts,
    required this.onChanged,
  });
  final String selected;
  final Map<String, int> counts;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: itemClassFilters.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final f = itemClassFilters[i];
          return InvFilterPill(
            label: f.label,
            // Counts arrive a beat after the first frame; until then the
            // pills render bare rather than claiming everything is empty.
            count: counts.isEmpty || itemClassCount(f.key, counts) < 0
                ? null
                : itemClassCount(f.key, counts),
            active: selected == f.key,
            onTap: () => onChanged(f.key),
          );
        },
      ),
    );
  }
}
