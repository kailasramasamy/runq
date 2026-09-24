// Pieces of the "Adjust stock" sheet — the location dropdown and its picker,
// the add / remove / set-to mode toggle, and the reason chips. Split out of
// adjust_stock_sheet.dart so the sheet file stays the state machine and this
// one stays presentation.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../inventory_adjustment_common.dart';
import 'inv_primitives.dart';
import 'inv_colors.dart';

/// What the typed number means. Spelled out rather than inferred from the
/// sign of a delta: an operator typing "4" must know whether four units are
/// arriving, leaving, or are the whole shelf.
enum AdjustMode { add, remove, setTo }

extension AdjustModeLabels on AdjustMode {
  String get label => switch (this) {
    AdjustMode.add => 'Add',
    AdjustMode.remove => 'Remove',
    AdjustMode.setTo => 'Set to',
  };

  String get fieldLabel => switch (this) {
    AdjustMode.add => 'Quantity to add',
    AdjustMode.remove => 'Quantity to remove',
    AdjustMode.setTo => 'New quantity on hand',
  };
}

/// The lots behind a pooled warehouse figure, one line each.
///
/// Read-only on purpose. The adjustment posts against the warehouse total and
/// the server draws FEFO underneath, so this is not a lot picker — it is the
/// arithmetic, shown so a count of 354.43 can be checked against the four
/// lots it came from instead of taken on trust. Rows keep the order they
/// arrived in, which is the order a withdrawal will consume them.
///
/// Each line carries the collection date and shift behind the batch, because
/// a consignment code alone says nothing about which milk it is: CON/.../02433
/// and CON/.../02434 are the same centre on the same day, one AM and one PM.
class AdjustLotBreakdown extends StatelessWidget {
  const AdjustLotBreakdown({super.key, required this.holding, this.indent = 0});

  final AdjustHolding holding;

  /// Left inset, so the list can sit under a sheet row's title.
  final double indent;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (holding.batches.length < 2) return const SizedBox.shrink();

    return Padding(
      padding: EdgeInsets.fromLTRB(indent, 6, 0, 0),
      child: Column(
        children: [
          for (final b in holding.batches) _line(t, b),
        ],
      ),
    );
  }

  Widget _line(RunqTokens t, InvItemStockRow b) {
    final label = b.batchNo.isEmpty ? 'No batch number' : b.batchNo;
    final collected = _collectedAt(b);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              collected == null ? label : '$label · $collected',
              style: RunqText.caption.copyWith(color: t.muted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 10),
          Text(
            invFmtQty(b.qty),
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }

  /// "28 Aug PM" — the collection that filled this lot. Null for batches with
  /// no dated origin (a GRN, an adjustment), where there is nothing to add
  /// beyond the batch number itself.
  String? _collectedAt(InvItemStockRow b) {
    final date = b.origin?.date;
    if (date == null || date.isEmpty) return null;
    final shift = b.origin?.shift;
    final when = prettyShortDate(date);
    return shift == null || shift.isEmpty ? when : '$when ${shift.toUpperCase()}';
  }
}

// ── Location ─────────────────────────────────────────────────────────────

/// Everything an item holds in one warehouse: the pooled quantity, and the
/// lots it is spread across.
///
/// Stock is kept per (warehouse, batch), but nobody counting a shelf counts
/// per lot — they count what is there. So the adjust screen works at this
/// level: one number per location, whatever it is split into underneath.
/// `batches` keeps the order the server sent, which is FEFO (soonest expiry
/// first, undated last, oldest intake breaking the tie), so a withdrawal can
/// draw straight down the list.
class AdjustHolding {
  const AdjustHolding({
    required this.warehouseId,
    required this.warehouseName,
    required this.qty,
    required this.batches,
  });

  final String warehouseId;
  final String warehouseName;
  final double qty;
  final List<InvItemStockRow> batches;

  /// Lots carrying a batch number. A non-batch-tracked item holds one
  /// unnamed row, which is a holding of one pool rather than a lot list.
  int get lotCount => batches.where((b) => b.batchNo.isNotEmpty).length;

  String get displayName => warehouseName.isEmpty ? 'Warehouse' : warehouseName;
}

/// Groups stock rows into one entry per warehouse, biggest holding first.
///
/// Emptied lots are dropped: they are history, not somewhere anyone is
/// counting. Row order within a warehouse is left exactly as it arrived so
/// the FEFO draw order survives the grouping.
List<AdjustHolding> groupHoldings(List<InvItemStockRow> stock) {
  final live = stock.where((r) => r.qty > 0).toList();
  final rows = live.isEmpty ? [...stock] : live;
  final byWarehouse = <String, List<InvItemStockRow>>{};
  for (final r in rows) {
    byWarehouse.putIfAbsent(r.warehouseId, () => []).add(r);
  }
  final out = byWarehouse.entries.map((e) => AdjustHolding(
    warehouseId: e.key,
    warehouseName: e.value.first.warehouseName,
    qty: e.value.fold<double>(0, (sum, r) => sum + r.qty),
    batches: List.unmodifiable(e.value),
  )).toList();
  out.sort((a, b) => b.qty.compareTo(a.qty));
  return out;
}

/// Dropdown over the locations the item is held in, plus a trailing
/// "somewhere else" option. Null selection means that last option.
class AdjustLocationField extends StatelessWidget {
  const AdjustLocationField({
    super.key,
    required this.holdings,
    required this.selected,
    required this.newLocationLabel,
    required this.onChanged,
  });

  final List<AdjustHolding> holdings;
  final AdjustHolding? selected;
  final String newLocationLabel;
  final ValueChanged<AdjustHolding?> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final r = selected;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final picked = await _open(context);
          if (picked != null) onChanged(picked.holding);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: t.surface,
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.warehouse_outlined, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r == null ? newLocationLabel : r.displayName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    // Says where the pooled figure came from. Not a lot
                    // picker — the adjustment works on the total — just the
                    // reason the total is bigger than any one lot.
                    if (r != null && r.lotCount > 1)
                      Text(
                        '${r.lotCount} lots pooled',
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              Icon(Icons.expand_more_rounded, size: 20, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }

  Future<_LocationChoice?> _open(BuildContext context) {
    final t = RT(context);
    return showModalBottomSheet<_LocationChoice>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(0, 14, 0, 8),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Stock location',
                    style: RunqText.h4.copyWith(color: t.ink),
                  ),
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final h in holdings) ...[
                      _LocationRow(
                        title: h.displayName,
                        subtitle: h.lotCount > 1
                            ? '${h.lotCount} lots pooled'
                            : 'On hand here',
                        trailing: invFmtQty(h.qty),
                        selected: h.warehouseId == selected?.warehouseId,
                        onTap: () => Navigator.of(context).pop(_LocationChoice(h)),
                      ),
                      // Aligned to the ListTile's own 16pt inset so the lots
                      // read as a breakdown of the row above, not siblings
                      // of it.
                      if (h.batches.length > 1)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                          child: AdjustLotBreakdown(holding: h),
                        ),
                    ],
                    _LocationRow(
                      title: newLocationLabel,
                      subtitle: 'Nothing on hand there yet',
                      trailing: null,
                      selected: selected == null,
                      onTap: () => Navigator.of(context).pop(const _LocationChoice(null)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Wrapper so "picked the new-location option" (a real choice) is telling
/// apart from "dismissed the sheet" — both would otherwise arrive as null.
class _LocationChoice {
  const _LocationChoice(this.holding);
  final AdjustHolding? holding;
}

class _LocationRow extends StatelessWidget {
  const _LocationRow({
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.selected,
    required this.onTap,
  });
  final String title;
  final String subtitle;
  final String? trailing;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return ListTile(
      onTap: onTap,
      dense: true,
      title: Text(
        title,
        style: RunqText.bodyStrong.copyWith(color: t.ink),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        subtitle,
        style: RunqText.caption.copyWith(color: t.muted),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (trailing != null)
            Text(trailing!, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          if (selected) ...[
            const SizedBox(width: 8),
            Icon(Icons.check_rounded, size: 18, color: brand),
          ],
        ],
      ),
    );
  }
}

// ── Mode ─────────────────────────────────────────────────────────────────

class AdjustModeToggle extends StatelessWidget {
  const AdjustModeToggle({
    super.key,
    required this.mode,
    required this.onChanged,
    this.disabled = const {},
  });
  final AdjustMode mode;
  final ValueChanged<AdjustMode> onChanged;

  /// Modes that cannot be posted from the current selection — shown greyed
  /// rather than hidden, so the choice doesn't move around under the thumb.
  final Set<AdjustMode> disabled;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final m in AdjustMode.values)
            Expanded(child: _segment(context, m, t)),
        ],
      ),
    );
  }

  Widget _segment(BuildContext context, AdjustMode m, RunqTokens t) {
    final off = disabled.contains(m);
    final active = m == mode && !off;
    // Add and Remove carry the ledger's own colours so the choice is legible
    // before the preview line is read; Set-to is directionless until a number
    // exists, so it stays on the brand.
    final fill = switch (m) {
      AdjustMode.add => InvColors.success,
      AdjustMode.remove => InvColors.error,
      AdjustMode.setTo => InvColors.brand(context),
    };
    return Material(
      color: active ? fill : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: off ? null : () => onChanged(m),
        child: SizedBox(
          height: 36,
          child: Center(
            child: Text(
              m.label,
              style: RunqText.bodyStrong.copyWith(
                color: active
                    ? Colors.white
                    : (off ? t.muted2.withValues(alpha: 0.5) : t.muted),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Reason ───────────────────────────────────────────────────────────────

class AdjustReasonChips extends StatelessWidget {
  const AdjustReasonChips({
    super.key,
    required this.isOutbound,
    required this.value,
    required this.onChanged,
  });
  final bool isOutbound;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final reasons = isOutbound ? invOutboundReasonOrder : invInboundReasonOrder;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final r in reasons)
          GestureDetector(
            onTap: () => onChanged(r),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: r == value ? brand : t.surface,
                border: Border.all(color: r == value ? brand : t.hairline),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                invReasonLabels[r] ?? r,
                style: RunqText.caption.copyWith(
                  color: r == value ? Colors.white : t.ink,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
