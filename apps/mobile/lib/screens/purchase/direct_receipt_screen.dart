import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/runq_snack.dart';
import 'direct_receipt_create_screen.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// PP Phase 4 — Mobile Direct Receipt.
/// Single screen: today's receipts at top + FAB → bottom-sheet entry form.
/// No JE; memo qty entry only. Designed for daily ops (milk arrival).
class DirectReceiptScreen extends ConsumerStatefulWidget {
  const DirectReceiptScreen({super.key});

  @override
  ConsumerState<DirectReceiptScreen> createState() => _DirectReceiptScreenState();
}

class _DirectReceiptScreenState extends ConsumerState<DirectReceiptScreen> {
  late Future<List<DirectReceiptRow>> _future;
  String _filterDate = DateTime.now().toIso8601String().substring(0, 10);

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  void _refresh() {
    _future = purchaseRepo.listDirectReceipts(dateFrom: _filterDate, dateTo: _filterDate);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: Column(
          children: [
            // Tab-level screen — no back arrow. The trailing + is the
            // always-visible create shortcut (the floating nav pill hides a
            // bottom-right FAB, so the affordance lives in the app bar).
            PurPlainAppBar(
              title: 'Direct receipts',
              showBack: false,
              actions: [
                IconButton(
                  icon: Icon(Icons.add_rounded, color: PurColors.brand(context)),
                  onPressed: _openEntry,
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  const Spacer(),
                  TextButton.icon(
                    icon: const Icon(Icons.event_outlined, size: 16),
                    label: Text(_filterDate),
                    onPressed: _pickDate,
                  ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  setState(_refresh);
                  await _future;
                },
                child: FutureBuilder<List<DirectReceiptRow>>(
                  future: _future,
                  builder: (_, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snap.hasError) {
                      return Center(
                        child: Text('Failed to load: ${snap.error}', style: RunqText.body),
                      );
                    }
                    final rows = snap.data ?? const [];
                    if (rows.isEmpty) {
                      return PurEmptyState(
                        icon: Icons.local_shipping_outlined,
                        title: 'No receipts for $_filterDate',
                        description: 'Record the first one — or tap + below.',
                        action: PurPrimaryButton(
                          label: 'Record receipt',
                          icon: Icons.add_rounded,
                          onPressed: _openEntry,
                        ),
                      );
                    }
                    return ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 100),
                      itemCount: rows.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _ReceiptTile(
                        row: rows[i],
                        onEdit: () => _edit(rows[i]),
                        onCancel: () => _cancel(rows[i].id),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_filterDate),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() {
        _filterDate = picked.toIso8601String().substring(0, 10);
        _refresh();
      });
    }
  }

  Future<void> _cancel(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reverse this receipt?'),
        content: const Text('On-hand qty drops by the same amount. GRN row stays for audit.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reverse')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await purchaseRepo.cancelDirectReceipt(id);
      setState(_refresh);
      if (mounted) showRunqSnack(context, 'Receipt reversed', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    }
  }

  Future<void> _openEntry() async {
    final created = await context.push<bool>('/purchase/direct/new');
    if (created == true) setState(_refresh);
  }

  Future<void> _edit(DirectReceiptRow row) async {
    // Resolve the full item first so the edit form knows the tracking flags
    // and master rate up-front (the list row only carries the item id/name).
    InvItem item;
    try {
      item = await inventoryRepo.itemById(row.inventoryItemId);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Could not load item: $e', kind: SnackKind.error);
      return;
    }
    if (!mounted) return;
    final args = DirectReceiptEditArgs(
      id: row.id,
      item: item,
      warehouseId: row.warehouseId,
      receivedAt: row.receivedAt,
      qty: row.qty,
      batchNo: row.batchNo,
      expiryDate: row.expiryDate,
      sourceLabel: row.sourceLabel,
      vehicleNo: row.vehicleNo,
      lrNo: row.lrNo,
      notes: _noteWithoutSource(row.notes, row.sourceLabel),
    );
    final saved = await context.push<bool>('/purchase/direct/edit', extra: args);
    if (saved == true) setState(_refresh);
  }

  /// The server stores notes as "sourceLabel — notes"; peel the source prefix
  /// back off so the edit form's Notes field shows just the free text.
  String? _noteWithoutSource(String? notes, String? source) {
    if (notes == null) return null;
    if (source == null || source.isEmpty) return notes;
    if (notes == source) return null;
    final prefix = '$source — ';
    return notes.startsWith(prefix) ? notes.substring(prefix.length) : notes;
  }
}

class _ReceiptTile extends StatelessWidget {
  final DirectReceiptRow row;
  final VoidCallback onEdit;
  final VoidCallback onCancel;
  const _ReceiptTile({required this.row, required this.onEdit, required this.onCancel});

  bool get _cancelled => row.status == 'cancelled';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _header(context, t),
          ..._metaChips(t),
          Divider(height: 18, color: t.hairline),
          _footer(context, t),
        ],
      ),
    );
  }

  Widget _header(BuildContext context, RunqTokens t) {
    final brand = PurColors.brand(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(
            color: _cancelled ? t.bgWarmer : PurColors.violetSubtle,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.local_shipping_outlined, size: 19,
              color: _cancelled ? t.muted2 : brand),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(row.itemName,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.bodyStrong.copyWith(
                    color: _cancelled ? t.muted : t.ink,
                    decoration: _cancelled ? TextDecoration.lineThrough : null,
                  )),
              const SizedBox(height: 2),
              Text('GRN ${row.grnNo}', style: RunqText.micro.copyWith(color: t.muted2)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(_fmtQty(row.qty),
                style: RunqText.h3.copyWith(
                    color: _cancelled ? t.muted : t.ink, height: 1.1)),
            Text('₹${row.lineTotal.toStringAsFixed(0)}',
                style: RunqText.caption.copyWith(
                    color: _cancelled ? t.muted2 : brand)),
          ],
        ),
      ],
    );
  }

  List<Widget> _metaChips(RunqTokens t) {
    final chips = <PurDocMeta>[
      if (row.sourceLabel != null && row.sourceLabel!.isNotEmpty)
        PurDocMeta(icon: Icons.person_outline_rounded, label: row.sourceLabel!),
      if (row.batchNo != null)
        PurDocMeta(icon: Icons.qr_code_2_rounded, label: row.batchNo!),
      if (row.expiryDate != null)
        PurDocMeta(icon: Icons.schedule_outlined, label: 'Exp ${row.expiryDate}'),
    ];
    if (chips.isEmpty) return const [SizedBox(height: 2)];
    return [
      const SizedBox(height: 10),
      Wrap(spacing: 10, runSpacing: 6, children: chips.map((m) => PurMetaChip(meta: m)).toList()),
    ];
  }

  Widget _footer(BuildContext context, RunqTokens t) {
    return Row(
      children: [
        if (_cancelled)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: PurColors.errorBg, borderRadius: BorderRadius.circular(6)),
            child: Text('Reversed',
                style: RunqText.micro.copyWith(
                    color: PurColors.error, fontWeight: FontWeight.w600)),
          )
        else
          Text('Received ${row.receivedAt}',
              style: RunqText.micro.copyWith(color: t.muted2)),
        const Spacer(),
        if (!_cancelled) ...[
          _TileAction(
              icon: Icons.edit_outlined, label: 'Edit',
              color: PurColors.brand(context), onTap: onEdit),
          const SizedBox(width: 2),
          _TileAction(
              icon: Icons.undo_rounded, label: 'Reverse',
              color: PurColors.error, onTap: onCancel),
        ],
      ],
    );
  }

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);
}

class _TileAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _TileAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 4),
            Text(label,
                style: RunqText.caption.copyWith(color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
