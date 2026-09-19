import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../inventory/batch_detail_sheet.dart';
import '../inventory/widgets/batch_pool.dart';
import 'mfg_material_sheet.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';
import '../../utils/format_qty.dart';

/// What the plant has, on both sides of a run: the materials it can draw and
/// the goods it has made.
///
/// The floor is granted `manufacturing` and nothing else, so this is the only
/// stock view they can reach — hence both shelves live here rather than one
/// here and one in Inventory. `inputs` is raw_material + packaging, exactly
/// what consumption pulls from; `finished` is finished_good + semi_finished,
/// which is what a run puts back, unpacked paneer included.
class MfgRawMaterialsScreen extends ConsumerStatefulWidget {
  const MfgRawMaterialsScreen({super.key});

  @override
  ConsumerState<MfgRawMaterialsScreen> createState() => _MfgRawMaterialsScreenState();
}

/// The two shelves, and the class chips that subdivide each. Made goods split
/// into packed and unpacked because those are different questions: one is what
/// can ship, the other is what still has to be packed.
///
/// Made leads, and so opens by default: the floor comes to this screen to see
/// what the shift has put out. What went in is the follow-up question — and
/// the one the Raw materials card on the home screen already answers.
const _shelves = <({String group, String label, List<({String? cls, String label})> chips})>[
  (
    group: 'finished',
    label: 'Made',
    chips: [
      (cls: null, label: 'All'),
      (cls: 'finished_good', label: 'Packed'),
      (cls: 'semi_finished', label: 'Unpacked'),
    ],
  ),
  (
    group: 'inputs',
    label: 'Raw materials',
    chips: [
      (cls: null, label: 'All'),
      (cls: 'raw_material', label: 'Raw material'),
      (cls: 'packaging', label: 'Packaging'),
    ],
  ),
];

class _MfgRawMaterialsScreenState extends ConsumerState<MfgRawMaterialsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';

  /// Which shelf is showing — an index into [_shelves].
  int _shelf = 0;

  /// null = the whole group. Filtered client-side: the group is already
  /// fetched whole, so a class chip costs no extra round trip.
  String? _itemClass;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final shelf = _shelves[_shelf];
    final args = (warehouseId: null, itemClassGroup: shelf.group);
    final async = ref.watch(mfgStockProvider(args));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: MfgColors.brand(context),
          onRefresh: () async {
            ref.invalidate(mfgStockProvider(args));
            await Future<void>.delayed(const Duration(milliseconds: 200));
          },
          child: Column(children: [
            // A bottom-nav tab, so no back arrow — there is nothing behind it.
            const MfgPlainAppBar(title: 'Stock', showBack: false),
            _shelfSwitcher(t),
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
                  for (final c in shelf.chips)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: MfgFilterChip(
                        label: c.label,
                        selected: _itemClass == c.cls,
                        onTap: () => setState(() => _itemClass = c.cls),
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

  /// Made | Raw materials. A segmented control rather than chips, because the
  /// two are different questions rather than filters on one list — and the
  /// class chips below are already chips.
  ///
  /// Drawn as a track with a single raised thumb that slides between the
  /// segments. The old version outlined the whole control *and* the selected
  /// half, which put three borders inside 40 points and read as two buttons
  /// rather than one control with a position.
  Widget _shelfSwitcher(RunqTokens t) {
    final brand = MfgColors.brand(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Container(
        height: 44,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: t.bgWarmer,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Stack(children: [
          AnimatedAlign(
            alignment: _thumbAlignment,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            child: FractionallySizedBox(
              widthFactor: 1 / _shelves.length,
              heightFactor: 1,
              child: Container(
                decoration: BoxDecoration(
                  color: t.surface,
                  // Fully round, track and thumb alike: a pill inside a pill
                  // keeps one curve on the control instead of two that nearly
                  // agree. The class chips below are pills too, so the whole
                  // header now shares a shape.
                  borderRadius: BorderRadius.circular(999),
                  // A shadow rather than an outline: the thumb has to read as
                  // lifted off the track, and a border on top of the track's
                  // own fill only draws a second edge.
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 6,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Row(children: [
            for (var i = 0; i < _shelves.length; i++)
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() {
                    _shelf = i;
                    // The class chips belong to the shelf, so a stale one
                    // would filter the new list to nothing.
                    _itemClass = null;
                  }),
                  child: Center(
                    // Animated with the thumb, so the label colour arrives
                    // when the thumb does rather than a frame ahead of it.
                    child: AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 200),
                      curve: Curves.easeOutCubic,
                      style: RunqText.body.copyWith(
                        color: _shelf == i ? brand : t.muted,
                        fontWeight: _shelf == i ? FontWeight.w700 : FontWeight.w500,
                      ),
                      child: Text(_shelves[i].label),
                    ),
                  ),
                ),
              ),
          ]),
        ]),
      ),
    );
  }

  /// Where the thumb sits: the left edge for the first segment, the right for
  /// the last, spread evenly in between.
  Alignment get _thumbAlignment => _shelves.length < 2
      ? Alignment.center
      : Alignment(-1 + 2 * _shelf / (_shelves.length - 1), 0);

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
      final madeShelf = _shelves[_shelf].group == 'finished';
      return MfgEmptyState(
        icon: Icons.inventory_2_outlined,
        title: all.isEmpty
            ? (madeShelf ? 'Nothing made yet' : 'No raw materials in stock')
            : 'No match',
        description: all.isEmpty
            ? (madeShelf
                ? 'Close a draw or record a run, and what it made shows up here.'
                : 'A work order will have nothing to consume until stock arrives.')
            : 'Nothing matches "$_search".',
      );
    }

    // Grouped under the category they are filed against, because that is how
    // the floor thinks about them: milk is one shelf, oils another, packaging
    // a third. A flat list ordered by quantity put jaggery between two milks
    // for no reason a reader could see.
    final groups = _groupByCategory(rows);
    final madeShelf = _shelves[_shelf].group == 'finished';

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
          // Made goods are a list, not a stack of cards: a finished SKU is a
          // name and a number, and the lots behind it are a question you ask
          // by tapping. Raw materials keep their per-item card, where the
          // batch pool is the point — that is what a run draws from.
          if (madeShelf)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: MfgCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                child: Column(children: [
                  for (var i = 0; i < g.items.length; i++) ...[
                    if (i > 0) Divider(color: t.hairline, height: 1),
                    _madeRow(t, g.items[i]),
                  ],
                ]),
              ),
            )
          else
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

  /// One made item. The unit belongs to the name — "A2 Desi Cow Curd 400g" is
  /// the SKU as the floor says it, and 25 is how many of it there are.
  Widget _madeRow(RunqTokens t, List<InvOnHandRow> batches) {
    final first = batches.first;
    final qty = _totalQty(batches);
    final unit = first.itemUnit ?? '';
    return InkWell(
      onTap: () => showMfgMaterialSheet(context, rows: batches),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(children: [
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(
                  text: first.itemName,
                  style: RunqText.body.copyWith(color: t.ink),
                ),
                if (unit.isNotEmpty)
                  TextSpan(
                    text: '  $unit',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
              ]),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _trimQty(qty, first.itemUnit),
            style: RunqText.bodyStrong.copyWith(color: t.ink),
          ),
          Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
        ]),
      ),
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
                viaManufacturing: true,
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
