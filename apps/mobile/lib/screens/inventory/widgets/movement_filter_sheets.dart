// The sheets behind the Stock Movement filter row.
//
// The screen used to wear its filters: a direction segment, a period chip
// row, an eight-chip type row and a warehouse box, four bands of chrome
// before the first entry. Only the direction stays on the surface — the rest
// moved in here, one pill each, so the list starts near the top of the
// screen and the type filter has room to go a layer deeper than "Adjustments"
// into "Adjustment in" / "Adjustment out".

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'movement_filters.dart';

/// The concrete ledger types inside a group, in ledger order. Mirrors
/// `movementGroupMembers` on the API — the server resolves a group to exactly
/// this list, so the sheet's second layer and the query agree by construction.
const invMovementGroupTypes = <String, List<String>>{
  'receipt': ['grn'],
  'dispatch': ['delivery'],
  'production': ['production_in', 'production_out'],
  'transfer': ['transfer_in', 'transfer_out'],
  'adjustment': ['adjustment_in', 'adjustment_out'],
  'stock_take': ['stock_take_in', 'stock_take_out'],
  'return': ['sales_return_in', 'reclaim_in', 'reclaim_out'],
  'other': ['opening', 'reversal'],
};

/// What the type sheet hands back: a group, a type inside it, or neither.
class InvTypePick {
  const InvTypePick({this.group, this.type});
  final String? group;
  final String? type;
}

/// Layered type picker — groups on the first level, the ledger's own types on
/// the second. Tapping a group takes the whole group; expanding it and
/// tapping a row takes just that movement.
Future<InvTypePick?> showInvMovementTypeSheet(
  BuildContext context, {
  required String? group,
  required String? type,
}) {
  return showModalBottomSheet<InvTypePick>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _TypeSheet(group: group, type: type),
  );
}

/// Window picker — a flat list, since a period has no second layer.
Future<String?> showInvMovementPeriodSheet(
  BuildContext context, {
  required String period,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) => _SheetFrame(
      title: 'Period',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final p in invMovementPeriods)
            _SheetRow(
              label: p.label,
              selected: p.value == period,
              onTap: () => Navigator.of(context).pop(p.value),
            ),
        ],
      ),
    ),
  );
}

/// Windows the per-item audit trail offers. It filters by a `from` date
/// rather than the feed's named periods, so it carries its own vocabulary —
/// a day count, or null for all time.
const invItemWindows = <({int? days, String label})>[
  (days: 30, label: 'Last 30 days'),
  (days: 90, label: 'Last 90 days'),
  (days: 365, label: 'Last year'),
  (days: null, label: 'All time'),
];

String invItemWindowLabel(int? days) {
  for (final w in invItemWindows) {
    // Match on the bucket the day count falls in, not on equality: `days` is
    // derived from the stored `from` date, so it drifts by one as the clock
    // crosses midnight.
    if (w.days != null && days != null && days <= w.days! + 1) return w.label;
  }
  return 'All time';
}

/// Records can't be returned nullably-with-meaning through a sheet, so the
/// pick is wrapped: null future = dismissed, `days: null` = all time.
Future<({int? days})?> showInvItemWindowSheet(
  BuildContext context, {
  required int? days,
}) {
  return showModalBottomSheet<({int? days})>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) => _SheetFrame(
      title: 'Window',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final w in invItemWindows)
            _SheetRow(
              label: w.label,
              selected: invItemWindowLabel(days) == w.label,
              onTap: () => Navigator.of(context).pop((days: w.days)),
            ),
        ],
      ),
    ),
  );
}

class _TypeSheet extends StatefulWidget {
  const _TypeSheet({required this.group, required this.type});
  final String? group;
  final String? type;

  @override
  State<_TypeSheet> createState() => _TypeSheetState();
}

class _TypeSheetState extends State<_TypeSheet> {
  // Opens on the group already in play, so a filtered screen shows you where
  // you are instead of a collapsed list you have to re-find your place in.
  late String? _open = widget.group;

  @override
  Widget build(BuildContext context) {
    return _SheetFrame(
      title: 'Movement type',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetRow(
            label: 'All types',
            selected: widget.group == null && widget.type == null,
            onTap: () => Navigator.of(context).pop(const InvTypePick()),
          ),
          for (final g in invMovementGroups) ..._groupRows(g),
        ],
      ),
    );
  }

  List<Widget> _groupRows(({String value, String label, IconData icon}) g) {
    final types = invMovementGroupTypes[g.value] ?? const <String>[];
    // A one-member group has nothing to drill into — "Receipts" and "Receipt"
    // would be the same row twice.
    final layered = types.length > 1;
    final expanded = layered && _open == g.value;
    return [
      _SheetRow(
        label: g.label,
        icon: g.icon,
        selected: widget.group == g.value && widget.type == null,
        trailing: layered
            ? Icon(
                expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                size: 20,
                color: RT(context).muted2,
              )
            : null,
        onTrailingTap:
            layered ? () => setState(() => _open = expanded ? null : g.value) : null,
        onTap: () =>
            Navigator.of(context).pop(InvTypePick(group: g.value)),
      ),
      if (expanded)
        for (final ty in types)
          _SheetRow(
            label: invMovementLabel(ty),
            indented: true,
            selected: widget.type == ty,
            onTap: () => Navigator.of(context)
                .pop(InvTypePick(group: g.value, type: ty)),
          ),
    ];
  }
}

// ── Sheet chrome ──────────────────────────────────────────────────────────

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 8),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 8, 6),
              child: Row(
                children: [
                  Text(title, style: RunqText.h3.copyWith(color: t.ink)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 12),
                child: child,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
    this.trailing,
    this.onTrailingTap,
    this.indented = false,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final Widget? trailing;

  /// Lets the expander take the tap without selecting the group — the chevron
  /// opens the layer, the row body picks the whole group.
  final VoidCallback? onTrailingTap;
  final bool indented;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.fromLTRB(indented ? 46 : 20, 12, 12, 12),
        child: Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 17, color: selected ? brand : t.muted),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Text(
                label,
                style: (indented ? RunqText.body : RunqText.bodyStrong).copyWith(
                  color: selected ? brand : t.ink,
                ),
              ),
            ),
            if (selected)
              Icon(Icons.check_rounded, size: 18, color: brand),
            if (trailing != null)
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onTrailingTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: trailing,
                ),
              )
            else
              const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}
