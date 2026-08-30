// Items — the inventory item master. Searchable, class-group filtered,
// load-more paginated list of every catalog item. Mirrors the web
// /inventory/items page: tap a row to open the item, or "+ New item" to
// add one. Search + class filter run server-side (GET /masters/items).

library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_qty.dart';
import 'widgets/inv_colors.dart';
import 'widgets/item_category_browser.dart';
import 'widgets/inv_primitives.dart';

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
const _classFilters = <({String key, String label, _FilterKind kind})>[
  (key: 'all', label: 'All', kind: _FilterKind.all),
  (key: 'finished', label: 'Finished', kind: _FilterKind.group),
  (key: 'trading_good', label: 'Trading', kind: _FilterKind.itemClass),
  (key: 'raw_material', label: 'Raw material', kind: _FilterKind.itemClass),
  (key: 'packaging', label: 'Packaging', kind: _FilterKind.itemClass),
  (key: 'consumable', label: 'Consumable', kind: _FilterKind.itemClass),
  (key: 'semi_finished', label: 'Semi-packaged', kind: _FilterKind.itemClass),
  (key: 'spare_part', label: 'Spare part', kind: _FilterKind.itemClass),
  (key: 'other', label: 'Other', kind: _FilterKind.unclassified),
  // Deactivated items are hidden from every picker in the app, so this is
  // the only place left to find one — and the only way to reactivate it.
  (key: 'inactive', label: 'Inactive', kind: _FilterKind.inactive),
];

enum _FilterKind { all, group, itemClass, unclassified, inactive }

/// Bucket keys that other screens still deep-link with (`?classGroup=`), mapped
/// to the pill that now carries that stock. 'inputs' lands on Raw material —
/// the Home "raw material available" strip is what sends it.
const Map<String, String> _legacyGroupAliases = {
  'inputs': 'raw_material',
  'trading': 'trading_good',
};

_FilterKind _kindOf(String key) => _classFilters
    .firstWhere((f) => f.key == key, orElse: () => _classFilters.first)
    .kind;

/// Count shown on a pill. Groups sum their member classes; 'All' sums
/// everything including the unclassified leftovers.
int _countFor(String key, Map<String, int> byClass) {
  switch (_kindOf(key)) {
    case _FilterKind.all:
      return byClass.values.fold(0, (a, b) => a + b);
    case _FilterKind.group:
      // 'finished' is the only group left, and it means packed goods —
      // semi-finished has its own pill, so it must not be counted twice.
      return byClass['finished_good'] ?? 0;
    case _FilterKind.itemClass:
      return byClass[key] ?? 0;
    case _FilterKind.unclassified:
      return byClass['unclassified'] ?? 0;
    case _FilterKind.inactive:
      // The counts aggregate covers active items only, so this pill has no
      // number to show. A bare pill beats a wrong one.
      return -1;
  }
}

class InventoryItemsListScreen extends ConsumerStatefulWidget {
  const InventoryItemsListScreen({super.key, this.initialClassGroup});

  /// Pre-selected class pill, passed as `?classGroup=` by the Home stock
  /// strips so "See all" lands on the bucket the user tapped from. Unknown
  /// values fall back to 'all'.
  final String? initialClassGroup;

  @override
  ConsumerState<InventoryItemsListScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryItemsListScreen> {
  final _searchCtrl = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  String _search = '';
  String _classGroup = 'all';

  /// Flat list, or drill through the category tree. The tree is the same
  /// catalogue seen through its filing rather than a different data set, so
  /// it shares the class filter and hands leaves back to this list.
  bool _browse = false;
  List<InvCategory> _tree = const [];
  List<InvCategory> _path = const [];
  int _uncategorised = 0;
  bool _treeLoading = false;

  /// Set when the list is showing one category picked out of the browser.
  /// [_pickedUncategorised] is the no-category bucket, which is a filter the
  /// category id cannot express. The name is carried by the last breadcrumb,
  /// not held here.
  String? _pickedCategoryId;
  bool _pickedUncategorised = false;
  final List<InvItemListRow> _rows = [];
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  /// item_class → active-item count, plus an 'unclassified' key. Drives the
  /// pill badges; refreshed alongside a reset load so a reclassify shows up.
  Map<String, int> _classCounts = const {};

  @override
  void initState() {
    super.initState();
    final requested = widget.initialClassGroup;
    if (requested != null) {
      final key = _legacyGroupAliases[requested] ?? requested;
      if (_classFilters.any((f) => f.key == key)) _classGroup = key;
    }
    _scroll.addListener(_onScroll);
    _load(reset: true);
    // The pickers need the tree whether or not the browser is open, and its
    // counts are what make an option worth offering.
    _loadTree();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_loadingMore || _loading) return;
    if (_page >= _totalPages) return;
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 300) {
      _load(reset: false);
    }
  }

  Future<void> _load({required bool reset}) async {
    if (reset) _loadCounts();
    setState(() {
      if (reset) {
        _loading = true;
        _error = null;
      } else {
        _loadingMore = true;
      }
    });
    try {
      final next = reset ? 1 : _page + 1;
      final kind = _kindOf(_classGroup);
      final res = await inventoryRepo.items(
        page: next,
        search: _search,
        itemClassGroup: kind == _FilterKind.group ? _classGroup : null,
        itemClass: kind == _FilterKind.itemClass ? _classGroup : null,
        unclassified: kind == _FilterKind.unclassified,
        status: kind == _FilterKind.inactive ? 'inactive' : null,
        categoryId: _pickedCategoryId,
        uncategorised: _pickedUncategorised,
        // Balance is the headline number on the tile, so the list needs it.
        withStock: true,
        // Ordered category → subcategory → name so the list can section by
        // category on any class filter, and a section never straddles a page.
        sort: 'category',
      );
      if (!mounted) return;
      setState(() {
        if (reset) {
          _rows
            ..clear()
            ..addAll(res.rows);
        } else {
          _rows.addAll(res.rows);
        }
        _page = res.page;
        _totalPages = res.totalPages;
        _total = res.total;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = _loadingMore = false);
    }
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _search = v;
      _load(reset: true);
    });
  }

  /// Counts are a separate aggregate — fetched once per reset load and left
  /// alone on paging, where nothing about the catalogue has changed.
  Future<void> _loadCounts() async {
    try {
      final counts = await inventoryRepo.itemClassCounts();
      if (mounted) setState(() => _classCounts = counts);
    } on Exception {
      // A missing badge is not worth an error state — the list still works.
    }
  }

  void _onClass(String g) {
    if (g == _classGroup) return;
    setState(() => _classGroup = g);
    _load(reset: true);
    // Counts on the tree are computed under the class filter, so they go
    // stale the moment it changes — and the flat list's pickers read the
    // same tree, so this is no longer browse-only.
    _loadTree();
  }

  /// Switch between the flat list and the category tree. Leaving the tree
  /// drops any category it picked — the flat list means "everything".
  void _setBrowse(bool on) {
    if (on == _browse) return;
    setState(() {
      _browse = on;
      // Both directions start clean: the flat list means "everything", and
      // re-entering the tree opens at the root rather than resuming a trail
      // the user has since stopped thinking about.
      _path = const [];
      _clearPick(reload: false);
    });
    if (on) {
      _loadTree();
      // The tree pane shows no items, but returning to a leaf must not
      // surface the previous category's rows — reload unfiltered.
      _load(reset: true);
    } else {
      _load(reset: true);
    }
  }

  /// Stand-in id for the no-category crumb, which has no category behind it.
  static const _uncategorisedCrumbId = '__uncategorised__';

  void _clearPick({bool reload = true}) {
    _pickedCategoryId = null;
    _pickedUncategorised = false;
    if (reload) _load(reset: true);
  }

  Future<void> _loadTree() async {
    setState(() => _treeLoading = true);
    try {
      final kind = _kindOf(_classGroup);
      final tree = await inventoryRepo.categoryTree(
        withCounts: true,
        itemClassGroup: kind == _FilterKind.group ? _classGroup : null,
        itemClass: kind == _FilterKind.itemClass ? _classGroup : null,
        unclassified: kind == _FilterKind.unclassified,
      );
      // The tree cannot carry a bucket for items filed under nothing, so it
      // is counted separately — one row, and only when it is non-empty.
      final orphans = await inventoryRepo.items(
        limit: 1,
        uncategorised: true,
        itemClassGroup: kind == _FilterKind.group ? _classGroup : null,
        itemClass: kind == _FilterKind.itemClass ? _classGroup : null,
        unclassified: kind == _FilterKind.unclassified,
        status: kind == _FilterKind.inactive ? 'inactive' : null,
      );
      if (!mounted) return;
      setState(() {
        _tree = tree;
        _uncategorised = orphans.total;
        _treeLoading = false;
      });
    } on Exception {
      if (mounted) setState(() => _treeLoading = false);
    }
  }

  /// Showing items for a picked category rather than the tree beneath it.
  bool get _showingItems => _pickedCategoryId != null || _pickedUncategorised;

  /// A pick is a step *down* the tree, not a way out of it. The breadcrumb
  /// stays above the items, so the level you came from is one tap away —
  /// switching to the flat list here stranded the user at the root.
  void _onPick(InvCategoryPick pick) {
    setState(() {
      _pickedCategoryId = pick.categoryId;
      _pickedUncategorised = pick.uncategorised;
      // "Directly in X" is already the last crumb; a leaf and the
      // no-category bucket each add one so the trail names where you are.
      final alreadyHere = _path.isNotEmpty && _path.last.id == pick.categoryId;
      if (!alreadyHere) {
        _path = [
          ..._path,
          InvCategory(
            id: pick.categoryId ?? _uncategorisedCrumbId,
            name: pick.label,
          ),
        ];
      }
    });
    _load(reset: true);
  }

  /// Drop [levels] crumbs. Any pick goes with them: the level above a list of
  /// items is the tree, never the same items under a shorter trail.
  void _onUp(int levels) {
    setState(() {
      _path = _path.sublist(0, _path.length - levels);
      _pickedCategoryId = null;
      _pickedUncategorised = false;
    });
    _load(reset: true);
  }

  Future<void> _openNew() async {
    final created = await context.push('/inventory/items/new');
    if (created == true) _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // The rows live in local state, so a movement posted on a screen pushed
    // over this one (item detail → adjust stock, threshold edit) can't reach
    // them by provider invalidation. Reload on the revision instead, while
    // this screen is still mounted underneath, so the balance is already
    // right when the user walks back.
    ref.listen(invStockRevisionProvider, (_, _) {
      if (mounted) _load(reset: true);
    });
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Items',
        onBack: () => context.pop(),
        // Matches the add button on GRNs, deliveries, transfers and
        // adjustments — an extended FAB here covered the last row and read as
        // a different affordance to the same action on its sibling screens.
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            InvItemViewToggle(browse: _browse, onChanged: _setBrowse),
            _AddBtn(onTap: _openNew),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: InvSearchBar(
              controller: _searchCtrl,
              onChanged: _onSearch,
              hint: 'Search by name or SKU…',
            ),
          ),
          _ClassStrip(
            selected: _classGroup,
            counts: _classCounts,
            onChanged: _onClass,
          ),
          if (!_browse && !_loading && _error == null)
            _CountLine(loaded: _rows.length, total: _total),
          Expanded(child: _browse ? _browseBody(t) : _body(t)),
        ],
      ),
    );
  }

  Widget _browseBody(RunqTokens t) {
    // A search spans the catalogue, so it cannot be answered by a tree: the
    // match is usually in some *other* branch. Results take over the pane
    // until the box is cleared, which drops the user back exactly where they
    // were standing.
    //
    // Scoped to the picked category once there is one — a category filter
    // matches one category exactly, so narrowing works at a leaf but has no
    // meaning part-way down a branch.
    final searching = _search.trim().isNotEmpty;
    if (_treeLoading && _tree.isEmpty && !searching) {
      return const Center(child: CircularProgressIndicator());
    }
    final showItems = _showingItems || searching;
    return Column(
      children: [
        if (searching && !_showingItems)
          _SearchScopeNote(path: _path, onClear: _clearSearch)
        else if (_path.isNotEmpty)
          InvCategoryBreadcrumb(path: _path, onUp: _onUp),
        if (showItems && !_loading && _error == null)
          _CountLine(loaded: _rows.length, total: _total),
        // Items when a category is picked or a search is running, the tree
        // beneath the current level otherwise.
        Expanded(child: showItems ? _body(t) : _treePane()),
      ],
    );
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchCtrl.clear();
    setState(() => _search = '');
    _load(reset: true);
  }

  Widget _treePane() => RefreshIndicator(
    color: InvColors.brand(context),
    onRefresh: _loadTree,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        InvCategoryBrowser(
          tree: _tree,
          path: _path,
          uncategorisedCount: _uncategorised,
          onDrill: (c) => setState(() => _path = [..._path, c]),
          onPick: _onPick,
        ),
      ],
    ),
  );

  Widget _body(RunqTokens t) {
    if (_loading && _rows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _rows.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Failed to load items: $_error',
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    if (_rows.isEmpty) {
      return InvEmptyState(
        icon: Icons.inventory_2_outlined,
        title: _search.isNotEmpty ? 'No items match' : 'No items yet',
        subtitle: _search.isNotEmpty
            ? 'Try a different search or filter'
            : 'Add your first catalog item',
        actionLabel: 'New item',
        onAction: _openNew,
      );
    }
    final entries = _sectionedEntries(_rows);
    return RefreshIndicator(
      color: InvColors.brand(context),
      onRefresh: () => _load(reset: true),
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: entries.length + (_page < _totalPages ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          if (i >= entries.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          final e = entries[i];
          return e is _SectionLabel
              ? _SectionHeader(label: e.label, count: e.count, nested: e.nested)
              : _ItemTile(row: e as InvItemListRow);
        },
      ),
    );
  }
}

/// Marker entry in the flat list — a section title plus its row count.
/// [nested] marks the subcategory header sitting under its category.
/// Says why the tree has been replaced by a list, and offers the way back.
/// Without it a search reads as "the categories disappeared".
class _SearchScopeNote extends StatelessWidget {
  const _SearchScopeNote({required this.path, required this.onClear});
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

class _SectionLabel {
  const _SectionLabel(this.label, this.count, {this.nested = false});
  final String label;
  final int count;
  final bool nested;
}

const _uncategorised = 'Uncategorised';

/// Flatten rows into [category, subcategory?, ...rows, …]. Buckets are filled
/// from the whole loaded set on every build, so load-more appends into the
/// section a row belongs to instead of restarting the sequence. Rows filed
/// straight on a root category carry no subcategory and render right under
/// the category header.
List<Object> _sectionedEntries(List<InvItemListRow> rows) {
  final byCategory = <String, Map<String, List<InvItemListRow>>>{};
  for (final r in rows) {
    final cat = (r.category?.trim().isNotEmpty == true)
        ? r.category!.trim()
        : _uncategorised;
    final sub = r.subcategory?.trim() ?? '';
    byCategory.putIfAbsent(cat, () => {}).putIfAbsent(sub, () => []).add(r);
  }
  return [
    for (final entry in byCategory.entries) ...[
      _SectionLabel(
        entry.key,
        entry.value.values.fold(0, (n, list) => n + list.length),
      ),
      for (final sub in entry.value.entries) ...[
        if (sub.key.isNotEmpty)
          _SectionLabel(sub.key, sub.value.length, nested: true),
        ...sub.value,
      ],
    ],
  ];
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
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
          ? const EdgeInsets.fromLTRB(10, 4, 2, 0)
          : const EdgeInsets.fromLTRB(2, 8, 2, 0),
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

class _ClassStrip extends StatelessWidget {
  const _ClassStrip({
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
        itemCount: _classFilters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final f = _classFilters[i];
          return InvFilterPill(
            label: f.label,
            // Counts arrive a beat after the first frame; until then the
            // pills render bare rather than claiming everything is empty.
            count: counts.isEmpty || _countFor(f.key, counts) < 0
                ? null
                : _countFor(f.key, counts),
            active: selected == f.key,
            onTap: () => onChanged(f.key),
          );
        },
      ),
    );
  }
}

class _CountLine extends StatelessWidget {
  const _CountLine({required this.loaded, required this.total});
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

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.row});
  final InvItemListRow row;

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
    return InvCard(
      onTap: () => context.push('/inventory/items/${row.id}'),
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
                      maxLines: 2,
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
                formatItemQty(row.stockQty, row.itemClass, unit: row.unit),
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
class _AddBtn extends StatelessWidget {
  const _AddBtn({required this.onTap});
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
