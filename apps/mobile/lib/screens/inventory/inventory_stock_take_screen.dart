// Stock take list + start session + scan-driven count loop.
//
// Phase 4 godown UX:
//   1. List sessions; FAB → "Start new" with warehouse + scope
//   2. Tap an in-progress session → focused count screen
//      - Scan barcode → matched line surfaces with system qty + last count
//      - Enter counted qty → tap "Save & next" → barcode field re-focuses
//      - Post button collapses variance into one adjustment + JE

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

class InventoryStockTakeScreen extends ConsumerWidget {
  const InventoryStockTakeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invStockTakeListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Stock take', style: RunqText.h3.copyWith(color: t.ink)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _openStart(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invStockTakeListProvider(null));
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
                  Icon(Icons.checklist_outlined, size: 48, color: t.muted2),
                  Center(child: Text('No sessions yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  Center(
                    child: TextButton(
                      onPressed: () => _openStart(context, ref),
                      child: const Text('Start a session'),
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
              itemBuilder: (_, i) => _StTile(
                st: list[i],
                onTap: list[i].status == 'in_progress'
                    ? () => _openCount(context, ref, list[i].id)
                    : null,
              ),
            );
          },
        ),
      ),
    );
  }

  void _openStart(BuildContext context, WidgetRef ref) async {
    final created = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _StartSheet(),
    );
    if (created != null) {
      ref.invalidate(invStockTakeListProvider(null));
      if (context.mounted) _openCount(context, ref, created);
    }
  }

  void _openCount(BuildContext context, WidgetRef ref, String stockTakeId) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _CountScreen(stockTakeId: stockTakeId)),
    );
    ref.invalidate(invStockTakeListProvider(null));
  }
}

class _StTile extends StatelessWidget {
  const _StTile({required this.st, this.onTap});
  final InvStockTake st;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (st.status) {
      'posted' => Colors.green.shade700,
      'in_progress' => Colors.blue.shade700,
      'cancelled' => Colors.red.shade700,
      _ => t.muted,
    };
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: t.hairlineSoft),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(st.stNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    Text('${st.warehouseName} · ${st.scope}',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Text(st.status.toUpperCase().replaceAll('_', ' '),
                  style: RunqText.micro.copyWith(color: statusColor)),
              if (onTap != null) Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Icon(Icons.chevron_right, color: t.muted2),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Start session sheet ───────────────────────────────────────────────

class _StartSheet extends ConsumerStatefulWidget {
  const _StartSheet();
  @override
  ConsumerState<_StartSheet> createState() => _StartSheetState();
}

class _StartSheetState extends ConsumerState<_StartSheet> {
  String? warehouseId;
  bool submitting = false;

  Future<void> _submit() async {
    if (warehouseId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick a warehouse')));
      return;
    }
    setState(() => submitting = true);
    try {
      final st = await inventoryRepo.startStockTake(warehouseId: warehouseId!);
      if (!mounted) return;
      Navigator.of(context).pop(st.id);
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
            Text('Start stock take', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text('Snapshots the warehouse on-hand. Count via barcode scan.',
                style: RunqText.caption.copyWith(color: t.muted)),
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
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: submitting ? null : _submit,
                child: Text(submitting ? 'Starting…' : 'Start session'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Scan + count screen ───────────────────────────────────────────────

class _CountScreen extends ConsumerStatefulWidget {
  const _CountScreen({required this.stockTakeId});
  final String stockTakeId;
  @override
  ConsumerState<_CountScreen> createState() => _CountScreenState();
}

class _CountScreenState extends ConsumerState<_CountScreen> {
  final _barcodeCtrl = TextEditingController();
  final _countCtrl = TextEditingController();
  final _barcodeFocus = FocusNode();
  final _countFocus = FocusNode();
  InvItem? pickedItem;
  InvStockTakeLine? matchedLine;
  bool saving = false;
  bool posting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _barcodeFocus.requestFocus());
  }

  @override
  void dispose() {
    _barcodeCtrl.dispose(); _countCtrl.dispose();
    _barcodeFocus.dispose(); _countFocus.dispose();
    super.dispose();
  }

  Future<void> _onScan(String code) async {
    final value = code.trim();
    if (value.isEmpty) return;
    final item = await inventoryRepo.findByBarcode(value);
    if (!mounted) return;
    if (item == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No item matched')),
      );
      _barcodeFocus.requestFocus();
      return;
    }
    final detail = ref.read(invStockTakeDetailProvider(widget.stockTakeId)).valueOrNull;
    final line = detail?.lines.firstWhere(
      (l) => l.itemId == item.id,
      orElse: () => InvStockTakeLine(
        id: '', itemId: item.id, itemName: item.name,
        itemSku: item.sku, itemUnit: item.unit, batchNo: null,
        systemQty: 0, countedQty: null, unitCost: 0, variance: null,
      ),
    );
    setState(() {
      pickedItem = item;
      matchedLine = line;
      _countCtrl.text = (line?.countedQty ?? 0).toString();
    });
    _countFocus.requestFocus();
  }

  Future<void> _saveAndNext() async {
    if (pickedItem == null) return;
    final qty = double.tryParse(_countCtrl.text) ?? -1;
    if (qty < 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a non-negative qty')));
      return;
    }
    setState(() => saving = true);
    try {
      await inventoryRepo.upsertCountLines(widget.stockTakeId, [
        InvCountLineInput(
          itemId: pickedItem!.id,
          batchNo: matchedLine?.batchNo,
          countedQty: qty,
        ),
      ]);
      ref.invalidate(invStockTakeDetailProvider(widget.stockTakeId));
      _barcodeCtrl.clear();
      _countCtrl.clear();
      setState(() { pickedItem = null; matchedLine = null; });
      _barcodeFocus.requestFocus();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _post() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Post stock take?'),
        content: const Text(
          'Variance vs system qty will be posted as one adjustment + JE. '
          'Uncounted lines are assumed zero variance.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Post')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    setState(() => posting = true);
    try {
      await inventoryRepo.postStockTake(widget.stockTakeId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Posted — adjustment + JE created')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(invStockTakeDetailProvider(widget.stockTakeId));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text(
          detail.maybeWhen(data: (d) => d.stNo, orElse: () => 'Counting'),
          style: RunqText.h3.copyWith(color: t.ink),
        ),
        actions: [
          TextButton(
            onPressed: posting ? null : _post,
            child: Text(posting ? 'Posting…' : 'POST', style: TextStyle(color: InvColors.brand(context))),
          ),
        ],
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (d) {
          final counted = d.lines.where((l) => l.countedQty != null).length;
          final variant = d.lines.where((l) => (l.variance ?? 0) != 0).length;
          return Column(
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                color: t.surface,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${d.warehouseName}', style: RunqText.bodyStrong.copyWith(color: t.ink)),
                          Text('$counted of ${d.lines.length} counted · $variant with variance',
                              style: RunqText.caption.copyWith(color: t.muted)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                color: t.bgWarmer,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Scan to count', style: RunqText.label.copyWith(color: t.muted)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _barcodeCtrl,
                      focusNode: _barcodeFocus,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: t.surface,
                        labelText: 'Barcode',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.qr_code_scanner),
                          onPressed: () => _onScan(_barcodeCtrl.text),
                        ),
                      ),
                      onSubmitted: _onScan,
                    ),
                    if (pickedItem != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: t.surface,
                          border: Border.all(color: t.hairlineSoft),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(pickedItem!.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                            if (matchedLine != null && matchedLine!.id.isNotEmpty)
                              Text(
                                'System: ${matchedLine!.systemQty.toStringAsFixed(3)}'
                                '${matchedLine!.countedQty != null ? ' · prev count: ${matchedLine!.countedQty!.toStringAsFixed(3)}' : ''}',
                                style: RunqText.caption.copyWith(color: t.muted),
                              )
                            else
                              Text('No on-hand snapshot — counted as surplus',
                                  style: RunqText.caption.copyWith(color: Colors.orange.shade700)),
                            const SizedBox(height: 10),
                            TextField(
                              controller: _countCtrl,
                              focusNode: _countFocus,
                              decoration: const InputDecoration(
                                labelText: 'Counted qty',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              onSubmitted: (_) => _saveAndNext(),
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: saving ? null : _saveAndNext,
                                child: Text(saving ? 'Saving…' : 'Save & next'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.all(12),
                  itemCount: d.lines.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final l = d.lines[i];
                    final v = l.variance;
                    return ListTile(
                      dense: true,
                      title: Text(l.itemName, style: RunqText.body.copyWith(color: t.ink)),
                      subtitle: Text(
                        'Sys ${l.systemQty.toStringAsFixed(3)}'
                        '${l.countedQty != null ? ' · Counted ${l.countedQty!.toStringAsFixed(3)}' : ' · Not counted'}'
                        '${l.batchNo != null ? ' · ${l.batchNo}' : ''}',
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                      trailing: v == null || v == 0
                          ? null
                          : Text(
                              v > 0 ? '+${v.toStringAsFixed(3)}' : v.toStringAsFixed(3),
                              style: RunqText.bodyStrong.copyWith(
                                color: v < 0 ? Colors.red.shade700 : Colors.green.shade700,
                              ),
                            ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
