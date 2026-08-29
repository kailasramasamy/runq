import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../inventory/batch_detail_sheet.dart';
import '../inventory/widgets/batch_pool.dart';
import '../inventory/widgets/inv_primitives.dart' show compactINR;
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
            const MfgPlainAppBar(title: 'Raw materials'),
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

    final byItem = <String, List<InvOnHandRow>>{};
    for (final r in rows) {
      byItem.putIfAbsent(r.itemId, () => []).add(r);
    }
    final itemIds = byItem.keys.toList()
      ..sort((x, y) => _qtyOf(byItem[y]!).compareTo(_qtyOf(byItem[x]!)));

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        for (final id in itemIds) ...[
          _itemCard(t, byItem[id]!),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  static double _qtyOf(List<InvOnHandRow> rs) =>
      rs.fold<double>(0, (sum, r) => sum + r.qty);

  Widget _itemCard(RunqTokens t, List<InvOnHandRow> batches) {
    final first = batches.first;
    final qty = _qtyOf(batches);
    final value = batches.fold<double>(0, (sum, r) => sum + r.value);
    final unit =
        first.itemUnit != null && first.itemUnit!.isNotEmpty ? ' ${first.itemUnit}' : '';
    // FEFO, the order a run should draw in: soonest expiry first, undated
    // last, oldest intake breaking the tie. Sorting on the batch number
    // instead only worked while numbers happened to run in arrival order.
    final ordered = [...batches]..sort(_byUrgency);

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(first.itemName,
                style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${_trimQty(qty, first.itemUnit)}$unit',
                style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
            // Uncosted stock is worth stating plainly — anything made from it
            // carries an understated cost until raw milk is valued.
            Text(value > 0 ? compactINR(value) : 'not costed',
                style: RunqText.micro.copyWith(color: t.muted)),
          ]),
        ]),
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
                value: b.value,
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
