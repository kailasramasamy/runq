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

  void _setDirection(String? d) =>
      setState(() => _q = _q.copyWith(direction: d, page: 1));

  void _setWindow(int? days) => setState(
        () => _q = _q.copyWith(from: days == null ? null : _isoDaysAgo(days), page: 1),
      );

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
          _Filters(
            direction: _q.direction,
            from: _q.from,
            onDirection: _setDirection,
            onWindow: _setWindow,
          ),
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

class _Filters extends StatelessWidget {
  const _Filters({
    required this.direction,
    required this.from,
    required this.onDirection,
    required this.onWindow,
  });
  final String? direction;
  final String? from;
  final ValueChanged<String?> onDirection;
  final ValueChanged<int?> onWindow;

  @override
  Widget build(BuildContext context) {
    // The window pills compare against `from` rather than tracking their own
    // selection, so a rebuild can never drift from the query actually in use.
    final days = from == null
        ? null
        : DateTime.now()
            .difference(DateTime.parse(from!))
            .inDays;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          InvFilterPill(
            label: 'All',
            active: direction == null,
            onTap: () => onDirection(null),
          ),
          const SizedBox(width: 8),
          InvFilterPill(
            label: 'Added',
            active: direction == 'in',
            activeColor: InvColors.success,
            onTap: () => onDirection('in'),
          ),
          const SizedBox(width: 8),
          InvFilterPill(
            label: 'Removed',
            active: direction == 'out',
            activeColor: InvColors.error,
            onTap: () => onDirection('out'),
          ),
          const SizedBox(width: 16),
          InvFilterPill(
            label: '30d',
            active: days != null && days <= 31,
            onTap: () => onWindow(30),
          ),
          const SizedBox(width: 8),
          InvFilterPill(
            label: '90d',
            active: days != null && days > 31 && days <= 91,
            onTap: () => onWindow(90),
          ),
          const SizedBox(width: 8),
          InvFilterPill(
            label: 'All time',
            active: days == null,
            onTap: () => onWindow(null),
          ),
        ],
      ),
    );
  }
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
