import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../inventory/batch_detail_sheet.dart';
import '../inventory/widgets/batch_pool.dart';
import 'mfg_material_sheet.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';
import '../../utils/format_qty.dart';

/// Every input a work order can draw from, batch by batch — inside the
/// Manufacturing module rather than sending the planner over to Inventory and
/// losing their place mid-run.
///
/// Reads the `inputs` item-class group (raw_material + packaging), which is
/// exactly the set consumption pulls from, so nothing here is un-consumable.
/// The two classes are then split by a chip strip — a planner chasing bottles
/// should not have to scroll past every drum of oil to find them.
class MfgRawMaterialsScreen extends ConsumerStatefulWidget {
  const MfgRawMaterialsScreen({super.key});

  @override
  ConsumerState<MfgRawMaterialsScreen> createState() => _MfgRawMaterialsScreenState();
}

class _MfgRawMaterialsScreenState extends ConsumerState<MfgRawMaterialsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  /// null = the whole 'inputs' group. Filtered client-side: the group is
  /// already fetched whole, so a class chip costs no extra round trip.
  String? _itemClass;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final args = (warehouseId: null, lowOnly: false, itemClassGroup: 'inputs');
    final async = ref.watch(invOnHandProvider(args));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: MfgColors.brand(context),
          onRefresh: () async {
            ref.invalidate(invOnHandProvider(args));
            await Future<void>.delayed(const Duration(milliseconds: 200));
          },
          child: Column(children: [
            // A bottom-nav tab, so no back arrow — there is nothing behind it.
            const MfgPlainAppBar(title: 'Raw materials', showBack: false),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: MfgSearchBar(
                controller: _searchCtrl,
                placeholder: 'Search item or batch',
                onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              ),
            ),
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final c in const [
                    (itemClass: null, label: 'All'),
                    (itemClass: 'raw_material', label: 'Raw material'),
                    (itemClass: 'packaging', label: 'Packaging'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: MfgFilterChip(
                        label: c.label,
                        selected: _itemClass == c.itemClass,
                        onTap: () => setState(() => _itemClass = c.itemClass),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => MfgEmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: 'Could not load stock',
                  description: '$e',
                ),
                data: (rows) => _list(t, rows),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _list(RunqTokens t, List<InvOnHandRow> everything) {
    final all = _itemClass == null
        ? everything
        : everything.where((r) => r.itemClass == _itemClass).toList();
    final rows = _search.isEmpty
        ? all
        : all
            .where((r) =>
                r.itemName.toLowerCase().contains(_search) ||
                r.batchNo.toLowerCase().contains(_search))
            .toList();
    if (rows.isEmpty) {
      return MfgEmptyState(
        icon: Icons.inventory_2_outlined,
        title: all.isEmpty ? 'No raw materials in stock' : 'No match',
        description: all.isEmpty
            ? 'A work order will have nothing to consume until stock arrives.'
            : 'Nothing matches "$_search".',
      );
    }

    // Grouped under the category they are filed against, because that is how
    // the floor thinks about them: milk is one shelf, oils another, packaging
    // a third. A flat list ordered by quantity put jaggery between two milks
    // for no reason a reader could see.
    final groups = _groupByCategory(rows);

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 32),
      children: [
        for (final g in groups) ...[
          MfgSectionHeader(
            label: g.label,
            trailing: Text(
              g.items.length == 1 ? '1 item' : '${g.items.length} items',
              style: RunqText.caption.copyWith(color: t.muted2),
            ),
          ),
          for (final batches in g.items)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: _itemCard(t, batches),
            ),
          const SizedBox(height: 6),
        ],
      ],
    );
  }

  Widget _itemCard(RunqTokens t, List<InvOnHandRow> batches) {
    final first = batches.first;
    final qty = _totalQty(batches);
    final unit =
        first.itemUnit != null && first.itemUnit!.isNotEmpty ? ' ${first.itemUnit}' : '';
    // FEFO, the order a run should draw in: soonest expiry first, undated
    // last, oldest intake breaking the tie. Sorting on the batch number
    // instead only worked while numbers happened to run in arrival order.
    final ordered = [...batches]..sort(_byUrgency);

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // The header is the item, and tapping it opens the same pool sheet the
        // home card does — arrival times first, consignment codes last.
        InkWell(
          onTap: () => showMfgMaterialSheet(context, rows: batches),
          child: Row(children: [
            Expanded(
              child: Text(first.itemName,
                  style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 8),
            Text('${_trimQty(qty, first.itemUnit)}$unit',
                style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
            Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
          ]),
        ),
        Divider(color: t.hairline, height: 16),
        // One labelled row per batch — a planner picking milk for paneer is
        // choosing on centre, shift and freshness, none of which a
        // consignment number carries.
        for (final b in ordered)
          BatchPoolRow(
            batchNo: b.batchNo,
            qty: b.qty,
            unit: first.itemUnit,
            origin: b.origin,
            expiryDate: b.expiryDate,
            partUsed: b.isPartUsed,
            onTap: () => showBatchDetailSheet(
              context,
              BatchDetailArgs(
                itemId: b.itemId,
                itemName: b.itemName,
                batchNo: b.batchNo,
                qty: b.qty,
                unit: b.itemUnit,
                expiryDate: b.expiryDate,
                warehouseName: b.warehouseName,
                origin: b.origin,
              ),
            ),
          ),
      ]),
    );
  }

  /// See `StockQueryService.compareByUrgency` — the same order, so the app and
  /// the API never disagree about which batch is next.
  static int _byUrgency(InvOnHandRow a, InvOnHandRow b) {
    if (a.expiryDate != b.expiryDate) {
      if (a.expiryDate == null) return 1;
      if (b.expiryDate == null) return -1;
      return a.expiryDate!.compareTo(b.expiryDate!);
    }
    return (a.receivedAt ?? '').compareTo(b.receivedAt ?? '');
  }

  static String _trimQty(double v, [String? unit]) =>
      formatItemQty(v, null, unit: unit);
}

/// One category's worth of stock: the heading, and its items each still
/// carrying their own batches.
class _CategoryGroup {
  const _CategoryGroup(this.label, this.items, this.isPrimary);
  final String label;

  /// Items, each as its list of (warehouse, batch) rows. Biggest holding
  /// first within the group.
  final List<List<InvOnHandRow>> items;

  /// Filed under a category flagged as the shop floor's own — those groups
  /// sort to the top, since they are what the plant actually runs on.
  final bool isPrimary;
}

/// Rows collapsed into per-category groups, each holding per-item batch lists.
///
/// Headed by the parent category ("Milk & Dairy") rather than the leaf
/// ("Milk"): the parent is the shelf, and heading every leaf separately would
/// have split three milks across three one-item sections. Items with no
/// category fall into "Other", which always sorts last so an unfiled item is
/// visible without pushing the real shelves down.
List<_CategoryGroup> _groupByCategory(List<InvOnHandRow> rows) {
  final byCategory = <String, List<InvOnHandRow>>{};
  final primary = <String>{};
  for (final r in rows) {
    final label = r.categoryGroup ?? r.categoryName ?? 'Other';
    byCategory.putIfAbsent(label, () => []).add(r);
    if (r.categoryIsPrimaryInput) primary.add(label);
  }

  final groups = byCategory.entries.map((e) {
    final byItem = <String, List<InvOnHandRow>>{};
    for (final r in e.value) {
      byItem.putIfAbsent(r.itemId, () => []).add(r);
    }
    final items = byItem.values.toList()
      ..sort((x, y) => _totalQty(y).compareTo(_totalQty(x)));
    return _CategoryGroup(e.key, items, primary.contains(e.key));
  }).toList();

  groups.sort((a, b) {
    if (a.label == 'Other' || b.label == 'Other') {
      return a.label == 'Other' ? 1 : -1;
    }
    if (a.isPrimary != b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.label.toLowerCase().compareTo(b.label.toLowerCase());
  });
  return groups;
}

/// Everything on hand across one item's batches.
double _totalQty(List<InvOnHandRow> rs) => rs.fold<double>(0, (s, r) => s + r.qty);
