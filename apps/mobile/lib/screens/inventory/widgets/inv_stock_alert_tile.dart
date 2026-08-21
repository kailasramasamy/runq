// Stock alert tile + summary strip, shared by the Alerts screen.
//
// Split out of inventory_stock_alerts_screen.dart to keep both files
// inside the 500-line budget.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'reorder_level_sheet.dart';

String fmtQty(double q) =>
    q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);

/// Colour that carries an alert's severity across the whole tile.
Color alertColor(String urgency) => switch (urgency) {
      'out' => InvColors.error,
      'critical' => InvColors.error,
      _ => InvColors.orangeAlert,
    };

// ── Summary strip ────────────────────────────────────────────────────────

/// Out-of-stock and low counts, each tappable to filter the list below.
class InvAlertSummaryStrip extends StatelessWidget {
  const InvAlertSummaryStrip({
    super.key,
    required this.out,
    required this.low,
    required this.selected,
    required this.onSelect,
  });

  final int out;
  final int low;

  /// 'all' | 'out' | 'low'.
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      // IntrinsicHeight so both cards match the taller one; a sliver hands
      // down an unbounded height that stretch alone can't resolve.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _CountCard(
                label: 'Out of stock',
                value: out,
                color: InvColors.error,
                bg: InvColors.errorBg,
                active: selected == 'out',
                onTap: () => onSelect(selected == 'out' ? 'all' : 'out'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _CountCard(
                label: 'Running low',
                value: low,
                color: InvColors.orangeAlert,
                bg: InvColors.orangeAlertBg,
                active: selected == 'low',
                onTap: () => onSelect(selected == 'low' ? 'all' : 'low'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CountCard extends StatelessWidget {
  const _CountCard({
    required this.label,
    required this.value,
    required this.color,
    required this.bg,
    required this.active,
    required this.onTap,
  });

  final String label;
  final int value;
  final Color color;
  final Color bg;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(
            color: color.withValues(alpha: active ? 0.85 : 0.22),
            width: active ? 1.5 : 1,
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label.toUpperCase(), style: RunqText.label.copyWith(color: color)),
            const SizedBox(height: 4),
            Text('$value',
                style: RunqText.tabular(size: 20, w: FontWeight.w700, color: color)
                    .copyWith(height: 1.15)),
          ],
        ),
      ),
    );
  }
}

// ── Alert tile ───────────────────────────────────────────────────────────

/// One alert as a two-line row.
///
/// This used to be a small dashboard per item: name, SKU, warehouse, urgency
/// pill, a labelled bar with four surrounding labels, a divider, three
/// labelled stats and a supplier line — eight lines of text for one decision.
/// The decision is "how short am I, and do I order now", so that leads; the
/// rest (order qty, last movement, supplier) folds behind a chevron.
///
/// The urgency pill is gone: every row already sits under an "Out of stock"
/// or "Running low" header, so the pill restated the section it was in.
class InvStockAlertTile extends StatefulWidget {
  const InvStockAlertTile({super.key, required this.alert, this.onTap});

  final InvStockAlert alert;
  final VoidCallback? onTap;

  @override
  State<InvStockAlertTile> createState() => _InvStockAlertTileState();
}

class _InvStockAlertTileState extends State<InvStockAlertTile> {
  bool _open = false;

  InvStockAlert get alert => widget.alert;

  /// Set the threshold from here — this row is where the user actually
  /// notices it's missing, so making them hunt for the item master is how
  /// thresholds stay unset forever.
  Future<void> _setThreshold() => showReorderLevelSheet(
        context,
        itemId: alert.itemId,
        itemName: alert.itemName,
        unit: alert.itemUnit,
        currentLevel: alert.reorderLevel,
        currentQty: alert.onHand,
      );

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final color = alertColor(alert.urgency);
    final unit = alert.itemUnit ?? '';
    final hasLevel = alert.reorderLevel != null && alert.reorderLevel! > 0;

    return InkWell(
      onTap: widget.onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Severity as a colour rail rather than a pill — same signal,
            // no words.
            Container(
              width: 3,
              height: 34,
              margin: const EdgeInsets.only(right: 10, top: 2),
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(alert.itemName,
                      style: RunqText.tabular(
                          size: 14, w: FontWeight.w600, color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 3),
                  if (hasLevel)
                    Text(
                      '${fmtQty(alert.onHand)} $unit on hand · reorder at '
                      '${fmtQty(alert.reorderLevel!)}'
                          .trim(),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    )
                  else
                    Row(children: [
                      Flexible(
                        child: Text(
                          '${fmtQty(alert.onHand)} $unit on hand · no threshold'
                              .trim(),
                          style: RunqText.caption.copyWith(color: t.muted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      _SetLink(onTap: _setThreshold),
                    ]),
                  if (_open) _Details(alert: alert),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // The one number worth acting on.
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  hasLevel ? '−${fmtQty(alert.shortBy)}' : fmtQty(alert.onHand),
                  style: RunqText.tabular(
                          size: 16, w: FontWeight.w700, color: color)
                      .copyWith(height: 1.1),
                ),
                Text(hasLevel ? 'short $unit'.trim() : unit,
                    style: RunqText.micro.copyWith(color: t.muted2)),
              ],
            ),
            IconButton(
              onPressed: () => setState(() => _open = !_open),
              visualDensity: VisualDensity.compact,
              icon: Icon(
                _open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                size: 20,
                color: t.muted2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The facts that don't drive the decision but answer the follow-up: how much
/// to order, whether this item is even moving, and who supplies it.
class _Details extends StatelessWidget {
  const _Details({required this.alert});
  final InvStockAlert alert;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unit = alert.itemUnit ?? '';
    final days = alert.daysSinceLastMovement;
    final bits = <String>[
      if ((alert.itemSku ?? '').isNotEmpty) alert.itemSku!,
      alert.warehouseName,
      if (alert.reorderQty != null)
        'order ${fmtQty(alert.reorderQty!)} $unit'.trim(),
      if (days != null) days == 0 ? 'moved today' : 'moved ${days}d ago',
      if ((alert.supplierName ?? '').isNotEmpty) alert.supplierName!,
    ];
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(bits.join('  ·  '),
          style: RunqText.caption.copyWith(color: t.muted2)),
    );
  }
}

class _SetLink extends StatelessWidget {
  const _SetLink({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Text('Set',
            style: RunqText.caption.copyWith(
              color: InvColors.brand(context),
              fontWeight: FontWeight.w700,
            )),
      ),
    );
  }
}
