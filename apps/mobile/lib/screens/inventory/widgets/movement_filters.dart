// Filter chrome + money header for the Stock Movement screen
// (inventory_activity_screen.dart). Kept out of the screen so the screen
// stays a list and a state machine, not a widget tree.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/inventory_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';
import 'movement_filter_sheets.dart';
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

/// Label for a period value — the pill prints it, and so does the money
/// header above the list.
String invMovementPeriodLabel(String period) =>
    invMovementPeriods.firstWhere((p) => p.value == period).label;

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

/// Direction segment + one row of value-carrying pills.
///
/// Direction stays a three-way segment because it is the axis the user
/// arrives on: Home's "Today in" and "Today out" both land here, and they
/// have to see which one they are looking at without reading a row of pills.
/// Everything else collapsed into pills that state their own current value
/// and open a sheet — a period row plus an eight-chip type row cost three
/// bands of screen to say what "Today · Adjustment out" says in one.
class InvMovementFilterBar extends ConsumerWidget {
  const InvMovementFilterBar({
    super.key,
    required this.filter,
    required this.onChanged,
  });
  final InvMovementFilter filter;
  final ValueChanged<InvMovementFilter> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final warehouses = ref.watch(invWarehousesProvider).valueOrNull ?? const [];
    final wh = filter.warehouseId == null
        ? null
        : warehouses.where((w) => w.id == filter.warehouseId).firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InvDirectionSegment(
          value: filter.direction,
          onChanged: (d) => onChanged(filter.copyWith(direction: () => d)),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              InvDropPill(
                icon: Icons.event_rounded,
                label: invMovementPeriodLabel(filter.period),
                // Every window is a real answer, so only a non-default one
                // counts as narrowing — 'Today' lit up would mean nothing.
                active: filter.period != 'today',
                onTap: () async {
                  final p = await showInvMovementPeriodSheet(
                    context,
                    period: filter.period,
                  );
                  if (p != null) onChanged(filter.copyWith(period: p));
                },
              ),
              const SizedBox(width: 6),
              InvDropPill(
                icon: _typeIcon(filter),
                label: _typeLabel(filter),
                active: filter.group != null || filter.type != null,
                onTap: () async {
                  final pick = await showInvMovementTypeSheet(
                    context,
                    group: filter.group,
                    type: filter.type,
                  );
                  if (pick != null) {
                    onChanged(filter.copyWith(
                      group: () => pick.group,
                      type: () => pick.type,
                    ));
                  }
                },
              ),
              const SizedBox(width: 6),
              InvDropPill(
                icon: Icons.warehouse_outlined,
                label: wh?.name ?? 'All warehouses',
                active: filter.warehouseId != null,
                onTap: () async {
                  final picked = await showWarehousePicker(
                    context,
                    warehouses: warehouses,
                    value: filter.warehouseId,
                  );
                  if (picked != null) {
                    onChanged(filter.copyWith(warehouseId: () => picked.id));
                  }
                },
              ),
              if (filter.hasNarrowing) ...[
                const SizedBox(width: 6),
                InvDropPill(
                  icon: Icons.close_rounded,
                  label: 'Clear',
                  active: false,
                  showChevron: false,
                  // Period survives a clear: it is the window you are reading,
                  // not a narrowing, and dropping it back to today would hide
                  // rows the user never filtered out.
                  onTap: () => onChanged(InvMovementFilter(period: filter.period)),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  static String _typeLabel(InvMovementFilter f) {
    if (f.type != null) return invMovementLabel(f.type!);
    if (f.group != null) {
      return invMovementGroups.firstWhere((g) => g.value == f.group).label;
    }
    return 'All types';
  }

  static IconData _typeIcon(InvMovementFilter f) {
    final g = f.group;
    if (g == null) return Icons.category_outlined;
    return invMovementGroups.firstWhere((x) => x.value == g).icon;
  }
}

/// A pill that shows its own current value and opens a sheet. Distinct from
/// [InvFilterPill], which is a binary on/off chip — these always carry a
/// value, so a solid brand fill would leave the row permanently shouting.
///
/// Shared by both movement screens: the feed's filter row and the per-item
/// audit trail's.
class InvDropPill extends StatelessWidget {
  const InvDropPill({
    super.key,
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
    this.showChevron = true,
  });
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final fg = active ? brand : t.ink;
    return Center(
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 7, 8, 7),
            decoration: BoxDecoration(
              color: active ? brand.withValues(alpha: 0.10) : t.surface,
              border: Border.all(color: active ? brand : t.hairline),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 14, color: fg),
                const SizedBox(width: 5),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 150),
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(
                      color: fg,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (showChevron) ...[
                  const SizedBox(width: 2),
                  Icon(Icons.expand_more_rounded, size: 16, color: fg),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Three-way in/out segment. Public because both movement screens arrive on
/// this axis; the labels differ because the feed talks about the stock ("In" /
/// "Out") while the item trail talks about the item ("Added" / "Removed").
class InvDirectionSegment extends StatelessWidget {
  const InvDirectionSegment({
    super.key,
    required this.value,
    required this.onChanged,
    this.inLabel = 'In',
    this.outLabel = 'Out',
    this.outColor = InvColors.amberDeep,
  });
  final String? value;
  final ValueChanged<String?> onChanged;
  final String inLabel;
  final String outLabel;
  final Color outColor;

  List<({String? value, String label, Color? color})> get _options => [
        (value: null, label: 'All', color: null),
        (value: 'in', label: inLabel, color: InvColors.success),
        (value: 'out', label: outLabel, color: outColor),
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
