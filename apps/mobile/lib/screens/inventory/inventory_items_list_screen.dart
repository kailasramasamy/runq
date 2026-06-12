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
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

// Class-group filters shown as a pill strip. 'all' clears the filter; the
// rest map to the server's item_class_group buckets.
const _classFilters = <({String key, String label})>[
  (key: 'all', label: 'All'),
  (key: 'finished', label: 'Finished'),
  (key: 'inputs', label: 'Inputs'),
  (key: 'trading', label: 'Trading'),
  (key: 'other', label: 'Other'),
];

class InventoryItemsListScreen extends ConsumerStatefulWidget {
  const InventoryItemsListScreen({super.key});
  @override
  ConsumerState<InventoryItemsListScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryItemsListScreen> {
  final _searchCtrl = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  String _search = '';
  String _classGroup = 'all';
  final List<InvItemListRow> _rows = [];
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _load(reset: true);
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
      final res = await inventoryRepo.items(
        page: next,
        search: _search,
        itemClassGroup: _classGroup,
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

  void _onClass(String g) {
    if (g == _classGroup) return;
    setState(() => _classGroup = g);
    _load(reset: true);
  }

  Future<void> _openNew() async {
    final created = await context.push('/inventory/items/new');
    if (created == true) _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(title: 'Items', onBack: () => context.pop()),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openNew,
        backgroundColor: InvColors.brand(context),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded, size: 20),
        label: Text('New item', style: RunqText.bodyStrong.copyWith(color: Colors.white)),
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
          _ClassStrip(selected: _classGroup, onChanged: _onClass),
          if (!_loading && _error == null) _CountLine(loaded: _rows.length, total: _total),
          Expanded(child: _body(t)),
        ],
      ),
    );
  }

  Widget _body(RunqTokens t) {
    if (_loading && _rows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _rows.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Failed to load items: $_error',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center),
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
    return RefreshIndicator(
      color: InvColors.brand(context),
      onRefresh: () => _load(reset: true),
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
        itemCount: _rows.length + (_page < _totalPages ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          if (i >= _rows.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          return _ItemTile(row: _rows[i]);
        },
      ),
    );
  }
}

class _ClassStrip extends StatelessWidget {
  const _ClassStrip({required this.selected, required this.onChanged});
  final String selected;
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
        : (loaded < total ? 'Showing $loaded of $total items' : '$total item${total == 1 ? '' : 's'}');
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
      if (classLabel(row.itemClass, row.type) != null) classLabel(row.itemClass, row.type)!,
      if (row.category?.isNotEmpty == true) row.category!,
    ].join(' · ');
    return InvCard(
      onTap: () => context.push('/inventory/items/${row.id}'),
      child: Row(
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
                    Expanded(
                      child: Text(row.name,
                          style: RunqText.bodyStrong.copyWith(color: t.ink),
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                    ),
                    if (!row.isActive) ...[
                      const SizedBox(width: 6),
                      _InactivePill(),
                    ],
                  ],
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(meta,
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (row.defaultSellingPrice != null)
                Text(compactINR(row.defaultSellingPrice!),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              if (row.gstRate != null) ...[
                const SizedBox(height: 2),
                Text('GST ${_pct(row.gstRate!)}%',
                    style: RunqText.micro.copyWith(color: t.muted2)),
              ],
            ],
          ),
        ],
      ),
    );
  }

  static String _pct(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
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
      child: Text('Inactive',
          style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.2)),
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
