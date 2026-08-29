// Stock on Hand — live, filterable list of every (item, warehouse, batch)
// row. Tinted 3-col summary strip, search bar, searchable warehouse
// picker, category / sub-category pickers, low-only / hide-zero toggles,
// then a list of stock tiles (avatar + name + stock-bar + qty/value column).

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
import 'widgets/inv_primitives.dart';
import 'widgets/inv_stock_tile.dart';
import 'widgets/warehouse_picker.dart';

class InventoryOnHandScreen extends ConsumerStatefulWidget {
  const InventoryOnHandScreen({super.key});
  @override
  ConsumerState<InventoryOnHandScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryOnHandScreen> {
  String? warehouseId; // null = All
  bool lowOnly = false;
  bool hideZero = false;
  String query = '';

  /// On-hand opens on "All" — this screen answers "what's in the godown",
  /// and hiding three quarters of it behind a pill made the total on the
  /// summary strip disagree with the list under it. Picking a pill still
  /// narrows to one bucket; until then the list is sectioned by group.
  String classGroup = classGroupAll;

  /// Category tree filter. [category] is the parent heading, [subcategory] the
  /// leaf under it — both null means "everything", and picking a new parent
  /// clears a leaf that no longer belongs to it.
  String? category;
  String? subcategory;
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
      warehouseId != null ||
      category != null ||
      subcategory != null ||
      classGroup != classGroupAll ||
      lowOnly ||
      hideZero ||
      query.isNotEmpty;

  /// Back to the unfiltered godown view in one tap. Clears the search box
  /// too — a stale term left in the field is the filter people forget they
  /// set and then report the list as broken.
  void _clearFilters() {
    _searchCtrl.clear();
    setState(() {
      warehouseId = null;
      category = null;
      subcategory = null;
      classGroup = classGroupAll;
      lowOnly = false;
      hideZero = false;
      query = '';
    });
  }

  /// Rows the category pickers should count over: everything the *other*
  /// filters allow, so the option list never offers a branch that would come
  /// back empty — and never hides one just because a category is already
  /// picked.
  List<InvOnHandRow> _catScope(List<InvOnHandRow> rows) => rows
      .where(
        (r) =>
            (!hideZero || r.qty > 0) &&
            (classGroup == classGroupAll ||
                classGroupForItemClass(r.itemClass) == classGroup),
      )
      .toList();

  /// Parent categories present in [scope], with a position count each.
  /// Counted on collapsed positions so the number matches the tiles below.
  /// Unfiled stock sorts last — an unnamed tail shouldn't head the sheet.
  List<InvCatOption> _catOptions(List<InvOnHandRow> scope) =>
      _tally(scope, onHandCategoryOf);

  /// Leaves under the selected parent (or across all of them when none is
  /// picked). Items filed straight on a parent have no leaf and drop out.
  List<InvCatOption> _subOptions(List<InvOnHandRow> scope) => _tally(
    scope.where((r) => category == null || onHandCategoryOf(r) == category),
    onHandSubcategoryOf,
  );

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
            final scope = _catScope(rows);
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
                SliverToBoxAdapter(child: _Summary(rows: filtered)),
                SliverToBoxAdapter(
                  child: _SearchRow(
                    controller: _searchCtrl,
                    onChanged: (v) => setState(() => query = v),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                    child: WarehousePicker(
                      value: warehouseId,
                      onChanged: (v) => setState(() => warehouseId = v),
                      dense: true,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: InvCategoryFilter(
                      categories: _catOptions(scope),
                      subcategories: _subOptions(scope),
                      category: category,
                      subcategory: subcategory,
                      // A new parent invalidates a leaf that lived under the
                      // old one, so the leaf resets with it.
                      onCategory: (v) => setState(() {
                        category = v;
                        subcategory = null;
                      }),
                      onSubcategory: (v) => setState(() => subcategory = v),
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: InvClassTabs(
                      selected: classGroup,
                      counts: counts,
                      onChanged: (g) => setState(() => classGroup = g),
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _Toggles(
                    lowOnly: lowOnly,
                    hideZero: hideZero,
                    onLow: () => setState(() => lowOnly = !lowOnly),
                    onZero: () => setState(() => hideZero = !hideZero),
                    onClear: _hasFilters ? _clearFilters : null,
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

// ── Summary strip ─────────────────────────────────────────────────────────

class _Summary extends StatelessWidget {
  const _Summary({required this.rows});
  final List<OnHandGroup> rows;

  @override
  Widget build(BuildContext context) {
    final totalValue = rows.fold<double>(0, (a, r) => a + r.value);
    final lowCount = rows.where((r) => r.isLow).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      // IntrinsicHeight — slivers pass infinite height, `stretch` propagates it.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: InvKpiCard(
                label: 'Items',
                value: rows.length.toString(),
                sub: 'in stock',
                tint: InvColors.amberTint,
                borderTint: InvColors.amberHairline,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: InvKpiCard(
                label: 'Value',
                value: compactINR(totalValue),
                sub: 'total',
                tint: InvColors.amberTint,
                borderTint: InvColors.amberHairline,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: InvKpiCard(
                label: 'Low Stock',
                value: lowCount.toString(),
                sub: 'items',
                accent: lowCount > 0,
                tint: InvColors.amberTint,
                borderTint: InvColors.amberHairline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchRow extends StatelessWidget {
  const _SearchRow({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: InvSearchBar(
        controller: controller,
        onChanged: onChanged,
        hint: 'Item, SKU, warehouse, batch…',
      ),
    );
  }
}

class _Toggles extends StatelessWidget {
  const _Toggles({
    required this.lowOnly,
    required this.hideZero,
    required this.onLow,
    required this.onZero,
    required this.onClear,
  });
  final bool lowOnly;
  final bool hideZero;
  final VoidCallback onLow;
  final VoidCallback onZero;

  /// Null when nothing is filtered — the pill is hidden rather than shown
  /// dead, so its presence alone says "something is narrowing this list".
  final VoidCallback? onClear;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Row(
        children: [
          InvFilterPill(
            label: 'Low only',
            active: lowOnly,
            onTap: onLow,
            activeColor: InvColors.orangeAlert,
            icon: Icons.warning_amber_rounded,
          ),
          const SizedBox(width: 6),
          InvFilterPill(label: 'Hide zero', active: hideZero, onTap: onZero),
          if (onClear != null) ...[
            const Spacer(),
            InvFilterPill(
              label: 'Clear',
              active: false,
              onTap: onClear!,
              icon: Icons.filter_alt_off_outlined,
            ),
          ],
        ],
      ),
    );
  }
}
