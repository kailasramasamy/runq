// The scrolling body of the Items screen: category sections with pinned
// headers.
//
// Two shapes, chosen by [sectioned]. Unsearched, the catalogue is filed by
// category and reads best that way — headers pin so the section you are in
// never scrolls off. Searched, results arrive ranked best-first and headers
// would scatter the best answers down the page, so the list goes flat.
//
// A jump rail used to run down the right edge, scrubbing between sections.
// It cost every row 44px of width on a screen whose whole job is to say
// which item you are looking at — long names were truncating to pay for a
// scrubber over a list that search already answers faster. The width is
// better spent on the names.
//
// Every row and header is laid out at a fixed extent, so the list lays out
// in constant time however long the catalogue gets.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'item_list_tiles.dart';

class ItemSectionedList extends StatelessWidget {
  /// Side margin for rows and headers alike. Was the rail's width plus a gap
  /// on the right; now the list is symmetric.
  static const _gutter = 16.0;

  const ItemSectionedList({
    super.key,
    required this.rows,
    required this.sectioned,
    required this.controller,
    required this.onOpen,
    required this.onRefresh,
    this.showFooterSpinner = false,
  });

  final List<InvItemListRow> rows;

  /// Group under pinned category headers. False for ranked search results.
  final bool sectioned;

  /// Owned by the screen, which also drives load-more off it.
  final ScrollController controller;

  final ValueChanged<InvItemListRow> onOpen;
  final Future<void> Function() onRefresh;

  /// A page is still outstanding on the server-paginated path.
  final bool showFooterSpinner;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final sections = sectioned
        ? groupItemsByCategory(rows)
        : const <ItemCategorySection>[];
    return RefreshIndicator(
      color: InvColors.brand(context),
      onRefresh: onRefresh,
      child: CustomScrollView(
        controller: controller,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          if (sections.isEmpty)
            _rowsSliver(rows)
          else
            for (final s in sections) _sectionSliver(t, s),
          if (showFooterSpinner)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }

  Widget _sectionSliver(RunqTokens t, ItemCategorySection s) {
    return SliverMainAxisGroup(
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: ItemStickyHeader(
            label: s.label,
            count: s.count,
            background: t.bgWarm,
            trailingGutter: _gutter,
          ),
        ),
        for (final run in s.runs) ...[
          if (_showsSubHeader(s, run))
            SliverToBoxAdapter(
              child: SizedBox(
                height: kItemSubHeaderExtent,
                child: Padding(
                  padding: const EdgeInsets.only(left: 30, right: _gutter + 14),
                  child: ItemSectionHeader(
                    label: run.subcategory!,
                    count: run.rows.length,
                    nested: true,
                    padding: EdgeInsets.zero,
                  ),
                ),
              ),
            ),
          _rowsSliver(run.rows),
        ],
      ],
    );
  }

  /// A subcategory earns a header only when it says something the category
  /// header above it has not. Tenants routinely file a category's items
  /// under a subcategory of the same name, and printing both reads as a
  /// rendering bug — as does a lone subcategory that covers the whole
  /// section.
  static bool _showsSubHeader(ItemCategorySection s, ItemSubRun run) {
    final sub = run.subcategory;
    if (sub == null) return false;
    if (sub.toLowerCase() == s.label.toLowerCase()) return false;
    return s.runs.length > 1;
  }

  /// Fixed-extent so the list lays out in constant time however long it is.
  Widget _rowsSliver(List<InvItemListRow> list) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: _gutter),
    sliver: SliverFixedExtentList(
      itemExtent: kItemRowExtent,
      delegate: SliverChildBuilderDelegate(
        (_, i) => ItemTile(row: list[i], onTap: () => onOpen(list[i])),
        childCount: list.length,
      ),
    ),
  );
}
