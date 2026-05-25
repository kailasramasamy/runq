// Inventory Item Detail — per-item view: identity card, totals strip,
// reorder bar, and a per-warehouse stock allocation list. Reached by
// tapping a row on the Stock screen or by barcode deep-link from GRN/DN.
//
// The handoff also calls for a "Recent Movements" card; that's deferred
// to batch 2 because it needs a per-item ledger provider wired through —
// the rest of the redesign stands on its own without it.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class InventoryItemDetailScreen extends ConsumerWidget {
  const InventoryItemDetailScreen({super.key, required this.itemId});
  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final itemAsync = ref.watch(invItemDetailProvider(itemId));
    final stockAsync = ref.watch(invItemStockProvider(itemId));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Item Stock',
        onBack: () => context.pop(),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invItemDetailProvider(itemId));
          ref.invalidate(invItemStockProvider(itemId));
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
          data: (item) => _Body(item: item, stockAsync: stockAsync),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.item, required this.stockAsync});
  final InvItemDetail item;
  final AsyncValue<List<InvItemStockRow>> stockAsync;

  @override
  Widget build(BuildContext context) {
    // Aggregate per-warehouse stock so the totals strip + reorder bar
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

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(top: 12, bottom: 120),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _IdentityCard(item: item, totalQty: totalQty),
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _TotalsStrip(
            qty: totalQty,
            value: totalValue,
            avgCost: avgCost,
            unit: item.unit,
          ),
        ),
        if (totalQty > 0) ...[
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _ReorderCard(qty: totalQty, unit: item.unit),
          ),
        ],
        InvSectionHeader(title: 'By Warehouse (${allocations.length})'),
        if (allocations.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: InvCard(
              child: Text(
                'No stock recorded yet',
                style: RunqText.caption.copyWith(color: RT(context).muted),
              ),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                for (final w in allocations) ...[
                  _WarehouseRow(
                    alloc: w,
                    totalQty: totalQty,
                    unit: item.unit,
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        if ((item.description ?? '').trim().isNotEmpty) ...[
          const InvSectionHeader(title: 'Description'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
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

// ── Identity card (amber avatar + name + badges) ─────────────────────────

class _IdentityCard extends StatelessWidget {
  const _IdentityCard({required this.item, required this.totalQty});
  final InvItemDetail item;
  final double totalQty;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: InvColors.amberSubtle,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.inventory_2_outlined,
              size: 22,
              color: InvColors.brand(context),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: RunqText.h3.copyWith(color: t.ink)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if ((item.sku ?? '').isNotEmpty)
                      _Badge(
                        label: item.sku!,
                        bg: t.bgWarmer,
                        fg: t.muted,
                      ),
                    if ((item.hsnSacCode ?? '').isNotEmpty)
                      _Badge(
                        label: 'HSN ${item.hsnSacCode}',
                        bg: InvColors.amberSubtle,
                        fg: InvColors.amberDeep,
                      ),
                    if ((item.unit ?? '').isNotEmpty)
                      _Badge(
                        label: item.unit!,
                        bg: t.bgWarmer,
                        fg: t.muted,
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

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.bg, required this.fg});
  final String label;
  final Color bg;
  final Color fg;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: RunqText.micro.copyWith(color: fg, letterSpacing: 0.2),
      ),
    );
  }
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
              value: _fmtQty(qty),
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

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);
}

// ── Reorder card ─────────────────────────────────────────────────────────

class _ReorderCard extends StatelessWidget {
  const _ReorderCard({required this.qty, required this.unit});
  final double qty;
  final String? unit;
  // The masters/items record drives reorder_level, but the mobile
  // InvItemDetail doesn't expose it yet — kept as 0 here so the bar
  // renders a neutral "above reorder" state. Once the masters response
  // includes reorderLevel this becomes a real comparison.
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Stock Level',
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                ),
              ),
              Text(
                '${_fmtQty(qty)} ${unit ?? ''}'.trim(),
                style: RunqText.h4.copyWith(color: InvColors.success),
              ),
            ],
          ),
          const SizedBox(height: 8),
          InvStockBar(qty: qty, reorderLevel: null, isLow: false, height: 6),
          const SizedBox(height: 6),
          Text(
            'Reorder threshold not configured for this item',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ],
      ),
    );
  }

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);
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
                      '${_fmtQty(alloc.qty)} ${unit ?? ''}'.trim(),
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

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);
}
