// Delivery flow — list + quick-dispatch sheet. Mirrors GRN.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

class InventoryDeliveryScreen extends ConsumerWidget {
  const InventoryDeliveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invDnListProvider(null));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Dispatches', style: RunqText.h3.copyWith(color: t.ink)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _openSheet(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(invDnListProvider(null));
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
                  Icon(Icons.outbound_outlined, size: 48, color: t.muted2),
                  Center(child: Text('No deliveries yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  Center(
                    child: TextButton(
                      onPressed: () => _openSheet(context, ref),
                      child: const Text('Create the first delivery'),
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
              itemBuilder: (_, i) => _DnTile(dn: list[i]),
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
      builder: (_) => const _NewDnSheet(),
    );
    if (created == true) {
      ref.invalidate(invDnListProvider(null));
      ref.invalidate(invKpisProvider);
    }
  }
}

class _DnTile extends StatelessWidget {
  const _DnTile({required this.dn});
  final InvDn dn;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (dn.status) {
      'dispatched' => Colors.green.shade700,
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
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dn.dnNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${dn.dispatchDate} · ${dn.warehouseName}',
                    style: RunqText.caption.copyWith(color: t.muted)),
                if (dn.customerName != null)
                  Text(dn.customerName!, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('₹${dn.totalValue.toStringAsFixed(2)}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(dn.status.toUpperCase(),
                  style: RunqText.micro.copyWith(color: statusColor)),
            ],
          ),
        ],
      ),
    );
  }
}

class _NewDnSheet extends ConsumerStatefulWidget {
  const _NewDnSheet();
  @override
  ConsumerState<_NewDnSheet> createState() => _State();
}

class _State extends ConsumerState<_NewDnSheet> {
  final _qtyCtrl = TextEditingController();
  final _batchCtrl = TextEditingController();
  final _barcodeCtrl = TextEditingController();
  String? warehouseId;
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
    setState(() => submitting = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final dn = await inventoryRepo.createDn(
        warehouseId: warehouseId!,
        dispatchDate: today,
        lines: [
          InvDnLineInput(
            itemId: picked!.id,
            batchNo: _batchCtrl.text.trim().isEmpty ? null : _batchCtrl.text.trim(),
            qty: qty,
          ),
        ],
      );
      await inventoryRepo.dispatchDn(dn.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delivery ${dn.dnNo} dispatched')),
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
            Text('Dispatch stock', style: RunqText.h3.copyWith(color: t.ink)),
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
                decoration: const InputDecoration(
                  labelText: 'Batch (blank = FEFO)',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: submitting ? null : _submit,
                child: Text(submitting ? 'Dispatching…' : 'Dispatch + post'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
