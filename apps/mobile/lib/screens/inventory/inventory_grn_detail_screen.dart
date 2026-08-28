// GRN detail — header card with status/vendor/warehouse/date/totals, then
// the line items list (item, batch, qty + rate, line total).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_primitives.dart';
import '../../utils/format_qty.dart';

class InventoryGrnDetailScreen extends ConsumerWidget {
  const InventoryGrnDetailScreen({super.key, required this.grnId});
  final String grnId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(invGrnDetailProvider(grnId));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('GRN details', style: RunqText.h3.copyWith(color: t.ink))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(invGrnDetailProvider(grnId));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 120),
            Center(child: Text('Failed to load: $e',
              style: RunqText.body.copyWith(color: t.muted))),
          ]),
          data: (grn) => ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _HeaderCard(grn: grn),
              const SizedBox(height: 12),
              _LinesCard(lines: grn.lines, totalValue: grn.totalValue),
              if ((grn.notes ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _NotesCard(text: grn.notes!.trim()),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Header card ───────────────────────────────────────────────────────────

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.grn});
  final InvGrnDetail grn;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(grn.grnNo,
              style: RunqText.h3.copyWith(color: t.ink))),
            _StatusPill(status: grn.status),
          ]),
          const SizedBox(height: 6),
          Text('${grn.receivedDate} · ${grn.warehouseName}',
            style: RunqText.caption.copyWith(color: t.muted)),
          if (grn.vendorName != null) ...[
            const SizedBox(height: 2),
            Text(grn.vendorName!, style: RunqText.body.copyWith(color: t.ink)),
          ],
          if ((grn.vehicleNo ?? '').isNotEmpty || (grn.lrNo ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 6, children: [
              if ((grn.vehicleNo ?? '').isNotEmpty)
                _MetaChip(icon: Icons.local_shipping_outlined, label: grn.vehicleNo!),
              if ((grn.lrNo ?? '').isNotEmpty)
                _MetaChip(icon: Icons.receipt_long_outlined, label: 'LR ${grn.lrNo}'),
            ]),
          ],
          const SizedBox(height: 12),
          _SummaryRow(lines: grn.lines, totalValue: grn.totalValue),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.lines, required this.totalValue});
  final List<InvGrnLine> lines;
  final double totalValue;
  @override
  Widget build(BuildContext context) {
    final totalQty = lines.fold<double>(0, (a, l) => a + l.qty);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: _MiniStat(label: 'Items', value: lines.length.toString())),
          Expanded(child: _MiniStat(label: 'Total qty', value: totalQty.round().toString())),
          Expanded(child: _MiniStat(label: 'Value', value: indianINR(totalValue))),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});
  final String label, value;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: RunqText.label.copyWith(color: t.muted)),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, maxLines: 1,
            style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 16)),
        ),
      ],
    );
  }
}

// ── Lines card ────────────────────────────────────────────────────────────

class _LinesCard extends StatelessWidget {
  const _LinesCard({required this.lines, required this.totalValue});
  final List<InvGrnLine> lines;
  final double totalValue;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Line items', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 8),
          if (lines.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text('No lines on this GRN.',
                style: RunqText.caption.copyWith(color: t.muted)),
            )
          else
            ...lines.map((l) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _LineRow(line: l),
            )),
          const SizedBox(height: 10),
          Divider(height: 1, color: t.hairlineSoft),
          const SizedBox(height: 10),
          Row(children: [
            Text('Total', style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const Spacer(),
            Text(indianINR(totalValue, decimals: 2),
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          ]),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});
  final InvGrnLine line;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: t.bgWarm,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        // Drill into the item card from a GRN line — handy for cross-
        // checking SKU, MRP, and current on-hand without leaving the flow.
        onTap: () => context.push('/inventory/items/${line.itemId}'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(color: t.hairlineSoft),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(child: Text(line.itemName,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 2, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 8),
                Text(indianINR(line.lineTotal, decimals: 2),
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ]),
              const SizedBox(height: 2),
              Text(_metaLine(line),
                style: RunqText.caption.copyWith(color: t.muted)),
              if (line.serialNos.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text('${line.serialNos.length} serial${line.serialNos.length == 1 ? '' : 's'}',
                  style: RunqText.micro.copyWith(color: t.muted2)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _metaLine(InvGrnLine l) {
    final parts = <String>[
      if ((l.itemSku ?? '').isNotEmpty) l.itemSku!,
      '${formatItemQty(l.qty, null, unit: l.uom)}'
          '${(l.uom ?? '').isEmpty ? '' : ' ${l.uom}'} '
          '× ${indianINR(l.unitRate, decimals: 2)}',
      if ((l.batchNo ?? '').isNotEmpty) 'Batch ${l.batchNo}',
      if ((l.expiryDate ?? '').isNotEmpty) 'Exp ${l.expiryDate}',
    ];
    return parts.join(' · ').replaceAll('  ', ' ');
  }
}

// ── Misc ──────────────────────────────────────────────────────────────────

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final color = switch (status) {
      'posted' => Colors.green.shade700,
      'cancelled' => Colors.red.shade700,
      _ => t.muted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(status.toUpperCase(),
        style: RunqText.micro.copyWith(color: color, fontWeight: FontWeight.w700)),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: t.muted),
        const SizedBox(width: 4),
        Text(label, style: RunqText.micro.copyWith(color: t.ink)),
      ]),
    );
  }
}

class _NotesCard extends StatelessWidget {
  const _NotesCard({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Notes', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          Text(text, style: RunqText.body.copyWith(color: t.ink)),
        ],
      ),
    );
  }
}

