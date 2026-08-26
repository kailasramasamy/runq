// Adjust Stock — correct an item's on-hand quantity straight from the item
// detail screen, without walking the full Adjustments flow.
//
// The user picks a stock location (warehouse + batch, taken from the rows
// already on screen), says whether the number they type is being added,
// removed, or is the new total, and the screen books the difference as a
// one-line adjustment: create + post in a single tap, exactly what
// inventory_adjustment_screen.dart does for a multi-line draft. Reason
// defaults by direction and stays editable, so the GL lands where it should.
//
// A full screen rather than a bottom sheet: location, mode, quantity, reason
// and a confirm button leave nothing for the keyboard to sit on.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'inventory_adjustment_common.dart';
import 'widgets/adjust_stock_widgets.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';

/// Opens the editor. Returns true when stock was adjusted.
Future<bool> openAdjustStock(
  BuildContext context, {
  required InvItemDetail item,
  required List<InvItemStockRow> stock,
}) async {
  final done = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      builder: (_) => InventoryAdjustStockScreen(item: item, stock: stock),
    ),
  );
  return done == true;
}

class InventoryAdjustStockScreen extends ConsumerStatefulWidget {
  const InventoryAdjustStockScreen({
    super.key,
    required this.item,
    required this.stock,
  });
  final InvItemDetail item;
  final List<InvItemStockRow> stock;
  @override
  ConsumerState<InventoryAdjustStockScreen> createState() =>
      _InventoryAdjustStockScreenState();
}

class _InventoryAdjustStockScreenState
    extends ConsumerState<InventoryAdjustStockScreen> {
  final _qty = TextEditingController();
  final _batch = TextEditingController();

  /// Stock is held per (warehouse, batch), so a batch-tracked item shows one
  /// row per lot in the same warehouse — that is the granularity an
  /// adjustment posts at. Emptied lots are dropped: they are history, not
  /// somewhere anyone is counting stock. Biggest holding first.
  late final List<InvItemStockRow> _rows = _liveRows();

  List<InvItemStockRow> _liveRows() {
    final live = widget.stock.where((r) => r.qty > 0).toList();
    final rows = live.isEmpty ? [...widget.stock] : live;
    rows.sort((a, b) => b.qty.compareTo(a.qty));
    return rows;
  }

  /// Selected stock row, or null when adjusting a location the item isn't
  /// held in yet.
  InvItemStockRow? _row;
  String? _warehouseId;
  String? _reason;
  AdjustMode _mode = AdjustMode.add;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (_rows.isNotEmpty) {
      _select(_rows.first);
    } else {
      _applyDefaultWarehouse();
    }
  }

  /// Most plants run one warehouse, so picking it every time is a tap that
  /// can only be got wrong. Falls back to the sole warehouse when none is
  /// flagged default. Mirrors inventory_adjustment_screen.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final active = whs.where((w) => w.isActive).toList();
    if (active.isEmpty) return;
    final pick = active.firstWhere((w) => w.isDefault, orElse: () => active.first);
    setState(() => _warehouseId = pick.id);
  }

  @override
  void dispose() {
    _qty.dispose();
    _batch.dispose();
    super.dispose();
  }

  void _select(InvItemStockRow? row) {
    setState(() {
      _row = row;
      _warehouseId = row?.warehouseId;
      _qty.clear();
      _reason = null;
      // Nothing is on hand at a fresh location, so "remove" and "set to"
      // have nothing to act on — only stock arriving makes sense there.
      if (row == null) _mode = AdjustMode.add;
    });
    if (row == null) _applyDefaultWarehouse();
  }

  void _setMode(AdjustMode m) {
    setState(() {
      _mode = m;
      // Set-to opens on the current figure so the user edits a number rather
      // than recalling it; the delta modes are typed from scratch.
      _qty.text = m == AdjustMode.setTo ? invFmtQty(_currentQty) : '';
      _reason = null;
    });
  }

  double get _currentQty => _row?.qty ?? 0;
  double? get _entered => double.tryParse(_qty.text.trim());
  double? get _delta {
    final n = _entered;
    if (n == null || n < 0) return null;
    return switch (_mode) {
      AdjustMode.add => n,
      AdjustMode.remove => -n,
      AdjustMode.setTo => n - _currentQty,
    };
  }

  double get _resultQty => _currentQty + (_delta ?? 0);
  bool get _isOutbound => (_delta ?? 0) < 0;
  String get _unit => widget.item.unit ?? '';

  /// A picked reason only survives while it fits the direction — flipping
  /// from a shortfall to a surplus must not post "damage" inbound.
  String get _effectiveReason {
    final allowed = _isOutbound ? invOutboundReasonOrder : invInboundReasonOrder;
    if (_reason != null && allowed.contains(_reason)) return _reason!;
    if (_row == null && !_isOutbound) return 'opening_balance';
    return invDefaultReason(_isOutbound);
  }

  /// Batch-tracked stock needs a lot to post against. Existing rows carry
  /// theirs; a fresh location gets the house-convention suggestion.
  String? get _batchNo {
    if (_row != null) return _row!.batchNo.isEmpty ? null : _row!.batchNo;
    if (!widget.item.trackBatches) return null;
    final typed = _batch.text.trim();
    return typed.isEmpty ? null : typed;
  }

  bool get _canSave {
    final d = _delta;
    if (d == null || d == 0 || _resultQty < 0) return false;
    if (_warehouseId == null) return false;
    if (_row == null && widget.item.trackBatches && _batchNo == null) return false;
    return !_saving;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    final result = _resultQty;
    final adj = await _post();
    if (!mounted) return;
    setState(() => _saving = false);
    if (adj == null) return;
    invalidateStockViews(ref);
    ref.invalidate(invItemDetailProvider(widget.item.id));
    ref.invalidate(invItemStockProvider(widget.item.id));
    ref.invalidate(invAdjustmentListProvider(null));
    Navigator.of(context).pop(true);
    RunqSnack.success(
      context,
      '${adj.adjNo} posted — on hand now ${invFmtQty(result)} $_unit'.trim(),
    );
  }

  /// Create + post as one action. A rejected post would otherwise leave an
  /// unpostable draft behind, so it is cancelled the way the adjustment
  /// screen does.
  Future<InvAdjustment?> _post() async {
    InvAdjustment? created;
    try {
      created = await inventoryRepo.createAdjustment(
        warehouseId: _warehouseId!,
        reason: _effectiveReason,
        adjustmentDate: DateTime.now().toIso8601String().substring(0, 10),
        notes: 'Adjusted from item detail',
        lines: [
          InvAdjustmentLineInput(
            itemId: widget.item.id,
            batchNo: _batchNo,
            qtyDelta: _delta!,
          ),
        ],
      );
      await inventoryRepo.postAdjustment(created.id);
      return created;
    } catch (e) {
      final draft = created;
      if (draft != null) {
        await inventoryRepo
            .cancelAdjustment(draft.id, 'Auto-cancelled — posting failed')
            .catchError((_) => draft);
      }
      if (mounted) {
        RunqSnack.error(context, "Couldn't adjust stock", description: snackErrorText(e));
      }
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Adjust Stock',
        onBack: () => Navigator.of(context).pop(),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          _itemHeader(t),
          const SizedBox(height: 18),
          const InvFieldLabel('Location'),
          ..._locationSection(),
          const SizedBox(height: 18),
          const InvFieldLabel('What is this quantity?'),
          AdjustModeToggle(mode: _mode, onChanged: _setMode),
          const SizedBox(height: 14),
          _qtyField(t),
          const SizedBox(height: 10),
          _previewCard(t),
          const SizedBox(height: 18),
          const InvFieldLabel('Reason'),
          AdjustReasonChips(
            isOutbound: _isOutbound,
            value: _effectiveReason,
            onChanged: (r) => setState(() => _reason = r),
          ),
        ],
      ),
      bottomNavigationBar: _bottomBar(t),
    );
  }

  Widget _itemHeader(RunqTokens t) => InvCard(
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.item.name,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if ((widget.item.sku ?? '').isNotEmpty)
                Text(
                  widget.item.sku!,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        InvQtyText(
          qty: invFmtQty(_currentQty),
          unit: widget.item.unit,
          style: RunqText.h4.copyWith(color: t.ink),
        ),
      ],
    ),
  );

  List<Widget> _locationSection() {
    return [
      // With no stock anywhere there is nothing to choose between, so the
      // dropdown would offer a single "somewhere else" row above the picker
      // that actually does the work. Go straight to the picker.
      if (_rows.isNotEmpty)
        AdjustLocationField(
          rows: _rows,
          selected: _row,
          unit: widget.item.unit,
          newLocationLabel: widget.item.trackBatches
              ? 'Another warehouse or batch'
              : 'Another warehouse',
          onChanged: _select,
        ),
      if (_row == null) ...[
        if (_rows.isNotEmpty) const SizedBox(height: 10),
        WarehousePicker(
          value: _warehouseId,
          allowAll: false,
          dense: true,
          onChanged: (id) => setState(() => _warehouseId = id),
        ),
        if (widget.item.trackBatches) ...[
          const SizedBox(height: 10),
          TextField(
            controller: _batch,
            textCapitalization: TextCapitalization.characters,
            style: RunqText.body.copyWith(color: RT(context).ink),
            cursorColor: InvColors.brand(context),
            decoration: invInputDecoration(
              context,
              hint: invSuggestBatchNo(
                sku: widget.item.sku,
                itemName: widget.item.name,
                on: DateTime.now(),
              ),
            ),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ],
    ];
  }

  Widget _qtyField(RunqTokens t) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      InvFieldLabel(_mode.fieldLabel),
      TextField(
        controller: _qty,
        autofocus: _rows.isNotEmpty,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: RunqText.h4.copyWith(color: t.ink),
        cursorColor: InvColors.brand(context),
        decoration: invInputDecoration(
          context,
          hint: '0',
          suffix: _unit.isEmpty
              ? null
              : Padding(
                  padding: const EdgeInsets.only(right: 12, top: 12),
                  child: Text(
                    _unit,
                    style: RunqText.caption.copyWith(color: t.muted2),
                  ),
                ),
        ),
        onChanged: (_) => setState(() {}),
      ),
    ],
  );

  /// The whole point of the screen: spell out the before → after, so a typo
  /// or a wrong mode is caught before it hits the ledger.
  Widget _previewCard(RunqTokens t) {
    final d = _delta;
    if (d == null || d == 0) {
      return Text(
        '${invFmtQty(_currentQty)} $_unit on hand right now'.trim(),
        style: RunqText.caption.copyWith(color: t.muted2),
      );
    }
    if (_resultQty < 0) {
      return Text(
        "Can't remove more than the ${invFmtQty(_currentQty)} $_unit on hand".trim(),
        style: RunqText.caption.copyWith(color: InvColors.error),
      );
    }
    final color = d < 0 ? InvColors.error : InvColors.success;
    return Row(
      children: [
        Icon(d < 0 ? Icons.south_rounded : Icons.north_rounded, size: 15, color: color),
        const SizedBox(width: 6),
        Text(
          '${d < 0 ? 'Removing' : 'Adding'} ${invFmtQty(d.abs())} $_unit'.trim(),
          style: RunqText.bodyStrong.copyWith(color: color),
        ),
        const Spacer(),
        Text(
          '${invFmtQty(_currentQty)} → ${invFmtQty(_resultQty)} $_unit'.trim(),
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      ],
    );
  }

  Widget _bottomBar(RunqTokens t) => Container(
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
    decoration: BoxDecoration(
      color: t.surface,
      border: Border(top: BorderSide(color: t.hairline)),
    ),
    child: SafeArea(
      top: false,
      child: SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: _canSave ? _save : null,
          style: FilledButton.styleFrom(
            backgroundColor: InvColors.brand(context),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(_buttonLabel(), style: RunqText.bodyStrong.copyWith(color: Colors.white)),
        ),
      ),
    ),
  );

  /// The button repeats the action in words — the last chance to notice the
  /// number is going the wrong way.
  String _buttonLabel() {
    final d = _delta;
    if (d == null || d == 0) return 'Post adjustment';
    return d < 0
        ? 'Remove ${invFmtQty(d.abs())} $_unit'.trim()
        : 'Add ${invFmtQty(d)} $_unit'.trim();
  }
}
