// The scrolling body of the Items screen: category sections with pinned
// headers, and the rail that jumps between them.
//
// Two shapes, chosen by [sectioned]. Unsearched, the catalogue is filed by
// category and reads best that way — headers pin so the section you are in
// never scrolls off, and the rail turns the section list into a scrubber.
// Searched, results arrive ranked best-first and headers would scatter the
// best answers down the page, so the list goes flat and the rail hides.
//
// Every row and header is laid out at a fixed extent, which is what lets
// [_jumpTo] convert a section index into a scroll offset by arithmetic
// instead of measuring built widgets that may not exist yet.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'item_jump_rail.dart';
import 'item_list_tiles.dart';

class ItemSectionedList extends StatelessWidget {
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
    final showRail = sections.length >= kMinRailSections;
    final gutter = showRail ? kRailWidth + 10 : 16.0;
    return RefreshIndicator(
      color: InvColors.brand(context),
      onRefresh: onRefresh,
      child: Stack(
        children: [
          CustomScrollView(
            controller: controller,
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            slivers: [
              if (sections.isEmpty)
                _rowsSliver(rows, gutter)
              else
                for (final s in sections) _sectionSliver(t, s, gutter),
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
          if (showRail)
            Positioned(
              top: 4,
              bottom: 24,
              right: 4,
              child: ItemJumpRail(
                targets: [
                  for (final s in sections)
                    (tick: jumpTickFor(s.label), label: s.label),
                ],
                onJump: (i) => _jumpTo(sections, i),
              ),
            ),
        ],
      ),
    );
  }

  Widget _sectionSliver(RunqTokens t, ItemCategorySection s, double gutter) {
    return SliverMainAxisGroup(
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: ItemStickyHeader(
            label: s.label,
            count: s.count,
            background: t.bgWarm,
            trailingGutter: gutter,
          ),
        ),
        for (final run in s.runs) ...[
          if (_showsSubHeader(s, run))
            SliverToBoxAdapter(
              child: SizedBox(
                height: kItemSubHeaderExtent,
                child: Padding(
                  padding: EdgeInsets.only(left: 30, right: gutter + 14),
                  child: ItemSectionHeader(
                    label: run.subcategory!,
                    count: run.rows.length,
                    nested: true,
                    padding: EdgeInsets.zero,
                  ),
                ),
              ),
            ),
          _rowsSliver(run.rows, gutter),
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

  /// Fixed-extent so the list lays out in constant time however long it is,
  /// and so [_jumpTo] can compute an offset instead of guessing one.
  Widget _rowsSliver(List<InvItemListRow> list, double gutter) => SliverPadding(
    padding: EdgeInsets.only(left: 16, right: gutter),
    sliver: SliverFixedExtentList(
      itemExtent: kItemRowExtent,
      delegate: SliverChildBuilderDelegate(
        (_, i) => ItemTile(row: list[i], onTap: () => onOpen(list[i])),
        childCount: list.length,
      ),
    ),
  );

  /// Offset of a section's header, summed from the extents the slivers were
  /// built with — exact, because every row and header has a fixed height.
  void _jumpTo(List<ItemCategorySection> sections, int index) {
    if (!controller.hasClients || index >= sections.length) return;
    var offset = 0.0;
    for (var i = 0; i < index; i++) {
      offset += kItemHeaderExtent;
      for (final run in sections[i].runs) {
        if (_showsSubHeader(sections[i], run)) offset += kItemSubHeaderExtent;
        offset += run.rows.length * kItemRowExtent;
      }
    }
    controller.jumpTo(offset.clamp(0.0, controller.position.maxScrollExtent));
  }
}
