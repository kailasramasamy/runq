// Items — the inventory item master. Mirrors the web /inventory/items page:
// tap a row to open the item, or "+ New item" to add one.
//
// Getting to a *particular* item is the job, and there are three ways in,
// ordered by how little they cost:
//
//   1. Recently opened — the same handful of SKUs get worked all day, so the
//      shortcut row above the list usually ends the search before it starts.
//   2. Search — answered from memory when the catalogue fits in one page
//      (see [_catalogue]), which turns every keystroke from a round trip
//      into a rebuild, and lets results come back *ranked* rather than
//      filed by category.
//   3. The category rail and the tree — for "what do we even carry", where
//      the user has a shape in mind rather than a name.
//
// Big tenants fall back to the paginated server list; nothing below changes
// shape, only where the rows come from.

library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/auth_provider.dart';
import '../../providers/inventory_providers.dart';
import '../../services/item_catalogue.dart';
import '../../services/item_recents.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/item_search.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/item_browse_pane.dart';
import 'widgets/item_category_browser.dart'
    show InvCategoryPick, InvItemViewToggle;
import 'widgets/item_class_strip.dart';
import 'widgets/item_list_tiles.dart';
import 'widgets/item_sectioned_list.dart';
import 'widgets/item_recents_strip.dart';

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

  /// Server-paginated rows — the fallback path, used whenever [_catalogue]
  /// is null or the current view asks something it cannot answer.
  final List<InvItemListRow> _rows = [];
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  /// Every active item, held once. Null while it is still loading, and left
  /// null for tenants past [itemCatalogueCap] — see [_isLocal].
  List<InvItemListRow>? _catalogue;

  List<RecentItem> _recents = const [];

  /// item_class → active-item count, plus an 'unclassified' key. Drives the
  /// pill badges; refreshed alongside a reset load so a reclassify shows up.
  Map<String, int> _classCounts = const {};

  @override
  void initState() {
    super.initState();
    final requested = widget.initialClassGroup;
    if (requested != null) {
      final key = legacyItemGroupAliases[requested] ?? requested;
      if (itemClassFilters.any((f) => f.key == key)) _classGroup = key;
    }
    _scroll.addListener(_onScroll);
    _reload();
    _loadRecents();
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

  // ---------------------------------------------------------------- loading

  /// True when the flat list can be answered from memory. A picked category
  /// and the browse pane still go to the server: both key off category ids,
  /// which the cached rows carry only by name. So does any pill that asks
  /// for a status — the cached catalogue holds active items only.
  bool get _isLocal =>
      _catalogue != null &&
      !_browse &&
      !_showingItems &&
      itemClassQuery(_classGroup).status == null;

  /// Rows for the flat list under the current class pill and search box.
  /// Ranked while searching — the whole point of holding the catalogue is
  /// that "gh" can put Ghee first instead of wherever it is filed.
  List<InvItemListRow> get _localRows {
    final matching = [
      for (final r in _catalogue!)
        if (itemMatchesFilter(r, _classGroup)) r,
    ];
    return rankedItemMatches(
      matching,
      _search,
      name: (r) => r.name,
      sku: (r) => r.sku,
    );
  }

  List<InvItemListRow> get _visibleRows => _isLocal ? _localRows : _rows;

  Future<void> _loadCatalogue() async {
    final rows = await ItemCatalogue.fetchAll();
    if (mounted) setState(() => _catalogue = rows);
  }

  /// Pull fresh data for whichever path the current view is on.
  Future<void> _reload() async {
    setState(() => _loading = true);
    _loadCounts();
    await _loadCatalogue();
    if (!mounted) return;
    if (_isLocal) {
      setState(() {
        _loading = false;
        _error = null;
      });
      return;
    }
    await _load(reset: true);
  }

  /// Re-answer the current query. In local mode that is a rebuild and costs
  /// nothing — which is what makes the class pills feel instant too.
  void _refreshRows() {
    if (_isLocal) {
      setState(() {});
      return;
    }
    _load(reset: true);
  }

  void _onScroll() {
    if (_isLocal || _loadingMore || _loading) return;
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
      final q = itemClassQuery(_classGroup);
      final res = await inventoryRepo.items(
        page: reset ? 1 : _page + 1,
        search: _search,
        itemClassGroup: q.itemClassGroup,
        itemClass: q.itemClass,
        unclassified: q.unclassified,
        status: q.status,
        madeOnDispatch: q.madeOnDispatch,
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

  Future<void> _loadTree() async {
    setState(() => _treeLoading = true);
    try {
      final res = await ItemCatalogue.fetchTree(_classGroup);
      if (!mounted) return;
      setState(() {
        _tree = res.tree;
        _uncategorised = res.uncategorised;
        _treeLoading = false;
      });
    } on Exception {
      if (mounted) setState(() => _treeLoading = false);
    }
  }

  // ---------------------------------------------------------------- recents

  ItemRecentsStore get _recentsStore =>
      ItemRecentsStore(ref.read(authProvider).user?.id);

  Future<void> _loadRecents() async {
    final list = await _recentsStore.load();
    if (mounted) setState(() => _recents = list);
  }

  /// Recents earn their space only on the unfiltered list — once the user is
  /// narrowing, the narrowing is the answer and a shortcut row is noise.
  List<RecentItem> get _liveRecents => reconcileRecents(_recents, _catalogue);

  bool get _showRecents =>
      !_browse &&
      !_showingItems &&
      _search.trim().isEmpty &&
      _classGroup == 'all' &&
      _liveRecents.isNotEmpty;

  Future<void> _openItem(RecentItem item) async {
    final next = await _recentsStore.remember(item);
    if (!mounted) return;
    setState(() => _recents = next);
    context.push('/inventory/items/${item.id}');
  }

  Future<void> _clearRecents() async {
    await _recentsStore.clear();
    if (mounted) setState(() => _recents = const []);
  }

  // --------------------------------------------------------------- filters

  void _onSearch(String v) {
    _debounce?.cancel();
    // In-memory filtering costs a rebuild, so it can keep up with typing; the
    // server path still needs a gap to avoid a request per keystroke.
    final wait = _isLocal ? 120 : 350;
    _debounce = Timer(Duration(milliseconds: wait), () {
      if (!mounted) return;
      setState(() => _search = v);
      if (!_isLocal) _load(reset: true);
    });
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchCtrl.clear();
    setState(() => _search = '');
    _refreshRows();
  }

  void _onClass(String g) {
    if (g == _classGroup) return;
    setState(() => _classGroup = g);
    _refreshRows();
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
      _pickedCategoryId = null;
      _pickedUncategorised = false;
    });
    if (on) _loadTree();
    _refreshRows();
  }

  /// Stand-in id for the no-category crumb, which has no category behind it.
  static const _uncategorisedCrumbId = '__uncategorised__';

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
    _refreshRows();
  }

  /// Drop [levels] crumbs. Any pick goes with them: the level above a list of
  /// items is the tree, never the same items under a shorter trail.
  void _onUp(int levels) {
    setState(() {
      _path = _path.sublist(0, _path.length - levels);
      _pickedCategoryId = null;
      _pickedUncategorised = false;
    });
    _refreshRows();
  }

  Future<void> _openNew() async {
    final created = await context.push('/inventory/items/new');
    if (created == true) _reload();
  }

  // ----------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // The rows live in local state, so a movement posted on a screen pushed
    // over this one (item detail → adjust stock, threshold edit) can't reach
    // them by provider invalidation. Reload on the revision instead, while
    // this screen is still mounted underneath, so the balance is already
    // right when the user walks back.
    ref.listen(invStockRevisionProvider, (_, _) {
      if (mounted) _reload();
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
            NewItemButton(onTap: _openNew),
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
          ItemClassStrip(
            selected: _classGroup,
            counts: _classCounts,
            onChanged: _onClass,
          ),
          if (_showRecents)
            ItemRecentsStrip(
              items: _liveRecents,
              onTap: _openItem,
              onClear: _clearRecents,
            ),
          if (!_browse && !_loading && _error == null) _countLine(),
          Expanded(child: _browse ? _browsePane(t) : _body(t)),
        ],
      ),
    );
  }

  Widget _countLine() => ItemCountLine(
    loaded: _visibleRows.length,
    total: _isLocal ? _visibleRows.length : _total,
  );

  Widget _browsePane(RunqTokens t) {
    final searching = _search.trim().isNotEmpty;
    if (_treeLoading && _tree.isEmpty && !searching) {
      return const Center(child: CircularProgressIndicator());
    }
    return ItemBrowsePane(
      tree: _tree,
      path: _path,
      uncategorisedCount: _uncategorised,
      searching: searching,
      showingItems: _showingItems,
      header: _loading || _error != null ? null : _countLine(),
      itemsPane: _body(t),
      onDrill: (c) => setState(() => _path = [..._path, c]),
      onPick: _onPick,
      onUp: _onUp,
      onClearSearch: _clearSearch,
      onRefreshTree: _loadTree,
    );
  }

  Widget _body(RunqTokens t) {
    final rows = _visibleRows;
    final placeholder = itemListPlaceholder(
      context,
      loading: _loading,
      error: _error,
      isEmpty: rows.isEmpty,
      searching: _search.isNotEmpty,
      onNew: _openNew,
    );
    if (placeholder != null) return placeholder;
    return ItemSectionedList(
      rows: rows,
      // Ranked results go flat: headers over a ranked list would scatter the
      // best answers down the page.
      sectioned: _search.trim().isEmpty,
      controller: _scroll,
      onOpen: (r) => _openItem(RecentItem(id: r.id, name: r.name, sku: r.sku)),
      onRefresh: _reload,
      showFooterSpinner: !_isLocal && _page < _totalPages,
    );
  }
}
