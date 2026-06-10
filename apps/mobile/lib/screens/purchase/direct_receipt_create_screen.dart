// Full-screen Direct Receipt entry — mirrors web /purchase/direct/new.
// Memo qty entry only (no bill, no JE). Batch + expiry become required when
// the picked item is batch- / expiry-tracked, matching the server's
// validation so expiry-tracked (e.g. dairy) items can actually post.
//
// Parity with web: default warehouse auto-selected, item picker filtered to
// input classes (raw material / packaging), and a batch picker that pools a
// fresh receipt into an existing open batch via one-tap chips.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart' as inv_picker;
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

part 'direct_receipt_create_widgets.dart';

// Direct receipt is for inputs (raw materials, packaging) — milk procurement,
// opening stock, production returns. Filter so the picker doesn't drown in
// finished goods the user can't actually receive this way.
const _inputsClassGroup = 'inputs';

/// Prefill payload for editing an existing direct receipt. The full [item]
/// is resolved by the caller so the form knows the tracking flags up-front.
class DirectReceiptEditArgs {
  final String id;
  final InvItem item;
  final String warehouseId;
  final String receivedAt;
  final double qty;
  final String? batchNo;
  final String? expiryDate;
  final String? sourceLabel;
  final String? vehicleNo;
  final String? lrNo;
  final String? notes;
  const DirectReceiptEditArgs({
    required this.id,
    required this.item,
    required this.warehouseId,
    required this.receivedAt,
    required this.qty,
    this.batchNo,
    this.expiryDate,
    this.sourceLabel,
    this.vehicleNo,
    this.lrNo,
    this.notes,
  });
}

class DirectReceiptCreateScreen extends ConsumerStatefulWidget {
  const DirectReceiptCreateScreen({super.key, this.edit});

  /// When set, the screen edits this receipt in place instead of creating one.
  final DirectReceiptEditArgs? edit;

  @override
  ConsumerState<DirectReceiptCreateScreen> createState() =>
      _DirectReceiptCreateScreenState();
}

class _DirectReceiptCreateScreenState extends ConsumerState<DirectReceiptCreateScreen> {
  String? _warehouseId;
  InvItem? _item;
  bool _autoPickedWarehouse = false;
  final _receivedAt = TextEditingController(text: _todayIso());
  final _qty = TextEditingController();
  final _source = TextEditingController();
  final _batch = TextEditingController();
  final _expiry = TextEditingController();
  final _vehicle = TextEditingController();
  final _lr = TextEditingController();
  final _notes = TextEditingController();
  bool _busy = false;

  static String _todayIso() => DateTime.now().toIso8601String().substring(0, 10);

  bool get _isEdit => widget.edit != null;
  bool get _batchRequired => _item?.trackBatches ?? false;
  bool get _expiryRequired => _item?.trackExpiry ?? false;

  @override
  void initState() {
    super.initState();
    final e = widget.edit;
    if (e == null) return;
    _item = e.item;
    _warehouseId = e.warehouseId;
    _autoPickedWarehouse = true; // don't override the edit-prefilled warehouse
    _receivedAt.text = e.receivedAt;
    _qty.text = _fmtQty(e.qty);
    _batch.text = e.batchNo ?? '';
    _expiry.text = e.expiryDate ?? '';
    _source.text = e.sourceLabel ?? '';
    _vehicle.text = e.vehicleNo ?? '';
    _lr.text = e.lrNo ?? '';
    _notes.text = e.notes ?? '';
  }

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toString();

  @override
  void dispose() {
    for (final c in [
      _receivedAt, _qty, _source, _batch, _expiry, _vehicle, _lr, _notes,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  /// Auto-select the default (or sole) active warehouse once the list loads,
  /// matching web's useAutoSelectWarehouse. Runs once; the user can still
  /// change it. Skips on multi-warehouse tenants with no default.
  void _autoPickWarehouse(List<InvWarehouse> list) {
    if (_warehouseId != null || _autoPickedWarehouse) return;
    final active = list.where((w) => w.isActive).toList();
    InvWarehouse? pick;
    for (final w in active) {
      if (w.isDefault) {
        pick = w;
        break;
      }
    }
    pick ??= active.length == 1 ? active.first : null;
    if (pick == null) return;
    _autoPickedWarehouse = true;
    final id = pick.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _warehouseId = id);
    });
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
    if (picked == null) return;
    setState(() {
      _item = picked;
      if (!picked.trackBatches) _batch.clear();
      if (!picked.trackExpiry) _expiry.clear();
    });
  }

  Future<void> _pickDate(TextEditingController ctl,
      {required DateTime first, required DateTime last}) async {
    var initial = DateTime.tryParse(ctl.text) ?? DateTime.now();
    if (initial.isBefore(first)) initial = first;
    if (initial.isAfter(last)) initial = last;
    final picked = await showDatePicker(
      context: context, initialDate: initial, firstDate: first, lastDate: last,
    );
    if (picked != null) {
      setState(() => ctl.text = picked.toIso8601String().substring(0, 10));
    }
  }

  Future<void> _submit() async {
    final item = _item;
    if (_warehouseId == null || item == null) return _err('Pick warehouse and item');
    if (item.trackSerials) return _err("Serial-tracked items can't be received here");
    final q = double.tryParse(_qty.text.trim());
    if (q == null || q <= 0) return _err('Enter a quantity greater than 0');
    // Rate comes from the item master (defaultPurchasePrice), not the worker.
    // Falls back to 0 when the master rate is unset.
    final r = item.defaultPurchasePrice ?? 0;
    if (_batchRequired && _batch.text.trim().isEmpty) {
      return _err('Batch no is required for this item');
    }
    if (_expiryRequired && _expiry.text.trim().isEmpty) {
      return _err('Expiry date is required for this item');
    }
    setState(() => _busy = true);
    try {
      final edit = widget.edit;
      final res = edit != null
          ? await purchaseRepo.updateDirectReceipt(
              edit.id,
              warehouseId: _warehouseId!,
              inventoryItemId: item.id,
              receivedAt: _receivedAt.text.trim(),
              qty: q,
              unitRate: r,
              sourceLabel: _blankToNull(_source),
              batchNo: _blankToNull(_batch),
              expiryDate: _blankToNull(_expiry),
              vehicleNo: _blankToNull(_vehicle),
              lrNo: _blankToNull(_lr),
              notes: _blankToNull(_notes),
            )
          : await purchaseRepo.createDirectReceipt(
              warehouseId: _warehouseId!,
              inventoryItemId: item.id,
              receivedAt: _receivedAt.text.trim(),
              qty: q,
              unitRate: r,
              sourceLabel: _blankToNull(_source),
              batchNo: _blankToNull(_batch),
              expiryDate: _blankToNull(_expiry),
              vehicleNo: _blankToNull(_vehicle),
              lrNo: _blankToNull(_lr),
              notes: _blankToNull(_notes),
            );
      if (!mounted) return;
      final verb = _isEdit ? 'updated' : 'posted';
      showRunqSnack(context, 'Receipt $verb · GRN ${res.grnNo}', kind: SnackKind.success);
      context.pop(true);
    } catch (e) {
      if (mounted) _err(e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _err(String m) => showRunqSnack(context, m, kind: SnackKind.error);
  String? _blankToNull(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();

  // ── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    ref.watch(invWarehousesProvider).whenData(_autoPickWarehouse);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: Column(
          children: [
            PurPlainAppBar(
              title: _isEdit ? 'Edit direct receipt' : 'New direct receipt',
              onBack: () => context.pop(),
            ),
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                children: [
                  ..._whatSection(t),
                  ..._batchTransportSection(t),
                ],
              ),
            ),
            _submitBar(t),
          ],
        ),
      ),
    );
  }

  List<Widget> _whatSection(RunqTokens t) {
    final item = _item;
    final today = DateTime.now();
    return [
      const _SectionLabel('What and how much'),
      inv_picker.WarehousePicker(
        value: _warehouseId,
        allowAll: false,
        label: 'Warehouse',
        onChanged: (v) => setState(() => _warehouseId = v),
      ),
      const SizedBox(height: 12),
      _TapField(
        icon: Icons.inventory_2_outlined,
        label: 'Item',
        value: item?.name,
        hint: 'Pick input item…',
        onTap: _pickItem,
      ),
      if (item != null && item.trackSerials) ...[
        const SizedBox(height: 8),
        const _InfoBanner(
          text: "Serial-tracked items can't be received here — use a PO receipt.",
        ),
      ],
      const SizedBox(height: 12),
      _TextField(label: 'Qty', controller: _qty, number: true),
      const SizedBox(height: 12),
      _TapField(
        icon: Icons.event_outlined,
        label: 'Received on',
        value: _receivedAt.text,
        onTap: () => _pickDate(_receivedAt, first: DateTime(today.year - 1), last: today),
      ),
    ];
  }

  List<Widget> _batchTransportSection(RunqTokens t) {
    final today = DateTime.now();
    final title = _batchRequired || _expiryRequired
        ? 'Batch + transport'
        : 'Optional batch + transport';
    return [
      const SizedBox(height: 4),
      _SectionLabel(title),
      _BatchField(
        controller: _batch,
        itemId: _item?.id,
        warehouseId: _warehouseId,
        required: _batchRequired,
        itemName: _item?.name ?? 'item',
      ),
      const SizedBox(height: 12),
      _TapField(
        icon: Icons.schedule_outlined,
        label: _expiryRequired ? 'Expiry *' : 'Expiry',
        value: _expiry.text,
        hint: 'Pick expiry date…',
        onTap: () => _pickDate(_expiry,
            first: DateTime(today.year - 1), last: DateTime(today.year + 10)),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _TextField(label: 'Vehicle no', controller: _vehicle, caps: true)),
        const SizedBox(width: 8),
        Expanded(child: _TextField(label: 'LR / docket no', controller: _lr, caps: true)),
      ]),
      const SizedBox(height: 12),
      _TextField(label: 'Source label', controller: _source,
          hint: 'Farmer / shift / plant…', caps: true),
      const SizedBox(height: 12),
      _TextField(label: 'Notes', controller: _notes, hint: 'Optional…', caps: true, lines: 2),
    ];
  }

  Widget _submitBar(RunqTokens t) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: SizedBox(
        width: double.infinity,
        child: PurPrimaryButton(
          label: _isEdit ? 'Save changes' : 'Post receipt',
          icon: Icons.check_rounded,
          loading: _busy,
          onPressed: _busy ? null : _submit,
        ),
      ),
    );
  }
}
