// Category browser — the collapsed alternative to the flat item list.
//
// Drill-down rather than an accordion: one level on screen at a time, so a
// deep tree never turns the screen into a wall of half-open branches. Tapping
// a category descends; picking a leaf hands its id back to the list screen,
// which loads items filtered server-side through the machinery it already
// has (paging, search, class pills) instead of a second implementation.
//
// A category filter matches one category exactly, never a subtree — so a
// parent that holds items *directly* gets its own row. Without it those items
// would be reachable only from the flat list.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

/// What the browser hands back when the user picks something to list.
class InvCategoryPick {
  const InvCategoryPick({this.categoryId, required this.label, this.uncategorised = false});

  /// Null with [uncategorised] false never happens — one of the two is set.
  final String? categoryId;
  final String label;
  final bool uncategorised;
}

class InvCategoryBrowser extends StatelessWidget {
  const InvCategoryBrowser({
    super.key,
    required this.tree,
    required this.path,
    required this.uncategorisedCount,
    required this.onDrill,
    required this.onPick,
  });

  /// Root categories, already carrying subtree counts.
  final List<InvCategory> tree;

  /// Where we are. Empty = the root level.
  final List<InvCategory> path;
  final int uncategorisedCount;

  /// Descend into a category that has children.
  final ValueChanged<InvCategory> onDrill;

  /// Show the items for a leaf, a parent's own items, or the no-category bucket.
  final ValueChanged<InvCategoryPick> onPick;

  List<InvCategory> get _level =>
      path.isEmpty ? tree : path.last.subcategories;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final here = path.isEmpty ? null : path.last;
    final rows = _rows(here);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (rows.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
            child: Text(
              'Nothing filed under ${here?.name ?? 'any category'} yet',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center,
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: InvCard(
              padding: EdgeInsets.zero,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Column(
                  children: [
                    for (var i = 0; i < rows.length; i++) ...[
                      if (i > 0)
                        Divider(height: 1, thickness: 1, indent: 46,
                            endIndent: 14, color: t.hairlineSoft),
                      rows[i],
                    ],
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  List<Widget> _rows(InvCategory? here) {
    return <Widget>[
      // A parent's own items, when it has any. Counts are subtree totals, so
      // this is the remainder after the children are accounted for.
      if (here != null && here.directCount > 0)
        _Row(
          icon: Icons.inventory_2_outlined,
          label: 'Directly in ${here.name}',
          count: here.directCount,
          isLeaf: true,
          onTap: () => onPick(
            InvCategoryPick(categoryId: here.id, label: here.name),
          ),
        ),
      for (final c in _level)
        _Row(
          icon: c.subcategories.isEmpty
              ? Icons.sell_outlined
              : Icons.folder_outlined,
          label: c.name,
          count: c.itemCount ?? 0,
          isLeaf: c.subcategories.isEmpty,
          onTap: () => c.subcategories.isEmpty
              ? onPick(InvCategoryPick(categoryId: c.id, label: c.name))
              : onDrill(c),
        ),
      // Only at the root, and only when there is something in it — an item
      // filed under no category is invisible in this view otherwise.
      if (path.isEmpty && uncategorisedCount > 0)
        _Row(
          icon: Icons.help_outline_rounded,
          label: 'Uncategorised',
          count: uncategorisedCount,
          isLeaf: true,
          onTap: () => onPick(const InvCategoryPick(
            label: 'Uncategorised',
            uncategorised: true,
          )),
        ),
    ];
  }
}

/// Where you are, and a tap back to any level above.
///
/// Rendered by the screen rather than the browser: once a leaf is picked the
/// pane below switches to the item list, and the trail has to survive that —
/// otherwise reaching items is a one-way trip out of the tree.
class InvCategoryBreadcrumb extends StatelessWidget {
  const InvCategoryBreadcrumb({super.key, required this.path, required this.onUp});
  final List<InvCategory> path;
  final ValueChanged<int> onUp;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return SizedBox(
      height: 34,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _Crumb(label: 'All', onTap: () => onUp(path.length), color: brand),
          for (var i = 0; i < path.length; i++) ...[
            Icon(Icons.chevron_right_rounded, size: 16, color: t.muted2),
            _Crumb(
              label: path[i].name,
              // The last crumb is where we already are.
              onTap: i == path.length - 1 ? null : () => onUp(path.length - 1 - i),
              color: i == path.length - 1 ? t.ink : brand,
            ),
          ],
        ],
      ),
    );
  }
}

class _Crumb extends StatelessWidget {
  const _Crumb({required this.label, required this.onTap, required this.color});
  final String label;
  final VoidCallback? onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Text(
          label,
          style: RunqText.caption.copyWith(color: color, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.count,
    required this.isLeaf,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final int count;
  final bool isLeaf;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Icon(icon, size: 18, color: isLeaf ? t.muted : InvColors.brand(context)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text('$count',
                style: RunqText.tabular(size: 13, w: FontWeight.w600)
                    .copyWith(color: t.muted)),
            Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

/// List ⇄ categories. A segmented pair rather than one toggling icon: an
/// icon that swaps on tap never says which state you are in, only which way
/// you are about to go.
class InvItemViewToggle extends StatelessWidget {
  const InvItemViewToggle({super.key, required this.browse, required this.onChanged});
  final bool browse;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _seg(context, t, Icons.view_list_rounded, !browse, () => onChanged(false), 'Flat list'),
        _seg(context, t, Icons.account_tree_outlined, browse, () => onChanged(true), 'By category'),
      ]),
    );
  }

  Widget _seg(BuildContext context, RunqTokens t, IconData icon, bool active,
      VoidCallback onTap, String tooltip) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: active ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon,
              size: 17, color: active ? InvColors.brand(context) : t.muted),
        ),
      ),
    );
  }
}
