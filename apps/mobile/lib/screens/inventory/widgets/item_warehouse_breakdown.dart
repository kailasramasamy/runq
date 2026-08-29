// Where an item's stock sits, warehouse by warehouse.
//
// Split out of `inventory_item_detail_screen.dart` to keep that file inside
// the size budget. The screen owns the layout; this owns how one warehouse's
// share of the total reads.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_qty.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

class WarehouseAlloc {
  final String id;
  final String name;
  final double qty;
  final double value;
  const WarehouseAlloc({
    required this.id,
    required this.name,
    required this.qty,
    required this.value,
  });
  WarehouseAlloc add(double q, double v) =>
      WarehouseAlloc(id: id, name: name, qty: qty + q, value: value + v);
}

// ── Totals strip (On Hand / Value / Avg Cost) ────────────────────────────

class _WarehouseRow extends StatelessWidget {
  const _WarehouseRow({
    required this.alloc,
    required this.totalQty,
    this.unit,
  });
  final WarehouseAlloc alloc;
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
                      formatItemQty(alloc.qty, null, unit: unit),
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
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


/// Where the total sits, folded into one line.
///
/// This was a section of its own — a heading plus a share bar per warehouse —
/// which is a lot of screen for a fact most plants never need: they run one
/// warehouse, so the section said "100% of total" and nothing else. Now it
/// states the location on one line and keeps the split behind a tap, for the
/// tenants that do run several.
class ItemWarehouseBreakdown extends StatefulWidget {
  const ItemWarehouseBreakdown({
    required this.allocations,
    required this.totalQty,
    required this.unit,
  });

  final List<WarehouseAlloc> allocations;
  final double totalQty;
  final String? unit;

  @override
  State<ItemWarehouseBreakdown> createState() => _ItemWarehouseBreakdownState();
}

class _ItemWarehouseBreakdownState extends State<ItemWarehouseBreakdown> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final allocs = widget.allocations;
    if (allocs.isEmpty) {
      return InvCard(
        child: Text('No stock recorded yet',
            style: RunqText.caption.copyWith(color: t.muted)),
      );
    }

    // One warehouse is a statement, not a breakdown — naming it is the whole
    // answer, and there is nothing to expand into.
    final single = allocs.length == 1;
    final unit = widget.unit?.isNotEmpty == true ? ' ${widget.unit}' : '';

    return InvCard(
      onTap: single ? null : () => setState(() => _open = !_open),
      child: Column(children: [
        Row(children: [
          Icon(Icons.warehouse_outlined, size: 15, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              single ? allocs.first.name : 'Across ${allocs.length} warehouses',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            '${formatItemQty(widget.totalQty, null, unit: widget.unit)}$unit',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          if (!single) ...[
            const SizedBox(width: 4),
            Icon(_open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                size: 18, color: t.muted2),
          ],
        ]),
        if (_open && !single) ...[
          Divider(color: t.hairlineSoft, height: 18),
          for (final w in allocs) ...[
            _WarehouseRow(alloc: w, totalQty: widget.totalQty, unit: widget.unit),
            const SizedBox(height: 8),
          ],
        ],
      ]),
    );
  }
}
