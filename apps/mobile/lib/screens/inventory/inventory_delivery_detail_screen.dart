// DN detail — header card with status / customer / warehouse / date / totals,
// then the line items list (item, batch, qty + unit cost, line total). Tap a
// line to drill into the item card. If the DN is still a draft, an Edit button
// appears in the app bar that pushes the edit screen.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/data_providers.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../api/sales_dispatch_models.dart';
import 'widgets/draft_substitute.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import '../../widgets/runq_snack.dart';

class InventoryDeliveryDetailScreen extends ConsumerStatefulWidget {
  const InventoryDeliveryDetailScreen({super.key, required this.dnId});
  final String dnId;
  @override
  ConsumerState<InventoryDeliveryDetailScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryDeliveryDetailScreen> {
  bool _busy = false;

  Future<void> _dispatch() async {
    final ok = await _confirm(
      title: 'Dispatch this delivery?',
      body: 'Stock will be removed from the warehouse and COGS booked. '
          'Reversible via cancel.',
      confirmLabel: 'Dispatch',
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await inventoryRepo.dispatchDn(widget.dnId);
      if (!mounted) return;
      ref.invalidate(invDnDetailProvider(widget.dnId));
      ref.invalidate(invDnListProvider(null));
      ref.invalidate(invKpisProvider);
      RunqSnack.success(context, 'Dispatched',
          description: 'Stock and COGS booked.');
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't dispatch this delivery",
          description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    final reason = await _askReason();
    if (reason == null || reason.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await inventoryRepo.cancelDn(widget.dnId, reason.trim());
      if (!mounted) return;
      ref.invalidate(invDnDetailProvider(widget.dnId));
      ref.invalidate(invDnListProvider(null));
      RunqSnack.success(context, 'Delivery cancelled');
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't cancel this delivery",
          description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirm({required String title, required String body, required String confirmLabel}) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            style: TextButton.styleFrom(foregroundColor: InvColors.brand(context)),
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Back'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: InvColors.brand(context)),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }

  Future<String?> _askReason() {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel delivery?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Dispatched deliveries are cancelled by writing reversal entries + a reversal JE.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Reason',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            style: TextButton.styleFrom(foregroundColor: InvColors.brand(context)),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Back'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            child: const Text('Confirm cancel'),
          ),
        ],
      ),
    );
  }

  /// A swap changes the draft, the invoice's owed qty and the shortage
  /// counts, so everything that reads them has to be dropped together —
  /// including the invoice itself, which relabelling rewrites. Leaving its
  /// cache in place shows the operator the item that was billed and makes a
  /// change that did happen look like one that didn't.
  Future<void> _reloadAfterSubstitute([String? invoiceId]) async {
    ref.invalidate(invDnDetailProvider(widget.dnId));
    ref.invalidate(invDraftSubstitutesProvider(widget.dnId));
    ref.invalidate(invPendingDispatchProvider);
    ref.invalidate(invShortageCountProvider);
    ref.invalidate(invShortagesProvider);
    if (invoiceId != null) ref.invalidate(invoiceDetailProvider(invoiceId));
    ref.invalidate(invoicesProvider);
    ref.invalidate(invoiceSummaryProvider);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(invDnDetailProvider(widget.dnId));
    // Options are only meaningful while the DN can still change what it sends.
    final subs = ref.watch(invDraftSubstitutesProvider(widget.dnId)).valueOrNull
        ?? const <String, List<InvSubstituteOption>>{};

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Dispatch details', style: RunqText.h3.copyWith(color: t.ink)),
        actions: [
          async.maybeWhen(
            data: (dn) => dn.status == 'draft'
                ? Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: TextButton.icon(
                      onPressed: () => context.push('/inventory/delivery/${widget.dnId}/edit'),
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text('Edit'),
                      style: TextButton.styleFrom(
                        foregroundColor: InvColors.brand(context),
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(invDnDetailProvider(widget.dnId));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 120),
            Center(child: Text('Failed to load: $e',
              style: RunqText.body.copyWith(color: t.muted))),
          ]),
          data: (dn) => ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _HeaderCard(dn: dn),
              const SizedBox(height: 12),
              _LinesCard(
                dnId: widget.dnId,
                lines: dn.lines,
                totalValue: dn.totalValue,
                isDraft: dn.status == 'draft' && dn.invoiceId != null,
                substitutes: subs,
                onChanged: () => _reloadAfterSubstitute(dn.invoiceId),
              ),
              if (dn.status == 'dispatched' && dn.invoiceId != null) ...[
                const SizedBox(height: 12),
                RelabelInvoiceCard(
                  invoiceId: dn.invoiceId!,
                  lines: dn.lines,
                  onChanged: () => _reloadAfterSubstitute(dn.invoiceId),
                ),
              ],
              if ((dn.notes ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _NotesCard(text: dn.notes!.trim()),
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: async.maybeWhen(
        data: (dn) => _ActionBar(
          status: dn.status,
          busy: _busy,
          onDispatch: _dispatch,
          onCancel: _cancel,
        ),
        orElse: () => const SizedBox.shrink(),
      ),
    );
  }
}

// ── Bottom action bar ─────────────────────────────────────────────────────

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.status, required this.busy,
    required this.onDispatch, required this.onCancel,
  });
  final String status;
  final bool busy;
  final VoidCallback onDispatch;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) {
    if (status == 'cancelled') return const SizedBox.shrink();
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : onCancel,
                  icon: const Icon(Icons.block, size: 16),
                  label: const Text('Cancel'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red.shade700,
                    side: BorderSide(color: Colors.red.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
              if (status == 'draft') ...[
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: InvPrimaryButton(
                    label: 'Dispatch + Post',
                    icon: Icons.send,
                    busy: busy,
                    onTap: busy ? null : onDispatch,
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

// ── Header card ───────────────────────────────────────────────────────────

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.dn});
  final InvDnDetail dn;
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
            Expanded(child: Text(dn.dnNo, style: RunqText.h3.copyWith(color: t.ink))),
            _StatusPill(status: dn.status),
          ]),
          const SizedBox(height: 6),
          Text('${dn.dispatchDate} · ${dn.warehouseName}',
              style: RunqText.caption.copyWith(color: t.muted)),
          if (dn.customerName != null) ...[
            const SizedBox(height: 2),
            Text(dn.customerName!, style: RunqText.body.copyWith(color: t.ink)),
          ],
          // The invoice this shipped against, tappable. A dispatch is only
          // ever half the story — what left, but not what was billed for it —
          // and reconciling the two meant leaving the screen to search for a
          // number the row already knew.
          if ((dn.invoiceNumber ?? '').isNotEmpty && dn.invoiceId != null) ...[
            const SizedBox(height: 8),
            InkWell(
              onTap: () => context.push('/invoices/${dn.invoiceId}'),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.receipt_long_outlined,
                        size: 15, color: InvColors.brand(context)),
                    const SizedBox(width: 6),
                    Text('Invoice ${dn.invoiceNumber}',
                        style: RunqText.body
                            .copyWith(color: InvColors.brand(context))),
                    const SizedBox(width: 2),
                    Icon(Icons.chevron_right,
                        size: 16, color: InvColors.brand(context)),
                  ],
                ),
              ),
            ),
          ],
          if ((dn.vehicleNo ?? '').isNotEmpty || (dn.eWayBillNo ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 6, children: [
              if ((dn.vehicleNo ?? '').isNotEmpty)
                _MetaChip(icon: Icons.local_shipping_outlined, label: dn.vehicleNo!),
              if ((dn.eWayBillNo ?? '').isNotEmpty)
                _MetaChip(icon: Icons.receipt_long_outlined, label: 'e-Way ${dn.eWayBillNo}'),
            ]),
          ],
          const SizedBox(height: 12),
          _SummaryRow(lines: dn.lines, totalValue: dn.totalValue),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.lines, required this.totalValue});
  final List<InvDnLine> lines;
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
          Expanded(child: _MiniStat(label: 'COGS', value: indianINR(totalValue))),
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
  const _LinesCard({
    required this.dnId,
    required this.lines,
    required this.totalValue,
    required this.isDraft,
    required this.substitutes,
    required this.onChanged,
  });
  final String dnId;
  final List<InvDnLine> lines;
  final double totalValue;
  final bool isDraft;
  final Map<String, List<InvSubstituteOption>> substitutes;
  final Future<void> Function() onChanged;
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
              child: Text('No lines on this dispatch.',
                  style: RunqText.caption.copyWith(color: t.muted)),
            )
          else
            ...lines.map((l) => Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: _LineRow(
                    line: l,
                    trailing: DraftSubstituteRow(
                      dnId: dnId,
                      line: l,
                      options: substitutes[l.id] ?? const [],
                      isDraft: isDraft,
                      onChanged: onChanged,
                    ),
                  ),
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
  const _LineRow({required this.line, this.trailing});
  final InvDnLine line;

  /// The substitute action or swap note, rendered inside the tile so it reads
  /// as part of the line rather than a detached control.
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: t.bgWarm,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        // Drill into the item card — handy for verifying SKU / current on-hand
        // while reviewing a dispatch.
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
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }

  String _metaLine(InvDnLine l) {
    final qtyStr =
        '${l.qty % 1 == 0 ? l.qty.toStringAsFixed(0) : l.qty.toStringAsFixed(2)}'
        '${(l.uom ?? '').isEmpty ? '' : ' ${l.uom}'} '
        '× ${indianINR(l.unitCost, decimals: 2)}';
    final parts = <String>[
      if ((l.itemSku ?? '').isNotEmpty) l.itemSku!,
      qtyStr,
      if ((l.batchNo ?? '').isNotEmpty) 'Batch ${l.batchNo}',
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
      'dispatched' => Colors.green.shade700,
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

