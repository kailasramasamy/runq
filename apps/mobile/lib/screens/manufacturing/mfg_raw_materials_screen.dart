import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../inventory/widgets/inv_primitives.dart' show compactINR;
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Every input a work order can draw from, batch by batch — inside the
/// Manufacturing module rather than sending the planner over to Inventory and
/// losing their place mid-run.
///
/// Reads the `inputs` item-class group (raw_material + packaging), which is
/// exactly the set consumption pulls from, so nothing here is un-consumable.
class MfgRawMaterialsScreen extends ConsumerStatefulWidget {
  const MfgRawMaterialsScreen({super.key});

  @override
  ConsumerState<MfgRawMaterialsScreen> createState() => _MfgRawMaterialsScreenState();
}

class _MfgRawMaterialsScreenState extends ConsumerState<MfgRawMaterialsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';

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

  Widget _list(RunqTokens t, List<InvOnHandRow> all) {
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
    // Oldest batch first: a run should consume the milk that arrived earliest.
    final ordered = [...batches]..sort((a, b) => a.batchNo.compareTo(b.batchNo));

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(first.itemName,
                style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${_trimQty(qty)}$unit',
                style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
            // Uncosted stock is worth stating plainly — anything made from it
            // carries an understated cost until raw milk is valued.
            Text(value > 0 ? compactINR(value) : 'not costed',
                style: RunqText.micro.copyWith(color: t.muted)),
          ]),
        ]),
        Divider(color: t.hairline, height: 16),
        for (final b in ordered)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              Icon(Icons.label_outline_rounded, size: 14, color: t.muted2),
              const SizedBox(width: 6),
              Expanded(
                child: Text(b.batchNo.isEmpty ? 'No batch' : b.batchNo,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(color: t.ink2)),
              ),
              Text(b.warehouseName, style: RunqText.micro.copyWith(color: t.muted2)),
              const SizedBox(width: 8),
              Text('${_trimQty(b.qty)}$unit',
                  style: RunqText.caption.copyWith(color: t.ink)),
            ]),
          ),
      ]),
    );
  }

  static String _trimQty(double v) =>
      v == v.truncateToDouble() ? v.toInt().toString() : v.toStringAsFixed(3);
}
