// GRN flow — list + scan-to-receive. For phase 1 we ship the list and a
// minimal "new GRN" sheet that wraps the API directly. Barcode scan is
// available via the IconButton in the AppBar of the new-GRN sheet; on a
// successful scan the matched item is prefilled and the cursor jumps to
// qty.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

class InventoryGrnScreen extends ConsumerWidget {
  const InventoryGrnScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invGrnListProvider(null));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Receipts', style: RunqText.h3.copyWith(color: t.ink)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _openNewGrnSheet(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(invGrnListProvider(null));
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
                  Icon(Icons.add_box_outlined, size: 48, color: t.muted2),
                  Center(child: Text('No GRNs yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  Center(
                    child: TextButton(
                      onPressed: () => _openNewGrnSheet(context, ref),
                      child: const Text('Create the first GRN'),
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
              itemBuilder: (_, i) => _GrnTile(grn: list[i]),
            );
          },
        ),
      ),
    );
  }

  void _openNewGrnSheet(BuildContext context, WidgetRef ref) async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _NewGrnSheet(),
    );
    if (created == true) {
      ref.invalidate(invGrnListProvider(null));
      ref.invalidate(invKpisProvider);
    }
  }
}

class _GrnTile extends StatelessWidget {
  const _GrnTile({required this.grn});
  final InvGrn grn;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (grn.status) {
      'posted' => Colors.green.shade700,
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
                Text(grn.grnNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${grn.receivedDate} · ${grn.warehouseName}',
                    style: RunqText.caption.copyWith(color: t.muted)),
                if (grn.vendorName != null) Text(grn.vendorName!, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('₹${grn.totalValue.toStringAsFixed(2)}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(grn.status.toUpperCase(),
                  style: RunqText.micro.copyWith(color: statusColor)),
            ],
          ),
        ],
      ),
    );
  }
}

class _NewGrnSheet extends ConsumerStatefulWidget {
  const _NewGrnSheet();
  @override
  ConsumerState<_NewGrnSheet> createState() => _NewGrnSheetState();
}

class _NewGrnSheetState extends ConsumerState<_NewGrnSheet> {
  final _qtyCtrl = TextEditingController();
  final _rateCtrl = TextEditingController();
  final _batchCtrl = TextEditingController();
  final _barcodeCtrl = TextEditingController();
  final _serialCtrl = TextEditingController();
  final _serialFocus = FocusNode();
  String? warehouseId;
  InvItem? pickedItem;
  // Captured serials when picked item tracks serials. Each scan adds one;
  // qty is bound to the length so the user can't over-receive.
  final List<String> _serialNos = [];
  bool submitting = false;

  @override
  void dispose() {
    _qtyCtrl.dispose(); _rateCtrl.dispose(); _batchCtrl.dispose();
    _barcodeCtrl.dispose(); _serialCtrl.dispose(); _serialFocus.dispose();
    super.dispose();
  }

  void _addSerial(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return;
    if (_serialNos.contains(s)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Serial $s already scanned')),
      );
    } else {
      setState(() {
        _serialNos.add(s);
        _qtyCtrl.text = _serialNos.length.toString();
      });
    }
    _serialCtrl.clear();
    _serialFocus.requestFocus();
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
      setState(() => pickedItem = item);
    }
  }

  Future<void> _submit() async {
    if (warehouseId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick a warehouse')));
      return;
    }
    if (pickedItem == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick or scan an item')));
      return;
    }
    // Serial-bound qty: comes from scanned count, not the manual field.
    final qty = pickedItem?.trackSerials == true
        ? _serialNos.length.toDouble()
        : (double.tryParse(_qtyCtrl.text) ?? 0);
    final rate = double.tryParse(_rateCtrl.text) ?? 0;
    if (qty <= 0 || rate < 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Qty and rate required')));
      return;
    }
    setState(() => submitting = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final grn = await inventoryRepo.createGrn(
        warehouseId: warehouseId!,
        receivedDate: today,
        lines: [
          InvGrnLineInput(
            itemId: pickedItem!.id,
            batchNo: _batchCtrl.text.trim().isEmpty ? null : _batchCtrl.text.trim(),
            qty: qty,
            unitRate: rate,
            serialNos: _serialNos.isEmpty ? null : List<String>.from(_serialNos),
          ),
        ],
      );
      await inventoryRepo.postGrn(grn.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('GRN ${grn.grnNo} posted')),
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
            Text('Receive stock', style: RunqText.h3.copyWith(color: t.ink)),
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
                labelText: 'Barcode (scan or type)',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.qr_code_scanner),
                  onPressed: _lookupBarcode,
                ),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _lookupBarcode(),
            ),
            if (pickedItem != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: t.bgWarmer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(pickedItem!.name, style: RunqText.bodyStrong)),
                    if (pickedItem!.sku != null) Text(pickedItem!.sku!, style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
            ],
            if (pickedItem?.trackSerials == true) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _serialCtrl,
                focusNode: _serialFocus,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: 'Scan serial',
                  helperText: '${_serialNos.length} captured — qty binds to scan count',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.qr_code_scanner),
                    onPressed: () => _addSerial(_serialCtrl.text),
                  ),
                ),
                onSubmitted: _addSerial,
              ),
              if (_serialNos.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: t.bgWarmer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Wrap(
                    spacing: 6, runSpacing: 6,
                    children: _serialNos.map((s) => Chip(
                      label: Text(s, style: RunqText.caption),
                      onDeleted: () => setState(() {
                        _serialNos.remove(s);
                        _qtyCtrl.text = _serialNos.length.toString();
                      }),
                      visualDensity: VisualDensity.compact,
                    )).toList(),
                  ),
                ),
              ],
            ],
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _qtyCtrl,
                  readOnly: pickedItem?.trackSerials == true,
                  decoration: InputDecoration(
                    labelText: 'Qty',
                    helperText: pickedItem?.trackSerials == true ? 'Set by scan count' : null,
                    border: const OutlineInputBorder(),
                  ),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _rateCtrl,
                  decoration: const InputDecoration(labelText: 'Unit rate', border: OutlineInputBorder()),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
              ),
            ]),
            if (pickedItem?.trackBatches ?? false) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _batchCtrl,
                decoration: const InputDecoration(labelText: 'Batch no.', border: OutlineInputBorder()),
              ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: submitting ? null : _submit,
                child: Text(submitting ? 'Posting…' : 'Receive + post'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
