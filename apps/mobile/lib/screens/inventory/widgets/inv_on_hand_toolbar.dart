// Compact header for the Stock on Hand list.
//
// The screen used to stack a 3-card KPI strip, a search bar, a warehouse
// pill, a category/sub-category pair and a toggle row above the first tile —
// roughly three quarters of a phone screen before any stock was visible. The
// same controls live here in two bands: a search row with one Filters button,
// and a one-line summary. Everything that isn't reached on most visits
// (warehouse, category tree, low-only, hide-zero) is behind the button, which
// carries a count so a narrowed list never looks like the whole godown.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_category_filter.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';
import 'warehouse_picker.dart';

/// Everything the list narrows on apart from the search text and the class
/// pills — i.e. exactly what the Filters sheet owns.
class OnHandFilters {
  const OnHandFilters({
    this.warehouseId,
    this.category,
    this.subcategory,
    this.lowOnly = false,
    this.hideZero = false,
  });

  final String? warehouseId;
  final String? category;
  final String? subcategory;
  final bool lowOnly;
  final bool hideZero;

  /// How many of the five are narrowing the list. Drives the badge on the
  /// button and the reset affordance.
  int get activeCount =>
      (warehouseId != null ? 1 : 0) +
      (category != null ? 1 : 0) +
      (subcategory != null ? 1 : 0) +
      (lowOnly ? 1 : 0) +
      (hideZero ? 1 : 0);

  /// Flip low-only, keeping the rest. The summary chip and the sheet's pill
  /// are the same switch seen twice, so they share one transition.
  OnHandFilters toggleLowOnly() => OnHandFilters(
    warehouseId: warehouseId,
    category: category,
    subcategory: subcategory,
    lowOnly: !lowOnly,
    hideZero: hideZero,
  );
}

/// Category + sub-category options for one filter state. Recomputed by the
/// screen as the sheet changes so a branch emptied by the other filters is
/// never offered.
typedef OnHandFilterOptions = ({
  List<InvCatOption> cats,
  List<InvCatOption> subs,
});

// ── Search row ────────────────────────────────────────────────────────────

/// Search field plus the Filters button. One band, 16px gutters.
class InvOnHandToolbar extends StatelessWidget {
  const InvOnHandToolbar({
    super.key,
    required this.controller,
    required this.onSearch,
    required this.filters,
    required this.onFilters,
    required this.optionsFor,
  });

  final TextEditingController controller;
  final ValueChanged<String> onSearch;
  final OnHandFilters filters;

  /// Applied live as each control in the sheet is touched — the list behind
  /// the sheet is the preview, so there is nothing to confirm on the way out.
  final ValueChanged<OnHandFilters> onFilters;
  final OnHandFilterOptions Function(OnHandFilters) optionsFor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: InvSearchBar(
              controller: controller,
              onChanged: onSearch,
              hint: 'Item, SKU, warehouse, batch…',
            ),
          ),
          const SizedBox(width: 8),
          _FilterButton(
            count: filters.activeCount,
            onTap: () => showOnHandFilterSheet(
              context,
              value: filters,
              onChanged: onFilters,
              optionsFor: optionsFor,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final on = count > 0;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          height: 40,
          padding: EdgeInsets.symmetric(horizontal: on ? 10 : 12),
          decoration: BoxDecoration(
            color: on ? brand.withValues(alpha: 0.12) : t.surface,
            border: Border.all(
              color: on ? brand.withValues(alpha: 0.45) : t.hairline,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.tune_rounded,
                size: 18,
                color: on ? brand : t.muted,
              ),
              if (on) ...[
                const SizedBox(width: 6),
                Text(
                  '$count',
                  style: RunqText.caption.copyWith(
                    color: brand,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Summary line ──────────────────────────────────────────────────────────

/// The three KPI cards as one line of type: items · value · low. The figures
/// are context for the list, not the point of the screen, so they read as a
/// caption under the controls rather than as three cards above them.
class InvOnHandSummary extends StatelessWidget {
  const InvOnHandSummary({
    super.key,
    required this.items,
    required this.value,
    required this.low,
    required this.lowActive,
    required this.onTapLow,
  });

  final int items;
  final double value;
  final int low;

  /// Whether the low-only filter is on — the chip doubles as its toggle, so
  /// it has to show which way it is set.
  final bool lowActive;
  final VoidCallback onTapLow;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '$items item${items == 1 ? '' : 's'}'
              '  ·  ${compactINR(value)}',
              style: RunqText.caption.copyWith(color: t.muted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (low > 0 || lowActive) ...[
            const SizedBox(width: 8),
            InvFilterPill(
              label: '$low low',
              active: lowActive,
              onTap: onTapLow,
              activeColor: InvColors.orangeAlert,
              icon: Icons.warning_amber_rounded,
            ),
          ],
        ],
      ),
    );
  }
}

// ── Filter sheet ──────────────────────────────────────────────────────────

/// Warehouse, category tree and the two toggles, in one sheet. Changes apply
/// as they are made; closing is not a commit.
Future<void> showOnHandFilterSheet(
  BuildContext context, {
  required OnHandFilters value,
  required ValueChanged<OnHandFilters> onChanged,
  required OnHandFilterOptions Function(OnHandFilters) optionsFor,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FilterSheet(
      value: value,
      onChanged: onChanged,
      optionsFor: optionsFor,
    ),
  );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.value,
    required this.onChanged,
    required this.optionsFor,
  });
  final OnHandFilters value;
  final ValueChanged<OnHandFilters> onChanged;
  final OnHandFilterOptions Function(OnHandFilters) optionsFor;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late OnHandFilters _v = widget.value;

  void _set(OnHandFilters next) {
    setState(() => _v = next);
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final opts = widget.optionsFor(_v);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 8),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
              child: Row(
                children: [
                  Text('Filters', style: RunqText.h3.copyWith(color: t.ink)),
                  const Spacer(),
                  if (_v.activeCount > 0)
                    TextButton(
                      onPressed: () => _set(const OnHandFilters()),
                      style: TextButton.styleFrom(
                        foregroundColor: InvColors.brand(context),
                      ),
                      child: const Text('Clear all'),
                    ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: [
                  WarehousePicker(
                    value: _v.warehouseId,
                    onChanged: (w) => _set(
                      OnHandFilters(
                        warehouseId: w,
                        category: _v.category,
                        subcategory: _v.subcategory,
                        lowOnly: _v.lowOnly,
                        hideZero: _v.hideZero,
                      ),
                    ),
                    dense: true,
                  ),
                  const SizedBox(height: 10),
                  InvCategoryFilter(
                    categories: opts.cats,
                    subcategories: opts.subs,
                    category: _v.category,
                    subcategory: _v.subcategory,
                    // A new parent invalidates a leaf that lived under the
                    // old one, so the leaf resets with it.
                    onCategory: (c) => _set(
                      OnHandFilters(
                        warehouseId: _v.warehouseId,
                        category: c,
                        lowOnly: _v.lowOnly,
                        hideZero: _v.hideZero,
                      ),
                    ),
                    onSubcategory: (s) => _set(
                      OnHandFilters(
                        warehouseId: _v.warehouseId,
                        category: _v.category,
                        subcategory: s,
                        lowOnly: _v.lowOnly,
                        hideZero: _v.hideZero,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      InvFilterPill(
                        label: 'Low only',
                        active: _v.lowOnly,
                        activeColor: InvColors.orangeAlert,
                        icon: Icons.warning_amber_rounded,
                        onTap: () => _set(_v.toggleLowOnly()),
                      ),
                      const SizedBox(width: 8),
                      InvFilterPill(
                        label: 'Hide zero',
                        active: _v.hideZero,
                        onTap: () => _set(
                          OnHandFilters(
                            warehouseId: _v.warehouseId,
                            category: _v.category,
                            subcategory: _v.subcategory,
                            lowOnly: _v.lowOnly,
                            hideZero: !_v.hideZero,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
