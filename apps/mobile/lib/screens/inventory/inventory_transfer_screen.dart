// Transfers — list + create/dispatch/receive sheet. Redesigned per the
// inventory handoff: each tile shows a FROM → TO route visual (warm-fill
// pill with brand arrow), footer with date + line count + total, and an
// inline "Mark as Received" CTA when the transfer is in_transit.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';
import '../../widgets/runq_snack.dart';

class InventoryTransferScreen extends ConsumerWidget {
  const InventoryTransferScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invTransferListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Transfers',
        onBack: () => context.pop(),
        trailing: _AddBtn(onTap: () => _openSheet(context, ref)),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invTransferListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Failed to load: $e',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
            ),
          ),
          data: (list) {
            if (list.isEmpty) {
              return InvEmptyState(
                icon: Icons.alt_route_outlined,
                title: 'No transfers yet',
                subtitle: 'Move stock between two warehouses',
                actionLabel: '+ New Transfer',
                onAction: () => _openSheet(context, ref),
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _TransferTile(
                transfer: list[i],
                onTap: () => _openDetail(context, list[i]),
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
      backgroundColor: Colors.transparent,
      builder: (_) => const _NewTransferSheet(),
    );
    if (created == true) {
      ref.invalidate(invTransferListProvider(null));
      ref.invalidate(invKpisProvider);
    }
  }

  Future<void> _openDetail(BuildContext context, InvTransfer transfer) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _TransferDetailSheet(transfer: transfer),
    );
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
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: TextButton.styleFrom(foregroundColor: RT(ctx).muted),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: InvColors.brand(ctx),
              foregroundColor: Colors.white,
            ),
            child: const Text('Receive'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await inventoryRepo.receiveTransfer(id);
      if (!context.mounted) return;
      RunqSnack.success(context, '$no received');
      ref.invalidate(invTransferListProvider(null));
    } catch (e) {
      if (!context.mounted) return;
      RunqSnack.error(context, "Couldn't receive $no",
          description: snackErrorText(e));
    }
  }
}

class _AddBtn extends StatelessWidget {
  const _AddBtn({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: InvColors.brand(context),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: const SizedBox(
            width: 32, height: 32,
            child: Icon(Icons.add, color: Colors.white, size: 18),
          ),
        ),
      ),
    );
  }
}

// ── Transfer tile ────────────────────────────────────────────────────────

class _TransferTile extends StatelessWidget {
  const _TransferTile({required this.transfer, this.onReceive, this.onTap});
  final InvTransfer transfer;
  final VoidCallback? onReceive;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(transfer.transferNo,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
              ),
              InvStatusPill(status: transfer.status),
            ],
          ),
          const SizedBox(height: 10),
          // Route visual — bg-warmer pill, FROM/TO labels with brand arrow.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: t.bgWarmer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Expanded(child: _RouteEnd(label: 'FROM', name: transfer.fromWarehouseName)),
                _RouteArrow(),
                Expanded(
                  child: _RouteEnd(
                    label: 'TO',
                    name: transfer.toWarehouseName,
                    rightAligned: true,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  _footerText(transfer),
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                compactINR(transfer.totalValue),
                style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
              ),
            ],
          ),
          if (onReceive != null) ...[
            const SizedBox(height: 10),
            _ReceiveButton(onTap: onReceive!),
          ],
        ],
      ),
    );
  }

  static String _footerText(InvTransfer x) {
    final date = (x.transferDate ?? '').isNotEmpty
        ? x.transferDate!.substring(0, 10)
        : '';
    final lines = '${x.lineCount} ${x.lineCount == 1 ? 'line' : 'lines'}';
    if (date.isEmpty) return lines;
    return '$date · $lines';
  }
}

class _RouteEnd extends StatelessWidget {
  const _RouteEnd({required this.label, required this.name, this.rightAligned = false});
  final String label;
  final String name;
  final bool rightAligned;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final align = rightAligned ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    return Column(
      crossAxisAlignment: align,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label,
            style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
        const SizedBox(height: 2),
        Text(name,
            style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w600),
            maxLines: 1, overflow: TextOverflow.ellipsis,
            textAlign: rightAligned ? TextAlign.right : TextAlign.left),
      ],
    );
  }
}

class _RouteArrow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final brand = InvColors.brand(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 24, height: 1, color: brand),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Icon(Icons.east, size: 14, color: brand),
          ),
          Container(width: 24, height: 1, color: brand),
        ],
      ),
    );
  }
}

class _ReceiveButton extends StatelessWidget {
  const _ReceiveButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final brand = InvColors.brand(context);
    return Material(
      color: InvColors.amberSubtle,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: double.infinity,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(color: brand.withValues(alpha: 0.30)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle_outline, size: 16, color: brand),
              const SizedBox(width: 6),
              Text(
                'Mark as Received',
                style: RunqText.caption.copyWith(
                  color: brand,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── New Transfer sheet — multi-line, dispatches on save ──────────────────

// One row in the draft. Owns its own controllers so the qty/batch inputs
// survive list reorders without losing focus / cursor.
class _LineDraft {
  _LineDraft(this.item)
      : qtyCtrl = TextEditingController(),
        batchCtrl = TextEditingController();
  final InvItem item;
  final TextEditingController qtyCtrl;
  final TextEditingController batchCtrl;
  void dispose() {
    qtyCtrl.dispose();
    batchCtrl.dispose();
  }
}

class _NewTransferSheet extends ConsumerStatefulWidget {
  const _NewTransferSheet();
  @override
  ConsumerState<_NewTransferSheet> createState() => _NewTransferSheetState();
}

class _NewTransferSheetState extends ConsumerState<_NewTransferSheet> {
  String? fromId;
  String? toId;
  bool submitting = false;

  final List<_LineDraft> _lines = [];
  // itemId → warehouseId → on-hand qty. Cached so reused items don't refetch.
  final Map<String, Map<String, double>> _availByItem = {};
  final Set<String> _availLoading = {};

  @override
  void dispose() {
    for (final l in _lines) { l.dispose(); }
    super.dispose();
  }

  Future<void> _openItemPicker() async {
    final item = await showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _TransferItemPickerSheet(),
    );
    if (item != null && mounted) _addLine(item);
  }

  Future<void> _openBarcodeSheet() async {
    final item = await showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _BarcodeLookupSheet(),
    );
    if (item != null && mounted) _addLine(item);
  }

  void _addLine(InvItem item) {
    // Dedupe — if the item is already in the draft, just focus its row.
    final existing = _lines.indexWhere((l) => l.item.id == item.id);
    if (existing != -1) {
      RunqSnack.warning(context, '${item.name} is already in this transfer');
      return;
    }
    final draft = _LineDraft(item);
    draft.qtyCtrl.addListener(() => setState(() {}));
    setState(() => _lines.add(draft));
    _loadAvailability(item.id);
  }

  void _removeLine(int i) {
    setState(() {
      _lines[i].dispose();
      _lines.removeAt(i);
    });
  }

  Future<void> _loadAvailability(String itemId) async {
    if (_availByItem.containsKey(itemId) || _availLoading.contains(itemId)) return;
    setState(() => _availLoading.add(itemId));
    try {
      final rows = await inventoryRepo.itemStock(itemId);
      if (!mounted) return;
      final map = <String, double>{};
      for (final r in rows) {
        map[r.warehouseId] = (map[r.warehouseId] ?? 0) + r.qty;
      }
      setState(() {
        _availByItem[itemId] = map;
        _availLoading.remove(itemId);
      });
    } catch (_) {
      if (mounted) setState(() => _availLoading.remove(itemId));
    }
  }

  double _availAt(String itemId, String? whId) {
    if (whId == null) return 0;
    return _availByItem[itemId]?[whId] ?? 0;
  }

  bool get _canSubmit {
    if (fromId == null || toId == null || fromId == toId) return false;
    if (submitting || _lines.isEmpty) return false;
    for (final l in _lines) {
      final q = double.tryParse(l.qtyCtrl.text) ?? 0;
      if (q <= 0) return false;
      if (q > _availAt(l.item.id, fromId)) return false;
    }
    return true;
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => submitting = true);
    try {
      final t = await inventoryRepo.createTransfer(
        fromWarehouseId: fromId!,
        toWarehouseId: toId!,
        lines: [
          for (final l in _lines)
            InvTransferLineInput(
              itemId: l.item.id,
              batchNo: l.batchCtrl.text.trim().isEmpty ? null : l.batchCtrl.text.trim(),
              qty: double.parse(l.qtyCtrl.text),
            ),
        ],
      );
      await inventoryRepo.dispatchTransfer(t.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      RunqSnack.success(context, '${t.transferNo} dispatched',
          description: 'In transit.');
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't dispatch the transfer",
          description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHeader(title: 'New Transfer', onClose: () => Navigator.of(context).pop(false)),
          Flexible(
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Dispatches immediately on save — receive from the row action.',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                  const SizedBox(height: 12),
                  _Lbl('From Warehouse'),
                  WarehousePicker(
                    value: fromId,
                    onChanged: (id) => setState(() => fromId = id),
                    allowAll: false,
                    dense: true,
                  ),
                  const SizedBox(height: 14),
                  _Lbl('To Warehouse'),
                  WarehousePicker(
                    value: toId,
                    onChanged: (id) => setState(() => toId = id),
                    allowAll: false,
                    dense: true,
                  ),
                  if (fromId != null && fromId == toId)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'From and To must differ',
                        style: RunqText.caption.copyWith(color: InvColors.error),
                      ),
                    ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      Expanded(child: _Lbl('Products (${_lines.length})')),
                      _BarcodeSideBtn(onTap: _openBarcodeSheet),
                    ],
                  ),
                  if (_lines.isEmpty)
                    _EmptyLines(onAdd: _openItemPicker)
                  else
                    Column(
                      children: [
                        for (var i = 0; i < _lines.length; i++) ...[
                          if (i > 0) const SizedBox(height: 10),
                          _LineCard(
                            draft: _lines[i],
                            fromId: fromId,
                            toId: toId,
                            availFrom: _availAt(_lines[i].item.id, fromId),
                            availTo: _availAt(_lines[i].item.id, toId),
                            availLoading: _availLoading.contains(_lines[i].item.id),
                            onRemove: () => _removeLine(i),
                          ),
                        ],
                      ],
                    ),
                  const SizedBox(height: 10),
                  _AddProductBtn(onTap: _openItemPicker),
                  const SizedBox(height: 20),
                  InvPrimaryButton(
                    label: _lines.length <= 1
                        ? 'Dispatch Transfer'
                        : 'Dispatch ${_lines.length} lines',
                    icon: Icons.alt_route_outlined,
                    busy: submitting,
                    onTap: _canSubmit ? _submit : null,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Line card — product, qty, batch (if tracked), avail hints, remove ────

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.draft,
    required this.fromId,
    required this.toId,
    required this.availFrom,
    required this.availTo,
    required this.availLoading,
    required this.onRemove,
  });
  final _LineDraft draft;
  final String? fromId;
  final String? toId;
  final double availFrom;
  final double availTo;
  final bool availLoading;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final item = draft.item;
    final qty = double.tryParse(draft.qtyCtrl.text) ?? 0;
    final exceeds = fromId != null && qty > 0 && qty > availFrom;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: exceeds ? InvColors.error : t.hairline),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.inventory_2_outlined, size: 16, color: t.muted),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (((item.sku ?? '').isNotEmpty) || ((item.unit ?? '').isNotEmpty)) ...[
                      const SizedBox(height: 2),
                      Text(
                        [
                          if ((item.sku ?? '').isNotEmpty) item.sku!,
                          if ((item.unit ?? '').isNotEmpty) item.unit!,
                        ].join(' · '),
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                    ],
                  ],
                ),
              ),
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onRemove,
                  customBorder: const CircleBorder(),
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: Icon(Icons.close, size: 16, color: t.muted2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Lbl('Qty'),
                    TextField(
                      controller: draft.qtyCtrl,
                      style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: _dec(context, hint: '0'),
                    ),
                  ],
                ),
              ),
              if (item.trackBatches) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Lbl('Batch'),
                      TextField(
                        controller: draft.batchCtrl,
                        style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                        decoration: _dec(context, hint: 'Batch no.'),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          if (fromId != null || toId != null) ...[
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (fromId != null)
                  Expanded(
                    child: _AvailHint(
                      qty: availFrom,
                      unit: item.unit,
                      loading: availLoading,
                      isSource: true,
                      exceeded: exceeds,
                    ),
                  ),
                if (fromId != null && toId != null) const SizedBox(width: 12),
                if (toId != null)
                  Expanded(
                    child: _AvailHint(
                      qty: availTo,
                      unit: item.unit,
                      loading: availLoading,
                      isSource: false,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _EmptyLines extends StatelessWidget {
  const _EmptyLines({required this.onAdd});
  final VoidCallback onAdd;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(Icons.inventory_2_outlined, size: 22, color: t.muted2),
          const SizedBox(height: 6),
          Text('No products added yet',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 2),
          Text('Tap "Add product" or scan a barcode',
              style: RunqText.micro.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

class _AddProductBtn extends StatelessWidget {
  const _AddProductBtn({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(color: t.hairline, style: BorderStyle.solid),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add, size: 16, color: brand),
              const SizedBox(width: 6),
              Text('Add product',
                  style: RunqText.bodyStrong.copyWith(color: brand, fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Local sheet chrome (kept private to this file) ───────────────────────

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title, required this.onClose});
  final String title;
  final VoidCallback onClose;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 36, height: 4,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 12, 8),
          child: Row(children: [
            Expanded(child: Text(title, style: RunqText.h3.copyWith(color: t.ink))),
            Material(
              color: t.bgWarmer,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onClose,
                child: SizedBox(
                  width: 28, height: 28,
                  child: Icon(Icons.close, size: 14, color: t.muted),
                ),
              ),
            ),
          ]),
        ),
      ],
    );
  }
}

class _Lbl extends StatelessWidget {
  const _Lbl(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Text(label.toUpperCase(),
        style: RunqText.label.copyWith(color: RT(context).muted, letterSpacing: 0.5)),
  );
}

InputDecoration _dec(BuildContext context, {String? hint, Widget? suffix}) {
  final t = RT(context);
  return InputDecoration(
    hintText: hint,
    hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
    filled: true,
    fillColor: t.surface,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    suffixIcon: suffix,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
    ),
  );
}

class _BarcodeSideBtn extends StatelessWidget {
  const _BarcodeSideBtn({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Tooltip(
      message: 'Scan barcode',
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              border: Border.all(color: t.hairline),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.qr_code_scanner, size: 20, color: InvColors.brand(context)),
          ),
        ),
      ),
    );
  }
}

class _AvailHint extends StatelessWidget {
  const _AvailHint({
    required this.qty,
    required this.unit,
    required this.loading,
    required this.isSource,
    this.exceeded = false,
  });
  final double qty;
  final String? unit;
  final bool loading;
  final bool isSource;
  // Source-only — qty entered on the line exceeds what's on-hand here.
  final bool exceeded;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final u = (unit ?? '').isEmpty ? '' : ' ${unit!}';
    final low = isSource && (qty <= 0 || exceeded);
    final color = low ? InvColors.error : t.muted;
    final label = isSource ? 'At FROM' : 'At TO';
    final qtyStr = qty == qty.truncateToDouble()
        ? qty.toInt().toString()
        : qty.toStringAsFixed(2);
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Row(
        children: [
          Icon(low ? Icons.error_outline : Icons.inventory_outlined,
              size: 12, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              loading
                  ? '$label: checking…'
                  : '$label: $qtyStr$u${exceeded ? ' (not enough)' : ''}',
              style: RunqText.caption.copyWith(color: color),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Item picker sheet — searchable, swaps the old barcode-first flow ─────

class _TransferItemPickerSheet extends StatefulWidget {
  const _TransferItemPickerSheet();
  @override
  State<_TransferItemPickerSheet> createState() => _TransferItemPickerSheetState();
}

class _TransferItemPickerSheetState extends State<_TransferItemPickerSheet> {
  final _ctrl = TextEditingController();
  List<InvItem> _results = const [];
  bool _loading = false;
  String _lastQuery = '';
  // Inter-warehouse transfers usually move finished goods between stores.
  static const _preferredGroup = classGroupFinished;
  String? _classGroup;
  bool _userPickedGroup = false;

  @override
  void initState() {
    super.initState();
    _runSearch('');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _runSearch(String q) async {
    _lastQuery = q;
    setState(() => _loading = true);
    try {
      final hits = await inventoryRepo.searchItems(q);
      if (!mounted || q != _lastQuery) return;
      setState(() => _results = hits);
    } finally {
      if (mounted && q == _lastQuery) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            _SheetHeader(title: 'Pick product', onClose: () => Navigator.of(context).pop()),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _ctrl,
                autofocus: true,
                onChanged: _runSearch,
                style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search by name or SKU',
                  hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
                  prefixIcon: Icon(Icons.search, color: t.muted),
                  filled: true,
                  fillColor: t.bgWarmer,
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_results.isNotEmpty) ...[
              Builder(builder: (_) {
                final counts = bucketCountsFor(_results.map((r) => r.itemClass));
                if (!_userPickedGroup) {
                  final resolved = resolveDefaultClassGroup(_preferredGroup, counts);
                  if (_classGroup != resolved) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) setState(() => _classGroup = resolved);
                    });
                  }
                }
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: InvClassTabs(
                    selected: _classGroup ?? classGroupAll,
                    counts: counts,
                    onChanged: (g) => setState(() {
                      _classGroup = g;
                      _userPickedGroup = true;
                    }),
                  ),
                );
              }),
            ],
            Expanded(
              child: _loading && _results.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(builder: (_) {
                      final active = _classGroup ?? classGroupAll;
                      final shown = active == classGroupAll
                          ? _results
                          : _results
                              .where((r) => classGroupForItemClass(r.itemClass) == active)
                              .toList();
                      if (shown.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              _results.isEmpty
                                  ? 'No items match. Tweak the search or add this item in Masters.'
                                  : 'No items in this group. Try another tab.',
                              textAlign: TextAlign.center,
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                          ),
                        );
                      }
                      return ListView.separated(
                        controller: scrollCtrl,
                        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).viewInsets.bottom),
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => Divider(
                            height: 1, color: t.hairlineSoft, thickness: 0.5),
                        itemBuilder: (_, i) {
                          final r = shown[i];
                          return ListTile(
                            title: Text(r.name,
                                style: RunqText.bodyStrong
                                    .copyWith(color: t.ink, fontSize: 14)),
                            subtitle: Text(
                              [
                                if ((r.sku ?? '').isNotEmpty) r.sku!,
                                if ((r.unit ?? '').isNotEmpty) r.unit!,
                              ].join(' · '),
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                            onTap: () => Navigator.of(context).pop(r),
                          );
                        },
                      );
                    }),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Barcode lookup sheet — the side-option entry point ───────────────────

class _BarcodeLookupSheet extends StatefulWidget {
  const _BarcodeLookupSheet();
  @override
  State<_BarcodeLookupSheet> createState() => _BarcodeLookupSheetState();
}

class _BarcodeLookupSheetState extends State<_BarcodeLookupSheet> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _err;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final code = _ctrl.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() { _busy = true; _err = null; });
    final item = await inventoryRepo.findByBarcode(code);
    if (!mounted) return;
    if (item == null) {
      setState(() { _busy = false; _err = 'No item matched that barcode'; });
      return;
    }
    Navigator.of(context).pop(item);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHeader(title: 'Scan barcode', onClose: () => Navigator.of(context).pop()),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Lbl('Barcode'),
                TextField(
                  controller: _ctrl,
                  autofocus: true,
                  style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                  onSubmitted: (_) => _lookup(),
                  decoration: _dec(context,
                    hint: 'Scan or type barcode',
                    suffix: IconButton(
                      icon: Icon(Icons.qr_code_scanner, color: InvColors.brand(context)),
                      onPressed: _lookup,
                    ),
                  ),
                ),
                if (_err != null) ...[
                  const SizedBox(height: 8),
                  Text(_err!, style: RunqText.caption.copyWith(color: InvColors.error)),
                ],
                const SizedBox(height: 16),
                InvPrimaryButton(
                  label: 'Find product',
                  icon: Icons.search,
                  busy: _busy,
                  onTap: _lookup,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Transfer detail sheet — line items for one transfer ──────────────────

class _TransferDetailSheet extends StatefulWidget {
  const _TransferDetailSheet({required this.transfer});
  final InvTransfer transfer;
  @override
  State<_TransferDetailSheet> createState() => _TransferDetailSheetState();
}

class _TransferDetailSheetState extends State<_TransferDetailSheet> {
  InvTransferDetail? _detail;
  Object? _err;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await inventoryRepo.transferGet(widget.transfer.id);
      if (!mounted) return;
      setState(() { _detail = d; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _err = e; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            _SheetHeader(
              title: widget.transfer.transferNo,
              onClose: () => Navigator.of(context).pop(),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _err != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text('Failed to load: $_err',
                                textAlign: TextAlign.center,
                                style: RunqText.caption.copyWith(color: t.muted)),
                          ),
                        )
                      : _buildBody(scrollCtrl),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ScrollController scrollCtrl) {
    final t = RT(context);
    final d = _detail!;
    final dateStr = (d.createdAt ?? '').isNotEmpty ? d.createdAt!.substring(0, 10) : '';
    return ListView(
      controller: scrollCtrl,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        // Route + status banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(child: _RouteEnd(label: 'FROM', name: d.fromWarehouseName)),
                  _RouteArrow(),
                  Expanded(
                    child: _RouteEnd(
                      label: 'TO',
                      name: d.toWarehouseName,
                      rightAligned: true,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  InvStatusPill(status: d.status),
                  const Spacer(),
                  if (dateStr.isNotEmpty)
                    Text(dateStr, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ],
          ),
        ),
        if ((d.vehicleNo ?? '').isNotEmpty || (d.notes ?? '').isNotEmpty) ...[
          const SizedBox(height: 12),
          if ((d.vehicleNo ?? '').isNotEmpty)
            _MetaRow(icon: Icons.local_shipping_outlined, label: 'Vehicle', value: d.vehicleNo!),
          if ((d.notes ?? '').isNotEmpty)
            _MetaRow(icon: Icons.sticky_note_2_outlined, label: 'Notes', value: d.notes!),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Text('Items', style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
            const SizedBox(width: 6),
            Text('(${d.lines.length})',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        if (d.lines.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: Text('No line items',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
          )
        else
          for (var i = 0; i < d.lines.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _DetailLineCard(line: d.lines[i]),
          ],
      ],
    );
  }
}

class _DetailLineCard extends StatelessWidget {
  const _DetailLineCard({required this.line});
  final InvTransferDetailLine line;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final qtyStr = line.qty == line.qty.truncateToDouble()
        ? line.qty.toInt().toString()
        : line.qty.toStringAsFixed(2);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.inventory_2_outlined, size: 16, color: t.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.itemName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                if ((line.itemSku ?? '').isNotEmpty || (line.batchNo ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    [
                      if ((line.itemSku ?? '').isNotEmpty) line.itemSku!,
                      if ((line.batchNo ?? '').isNotEmpty) 'Batch ${line.batchNo!}',
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(qtyStr,
              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: t.muted),
          const SizedBox(width: 8),
          Text('$label: ',
              style: RunqText.caption.copyWith(color: t.muted)),
          Expanded(
            child: Text(value,
                style: RunqText.caption.copyWith(color: t.ink),
                maxLines: 3, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}
