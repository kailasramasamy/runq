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
import 'batch_detail_sheet.dart';
import 'inventory_adjust_stock_screen.dart';
import 'widgets/item_list_tiles.dart' show classLabel;
import '../../utils/format_qty.dart';
import 'widgets/batch_pool.dart';
import 'widgets/item_warehouse_breakdown.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/item_detail_cards.dart';
import 'widgets/item_movements_card.dart';
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
          // Family, so every filter/page instance behind the Recent
          // Movements card is dropped — a pull must refresh what is on
          // screen, not just what this handler happened to remember.
          ref.invalidate(invItemMovementsProvider);
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
            onViewMovements: () => context.push(
              Uri(
                path: '/inventory/items/$itemId/movements',
                queryParameters: {
                  'name': item.name,
                  if (item.unit != null) 'unit': item.unit!,
                },
              ).toString(),
            ),
            onEditPricing: () async {
              await context.push('/inventory/items/$itemId/pricing');
              ref.invalidate(invItemDetailProvider(itemId));
            },
            onAdjustStock: () => openAdjustStock(
              context,
              item: item,
              stock: stockAsync.valueOrNull ?? const [],
            ),
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
    required this.onAdjustStock,
    required this.onViewMovements,
  });
  final InvItemDetail item;
  final AsyncValue<List<InvItemStockRow>> stockAsync;
  final List<InvItemPriceLine> priceLines;
  final VoidCallback onEditPricing;
  final VoidCallback onEditThreshold;
  final VoidCallback onAdjustStock;
  final VoidCallback onViewMovements;

  @override
  Widget build(BuildContext context) {
    // Aggregate per-warehouse stock so the totals strip + stock-level bar
    // can reuse the numbers (and avoid a second round of math in each
    // card). When stock hasn't loaded yet we render the cards with
    // empty totals to keep the layout from jumping.
    final stock = stockAsync.valueOrNull ?? const <InvItemStockRow>[];
    final totalQty = stock.fold<double>(0, (a, r) => a + r.qty);
    final totalValue = stock.fold<double>(0, (a, r) => a + r.value);
    // Stock nobody has priced. Raw milk from a centre that records no pours
    // reaches the plant with no rate behind it, so it lands at zero — the
    // value tile then covers a fraction of the on-hand and reads as a
    // collapse in worth rather than a gap in costing.
    final uncostedQty =
        stock.where((r) => r.value == 0 && r.qty > 0).fold<double>(0, (a, r) => a + r.qty);
    final costedQty = totalQty - uncostedQty;
    // Averaged over what actually carries a cost. Dividing by the whole
    // on-hand blends in zeroes and prints a rate no batch was ever bought at.
    final avgCost = costedQty > 0 ? totalValue / costedQty : 0.0;
    // Bucket by warehouse — Item Stock view groups across batches but
    // the spec wants one row per warehouse with a horizontal share bar.
    final byWarehouse = <String, WarehouseAlloc>{};
    for (final r in stock) {
      final cur = byWarehouse[r.warehouseId];
      if (cur == null) {
        byWarehouse[r.warehouseId] = WarehouseAlloc(
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
          InvSectionHeader(
            title: 'Stock Position',
            action: 'Adjust',
            actionIcon: Icons.tune_rounded,
            onAction: onAdjustStock,
          ),
          _Pad(
            child: _TotalsStrip(
              qty: totalQty,
              value: totalValue,
              avgCost: avgCost,
              uncostedQty: uncostedQty,
              unit: item.unit,
            ),
          ),
          const SizedBox(height: 10),
          _Pad(
            child: ItemWarehouseBreakdown(
              allocations: allocations,
              totalQty: totalQty,
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
          if (stock.any((r) => r.batchNo.isNotEmpty)) ...[
            InvSectionHeader(
              title: 'Batches (${stock.where((r) => r.batchNo.isNotEmpty).length})',
            ),
            _Pad(child: _BatchPool(item: item, stock: stock)),
          ],
          InvSectionHeader(
            title: 'Recent Movements',
            action: 'View all',
            actionIcon: Icons.history_rounded,
            onAction: onViewMovements,
          ),
          _Pad(
            child: ItemMovementsCard(
              itemId: item.id,
              unit: item.unit,
              onViewAll: onViewMovements,
            ),
          ),
        ],
        InvSectionHeader(
          title: 'Pricing',
          action: 'Edit',
          actionIcon: Icons.edit_outlined,
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

class _TotalsStrip extends StatelessWidget {
  const _TotalsStrip({
    required this.qty,
    required this.value,
    required this.avgCost,
    required this.uncostedQty,
    required this.unit,
  });
  final double qty;
  final double value;
  final double avgCost;

  /// On-hand carrying no cost at all. Stated rather than blended away: the
  /// value tile only covers the rest, and the difference is a costing gap
  /// somebody has to close, not stock that is genuinely worthless.
  final double uncostedQty;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    // IntrinsicHeight bounds the row — `stretch` inside an unbounded ListView
    // child would otherwise feed h=Infinity into each Expanded card.
    final t = RT(context);
    final costed = qty - uncostedQty;
    final unitLabel = unit?.isNotEmpty == true ? ' ${unit!}' : '';
    return Column(children: [
      IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: InvKpiCard(
                label: 'On Hand',
                value: formatItemQty(qty, null, unit: unit),
                sub: unit ?? 'units',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: InvKpiCard(
                label: 'Value',
                value: compactINR(value),
                // Say what the figure covers. "Total" over stock that is only
                // part-priced is the claim that made this tile look broken.
                sub: uncostedQty > 0.0005
                    ? 'of ${formatItemQty(costed, null, unit: unit)}$unitLabel'
                    : 'total',
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
      ),
      if (uncostedQty > 0.0005) ...[
        const SizedBox(height: 6),
        Row(children: [
          Icon(Icons.info_outline_rounded, size: 13, color: InvColors.amberDeep),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              // Deliberately not milk-specific: any stock can reach the
              // ledger unpriced, and this screen serves every item class.
              '${formatItemQty(uncostedQty, null, unit: unit)}$unitLabel carries no '
              'purchase cost yet, so the value above covers the rest.',
              style: RunqText.micro.copyWith(color: t.muted),
            ),
          ),
        ]),
      ],
    ]);
  }
}

// ── Per-warehouse allocation row ─────────────────────────────────────────

/// What the item's total is actually made of. A raw-material number hides a
/// pool — yesterday's PM collection, this morning's intake, a part-used
/// balance, milk poured back out of packets — and a production run has to be
/// booked against the right one of those. Ordered the way a run should draw:
/// soonest expiry first (the API sorts it).
class _BatchPool extends StatelessWidget {
  const _BatchPool({required this.item, required this.stock});
  final InvItemDetail item;
  final List<InvItemStockRow> stock;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final batches = stock.where((r) => r.batchNo.isNotEmpty).toList();
    final warehouses = batches.map((r) => r.warehouseId).toSet();
    final qty = batches.fold<double>(0, (a, r) => a + r.qty);
    final value = batches.fold<double>(0, (a, r) => a + r.value);

    return InvCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        BatchPoolHeader(
          count: batches.length,
          qty: qty,
          unit: item.unit,
          value: value,
        ),
        Divider(color: t.hairlineSoft, height: 14),
        for (final b in batches)
          BatchPoolRow(
            batchNo: b.batchNo,
            qty: b.qty,
            unit: item.unit,
            origin: b.origin,
            expiryDate: b.expiryDate,
            value: b.value,
            partUsed: b.isPartUsed,
            onTap: () => showBatchDetailSheet(
              context,
              BatchDetailArgs(
                itemId: item.id,
                itemName: item.name,
                batchNo: b.batchNo,
                qty: b.qty,
                unit: item.unit,
                value: b.value,
                expiryDate: b.expiryDate,
                // One warehouse is the common case and naming it is noise;
                // two or more and the sheet has to say where the stock sits.
                warehouseName: warehouses.length > 1 ? b.warehouseName : null,
                origin: b.origin,
              ),
            ),
          ),
      ]),
    );
  }
}
