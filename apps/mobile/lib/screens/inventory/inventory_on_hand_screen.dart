// Stock on Hand — live, filterable list of every (item, warehouse, batch)
// row. One compact header band — search + Filters button, class-group tabs,
// a one-line summary — then the list of stock tiles (avatar + name +
// stock-bar + qty/value column). Warehouse, the category tree and the
// low-only / hide-zero toggles live in the Filters sheet: stacked inline
// they pushed the first tile off the bottom of the screen.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_category_filter.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_on_hand_sections.dart';
import 'widgets/inv_on_hand_toolbar.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/inv_stock_tile.dart';

class InventoryOnHandScreen extends ConsumerStatefulWidget {
  const InventoryOnHandScreen({super.key});
  @override
  ConsumerState<InventoryOnHandScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryOnHandScreen> {
  /// Warehouse + category tree + the two toggles, all owned by the Filters
  /// sheet. Held as one object so the sheet can hand back a whole state
  /// rather than five callbacks.
  OnHandFilters filters = const OnHandFilters();
  String query = '';

  String? get warehouseId => filters.warehouseId;
  bool get lowOnly => filters.lowOnly;
  bool get hideZero => filters.hideZero;
  String? get category => filters.category;
  String? get subcategory => filters.subcategory;

  /// On-hand opens on "All" — this screen answers "what's in the godown",
  /// and hiding three quarters of it behind a pill made the total on the
  /// summary strip disagree with the list under it. Picking a pill still
  /// narrows to one bucket; until then the list is sectioned by group.
  String classGroup = classGroupAll;

  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // Client-side filter on top of the server query. The server narrows by
  // warehouse + lowOnly; everything else stays local so the class-group
  // tabs can display per-bucket counts (only possible with the unfiltered
  // row set in memory) and search doesn't trigger a round-trip per keystroke.
  List<InvOnHandRow> _apply(List<InvOnHandRow> rows) {
    final q = query.trim().toLowerCase();
    final active = classGroup;
    return rows.where((r) {
      if (hideZero && r.qty <= 0) return false;
      if (active != classGroupAll &&
          classGroupForItemClass(r.itemClass) != active) {
        return false;
      }
      if (category != null && onHandCategoryOf(r) != category) return false;
      if (subcategory != null && onHandSubcategoryOf(r) != subcategory) {
        return false;
      }
      if (q.isEmpty) return true;
      return r.itemName.toLowerCase().contains(q) ||
          (r.itemSku ?? '').toLowerCase().contains(q) ||
          r.warehouseName.toLowerCase().contains(q) ||
          r.batchNo.toLowerCase().contains(q);
    }).toList();
  }

  /// Bucket the warehouse+lowOnly-filtered rows by class group so the tab
  /// strip can show per-bucket counts and hide empty buckets. Counted on the
  /// collapsed positions, so the pill agrees with the list under it.
  Map<String, int> _bucketCounts(List<InvOnHandRow> rows) {
    final counts = <String, int>{};
    for (final g in collapseOnHandRows(
      rows.where((r) => !hideZero || r.qty > 0).toList(),
    )) {
      final key = classGroupForItemClass(g.lead.itemClass);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  /// True when anything is narrowing the list — the reset affordance only
  /// earns its place on the row once there is something to reset.
  bool get _hasFilters =>
      filters.activeCount > 0 ||
      classGroup != classGroupAll ||
      query.isNotEmpty;

  /// Back to the unfiltered godown view in one tap. Clears the search box
  /// too — a stale term left in the field is the filter people forget they
  /// set and then report the list as broken.
  void _clearFilters() {
    _searchCtrl.clear();
    setState(() {
      filters = const OnHandFilters();
      classGroup = classGroupAll;
      query = '';
    });
  }

  /// Rows the category pickers should count over: everything the *other*
  /// filters allow, so the option list never offers a branch that would come
  /// back empty — and never hides one just because a category is already
  /// picked.
  List<InvOnHandRow> _catScope(List<InvOnHandRow> rows, OnHandFilters f) => rows
      .where(
        (r) =>
            (!f.hideZero || r.qty > 0) &&
            (classGroup == classGroupAll ||
                classGroupForItemClass(r.itemClass) == classGroup),
      )
      .toList();

  /// Options for the sheet's two category triggers, under the filter state
  /// the sheet currently holds — it recomputes as each control is touched,
  /// so a branch the other filters just emptied stops being offered.
  ///
  /// Parents are counted on collapsed positions so the number matches the
  /// tiles below; unfiled stock sorts last. Leaves are the ones under the
  /// selected parent (or across all of them when none is picked) — items
  /// filed straight on a parent have no leaf and drop out.
  OnHandFilterOptions _optionsFor(List<InvOnHandRow> rows, OnHandFilters f) {
    final scope = _catScope(rows, f);
    return (
      cats: _tally(scope, onHandCategoryOf),
      subs: _tally(
        scope.where(
          (r) => f.category == null || onHandCategoryOf(r) == f.category,
        ),
        onHandSubcategoryOf,
      ),
    );
  }

  static List<InvCatOption> _tally(
    Iterable<InvOnHandRow> rows,
    String? Function(InvOnHandRow) key,
  ) {
    final counts = <String, int>{};
    for (final g in collapseOnHandRows(rows.toList())) {
      final k = key(g.lead);
      if (k == null) continue;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    final labels = counts.keys.toList()
      ..sort((a, b) {
        if (a == kUncategorised) return 1;
        if (b == kUncategorised) return -1;
        return a.toLowerCase().compareTo(b.toLowerCase());
      });
    return [for (final l in labels) (key: l, label: l, count: counts[l]!)];
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Pull the unfiltered set so the tab strip sees every bucket's count.
    // The class-group filter is applied locally in _apply.
    final args = (
      warehouseId: warehouseId,
      lowOnly: lowOnly,
      itemClassGroup: null as String?,
    );
    final rowsAsync = ref.watch(invOnHandProvider(args));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: const InvPlainAppBar(title: 'Stock on Hand'),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invOnHandProvider(args));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rowsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Failed to load: $e',
                style: RunqText.caption.copyWith(color: t.muted),
                textAlign: TextAlign.center,
              ),
            ),
          ),
          data: (rows) {
            final counts = _bucketCounts(rows);
            final filtered = collapseOnHandRows(_apply(rows));
            // Category → subcategory sections. A tenant that files nothing
            // gets one "Uncategorised" section, where the header says
            // nothing the list doesn't — drop it and render flat.
            var sections = groupOnHandRows(filtered);
            if (sections.length == 1 && sections.first.subs.length <= 1) {
              sections = const [];
            }
            return CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: InvOnHandToolbar(
                    controller: _searchCtrl,
                    onSearch: (v) => setState(() => query = v),
                    filters: filters,
                    onFilters: (f) => setState(() => filters = f),
                    optionsFor: (f) => _optionsFor(rows, f),
                  ),
                ),
                SliverToBoxAdapter(
                  child: InvClassTabs(
                    selected: classGroup,
                    counts: counts,
                    onChanged: (g) => setState(() => classGroup = g),
                  ),
                ),
                SliverToBoxAdapter(
                  child: InvOnHandSummary(
                    items: filtered.length,
                    value: filtered.fold<double>(0, (a, r) => a + r.value),
                    low: filtered.where((r) => r.isLow).length,
                    lowActive: lowOnly,
                    onTapLow: () =>
                        setState(() => filters = filters.toggleLowOnly()),
                  ),
                ),
                if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    // The dead end is where a reset is worth most, so the
                    // empty state offers it rather than sending the reader
                    // back up the screen to hunt for the control.
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        InvEmptyState(
                          icon: Icons.inventory_2_outlined,
                          title: 'No items match',
                          subtitle: query.isNotEmpty
                              ? 'Try a different search or warehouse'
                              : 'Adjust filters above',
                        ),
                        if (_hasFilters)
                          TextButton.icon(
                            onPressed: _clearFilters,
                            icon: const Icon(
                              Icons.filter_alt_off_outlined,
                              size: 16,
                            ),
                            label: const Text('Clear filters'),
                            style: TextButton.styleFrom(
                              foregroundColor: InvColors.brand(context),
                            ),
                          ),
                      ],
                    ),
                  )
                else if (sections.isEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                    sliver: SliverList.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => InvStockTile(row: filtered[i]),
                    ),
                  )
                else
                  for (var si = 0; si < sections.length; si++)
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(
                        16,
                        0,
                        16,
                        si == sections.length - 1 ? 120 : 0,
                      ),
                      // Flattened to one list per section so the header, the
                      // leaf headings and the tiles share one separator
                      // rhythm — built once, not per itemBuilder call.
                      sliver: _SectionSliver(section: sections[si]),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ── Section list ──────────────────────────────────────────────────────────

/// One category section: its header, then each leaf band's heading and rows,
/// flattened into a single list so every gap in the section is the same.
class _SectionSliver extends StatelessWidget {
  const _SectionSliver({required this.section});
  final OnHandSection section;

  @override
  Widget build(BuildContext context) {
    final entries = <Widget>[
      InvGroupHeader(label: section.label, rows: section.rows),
      for (final sub in section.subs) ...[
        if (sub.label != null)
          InvSubGroupHeader(label: sub.label!, rows: sub.rows),
        for (final row in sub.rows) InvStockTile(row: row),
      ],
    ];
    return SliverList.separated(
      itemCount: entries.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => entries[i],
    );
  }
}

