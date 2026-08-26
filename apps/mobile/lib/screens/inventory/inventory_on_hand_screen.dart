// Stock on Hand — live, filterable list of every (item, warehouse, batch)
// row. Tinted 3-col summary strip, search bar, searchable warehouse
// picker, low-only / hide-zero toggles, then a list of stock tiles
// (avatar + name + stock-bar + qty/value column).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_on_hand_sections.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';

class InventoryOnHandScreen extends ConsumerStatefulWidget {
  const InventoryOnHandScreen({super.key});
  @override
  ConsumerState<InventoryOnHandScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryOnHandScreen> {
  String? warehouseId; // null = All
  bool lowOnly = false;
  bool hideZero = false;
  String query = '';

  /// On-hand opens on "All" — this screen answers "what's in the godown",
  /// and hiding three quarters of it behind a pill made the total on the
  /// summary strip disagree with the list under it. Picking a pill still
  /// narrows to one bucket; until then the list is sectioned by group.
  String classGroup = classGroupAll;
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // Client-side filter on top of the server query. The server narrows by
  // warehouse + lowOnly; everything else stays local so the class-group
  // tabs can display per-bucket counts (only possible with the unfiltered
  // row set in memory) and search doesn't trigger a round-trip per keystroke.
  List<InvOnHandRow> _apply(List<InvOnHandRow> rows) {
    final q = query.trim().toLowerCase();
    final active = classGroup;
    return rows.where((r) {
      if (hideZero && r.qty <= 0) return false;
      if (active != classGroupAll &&
          classGroupForItemClass(r.itemClass) != active) {
        return false;
      }
      if (q.isEmpty) return true;
      return r.itemName.toLowerCase().contains(q) ||
          (r.itemSku ?? '').toLowerCase().contains(q) ||
          r.warehouseName.toLowerCase().contains(q) ||
          r.batchNo.toLowerCase().contains(q);
    }).toList();
  }

  /// Bucket the warehouse+lowOnly-filtered rows by class group so the tab
  /// strip can show per-bucket counts and hide empty buckets. Counted on the
  /// collapsed positions, so the pill agrees with the list under it.
  Map<String, int> _bucketCounts(List<InvOnHandRow> rows) {
    final counts = <String, int>{};
    for (final g in collapseOnHandRows(
      rows.where((r) => !hideZero || r.qty > 0).toList(),
    )) {
      final key = classGroupForItemClass(g.lead.itemClass);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Pull the unfiltered set so the tab strip sees every bucket's count.
    // The class-group filter is applied locally in _apply.
    final args = (
      warehouseId: warehouseId,
      lowOnly: lowOnly,
      itemClassGroup: null as String?,
    );
    final rowsAsync = ref.watch(invOnHandProvider(args));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: const InvPlainAppBar(title: 'Stock on Hand'),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invOnHandProvider(args));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rowsAsync.when(
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
          data: (rows) {
            final counts = _bucketCounts(rows);
            final filtered = collapseOnHandRows(_apply(rows));
            // Category → subcategory sections. A tenant that files nothing
            // gets one "Uncategorised" section, where the header says
            // nothing the list doesn't — drop it and render flat.
            var sections = groupOnHandRows(filtered);
            if (sections.length == 1 && sections.first.subs.length <= 1) {
              sections = const [];
            }
            return CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(child: _Summary(rows: filtered)),
                SliverToBoxAdapter(
                  child: _SearchRow(
                    controller: _searchCtrl,
                    onChanged: (v) => setState(() => query = v),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                    child: WarehousePicker(
                      value: warehouseId,
                      onChanged: (v) => setState(() => warehouseId = v),
                      dense: true,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: InvClassTabs(
                      selected: classGroup,
                      counts: counts,
                      onChanged: (g) => setState(() => classGroup = g),
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _Toggles(
                    lowOnly: lowOnly,
                    hideZero: hideZero,
                    onLow: () => setState(() => lowOnly = !lowOnly),
                    onZero: () => setState(() => hideZero = !hideZero),
                  ),
                ),
                if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: InvEmptyState(
                      icon: Icons.inventory_2_outlined,
                      title: 'No items match',
                      subtitle: query.isNotEmpty
                          ? 'Try a different search or warehouse'
                          : 'Adjust filters above',
                    ),
                  )
                else if (sections.isEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                    sliver: SliverList.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _StockTile(row: filtered[i]),
                    ),
                  )
                else
                  for (var si = 0; si < sections.length; si++)
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(
                        16,
                        0,
                        16,
                        si == sections.length - 1 ? 120 : 0,
                      ),
                      // Flattened to one list per section so the header, the
                      // leaf headings and the tiles share one separator
                      // rhythm — built once, not per itemBuilder call.
                      sliver: _SectionSliver(section: sections[si]),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ── Section list ──────────────────────────────────────────────────────────

/// One category section: its header, then each leaf band's heading and rows,
/// flattened into a single list so every gap in the section is the same.
class _SectionSliver extends StatelessWidget {
  const _SectionSliver({required this.section});
  final OnHandSection section;

  @override
  Widget build(BuildContext context) {
    final entries = <Widget>[
      InvGroupHeader(label: section.label, rows: section.rows),
      for (final sub in section.subs) ...[
        if (sub.label != null)
          InvSubGroupHeader(label: sub.label!, rows: sub.rows),
        for (final row in sub.rows) _StockTile(row: row),
      ],
    ];
    return SliverList.separated(
      itemCount: entries.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => entries[i],
    );
  }
}

// ── Summary strip ─────────────────────────────────────────────────────────

class _Summary extends StatelessWidget {
  const _Summary({required this.rows});
  final List<OnHandGroup> rows;

  @override
  Widget build(BuildContext context) {
    final totalValue = rows.fold<double>(0, (a, r) => a + r.value);
    final lowCount = rows.where((r) => r.isLow).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      // IntrinsicHeight — slivers pass infinite height, `stretch` propagates it.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: InvKpiCard(
                label: 'Items',
                value: rows.length.toString(),
                sub: 'in stock',
                tint: InvColors.amberTint,
                borderTint: InvColors.amberHairline,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: InvKpiCard(
                label: 'Value',
                value: compactINR(totalValue),
                sub: 'total',
                tint: InvColors.amberTint,
                borderTint: InvColors.amberHairline,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: InvKpiCard(
                label: 'Low Stock',
                value: lowCount.toString(),
                sub: 'items',
                accent: lowCount > 0,
                tint: InvColors.amberTint,
                borderTint: InvColors.amberHairline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchRow extends StatelessWidget {
  const _SearchRow({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: InvSearchBar(
        controller: controller,
        onChanged: onChanged,
        hint: 'Item, SKU, warehouse, batch…',
      ),
    );
  }
}

class _Toggles extends StatelessWidget {
  const _Toggles({
    required this.lowOnly,
    required this.hideZero,
    required this.onLow,
    required this.onZero,
  });
  final bool lowOnly;
  final bool hideZero;
  final VoidCallback onLow;
  final VoidCallback onZero;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Row(
        children: [
          InvFilterPill(
            label: 'Low only',
            active: lowOnly,
            onTap: onLow,
            activeColor: InvColors.orangeAlert,
            icon: Icons.warning_amber_rounded,
          ),
          const SizedBox(width: 6),
          InvFilterPill(label: 'Hide zero', active: hideZero, onTap: onZero),
        ],
      ),
    );
  }
}

// ── Stock tile ────────────────────────────────────────────────────────────

class _StockTile extends StatelessWidget {
  const _StockTile({required this.row});
  final OnHandGroup row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final batches = row.batches.length;
    final metaBits = [
      if (row.itemSku?.isNotEmpty == true) row.itemSku!,
      row.warehouseName,
      // A single batch is worth naming; a hundred milk consignments are not,
      // so past one the tile states the count and defers to the item screen.
      if (batches == 1 && row.lead.batchNo.isNotEmpty)
        'Batch ${row.lead.batchNo}'
      else if (batches > 1)
        '$batches batches',
    ];
    final meta = metaBits.join(' · ');
    return InvCard(
      onTap: () => context.push('/inventory/items/${row.itemId}'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Item avatar — bg-warmer square with neutral box icon.
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: t.bgWarmer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.inventory_2_outlined, size: 17, color: t.muted),
          ),
          const SizedBox(width: 10),
          // Middle column — name + Low badge + meta + bar.
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // UOM trails the name — it qualifies the product, and
                    // under the bold quantity it read as a second number.
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          text: row.itemName,
                          style: RunqText.bodyStrong.copyWith(
                            color: t.ink,
                            fontSize: 14,
                          ),
                          children: [
                            if (row.itemUnit?.isNotEmpty == true)
                              TextSpan(
                                text: '  ${row.itemUnit}',
                                style: RunqText.caption.copyWith(
                                  color: t.muted2,
                                ),
                              ),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (row.isLow)
                      Container(
                        margin: const EdgeInsets.only(left: 6, top: 1),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: InvColors.orangeAlertBg,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'Low',
                          style: RunqText.micro.copyWith(
                            color: InvColors.orangeAlert,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ),
                    if (row.earliestExpiry != null)
                      _ExpiryPill(date: row.earliestExpiry!),
                  ],
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 6),
                InvStockBar(
                  qty: row.qty,
                  reorderLevel: row.reorderLevel,
                  isLow: row.isLow,
                  // The threshold rides the bar as a badge — the row no longer
                  // needs a legend to say what the mark stands for.
                  markerLabel: row.reorderLevel == null
                      ? null
                      : _fmtQty(row.reorderLevel!),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Right column — qty, value.
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _fmtQty(row.qty),
                style: RunqText.h4.copyWith(
                  color: row.isLow ? InvColors.orangeAlert : t.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                compactINR(row.value),
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _fmtQty(double q) {
    if (q == q.roundToDouble()) return q.toStringAsFixed(0);
    return q.toStringAsFixed(2);
  }
}

/// Per-row expiry pill. Sits beside the Low badge in the stock tile header.
/// Suppressed for batches outside the 7-day urgency window so the list
/// stays calm on non-perishable stock.
class _ExpiryPill extends StatelessWidget {
  const _ExpiryPill({required this.date});
  final String date;

  @override
  Widget build(BuildContext context) {
    final days = _daysFromToday(date);
    if (days == null || days > 7) return const SizedBox.shrink();
    final urgent = days <= 1;
    final bg = urgent ? InvColors.errorBg : InvColors.orangeAlertBg;
    final fg = urgent ? InvColors.error : InvColors.orangeAlert;
    final label = days < 0
        ? 'Expired'
        : days == 0
        ? 'Today'
        : days == 1
        ? 'Tomorrow'
        : '${days}d';
    return Container(
      margin: const EdgeInsets.only(left: 6, top: 1),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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

  static int? _daysFromToday(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return null;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return d.difference(today).inDays;
  }
}
