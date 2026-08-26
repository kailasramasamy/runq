// Item stock audit trail — every quantity change for one item, grouped by
// day, with the document that caused it. Finished goods leave on a delivery
// note (tap through to the DN, and its sales invoice is named on the row);
// raw materials leave on a work order with the BOM that consumed them.
//
// Defaults to the last 90 days. High-turnover SKUs post thousands of rows a
// month, so the window is a deliberate floor rather than a lazy default.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_movement_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/movement_filter_sheets.dart';
import 'widgets/movement_filters.dart';
import 'widgets/warehouse_picker.dart';

class InventoryItemMovementsScreen extends ConsumerStatefulWidget {
  const InventoryItemMovementsScreen({
    super.key,
    required this.itemId,
    this.itemName,
    this.unit,
  });
  final String itemId;
  final String? itemName;
  final String? unit;

  @override
  ConsumerState<InventoryItemMovementsScreen> createState() =>
      _ItemMovementsState();
}

class _ItemMovementsState extends ConsumerState<InventoryItemMovementsScreen> {
  late InvMovementQuery _q = InvMovementQuery(
    itemId: widget.itemId,
    from: _isoDaysAgo(90),
  );

  static String _isoDaysAgo(int days) => DateTime.now()
      .subtract(Duration(days: days))
      .toIso8601String()
      .substring(0, 10);

  /// Every filter change resets to page 1 — staying on page 4 of a trail you
  /// just narrowed lands the user on an empty screen that reads as "no data".
  void _apply(InvMovementQuery q) => setState(() => _q = q);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(invItemMovementsProvider(_q));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: widget.itemName == null ? 'Stock Movements' : 'Movements',
        onBack: () => context.pop(),
      ),
      body: Column(
        children: [
          _Filters(q: _q, onChanged: _apply, isoDaysAgo: _isoDaysAgo),
          Expanded(
            child: RefreshIndicator(
              color: InvColors.brand(context),
              onRefresh: () async {
                ref.invalidate(invItemMovementsProvider(_q));
                await Future<void>.delayed(const Duration(milliseconds: 200));
              },
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _Message(text: 'Failed to load: $e'),
                data: (page) => page.rows.isEmpty
                    ? const _Message(
                        text: 'No movements in this window.\nTry "All time".')
                    : _MovementList(
                        page: page,
                        unit: widget.unit,
                        pageNo: _q.page,
                        onPage: (p) => setState(() => _q = _q.copyWith(page: p)),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ),
      ],
    );
  }
}

/// Direction on the surface, everything else one layer down.
///
/// The row used to be six chips of two different kinds — three directions and
/// three windows — scrolling off the right edge with two of them lit at once,
/// which read as one broken multi-select. Direction is now a segment (it is
/// the axis, and it is always set), and window / type / warehouse are pills
/// that state their own value and open a sheet.
class _Filters extends ConsumerWidget {
  const _Filters({
    required this.q,
    required this.onChanged,
    required this.isoDaysAgo,
  });
  final InvMovementQuery q;
  final ValueChanged<InvMovementQuery> onChanged;
  final String Function(int days) isoDaysAgo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The window pill reads back off `from` rather than tracking its own
    // selection, so a rebuild can never drift from the query actually in use.
    final days = q.from == null
        ? null
        : DateTime.now().difference(DateTime.parse(q.from!)).inDays;
    final warehouses = ref.watch(invWarehousesProvider).valueOrNull ?? const [];
    final wh = q.warehouseId == null
        ? null
        : warehouses.where((w) => w.id == q.warehouseId).firstOrNull;

    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InvDirectionSegment(
            value: q.direction,
            inLabel: 'Added',
            outLabel: 'Removed',
            outColor: InvColors.error,
            onChanged: (d) =>
                onChanged(q.copyWith(direction: d, page: 1)),
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
                  label: invItemWindowLabel(days),
                  // 90 days is the screen's own default, not a narrowing.
                  active: invItemWindowLabel(days) != 'Last 90 days',
                  onTap: () async {
                    final pick = await showInvItemWindowSheet(context, days: days);
                    if (pick != null) {
                      onChanged(q.copyWith(
                        from: pick.days == null ? null : isoDaysAgo(pick.days!),
                        page: 1,
                      ));
                    }
                  },
                ),
                const SizedBox(width: 6),
                InvDropPill(
                  icon: _typeIcon(q.group),
                  label: _typeLabel(q),
                  active: q.group != null || q.type != null,
                  onTap: () async {
                    final pick = await showInvMovementTypeSheet(
                      context,
                      group: q.group,
                      type: q.type,
                    );
                    if (pick != null) {
                      onChanged(q.copyWith(
                        group: pick.group,
                        type: pick.type,
                        page: 1,
                      ));
                    }
                  },
                ),
                const SizedBox(width: 6),
                InvDropPill(
                  icon: Icons.warehouse_outlined,
                  label: wh?.name ?? 'All warehouses',
                  active: q.warehouseId != null,
                  onTap: () async {
                    final picked = await showWarehousePicker(
                      context,
                      warehouses: warehouses,
                      value: q.warehouseId,
                    );
                    if (picked != null) {
                      onChanged(q.copyWith(warehouseId: picked.id, page: 1));
                    }
                  },
                ),
                if (q.hasNarrowing) ...[
                  const SizedBox(width: 6),
                  InvDropPill(
                    icon: Icons.close_rounded,
                    label: 'Clear',
                    active: false,
                    showChevron: false,
                    // The window survives a clear: it is how far back you are
                    // reading, not a narrowing of what you are reading.
                    onTap: () => onChanged(InvMovementQuery(
                      itemId: q.itemId,
                      from: q.from,
                    )),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _typeLabel(InvMovementQuery q) {
    if (q.type != null) return invMovementLabel(q.type!);
    if (q.group != null) {
      return invMovementGroups.firstWhere((g) => g.value == q.group).label;
    }
    return 'All types';
  }

  static IconData _typeIcon(String? group) => group == null
      ? Icons.category_outlined
      : invMovementGroups.firstWhere((g) => g.value == group).icon;
}

class _MovementList extends StatelessWidget {
  const _MovementList({
    required this.page,
    required this.unit,
    required this.pageNo,
    required this.onPage,
  });
  final InvMovementPage page;
  final String? unit;
  final int pageNo;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    // Group by calendar day so a busy production day reads as one block
    // instead of twenty identical timestamps.
    final groups = <String, List<InvMovementRow>>{};
    for (final r in page.rows) {
      final key = r.movedAt.toIso8601String().substring(0, 10);
      groups.putIfAbsent(key, () => []).add(r);
    }

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        for (final entry in groups.entries) ...[
          InvSectionHeader(title: prettyShortDate(entry.key), topPad: 8),
          for (final r in entry.value)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _MovementCard(row: r, unit: unit),
            ),
        ],
        if (pageNo > 1 || page.hasMore)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(
                  onPressed: pageNo > 1 ? () => onPage(pageNo - 1) : null,
                  child: const Text('Newer'),
                ),
                const SizedBox(width: 16),
                TextButton(
                  onPressed: page.hasMore ? () => onPage(pageNo + 1) : null,
                  child: const Text('Older'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _MovementCard extends StatelessWidget {
  const _MovementCard({required this.row, required this.unit});
  final InvMovementRow row;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final doc = row.doc;
    final route = doc?.route;
    final tone = row.isIn ? InvColors.success : InvColors.error;
    final label = invMovementLabels[row.movementType] ?? row.movementType;

    return InvCard(
      onTap: route == null ? null : () => context.push(route),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: row.isIn ? InvColors.successBg : InvColors.errorBg,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  label,
                  style: RunqText.caption.copyWith(
                    color: tone,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Spacer(),
              InvQtyText(
                qty: '${row.isIn ? '+' : '−'}${_qty(row.qty)}',
                unit: unit,
                style: RunqText.body.copyWith(
                  color: tone,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doc == null ? 'Adjustment' : doc.no,
                      style: RunqText.body.copyWith(fontWeight: FontWeight.w600),
                    ),
                    if (doc?.party != null)
                      Text(doc!.party!, style: RunqText.caption.copyWith(color: t.ink)),
                    if (doc?.note != null)
                      Text(
                        doc!.note!,
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                    if (doc?.ref != null)
                      Text(
                        '${doc!.ref!.label ?? 'Ref'}: ${doc.ref!.no}',
                        style: RunqText.caption.copyWith(
                          color: InvColors.brand(context),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
              if (route != null)
                Icon(Icons.chevron_right, size: 18, color: t.muted),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              InvMetaChip(icon: Icons.warehouse_outlined, label: row.warehouseName),
              if (row.batchNo != null && row.batchNo!.isNotEmpty)
                InvMetaChip(icon: Icons.qr_code_2, label: row.batchNo!),
              if (row.unitCost > 0)
                InvMetaChip(
                  icon: Icons.currency_rupee,
                  label: indianINR(row.unitCost, decimals: 2),
                ),
              InvMetaChip(
                icon: Icons.inventory_2_outlined,
                label: 'Bal ${_qty(row.runningQty)}',
              ),
              if (row.postedByName != null)
                InvMetaChip(icon: Icons.person_outline, label: row.postedByName!),
            ],
          ),
        ],
      ),
    );
  }

  static String _qty(double v) {
    final s = v.toStringAsFixed(3);
    return s.contains('.')
        ? s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '')
        : s;
  }
}
