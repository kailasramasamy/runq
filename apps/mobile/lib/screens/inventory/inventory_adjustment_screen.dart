// Adjustment list + scan-create + post sheet. Phase 4 godown-floor UX:
// reason picker, scan item, signed qty (damage = negative, found = positive),
// posts in one tap.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

const Map<String, String> _reasonLabels = {
  'damage': 'Damage', 'expiry': 'Expiry', 'theft': 'Theft', 'found': 'Found',
  'revaluation': 'Revaluation', 'correction': 'Correction', 'opening_balance': 'Opening',
};

class InventoryAdjustmentScreen extends ConsumerWidget {
  const InventoryAdjustmentScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invAdjustmentListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Adjustments', style: RunqText.h3.copyWith(color: t.ink)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _openSheet(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invAdjustmentListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 80),
                  Icon(Icons.tune, size: 48, color: t.muted2),
                  Center(child: Text('No adjustments yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  const SizedBox(height: 4),
                  Center(
                    child: TextButton(
                      onPressed: () => _openSheet(context, ref),
                      child: const Text('Record an adjustment'),
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _AdjTile(adj: list[i]),
            );
          },
        ),
      ),
    );
  }

  void _openSheet(BuildContext context, WidgetRef ref) async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _NewAdjustmentSheet(),
    );
    if (created == true) {
      ref.invalidate(invAdjustmentListProvider(null));
      ref.invalidate(invKpisProvider);
    }
  }
}

class _AdjTile extends StatelessWidget {
  const _AdjTile({required this.adj});
  final InvAdjustment adj;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (adj.status) {
      'posted' => Colors.green.shade700,
      'pending_approval' => Colors.orange.shade700,
      'cancelled' => Colors.red.shade700,
      _ => t.muted,
    };
    final delta = adj.totalValueDelta;
    final deltaColor = delta < 0
        ? Colors.red.shade700
        : delta > 0 ? Colors.green.shade700 : t.muted;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(adj.adjNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${adj.adjustmentDate} · ${_reasonLabels[adj.reason] ?? adj.reason} · ${adj.warehouseName}',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                delta == 0 ? '—' : '${delta > 0 ? '+' : '-'}₹${delta.abs().toStringAsFixed(2)}',
                style: RunqText.bodyStrong.copyWith(color: deltaColor),
              ),
              const SizedBox(height: 2),
              Text(adj.status.toUpperCase().replaceAll('_', ' '),
                  style: RunqText.micro.copyWith(color: statusColor)),
            ],
          ),
        ],
      ),
    );
  }
}

class _NewAdjustmentSheet extends ConsumerStatefulWidget {
  const _NewAdjustmentSheet();
  @override
  ConsumerState<_NewAdjustmentSheet> createState() => _NewAdjustmentSheetState();
}

class _NewAdjustmentSheetState extends ConsumerState<_NewAdjustmentSheet> {
  final _qtyCtrl = TextEditingController();
  final _batchCtrl = TextEditingController();
  final _barcodeCtrl = TextEditingController();
  String? warehouseId;
  String reason = 'damage';
  InvItem? picked;
  bool submitting = false;

  @override
  void dispose() {
    _qtyCtrl.dispose(); _batchCtrl.dispose(); _barcodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _lookupBarcode() async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty) return;
    final item = await inventoryRepo.findByBarcode(code);
    if (!mounted) return;
    if (item == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No item matched that barcode')),
      );
    } else {
      setState(() => picked = item);
    }
  }

  bool get _isOutbound =>
      reason == 'damage' || reason == 'expiry' || reason == 'theft';

  Future<void> _submit() async {
    if (warehouseId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick a warehouse')));
      return;
    }
    if (picked == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick or scan an item')));
      return;
    }
    final qty = double.tryParse(_qtyCtrl.text) ?? 0;
    if (qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Qty required')));
      return;
    }
    // Sign the delta based on reason: damage/expiry/theft are removals.
    final delta = _isOutbound ? -qty : qty;
    setState(() => submitting = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final a = await inventoryRepo.createAdjustment(
        warehouseId: warehouseId!,
        reason: reason,
        adjustmentDate: today,
        lines: [
          InvAdjustmentLineInput(
            itemId: picked!.id,
            batchNo: _batchCtrl.text.trim().isEmpty ? null : _batchCtrl.text.trim(),
            qtyDelta: delta,
          ),
        ],
      );
      await inventoryRepo.postAdjustment(a.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${a.adjNo} posted')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final whs = ref.watch(invWarehousesProvider);
    final insets = MediaQuery.of(context).viewInsets;
    return Padding(
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Record adjustment', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(
              _isOutbound
                  ? 'Reason removes stock. Qty entered as a positive number; we sign it.'
                  : 'Reason adds stock to the warehouse.',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 16),
            whs.maybeWhen(
              data: (list) => DropdownButtonFormField<String>(
                initialValue: warehouseId,
                decoration: const InputDecoration(labelText: 'Warehouse', border: OutlineInputBorder()),
                items: list.map((w) => DropdownMenuItem(value: w.id, child: Text(w.name))).toList(),
                onChanged: (v) => setState(() => warehouseId = v),
              ),
              orElse: () => const LinearProgressIndicator(),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: reason,
              decoration: const InputDecoration(labelText: 'Reason', border: OutlineInputBorder()),
              items: _reasonLabels.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => reason = v ?? 'damage'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _barcodeCtrl,
              decoration: InputDecoration(
                labelText: 'Barcode',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(icon: const Icon(Icons.qr_code_scanner), onPressed: _lookupBarcode),
              ),
              onSubmitted: (_) => _lookupBarcode(),
            ),
            if (picked != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: t.bgWarmer, borderRadius: BorderRadius.circular(8)),
                child: Text(picked!.name, style: RunqText.bodyStrong),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _qtyCtrl,
              decoration: InputDecoration(
                labelText: _isOutbound ? 'Qty to remove' : 'Qty to add',
                border: const OutlineInputBorder(),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            if (picked?.trackBatches ?? false) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _batchCtrl,
                decoration: const InputDecoration(labelText: 'Batch', border: OutlineInputBorder()),
              ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: submitting ? null : _submit,
                child: Text(submitting ? 'Posting…' : 'Post adjustment'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
