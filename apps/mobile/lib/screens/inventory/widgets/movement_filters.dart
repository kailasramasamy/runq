// Filter chrome + money header for the Stock Movement screen
// (inventory_activity_screen.dart). Kept out of the screen so the screen
// stays a list and a state machine, not a widget tree.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';
import 'warehouse_picker.dart';

// ── Vocabulary ────────────────────────────────────────────────────────────

/// Windows the feed offers. Mirrors `movementPeriodSchema` on the API.
const invMovementPeriods = <({String value, String label})>[
  (value: 'today', label: 'Today'),
  (value: '7d', label: '7 days'),
  (value: '30d', label: '30 days'),
  (value: 'month', label: 'This month'),
  (value: 'all', label: 'All time'),
];

/// Movement groups, in the order an owner cares about them. Mirrors
/// `movementGroupMembers` on the API — the ledger's 17 types collapse to 8.
const invMovementGroups = <({String value, String label, IconData icon})>[
  (value: 'receipt', label: 'Receipts', icon: Icons.inventory_2_outlined),
  (value: 'dispatch', label: 'Dispatch', icon: Icons.local_shipping_outlined),
  (value: 'production', label: 'Production', icon: Icons.precision_manufacturing_outlined),
  (value: 'transfer', label: 'Transfers', icon: Icons.alt_route_outlined),
  (value: 'adjustment', label: 'Adjustments', icon: Icons.tune_rounded),
  (value: 'stock_take', label: 'Stock take', icon: Icons.checklist_outlined),
  (value: 'return', label: 'Returns', icon: Icons.undo_rounded),
  (value: 'other', label: 'Opening / reversal', icon: Icons.more_horiz_rounded),
];

/// Row label for a raw ledger `movement_type`. The feed returns the concrete
/// enum value, not the group, because "Adjustment" and "Adjustment out" are
/// different facts on a row even though they filter together.
String invMovementLabel(String type) => switch (type) {
      'grn' => 'Receipt',
      'delivery' => 'Dispatch',
      'transfer_in' => 'Transfer in',
      'transfer_out' => 'Transfer out',
      'adjustment_in' => 'Adjustment in',
      'adjustment_out' => 'Adjustment out',
      'stock_take_in' => 'Stock take gain',
      'stock_take_out' => 'Stock take loss',
      'production_in' => 'Production output',
      'production_out' => 'Production consumed',
      'sales_return_in' => 'Sales return',
      'reclaim_in' => 'Reclaimed',
      'reclaim_out' => 'Reclaim teardown',
      'opening' => 'Opening balance',
      'reversal' => 'Reversal',
      _ => type,
    };

/// Icon bucket for a raw ledger type — `InvActivityIcon` only knows the five
/// buckets the Home card ever showed, so map the rest onto them here.
String invMovementIconKey(String type) {
  if (type.startsWith('transfer')) return 'transfer';
  if (type.startsWith('adjustment') || type == 'reversal') return 'adjustment';
  if (type.startsWith('stock_take')) return 'stock_take';
  if (type == 'delivery') return 'dn';
  if (type == 'grn') return 'grn';
  return type;
}

// ── Money header ──────────────────────────────────────────────────────────

/// In / Out / Net for the active filter.
///
/// The Home tiles this screen opens from are rupee figures, so the screen
/// has to answer in rupees too — landing on a bare list of quantities made
/// the tap feel like it went somewhere else. Doc counts sit under each
/// amount because zero-valued stock is real here: MP raw milk posts at ₹0
/// until cycle lock, so the count is what proves the stock moved.
class InvMovementMoneyHeader extends StatelessWidget {
  const InvMovementMoneyHeader({
    super.key,
    required this.summary,
    required this.periodLabel,
    required this.direction,
  });
  final InvMovementSummary? summary;
  final String periodLabel;
  final String? direction;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final s = summary;
    // Direction filters make one column meaningless — an "in only" view has
    // no outflow and its net is just the inflow restated.
    final showIn = direction != 'out';
    final showOut = direction != 'in';
    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            periodLabel.toUpperCase(),
            style: RunqText.micro.copyWith(
              color: t.muted2,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (showIn)
                  Expanded(
                    child: _Figure(
                      label: 'Stock in',
                      value: s?.inValue,
                      sub: s == null ? '' : _docs(s.inDocs),
                      color: InvColors.success,
                      icon: Icons.south_west_rounded,
                    ),
                  ),
                if (showIn && showOut) _divider(t),
                if (showOut)
                  Expanded(
                    child: _Figure(
                      label: 'Stock out',
                      value: s?.outValue,
                      sub: s == null ? '' : _docs(s.outDocs),
                      color: InvColors.amberDeep,
                      icon: Icons.north_east_rounded,
                    ),
                  ),
                if (showIn && showOut) ...[
                  _divider(t),
                  Expanded(
                    child: _Figure(
                      label: 'Net',
                      value: s?.netValue,
                      sub: s == null ? '' : _rows(s.totalRows),
                      color: s == null || s.netValue >= 0
                          ? InvColors.info
                          : InvColors.error,
                      icon: Icons.swap_vert_rounded,
                      signed: true,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _divider(RunqTokens t) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: VerticalDivider(width: 1, thickness: 0.5, color: t.hairlineSoft),
      );

  static String _docs(int n) => n == 1 ? '1 document' : '$n documents';
  static String _rows(int n) => n == 1 ? '1 entry' : '$n entries';
}

class _Figure extends StatelessWidget {
  const _Figure({
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
    required this.icon,
    this.signed = false,
  });
  final String label;
  final double? value;
  final String sub;
  final Color color;
  final IconData icon;
  final bool signed;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final v = value;
    final text = v == null
        ? '—'
        : signed && v > 0
            ? '+${compactINR(v)}'
            : compactINR(v);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                style: RunqText.caption.copyWith(color: t.muted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            text,
            style: RunqText.h3.copyWith(
              color: t.ink,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
        const SizedBox(height: 2),
        Text(sub, style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0)),
      ],
    );
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────

/// Direction segment + period chips + group chips + warehouse.
///
/// Direction is a three-way segment rather than another chip row because it
/// is the axis the user arrives on: Home's "Today in" and "Today out" both
/// land here, and they have to be able to see which one they are looking at
/// without reading a row of pills.
class InvMovementFilterBar extends StatelessWidget {
  const InvMovementFilterBar({
    super.key,
    required this.filter,
    required this.onChanged,
  });
  final InvMovementFilter filter;
  final ValueChanged<InvMovementFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _DirectionSegment(
          value: filter.direction,
          onChanged: (d) => onChanged(filter.copyWith(direction: () => d)),
        ),
        const SizedBox(height: 10),
        _chipRow([
          for (final p in invMovementPeriods)
            InvFilterPill(
              label: p.label,
              active: filter.period == p.value,
              onTap: () => onChanged(filter.copyWith(period: p.value)),
            ),
        ]),
        const SizedBox(height: 8),
        _chipRow([
          InvFilterPill(
            label: 'All types',
            active: filter.group == null,
            onTap: () => onChanged(filter.copyWith(group: () => null)),
          ),
          for (final g in invMovementGroups)
            InvFilterPill(
              label: g.label,
              icon: g.icon,
              active: filter.group == g.value,
              onTap: () => onChanged(filter.copyWith(
                group: () => filter.group == g.value ? null : g.value,
              )),
            ),
        ]),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: WarehousePicker(
            value: filter.warehouseId,
            dense: true,
            onChanged: (id) => onChanged(filter.copyWith(warehouseId: () => id)),
          ),
        ),
      ],
    );
  }

  /// Edge-to-edge scroller with the list's own 16pt gutter re-applied as
  /// padding, so the first chip lines up with the cards above it and the
  /// last one can still scroll clear of the screen edge.
  Widget _chipRow(List<Widget> chips) => SizedBox(
        height: 32,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: chips.length,
          separatorBuilder: (_, _) => const SizedBox(width: 6),
          itemBuilder: (_, i) => Center(child: chips[i]),
        ),
      );
}

class _DirectionSegment extends StatelessWidget {
  const _DirectionSegment({required this.value, required this.onChanged});
  final String? value;
  final ValueChanged<String?> onChanged;

  static const _options = <({String? value, String label, Color? color})>[
    (value: null, label: 'All', color: null),
    (value: 'in', label: 'In', color: InvColors.success),
    (value: 'out', label: 'Out', color: InvColors.amberDeep),
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: t.bgWarmer,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            for (final o in _options)
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(o.value),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 140),
                    padding: const EdgeInsets.symmetric(vertical: 7),
                    decoration: BoxDecoration(
                      color: value == o.value ? t.surface : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: value == o.value
                          ? Border.all(color: t.hairline, width: 0.5)
                          : null,
                    ),
                    child: Text(
                      o.label,
                      textAlign: TextAlign.center,
                      style: RunqText.caption.copyWith(
                        color: value == o.value ? (o.color ?? t.ink) : t.muted,
                        fontWeight: FontWeight.w700,
                      ),
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
