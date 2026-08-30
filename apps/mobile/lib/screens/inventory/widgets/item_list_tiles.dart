// Row and section furniture for the Items screen: the item card, the
// category section headers, the count line, and the note that explains why
// a search replaced the category tree. The screen owns the data and the
// scrolling; everything that just draws a row lives here.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_qty.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

/// Loading, failure and empty-catalogue stand-ins for the item list, or null
/// when there are rows to draw. Kept together because the screen's only
/// question is "is there a list to show yet", and three inline branches for
/// that buried the answer.
Widget? itemListPlaceholder(
  BuildContext context, {
  required bool loading,
  required String? error,
  required bool isEmpty,
  required bool searching,
  required VoidCallback onNew,
}) {
  if (!isEmpty) return null;
  final t = RT(context);
  if (loading) return const Center(child: CircularProgressIndicator());
  if (error != null) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Failed to load items: $error',
          style: RunqText.caption.copyWith(color: t.muted),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
  return InvEmptyState(
    icon: Icons.inventory_2_outlined,
    title: searching ? 'No items match' : 'No items yet',
    subtitle: searching
        ? 'Try a different search or filter'
        : 'Add your first catalog item',
    actionLabel: 'New item',
    onAction: onNew,
  );
}

/// Says why the tree has been replaced by a list, and offers the way back.
/// Without it a search reads as "the categories disappeared".
class SearchScopeNote extends StatelessWidget {
  const SearchScopeNote({super.key, required this.path, required this.onClear});
  final List<InvCategory> path;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final where = path.isEmpty ? null : path.last.name;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 14, color: t.muted2),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'Searching all categories',
              style: RunqText.caption.copyWith(color: t.muted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          InkWell(
            onTap: onClear,
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Text(
                where == null ? 'Back to categories' : 'Back to $where',
                style: RunqText.caption.copyWith(
                  color: InvColors.brand(context),
                  fontWeight: FontWeight.w700,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const kUncategorised = 'Uncategorised';

/// One category's slice of the list: the pinned header's label and count,
/// and the runs of rows beneath it. Rows filed straight on a root category
/// come back under a run with a null [subcategory]; a run with one carries
/// its own small header. Grouping is rebuilt from the whole loaded set on
/// every build, so load-more appends into the section a row belongs to
/// instead of restarting the sequence.
class ItemCategorySection {
  const ItemCategorySection({
    required this.label,
    required this.count,
    required this.runs,
  });
  final String label;
  final int count;
  final List<ItemSubRun> runs;
}

/// A contiguous run of rows sharing one subcategory (or none).
class ItemSubRun {
  const ItemSubRun({required this.subcategory, required this.rows});
  final String? subcategory;
  final List<InvItemListRow> rows;
}

List<ItemCategorySection> groupItemsByCategory(List<InvItemListRow> rows) {
  final byCategory = <String, Map<String, List<InvItemListRow>>>{};
  for (final r in rows) {
    final cat = (r.category?.trim().isNotEmpty == true)
        ? r.category!.trim()
        : kUncategorised;
    final sub = r.subcategory?.trim() ?? '';
    byCategory.putIfAbsent(cat, () => {}).putIfAbsent(sub, () => []).add(r);
  }
  return [
    for (final entry in byCategory.entries)
      ItemCategorySection(
        label: entry.key,
        count: entry.value.values.fold(0, (n, list) => n + list.length),
        runs: [
          for (final sub in entry.value.entries)
            ItemSubRun(
              subcategory: sub.key.isEmpty ? null : sub.key,
              rows: sub.value,
            ),
        ],
      ),
  ];
}

/// Row and header heights are imposed rather than measured, so the jump
/// rail can turn a section index into a scroll offset by arithmetic alone.
/// Every row is one card of the same height; the trade is that a long item
/// name truncates instead of wrapping to a second line.
const kItemRowExtent = 74.0;
const kItemHeaderExtent = 30.0;
const kItemSubHeaderExtent = 24.0;

/// Pins a category header while its own rows scroll under it, so the answer
/// to "what am I looking at" never leaves the screen mid-section.
class ItemStickyHeader extends SliverPersistentHeaderDelegate {
  const ItemStickyHeader({
    required this.label,
    required this.count,
    required this.background,
    this.trailingGutter = 18,
  });
  final String label;
  final int count;
  final Color background;

  /// The list's right padding. The count is inset a further card-padding
  /// beyond it, so it lands over the balances in the rows rather than out at
  /// the screen edge where it read as clipped.
  final double trailingGutter;

  /// Horizontal padding inside [InvCard], which the row balances sit behind.
  static const _cardInset = 14.0;

  @override
  double get minExtent => kItemHeaderExtent;
  @override
  double get maxExtent => kItemHeaderExtent;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      // Opaque, or the rows sliding beneath would read through the label.
      color: background,
      alignment: Alignment.centerLeft,
      padding: EdgeInsets.only(
        left: 16 + _cardInset,
        right: trailingGutter + _cardInset,
      ),
      child: ItemSectionHeader(
        label: label,
        count: count,
        padding: EdgeInsets.zero,
      ),
    );
  }

  @override
  bool shouldRebuild(ItemStickyHeader old) =>
      old.label != label ||
      old.count != count ||
      old.background != background ||
      old.trailingGutter != trailingGutter;
}

class ItemSectionHeader extends StatelessWidget {
  const ItemSectionHeader({
    super.key,
    required this.label,
    required this.count,
    this.nested = false,
    this.padding,
  });
  final String label;
  final int count;
  final bool nested;

  /// Overridden by callers that supply their own gutter — the pinned header
  /// sliver spans the full width, so its padding is not the list's.
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding:
          padding ??
          (nested
              ? const EdgeInsets.fromLTRB(10, 4, 2, 0)
              : const EdgeInsets.fromLTRB(2, 8, 2, 0)),
      child: Row(
        children: [
          Expanded(
            child: nested
                ? Text(label, style: RunqText.caption.copyWith(color: t.muted2))
                : Text(
                    label.toUpperCase(),
                    style: RunqText.label.copyWith(color: t.muted),
                  ),
          ),
          Text('$count', style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

class ItemCountLine extends StatelessWidget {
  const ItemCountLine({super.key, required this.loaded, required this.total});
  final int loaded;
  final int total;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final label = total == 0
        ? ''
        : (loaded < total
              ? 'Showing $loaded of $total items'
              : '$total item${total == 1 ? '' : 's'}');
    if (label.isEmpty) return const SizedBox(height: 4);
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 2, 16, 6),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
      ),
    );
  }
}

class ItemTile extends StatelessWidget {
  const ItemTile({super.key, required this.row, required this.onTap});
  final InvItemListRow row;

  /// The screen opens the item — it also records it as recently opened, and
  /// a tile has no business knowing that.
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final meta = [
      if (row.sku?.isNotEmpty == true) row.sku!,
      if (classLabel(row.itemClass, row.type) != null)
        classLabel(row.itemClass, row.type)!,
      if (row.category?.isNotEmpty == true) row.category!,
    ].join(' · ');
    final mark = _availabilityColour(row);
    // Fixed height so the jump rail's offset arithmetic stays exact; the
    // card keeps its own margin by sitting inside the taller slot.
    return SizedBox(
      height: kItemRowExtent,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: InvCard(
          onTap: onTap,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Availability as a colour rail, the same signal the alert rows
              // carry: red out of stock, orange at or below the reorder level,
              // green otherwise. Untracked items keep the rail's width as blank
              // space so every card's text starts on the same line.
              Container(
                width: 3,
                height: 34,
                margin: const EdgeInsets.only(right: 10, top: 1),
                decoration: BoxDecoration(
                  color: mark ?? Colors.transparent,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              Expanded(child: _content(t, meta)),
            ],
          ),
        ),
      ),
    );
  }

  /// Colour for the availability rail, or null when the list was fetched
  /// without stock and there is no balance to speak of.
  ///
  /// Untracked items — services and anything the ledger doesn't carry — read
  /// green: they have no balance to run out of.
  static Color? _availabilityColour(InvItemListRow row) {
    if (_isUntracked(row)) return InvColors.success;
    final qty = row.stockQty;
    if (qty == null) return null;
    // A SKU made at dispatch is *meant* to sit at zero — it is labelled out
    // of the pool when a delivery needs it. Red would report the normal
    // state as a fault. Once it does hold stock the usual colours apply,
    // because then the balance means what it always means.
    if (qty <= 0) return InvColors.error;
    final level = row.reorderLevel;
    final low = level != null && level > 0 && qty <= level;
    return low ? InvColors.orangeAlert : InvColors.success;
  }

  static bool _isUntracked(InvItemListRow row) =>
      row.type == 'service' || !row.trackInventory;

  Widget _content(RunqTokens t, String meta) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(Icons.inventory_2_outlined, size: 17, color: t.muted),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // UOM trails the name in muted type — it qualifies the
                  // product ("Milk, sold in 500ml") and belongs with it,
                  // not stacked under the balance where it read as a
                  // second number.
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        text: row.name,
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        children: [
                          if (row.unit?.isNotEmpty == true)
                            TextSpan(
                              text: '  ${row.unit}',
                              style: RunqText.caption.copyWith(color: t.muted2),
                            ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  // Says why the rail is green on a row carrying no
                  // quantity — an untracked item never runs out.
                  if (_isUntracked(row)) ...[
                    const SizedBox(width: 6),
                    const _AlwaysAvailablePill(),
                  ],
                  if (!row.isActive) ...[
                    const SizedBox(width: 6),
                    _InactivePill(),
                  ],
                ],
              ),
              if (meta.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  meta,
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 10),
        // Balance on hand is the headline figure — on an inventory screen
        // "how much is left" outranks "what we sell it for", so price drops
        // to the muted second line.
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (row.stockQty != null)
              Text(
                // Zero on a made-on-dispatch SKU is not a quantity anyone
                // should read as "none left", so it prints as a dash.
                row.madeOnDispatch && row.stockQty! <= 0
                    ? '—'
                    : formatItemQty(
                        row.stockQty,
                        row.itemClass,
                        unit: row.unit,
                      ),
                style: RunqText.bodyStrong.copyWith(
                  color: row.stockQty! <= 0 ? t.muted2 : t.ink,
                ),
              ),
            if (row.defaultSellingPrice != null) ...[
              const SizedBox(height: 2),
              Text(
                compactINR(row.defaultSellingPrice!),
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

/// Green counterpart to [_InactivePill] for items the ledger doesn't track.
class _AlwaysAvailablePill extends StatelessWidget {
  const _AlwaysAvailablePill();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 1),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: InvColors.successBg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'Always available',
        style: RunqText.micro.copyWith(
          color: InvColors.success,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _InactivePill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(top: 1),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'Inactive',
        style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.2),
      ),
    );
  }
}

/// Human-readable label for an item_class value. Services get a flat
/// 'Service' label; products show their class. Null when there's nothing
/// useful to show.
String? classLabel(String? itemClass, String? type) {
  if (type == 'service') return 'Service';
  switch (itemClass) {
    case 'raw_material':
      return 'Raw material';
    case 'packaging':
      return 'Packaging';
    case 'finished_good':
      return 'Finished good';
    case 'semi_finished':
      return 'Semi-finished';
    case 'trading_good':
      return 'Trading good';
    case 'consumable':
      return 'Consumable';
    case 'spare_part':
      return 'Spare part';
    default:
      return null;
  }
}

/// Brand square with a plus — the module's standard app-bar add button.
class NewItemButton extends StatelessWidget {
  const NewItemButton({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Tooltip(
        message: 'New item',
        child: Material(
          color: InvColors.brand(context),
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onTap,
            child: const SizedBox(
              width: 32,
              height: 32,
              child: Icon(Icons.add, color: Colors.white, size: 18),
            ),
          ),
        ),
      ),
    );
  }
}
