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

// ── Location ─────────────────────────────────────────────────────────────

/// Dropdown over the (warehouse, batch) rows the item is held in, plus a
/// trailing "somewhere else" option. Null selection means that last option.
class AdjustLocationField extends StatelessWidget {
  const AdjustLocationField({
    super.key,
    required this.rows,
    required this.selected,
    required this.unit,
    required this.newLocationLabel,
    required this.onChanged,
  });

  final List<InvItemStockRow> rows;
  final InvItemStockRow? selected;
  final String? unit;
  final String newLocationLabel;
  final ValueChanged<InvItemStockRow?> onChanged;

  String _qty(InvItemStockRow r) => '${invFmtQty(r.qty)} ${unit ?? ''}'.trim();

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
          if (picked != null) onChanged(picked.row);
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
                      r == null
                          ? newLocationLabel
                          : (r.warehouseName.isEmpty ? 'Warehouse' : r.warehouseName),
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (r != null && r.batchNo.isNotEmpty)
                      Text(
                        'Batch ${r.batchNo}',
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              if (r != null) ...[
                const SizedBox(width: 8),
                Text(_qty(r), style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ],
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
                    for (final r in rows)
                      _LocationRow(
                        title: r.warehouseName.isEmpty ? 'Warehouse' : r.warehouseName,
                        subtitle: r.batchNo.isEmpty ? 'No batch' : 'Batch ${r.batchNo}',
                        trailing: _qty(r),
                        selected: identical(r, selected),
                        onTap: () => Navigator.of(context).pop(_LocationChoice(r)),
                      ),
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
  const _LocationChoice(this.row);
  final InvItemStockRow? row;
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
  const AdjustModeToggle({super.key, required this.mode, required this.onChanged});
  final AdjustMode mode;
  final ValueChanged<AdjustMode> onChanged;

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
    final active = m == mode;
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
        onTap: () => onChanged(m),
        child: SizedBox(
          height: 36,
          child: Center(
            child: Text(
              m.label,
              style: RunqText.bodyStrong.copyWith(
                color: active ? Colors.white : t.muted,
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
