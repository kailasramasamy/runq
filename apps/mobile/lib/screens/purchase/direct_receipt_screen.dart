import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart' as inv_picker;
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
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: PurColors.brand(context),
        foregroundColor: Colors.white,
        onPressed: _openEntry,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Record receipt'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Tab-level screen — no back arrow.
            const PurPlainAppBar(title: 'Direct receipts', showBack: false),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Memo qty entry · no bill, no JE',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ),
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
                        description: 'Tap Record receipt to add the first one.',
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
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => const _DirectReceiptEntrySheet(),
    );
    if (created == true) setState(_refresh);
  }
}

class _ReceiptTile extends StatelessWidget {
  final DirectReceiptRow row;
  final VoidCallback onCancel;
  const _ReceiptTile({required this.row, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final cancelled = row.status == 'cancelled';
    return RunqCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  row.itemName,
                  style: RunqText.bodyStrong.copyWith(
                    color: t.ink,
                    decoration: cancelled ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              Text(
                row.qty.toString(),
                style: RunqText.bodyStrong.copyWith(
                  color: cancelled ? t.muted : t.ink,
                ),
              ),
              if (row.batchNo != null) ...[
                const SizedBox(width: 4),
                Text('×', style: RunqText.caption.copyWith(color: t.muted2)),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 10, runSpacing: 4,
            children: [
              if (row.sourceLabel != null)
                Text(row.sourceLabel!, style: RunqText.caption.copyWith(color: t.muted)),
              if (row.batchNo != null)
                Text('Batch ${row.batchNo}', style: RunqText.caption.copyWith(color: t.muted)),
              Text('Rate ${row.unitRate}', style: RunqText.caption.copyWith(color: t.muted)),
              Text('₹${row.lineTotal.toStringAsFixed(0)}',
                  style: RunqText.caption.copyWith(color: PurColors.brand(context))),
              if (cancelled)
                Text('Reversed', style: RunqText.caption.copyWith(color: PurColors.error)),
            ],
          ),
          if (!cancelled)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onCancel,
                icon: Icon(Icons.undo_rounded, size: 16, color: PurColors.error),
                label: Text('Reverse',
                    style: RunqText.caption.copyWith(color: PurColors.error)),
              ),
            ),
        ],
      ),
    );
  }
}

class _DirectReceiptEntrySheet extends StatefulWidget {
  const _DirectReceiptEntrySheet();

  @override
  State<_DirectReceiptEntrySheet> createState() => _DirectReceiptEntrySheetState();
}

class _DirectReceiptEntrySheetState extends State<_DirectReceiptEntrySheet> {
  String? _warehouseId;
  String? _itemId;
  String? _itemName;
  final _receivedAtCtl = TextEditingController(text: DateTime.now().toIso8601String().substring(0, 10));
  final _qtyCtl = TextEditingController();
  final _rateCtl = TextEditingController();
  final _sourceCtl = TextEditingController();
  final _batchCtl = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _receivedAtCtl.dispose();
    _qtyCtl.dispose();
    _rateCtl.dispose();
    _sourceCtl.dispose();
    _batchCtl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_warehouseId == null || _itemId == null) {
      showRunqSnack(context, 'Pick warehouse and item', kind: SnackKind.error);
      return;
    }
    final q = double.tryParse(_qtyCtl.text);
    final r = double.tryParse(_rateCtl.text);
    if (q == null || q <= 0 || r == null || r < 0) {
      showRunqSnack(context, 'Qty > 0 and rate ≥ 0', kind: SnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await purchaseRepo.createDirectReceipt(
        warehouseId: _warehouseId!,
        inventoryItemId: _itemId!,
        receivedAt: _receivedAtCtl.text.trim(),
        qty: q,
        unitRate: r,
        sourceLabel: _sourceCtl.text.trim().isEmpty ? null : _sourceCtl.text.trim(),
        batchNo: _batchCtl.text.trim().isEmpty ? null : _batchCtl.text.trim(),
      );
      if (!mounted) return;
      showRunqSnack(context, 'Receipt posted', kind: SnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickItem() async {
    final picked = await showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => const _ItemPickerSheet(),
    );
    if (picked != null) {
      setState(() {
        _itemId = picked.id;
        _itemName = picked.name;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtl) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(child: Text('Record receipt',
                      style: RunqText.h3.copyWith(color: t.ink))),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollCtl,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  inv_picker.WarehousePicker(
                    value: _warehouseId,
                    allowAll: false,
                    label: 'Warehouse',
                    onChanged: (v) => setState(() => _warehouseId = v),
                  ),
                  const SizedBox(height: 10),
                  InkWell(
                    onTap: _pickItem,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: t.bgWarm,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: t.hairline),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.inventory_2_outlined, size: 18, color: t.muted),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _itemName ?? 'Pick item from master…',
                              style: RunqText.bodyStrong.copyWith(
                                color: _itemName == null ? t.muted : t.ink,
                              ),
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded, color: t.muted2),
                        ],
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(child: _field('Qty', _qtyCtl, num: true)),
                      const SizedBox(width: 8),
                      Expanded(child: _field('Rate (₹)', _rateCtl, num: true)),
                    ],
                  ),
                  _field('Received on (YYYY-MM-DD)', _receivedAtCtl),
                  _field('Source label', _sourceCtl,
                      hint: 'Farmer / shift / plant…',
                      cap: TextCapitalization.sentences),
                  _field('Batch (if tracked)', _batchCtl),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
              decoration: BoxDecoration(
                color: t.surface,
                border: Border(top: BorderSide(color: t.hairline)),
              ),
              child: PurPrimaryButton(
                label: 'Post receipt',
                icon: Icons.check_rounded,
                loading: _busy,
                onPressed: _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(String label, TextEditingController c,
      {bool num = false, String? hint, TextCapitalization cap = TextCapitalization.none}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: RunqText.micro),
          const SizedBox(height: 2),
          TextField(
            controller: c,
            keyboardType: num ? const TextInputType.numberWithOptions(decimal: true) : null,
            textCapitalization: cap,
            decoration: InputDecoration(
              isDense: true,
              border: const OutlineInputBorder(),
              hintText: hint,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
          ),
        ],
      ),
    );
  }
}

/// Local item picker — same shape as PO receive screen's. Inlined here
/// to avoid cross-screen coupling; small enough to duplicate.
class _ItemPickerSheet extends StatefulWidget {
  const _ItemPickerSheet();

  @override
  State<_ItemPickerSheet> createState() => _ItemPickerSheetState();
}

class _ItemPickerSheetState extends State<_ItemPickerSheet> {
  final _ctl = TextEditingController();
  List<InvItem> _results = [];
  bool _loading = false;
  String _lastQuery = '';

  @override
  void initState() {
    super.initState();
    _search('');
  }

  Future<void> _search(String q) async {
    setState(() {
      _loading = true;
      _lastQuery = q;
    });
    try {
      final res = await inventoryRepo.searchItems(q, limit: 30);
      if (!mounted || _lastQuery != q) return;
      setState(() => _results = res);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtl) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                controller: _ctl,
                autofocus: true,
                onChanged: _search,
                textCapitalization: TextCapitalization.none,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search items by name or SKU…',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _results.isEmpty
                  ? Center(child: Text('No items', style: RunqText.caption.copyWith(color: t.muted)))
                  : ListView.separated(
                      controller: scrollCtl,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      itemCount: _results.length,
                      separatorBuilder: (_, __) => Divider(height: 1, color: t.hairline),
                      itemBuilder: (_, i) {
                        final item = _results[i];
                        return ListTile(
                          title: Text(item.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                          subtitle: item.sku != null
                              ? Text(item.sku!, style: RunqText.caption.copyWith(color: t.muted))
                              : null,
                          onTap: () => Navigator.pop(context, item),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
