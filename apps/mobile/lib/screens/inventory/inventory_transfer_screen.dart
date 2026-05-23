// Transfer list + create/dispatch/receive sheet. Phase 4 godown-floor UX:
// scan or pick item, default-receive on receipt, swipe-to-dispatch from
// the row action. Same shape as GRN / DN sheets so the user learns the
// pattern once.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

class InventoryTransferScreen extends ConsumerWidget {
  const InventoryTransferScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invTransferListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Transfers', style: RunqText.h3.copyWith(color: t.ink)),
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
          ref.invalidate(invTransferListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (list) {
            if (list.isEmpty) return _empty(context, ref, 'No transfers yet', 'Move stock between two warehouses.');
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _TransferTile(
                transfer: list[i],
                onReceive: list[i].status == 'in_transit'
                    ? () => _receive(context, ref, list[i].id, list[i].transferNo)
                    : null,
              ),
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
      builder: (_) => const _NewTransferSheet(),
    );
    if (created == true) {
      ref.invalidate(invTransferListProvider(null));
      ref.invalidate(invKpisProvider);
    }
  }

  Future<void> _receive(BuildContext context, WidgetRef ref, String id, String no) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Receive $no?'),
        content: const Text(
          'Adds the dispatched quantities at the destination warehouse. '
          'Use the web app for partial / short receipts.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Receive')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await inventoryRepo.receiveTransfer(id);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$no received')));
      ref.invalidate(invTransferListProvider(null));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }
}

class _TransferTile extends StatelessWidget {
  const _TransferTile({required this.transfer, this.onReceive});
  final InvTransfer transfer;
  final VoidCallback? onReceive;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (transfer.status) {
      'received' => Colors.green.shade700,
      'in_transit' => Colors.blue.shade700,
      'cancelled' => Colors.red.shade700,
      _ => t.muted,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(transfer.transferNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    Text('${transfer.fromWarehouseName} → ${transfer.toWarehouseName}',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('₹${transfer.totalValue.toStringAsFixed(2)}',
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(transfer.status.toUpperCase().replaceAll('_', ' '),
                      style: RunqText.micro.copyWith(color: statusColor)),
                ],
              ),
            ],
          ),
          if (onReceive != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonal(onPressed: onReceive, child: const Text('Receive')),
            ),
          ],
        ],
      ),
    );
  }
}

Widget _empty(BuildContext context, WidgetRef ref, String title, String body) {
  final t = RT(context);
  return ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      const SizedBox(height: 80),
      Icon(Icons.alt_route_outlined, size: 48, color: t.muted2),
      Center(child: Text(title, style: RunqText.bodyStrong.copyWith(color: t.muted))),
      const SizedBox(height: 4),
      Center(child: Text(body, style: RunqText.caption.copyWith(color: t.muted2), textAlign: TextAlign.center)),
    ],
  );
}

class _NewTransferSheet extends ConsumerStatefulWidget {
  const _NewTransferSheet();
  @override
  ConsumerState<_NewTransferSheet> createState() => _NewTransferSheetState();
}

class _NewTransferSheetState extends ConsumerState<_NewTransferSheet> {
  final _qtyCtrl = TextEditingController();
  final _batchCtrl = TextEditingController();
  final _barcodeCtrl = TextEditingController();
  String? fromId;
  String? toId;
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

  Future<void> _submit() async {
    if (fromId == null || toId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick both warehouses')));
      return;
    }
    if (fromId == toId) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('From and To must differ')));
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
    setState(() => submitting = true);
    try {
      final t = await inventoryRepo.createTransfer(
        fromWarehouseId: fromId!,
        toWarehouseId: toId!,
        lines: [
          InvTransferLineInput(
            itemId: picked!.id,
            batchNo: _batchCtrl.text.trim().isEmpty ? null : _batchCtrl.text.trim(),
            qty: qty,
          ),
        ],
      );
      await inventoryRepo.dispatchTransfer(t.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${t.transferNo} dispatched (in transit)')),
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
            Text('New transfer', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text('Dispatches immediately on save — receive from the row action.',
                style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(height: 16),
            whs.maybeWhen(
              data: (list) => Column(children: [
                DropdownButtonFormField<String>(
                  initialValue: fromId,
                  decoration: const InputDecoration(labelText: 'From warehouse', border: OutlineInputBorder()),
                  items: list.map((w) => DropdownMenuItem(value: w.id, child: Text(w.name))).toList(),
                  onChanged: (v) => setState(() => fromId = v),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: toId,
                  decoration: const InputDecoration(labelText: 'To warehouse', border: OutlineInputBorder()),
                  items: list.map((w) => DropdownMenuItem(value: w.id, child: Text(w.name))).toList(),
                  onChanged: (v) => setState(() => toId = v),
                ),
              ]),
              orElse: () => const LinearProgressIndicator(),
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
              decoration: const InputDecoration(labelText: 'Qty', border: OutlineInputBorder()),
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
                child: Text(submitting ? 'Dispatching…' : 'Dispatch'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
