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
import 'inv_primitives.dart';
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
                sub: 'Nothing on hand',
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
                sub: 'At or below reorder',
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
    required this.sub,
    required this.color,
    required this.bg,
    required this.active,
    required this.onTap,
  });

  final String label;
  final int value;
  final String sub;
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
            const SizedBox(height: 2),
            Text(sub,
                style: RunqText.caption
                    .copyWith(color: color.withValues(alpha: 0.8))),
          ],
        ),
      ),
    );
  }
}

// ── Alert tile ───────────────────────────────────────────────────────────

class InvStockAlertTile extends StatelessWidget {
  const InvStockAlertTile({super.key, required this.alert, this.onTap});

  final InvStockAlert alert;
  final VoidCallback? onTap;

  /// Set the threshold from here — this row is where the user actually
  /// notices it's missing, so making them hunt for the item master is how
  /// thresholds stay unset forever.
  Future<void> _setThreshold(BuildContext context) => showReorderLevelSheet(
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
    return InvCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(alert: alert),
              const SizedBox(height: 10),
              if (alert.reorderLevel != null && alert.reorderLevel! > 0)
                _LevelBar(alert: alert, color: color)
              else
                _NoLevelRow(
                  alert: alert,
                  color: color,
                  onSetThreshold: () => _setThreshold(context),
                ),
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Container(height: 1, color: t.hairlineSoft),
              ),
              const SizedBox(height: 10),
              _StatsRow(alert: alert, color: color),
              if ((alert.supplierName ?? '').isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('Supplier: ${alert.supplierName}',
                    style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.alert});
  final InvStockAlert alert;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(alert.itemName,
                  style: RunqText.tabular(size: 14, w: FontWeight.w600, color: t.ink),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text(
                [
                  if ((alert.itemSku ?? '').isNotEmpty) alert.itemSku!,
                  alert.warehouseName,
                ].join(' · '),
                style: RunqText.caption.copyWith(color: t.muted),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        InvUrgencyPill(urgency: alert.urgency),
      ],
    );
  }
}

/// On-hand vs reorder level, with the reorder line marked at 1/3 of the bar
/// (so a full bar reads as 3× cover).
class _LevelBar extends StatelessWidget {
  const _LevelBar({required this.alert, required this.color});
  final InvStockAlert alert;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final cap = alert.reorderLevel! * 3;
    final pct = cap > 0 ? (alert.onHand / cap).clamp(0.0, 1.0) : 0.0;
    final unit = alert.itemUnit ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('ON HAND',
                style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
            const Spacer(),
            Text('REORDER LEVEL',
                style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
          ],
        ),
        const SizedBox(height: 4),
        _MarkedStockBar(pct: pct.toDouble(), fillColor: color),
        const SizedBox(height: 4),
        Row(
          children: [
            Text('${fmtQty(alert.onHand)} $unit'.trim(),
                style: RunqText.caption
                    .copyWith(color: color, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text('${fmtQty(alert.reorderLevel!)} $unit'.trim(),
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
      ],
    );
  }
}

/// Shown when no reorder level is configured — there is no bar to draw, so
/// the row says so and nudges the user to set one.
class _NoLevelRow extends StatelessWidget {
  const _NoLevelRow({
    required this.alert,
    required this.color,
    required this.onSetThreshold,
  });
  final InvStockAlert alert;
  final Color color;
  final VoidCallback onSetThreshold;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Text('${fmtQty(alert.onHand)} ${alert.itemUnit ?? ''}'.trim(),
            style: RunqText.tabular(size: 18, w: FontWeight.w700, color: color)
                .copyWith(height: 1.15)),
        const SizedBox(width: 8),
        Expanded(
          child: Text('No low-stock threshold',
              style: RunqText.caption.copyWith(color: t.muted2),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        TextButton(
          onPressed: onSetThreshold,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            minimumSize: const Size(0, 30),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text('Set',
              style: RunqText.caption.copyWith(
                color: InvColors.brand(context),
                fontWeight: FontWeight.w700,
              )),
        ),
      ],
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.alert, required this.color});
  final InvStockAlert alert;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unit = alert.itemUnit ?? '';
    final days = alert.daysSinceLastMovement;
    return Row(
      children: [
        Expanded(
          child: _Stat(
            label: 'SHORT BY',
            value: alert.reorderLevel == null
                ? '—'
                : '${fmtQty(alert.shortBy)} $unit'.trim(),
            color: alert.reorderLevel == null ? t.muted2 : color,
          ),
        ),
        Expanded(
          child: _Stat(
            label: 'ORDER QTY',
            value: alert.reorderQty == null
                ? '—'
                : '${fmtQty(alert.reorderQty!)} $unit'.trim(),
            color: t.ink,
          ),
        ),
        Expanded(
          child: _Stat(
            label: 'LAST MOVED',
            value: days == null ? '—' : (days == 0 ? 'Today' : '${days}d ago'),
            color: t.ink,
          ),
        ),
      ],
    );
  }
}

class _MarkedStockBar extends StatelessWidget {
  const _MarkedStockBar({required this.pct, required this.fillColor});

  /// Fill ratio 0..1 against the 3× reorder scale the marker assumes.
  final double pct;
  final Color fillColor;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return LayoutBuilder(
      builder: (_, c) => SizedBox(
        height: 6,
        child: Stack(
          children: [
            Container(
              decoration: BoxDecoration(
                color: t.bgWarmer,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Positioned(
              left: c.maxWidth * (1 / 3),
              top: 0,
              bottom: 0,
              child: Container(width: 2, color: t.muted2.withValues(alpha: 0.45)),
            ),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  width: c.maxWidth * pct,
                  decoration: BoxDecoration(
                    color: fillColor,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label,
            style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
        const SizedBox(height: 2),
        Text(value,
            style: RunqText.caption
                .copyWith(color: color, fontWeight: FontWeight.w700)),
      ],
    );
  }
}
