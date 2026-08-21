// Inventory Item Detail — the mobile read-only mirror of the web item
// master (/inventory/items/:id/edit): identity, stock position, pricing,
// tracking behaviour, catalogue attributes, and the per-warehouse split.
// Reached by tapping a row on the Items or Stock screen, or by barcode
// deep-link from GRN/DN.
//
// Sections render only when the item carries the data, so a service SKU
// or a bare trading good doesn't scroll past a wall of empty rows.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'inventory_items_list_screen.dart' show classLabel;
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/item_detail_cards.dart';
import 'widgets/item_price_lists_card.dart';
import 'widgets/reorder_level_sheet.dart';

class InventoryItemDetailScreen extends ConsumerWidget {
  const InventoryItemDetailScreen({super.key, required this.itemId});
  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final itemAsync = ref.watch(invItemDetailProvider(itemId));
    final stockAsync = ref.watch(invItemStockProvider(itemId));
    final priceListsAsync = ref.watch(invItemPriceListsProvider(itemId));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Item Details',
        onBack: () => context.pop(),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invItemDetailProvider(itemId));
          ref.invalidate(invItemStockProvider(itemId));
          ref.invalidate(invItemPriceListsProvider(itemId));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: itemAsync.when(
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
          data: (item) => _Body(
            item: item,
            stockAsync: stockAsync,
            priceLines: priceListsAsync.valueOrNull ?? const [],
            onEditPricing: () async {
              await context.push('/inventory/items/$itemId/pricing');
              ref.invalidate(invItemDetailProvider(itemId));
            },
            onEditThreshold: () => showReorderLevelSheet(
              context,
              itemId: itemId,
              itemName: item.name,
              unit: item.unit,
              currentLevel: item.reorderLevel,
              currentQty: stockAsync.valueOrNull
                  ?.fold<double>(0, (a, r) => a + r.qty),
            ),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.item,
    required this.stockAsync,
    required this.priceLines,
    required this.onEditPricing,
    required this.onEditThreshold,
  });
  final InvItemDetail item;
  final AsyncValue<List<InvItemStockRow>> stockAsync;
  final List<InvItemPriceLine> priceLines;
  final VoidCallback onEditPricing;
  final VoidCallback onEditThreshold;

  @override
  Widget build(BuildContext context) {
    // Aggregate per-warehouse stock so the totals strip + stock-level bar
    // can reuse the numbers (and avoid a second round of math in each
    // card). When stock hasn't loaded yet we render the cards with
    // empty totals to keep the layout from jumping.
    final stock = stockAsync.valueOrNull ?? const <InvItemStockRow>[];
    final totalQty = stock.fold<double>(0, (a, r) => a + r.qty);
    final totalValue = stock.fold<double>(0, (a, r) => a + r.value);
    final avgCost = totalQty > 0 ? totalValue / totalQty : 0.0;
    // Bucket by warehouse — Item Stock view groups across batches but
    // the spec wants one row per warehouse with a horizontal share bar.
    final byWarehouse = <String, _WarehouseAlloc>{};
    for (final r in stock) {
      final cur = byWarehouse[r.warehouseId];
      if (cur == null) {
        byWarehouse[r.warehouseId] = _WarehouseAlloc(
          id: r.warehouseId,
          name: r.warehouseName,
          qty: r.qty,
          value: r.value,
        );
      } else {
        byWarehouse[r.warehouseId] = cur.add(r.qty, r.value);
      }
    }
    final allocations = byWarehouse.values.toList()
      ..sort((a, b) => b.qty.compareTo(a.qty));
    // Services and non-tracked SKUs have no stock position at all — skip
    // the whole inventory block rather than showing three zeroed KPIs.
    final showsStock = item.trackInventory && item.type != 'service';

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(top: 12, bottom: 120),
      children: [
        _Pad(child: ItemIdentityCard(
          item: item,
          classLabel: classLabel(item.itemClass, item.type),
        )),
        if (showsStock) ...[
          const InvSectionHeader(title: 'Stock Position'),
          _Pad(
            child: _TotalsStrip(
              qty: totalQty,
              value: totalValue,
              avgCost: avgCost,
              unit: item.unit,
            ),
          ),
          const SizedBox(height: 10),
          _Pad(
            child: ItemStockLevelCard(
              qty: totalQty,
              unit: item.unit,
              reorderLevel: item.reorderLevel,
              reorderQty: item.reorderQty,
              onEditThreshold: onEditThreshold,
            ),
          ),
          InvSectionHeader(title: 'By Warehouse (${allocations.length})'),
          if (allocations.isEmpty)
            _Pad(
              child: InvCard(
                child: Text(
                  'No stock recorded yet',
                  style: RunqText.caption.copyWith(color: RT(context).muted),
                ),
              ),
            )
          else
            _Pad(
              child: Column(
                children: [
                  for (final w in allocations) ...[
                    _WarehouseRow(alloc: w, totalQty: totalQty, unit: item.unit),
                    const SizedBox(height: 8),
                  ],
                ],
              ),
            ),
        ],
        InvSectionHeader(
          title: 'Pricing',
          action: 'Edit',
          onAction: onEditPricing,
        ),
        if (ItemPricingCard.hasData(item))
          _Pad(child: ItemPricingCard(item: item))
        else
          _Pad(
            child: InvCard(
              child: Text(
                'No pricing set — tap Edit to add cost and selling rates',
                style: RunqText.caption.copyWith(color: RT(context).muted),
              ),
            ),
          ),
        if (priceLines.isNotEmpty) ...[
          InvSectionHeader(title: 'Price Lists (${_listCount(priceLines)})'),
          _Pad(child: ItemPriceListsCard(lines: priceLines, unit: item.unit)),
        ],
        const InvSectionHeader(title: 'Tracking & Classification'),
        _Pad(child: ItemTrackingCard(item: item)),
        if (ItemAttributesCard.hasData(item.attributes)) ...[
          const InvSectionHeader(title: 'Attributes'),
          _Pad(child: ItemAttributesCard(attributes: item.attributes)),
        ],
        if ((item.description ?? '').trim().isNotEmpty) ...[
          const InvSectionHeader(title: 'Description'),
          _Pad(
            child: InvCard(
              child: Text(
                item.description!.trim(),
                style: RunqText.body.copyWith(color: RT(context).ink, fontSize: 14),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Distinct price lists, not tier rows — a 3-tier volume deal is one list.
int _listCount(List<InvItemPriceLine> lines) =>
    lines.map((l) => l.priceListId).toSet().length;

/// The page's single horizontal gutter — every card sits on it.
class _Pad extends StatelessWidget {
  const _Pad({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: child,
      );
}

class _WarehouseAlloc {
  final String id;
  final String name;
  final double qty;
  final double value;
  const _WarehouseAlloc({
    required this.id,
    required this.name,
    required this.qty,
    required this.value,
  });
  _WarehouseAlloc add(double q, double v) =>
      _WarehouseAlloc(id: id, name: name, qty: qty + q, value: value + v);
}

// ── Totals strip (On Hand / Value / Avg Cost) ────────────────────────────

class _TotalsStrip extends StatelessWidget {
  const _TotalsStrip({
    required this.qty,
    required this.value,
    required this.avgCost,
    required this.unit,
  });
  final double qty;
  final double value;
  final double avgCost;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    // IntrinsicHeight bounds the row — `stretch` inside an unbounded ListView
    // child would otherwise feed h=Infinity into each Expanded card.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: InvKpiCard(
              label: 'On Hand',
              value: fmtQty(qty),
              sub: unit ?? 'units',
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: InvKpiCard(
              label: 'Value',
              value: compactINR(value),
              sub: 'total',
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: InvKpiCard(
              label: 'Avg Cost',
              value: compactINR(avgCost),
              sub: unit == null ? 'per unit' : 'per ${unit!}',
            ),
          ),
        ],
      ),
    );
  }
}

// ── Per-warehouse allocation row ─────────────────────────────────────────

class _WarehouseRow extends StatelessWidget {
  const _WarehouseRow({
    required this.alloc,
    required this.totalQty,
    required this.unit,
  });
  final _WarehouseAlloc alloc;
  final double totalQty;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final pct = totalQty <= 0 ? 0.0 : (alloc.qty / totalQty).clamp(0.0, 1.0);
    return InvCard(
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: t.bgWarmer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.warehouse_outlined, size: 16, color: t.muted),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        alloc.name,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                      ),
                    ),
                    Text(
                      '${fmtQty(alloc.qty)} ${unit ?? ''}'.trim(),
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                LayoutBuilder(
                  builder: (_, c) => Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: t.hairlineSoft,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        width: c.maxWidth * pct,
                        color: InvColors.brand(context),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      '${(pct * 100).toStringAsFixed(0)}% of total',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                    const Spacer(),
                    Text(
                      compactINR(alloc.value),
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
