// Take material for production — the first half of a draw.
//
// "40 litres for khoa." That is the whole transaction: the material leaves the
// pool now, and what it became gets recorded hours later on the yield screen.
// Until this existed the floor posted the first half as a bare inventory
// adjustment — three of them account for 63.4 litres on one consignment, with
// no output, no yield, and nothing tying the milk to the khoa it became.
//
// Milk is the daily case, but nothing here is about milk: the pool is every
// raw material and packaging item in stock, so a drum of coconut oil drawn for
// a repack takes the same two screens.
//
// Batches are chosen, never allocated. The operator is standing at the tank
// and can see which can they are pouring from; FEFO-picking for them and being
// wrong writes the wrong consignment into the trail. Lots are ordered
// soonest-expiry-first so the FEFO choice is the one under their thumb, and
// nothing is prefilled.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/inventory_models.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart';
import '_record_production_form_cards.dart' show RecordProductionPickerTile;
import '_record_production_pool_row.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_item_picker.dart';
import 'widgets/mfg_primitives.dart';

class DrawTakeScreen extends ConsumerStatefulWidget {
  const DrawTakeScreen({super.key, this.inputItemId, this.drawId});

  /// The material the sheet was opened from, preselected. Null when the screen
  /// is reached cold from the menu.
  final String? inputItemId;

  /// Set when topping up a draw that is already open — the product is already
  /// decided, so only the pool is shown.
  final String? drawId;

  @override
  ConsumerState<DrawTakeScreen> createState() => _DrawTakeScreenState();
}

class _DrawTakeScreenState extends ConsumerState<DrawTakeScreen> {
  String? _inputItemId;
  MfgItemRow? _product;
  String? _warehouseId;
  bool _busy = false;

  /// Litres typed against each lot, keyed `itemId|batchNo`.
  final _qtyCtls = <String, TextEditingController>{};

  bool get _isTopUp => widget.drawId != null;

  @override
  void initState() {
    super.initState();
    _inputItemId = widget.inputItemId;
    _applyDefaultWarehouse();
  }

  /// Most plants run everything out of one warehouse, so making the operator
  /// pick it every time is a tap that can only be got wrong. Falls back to the
  /// sole warehouse when none is flagged default. Mirrors
  /// record_production_screen and wo_create_screen.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(mfgWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => _warehouseId = pick.id);
  }

  @override
  void dispose() {
    for (final c in _qtyCtls.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _ctl(String key) =>
      _qtyCtls.putIfAbsent(key, () => TextEditingController());

  static String _key(InvOnHandRow r) => '${r.itemId}|${r.batchNo}';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = ref
            .watch(mfgStockProvider((warehouseId: null, itemClassGroup: 'inputs')))
            .asData
            ?.value ??
        const <InvOnHandRow>[];

    // Only what the chosen material has on hand, soonest-expiry first — the
    // draw-next order, offered rather than imposed.
    final lots = rows.where((r) => r.itemId == _inputItemId && r.qty > 0).toList()
      ..sort(_byExpiry);
    final total = _typedTotal(lots);
    final uom = lots.isNotEmpty ? (lots.first.itemUnit ?? '') : '';

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          MfgPlainAppBar(
              title: _isTopUp ? 'Take more' : 'Take for production'),
          Expanded(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 140),
              children: [
                if (!_isTopUp) ...[
                  _whatForCard(t),
                  const SizedBox(height: 12),
                ],
                _materialCard(t, rows),
                const SizedBox(height: 12),
                if (_inputItemId == null)
                  MfgEmptyState(
                    icon: Icons.inventory_2_outlined,
                    title: 'Pick a material',
                    description: 'Choose what you are taking, and its lots appear here.',
                  )
                else if (lots.isEmpty)
                  MfgEmptyState(
                    icon: Icons.inventory_2_outlined,
                    title: 'Nothing on hand',
                    description: 'There is none of this in stock to take.',
                  )
                else
                  _poolCard(t, lots, uom),
              ],
            ),
          ),
          _bottomBar(t, total, uom, lots),
        ]),
      ),
    );
  }

  /// The chosen product's unit, falling back to its GST pack unit.
  ///
  /// `items.unit` is nullable, so a finished good can arrive without one. The
  /// line below used to print it unguarded, which turned a missing unit into
  /// "Measured in " — a dangling label that reads as a bug rather than as an
  /// item nobody has set a unit on.
  String get _productUnit {
    final p = _product;
    if (p == null) return '';
    return p.uom.isNotEmpty ? p.uom : (p.packSizeUqc ?? '');
  }

  /// What the material is for. Known at draw time, always — it is what the
  /// yield screen creates when the batch is done.
  Widget _whatForCard(RunqTokens t) => MfgCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('What is it for', style: RunqText.label),
          const SizedBox(height: 10),
          RecordProductionPickerTile(
            label: 'Product',
            value: _product?.name,
            onTap: _pickProduct,
          ),
          if (_productUnit.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Measured in $_productUnit',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 12),
          WarehousePicker(
            value: _warehouseId,
            onChanged: (v) => setState(() => _warehouseId = v),
            label: 'Warehouse',
            allowAll: false,
            dense: true,
          ),
        ]),
      );

  Widget _materialCard(RunqTokens t, List<InvOnHandRow> rows) {
    final name = rows.firstWhere(
      (r) => r.itemId == _inputItemId,
      orElse: () => rows.isEmpty ? _noRow : rows.first,
    );
    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('What are you taking', style: RunqText.label),
        const SizedBox(height: 10),
        RecordProductionPickerTile(
          label: 'Material',
          value: _inputItemId == null ? null : name.itemName,
          onTap: () => _pickMaterial(rows),
        ),
      ]),
    );
  }

  /// Every lot on hand with a box against it. No FEFO, no prefill — see the
  /// file header.
  Widget _poolCard(RunqTokens t, List<InvOnHandRow> lots, String uom) => MfgCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Which lots', style: RunqText.label)),
            Text('soonest expiry first',
                style: RunqText.micro.copyWith(color: t.muted2)),
          ]),
          const SizedBox(height: 10),
          for (final lot in lots)
            PoolBatchRow(
              batch: _asPoolBatch(lot),
              uom: uom,
              // No recipe means nothing is "needed" — tapping fills the whole
              // can, which is the common case at a tank.
              stillNeeded: lot.qty,
              showItem: false,
              controller: _ctl(_key(lot)),
              onChanged: () => setState(() {}),
            ),
        ]),
      );

  Widget _bottomBar(RunqTokens t, double total, String uom, List<InvOnHandRow> lots) {
    final ready = total > 0 && (_isTopUp || (_product != null && _warehouseId != null));
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Text('Taking', style: RunqText.caption.copyWith(color: t.muted)),
          const Spacer(),
          Text(
            total <= 0
                ? '—'
                : '${_trim(total)}${uom.isEmpty ? '' : ' $uom'} '
                    'from ${_filledCount(lots)} lot${_filledCount(lots) == 1 ? '' : 's'}',
            style: RunqText.bodyStrong.copyWith(color: MfgColors.brand(context)),
          ),
        ]),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: MfgPrimaryButton(
            label: _isTopUp ? 'Add to draw' : 'Take for production',
            icon: Icons.outbox_outlined,
            loading: _busy,
            onPressed: ready ? () => _submit(lots) : null,
          ),
        ),
      ]),
    );
  }

  // ── actions ─────────────────────────────────────────────────────────────

  Future<void> _pickProduct() async {
    final picked = await showMfgItemPicker(
      context,
      title: 'What is it for?',
      // finished_good + semi_finished: khoa is the former, "Paneer -
      // unpacked" the latter, and both are things a material is drawn for.
      itemClassGroup: 'finished',
    );
    if (picked != null) setState(() => _product = picked);
  }

  Future<void> _pickMaterial(List<InvOnHandRow> rows) async {
    // Picked from what is actually in stock rather than the item master: a
    // material with nothing on hand cannot be drawn, and offering it only
    // produces an empty pool and a puzzled operator.
    final byItem = <String, InvOnHandRow>{};
    for (final r in rows.where((r) => r.qty > 0)) {
      byItem.putIfAbsent(r.itemId, () => r);
    }
    final choices = byItem.values.toList()
      ..sort((a, b) => a.itemName.compareTo(b.itemName));
    if (!mounted) return;
    final picked = await showModalBottomSheet<InvOnHandRow>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _MaterialSheet(rows: choices),
    );
    if (picked != null) {
      setState(() {
        _inputItemId = picked.itemId;
        _qtyCtls.clear();
      });
    }
  }

  Future<void> _submit(List<InvOnHandRow> lots) async {
    final lines = <DrawLineInput>[];
    for (final lot in lots) {
      final qty = double.tryParse(_ctl(_key(lot)).text.trim()) ?? 0;
      if (qty <= 0) continue;
      if (qty > lot.qty + 0.0005) {
        showRunqSnack(
          context,
          'Lot ${lot.batchNo} has only ${_trim(lot.qty)} ${lot.itemUnit ?? ''}'.trim(),
          kind: SnackKind.error,
        );
        return;
      }
      lines.add(DrawLineInput(
        inputItemId: lot.itemId,
        batchNo: lot.batchNo.isEmpty ? null : lot.batchNo,
        qty: qty,
        uom: lot.itemUnit ?? '',
      ));
    }
    if (lines.isEmpty) return;

    setState(() => _busy = true);
    try {
      final draw = _isTopUp
          ? await manufacturingRepo.takeMore(widget.drawId!, lines)
          : await manufacturingRepo.openDraw(
              outputItemId: _product!.id,
              warehouseId: _warehouseId!,
              lines: lines,
            );
      ref.invalidate(openDrawsProvider);
      ref.invalidate(mfgStockProvider((warehouseId: null, itemClassGroup: 'inputs')));
      if (!mounted) return;
      showRunqSnack(
        context,
        '${_trim(draw.drawnQty)} ${draw.drawnUom} out for ${draw.outputItemName}',
        kind: SnackKind.success,
      );
      context.pop(true);
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  double _typedTotal(List<InvOnHandRow> lots) => lots.fold<double>(
        0,
        (s, l) => s + (double.tryParse(_ctl(_key(l)).text.trim()) ?? 0),
      );

  int _filledCount(List<InvOnHandRow> lots) => lots
      .where((l) => (double.tryParse(_ctl(_key(l)).text.trim()) ?? 0) > 0)
      .length;

  static InputPoolBatch _asPoolBatch(InvOnHandRow r) => InputPoolBatch(
        itemId: r.itemId,
        itemName: r.itemName,
        batchNo: r.batchNo.isEmpty ? null : r.batchNo,
        qty: r.qty,
        unitCost: r.avgCost,
        expiryDate: r.expiryDate,
        origin: r.origin,
      );

  /// Soonest expiry first, undated last — the order a lot should be drawn in,
  /// shown as a suggestion rather than applied as an allocation.
  static int _byExpiry(InvOnHandRow a, InvOnHandRow b) {
    if (a.expiryDate != b.expiryDate) {
      if (a.expiryDate == null) return 1;
      if (b.expiryDate == null) return -1;
      return a.expiryDate!.compareTo(b.expiryDate!);
    }
    return (a.receivedAt ?? '').compareTo(b.receivedAt ?? '');
  }

  static String _trim(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
}

/// Stand-in when the pool is empty — the material card still has to render.
final _noRow = InvOnHandRow(
  itemId: '',
  itemName: '',
  warehouseId: '',
  warehouseName: '',
  batchNo: '',
  qty: 0,
  avgCost: 0,
  value: 0,
);

/// Materials that actually have stock behind them.
class _MaterialSheet extends StatelessWidget {
  const _MaterialSheet({required this.rows});
  final List<InvOnHandRow> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('What are you taking?',
                  style: RunqText.h3.copyWith(color: t.ink)),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final r in rows)
                  ListTile(
                    title: Text(r.itemName, style: RunqText.body.copyWith(color: t.ink)),
                    trailing: Icon(Icons.chevron_right_rounded, color: t.muted2),
                    onTap: () => Navigator.of(context).pop(r),
                  ),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}
