// The category-tree half of the Items screen.
//
// Browsing answers a different question to searching — "what do we carry"
// rather than "where is this" — so it gets its own pane rather than another
// filter on the list. A search overrides it: the match is usually in some
// *other* branch, so results take over until the box is cleared, which drops
// the user back exactly where they were standing.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import 'inv_colors.dart';
import 'item_category_browser.dart';
import 'item_list_tiles.dart';

class ItemBrowsePane extends StatelessWidget {
  const ItemBrowsePane({
    super.key,
    required this.tree,
    required this.path,
    required this.uncategorisedCount,
    required this.searching,
    required this.showingItems,
    required this.header,
    required this.itemsPane,
    required this.onDrill,
    required this.onPick,
    required this.onUp,
    required this.onClearSearch,
    required this.onRefreshTree,
  });

  final List<InvCategory> tree;
  final List<InvCategory> path;
  final int uncategorisedCount;

  final bool searching;

  /// A category has been picked, so the pane shows its items, not the level
  /// beneath it.
  final bool showingItems;

  /// The count line, or nothing while the pane is still loading.
  final Widget? header;
  final Widget itemsPane;

  final ValueChanged<InvCategory> onDrill;
  final ValueChanged<InvCategoryPick> onPick;
  final ValueChanged<int> onUp;
  final VoidCallback onClearSearch;
  final Future<void> Function() onRefreshTree;

  @override
  Widget build(BuildContext context) {
    final showItems = showingItems || searching;
    return Column(
      children: [
        if (searching && !showingItems)
          SearchScopeNote(path: path, onClear: onClearSearch)
        else if (path.isNotEmpty)
          InvCategoryBreadcrumb(path: path, onUp: onUp),
        if (showItems && header != null) header!,
        Expanded(child: showItems ? itemsPane : _treePane(context)),
      ],
    );
  }

  Widget _treePane(BuildContext context) => RefreshIndicator(
    color: InvColors.brand(context),
    onRefresh: onRefreshTree,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        InvCategoryBrowser(
          tree: tree,
          path: path,
          uncategorisedCount: uncategorisedCount,
          onDrill: onDrill,
          onPick: onPick,
        ),
      ],
    ),
  );
}
