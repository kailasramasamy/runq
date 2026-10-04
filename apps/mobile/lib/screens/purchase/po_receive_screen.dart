import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../providers/po_receive_providers.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart' as inv_picker;
import '../../api/inventory_models.dart' show InvWarehouse;
import '../../providers/inventory_providers.dart';
import 'po_receive_extras.dart';
import 'widgets/po_form_widgets.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// PP catalog-receive — pulls the receive-template for a PO and lets the
/// operator confirm qty/batch/expiry per open line. Uses the same form
/// primitives as the create + edit screens so the three feel like one
/// continuous flow.
class PurchaseOrderReceiveScreen extends ConsumerStatefulWidget {
  final String poId;
  const PurchaseOrderReceiveScreen({super.key, required this.poId});

  @override
  ConsumerState<PurchaseOrderReceiveScreen> createState() => _PurchaseOrderReceiveScreenState();
}

class _PurchaseOrderReceiveScreenState extends ConsumerState<PurchaseOrderReceiveScreen> {
  String? _warehouseId;
  DateTime _receivedDate = DateTime.now();
  final _vehicleCtl = TextEditingController();
  final _lrCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  final Map<String, _RowState> _rows = {};
  /// Items the vendor added on the spot — received as new PO lines.
  final List<ReceiveTemplateLine> _extras = [];
  bool _busy = false;
  bool _seeded = false;

  @override
  void dispose() {
    _vehicleCtl.dispose();
    _lrCtl.dispose();
    _notesCtl.dispose();
    for (final r in _rows.values) {
      r.dispose();
    }
    super.dispose();
  }

  void _seedRows(ReceiveTemplate tpl) {
    if (_seeded) return;
    for (final l in tpl.lines) {
      _rows[l.poLineId] = _RowState.fromTemplate(l);
    }
    _warehouseId ??= tpl.warehouseId;
    _seeded = true;
  }

  /// Pre-select a warehouse — the PO's own, else the tenant default (else the
  /// only one) — so a routine receipt needs no picking.
  void _defaultWarehouse(List<InvWarehouse>? all) {
    if (_warehouseId != null || all == null || all.isEmpty) return;
    _warehouseId = (all.where((w) => w.isDefault).firstOrNull ?? all.first).id;
  }

  Future<void> _addExtra(ReceiveTemplate tpl) async {
    final line = await pickExtraItem(
      context,
      vendorId: tpl.vendorId,
      nextLineNo: tpl.lines.length + _extras.length + 1,
      taken: _rows.keys.toSet(),
    );
    if (line == null || !mounted) return;
    setState(() {
      _extras.add(line);
      _rows[line.poLineId] = _RowState.fromTemplate(line)..qty.text = '1';
    });
  }

  void _removeExtra(ReceiveTemplateLine line) => setState(() {
        _extras.remove(line);
        _rows.remove(line.poLineId)?.dispose();
      });

  Future<void> _pickReceivedDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _receivedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: PurColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _receivedDate = picked);
  }

  double get _totalValue {
    var t = 0.0;
    for (final r in _rows.values) {
      final qty = double.tryParse(r.qty.text) ?? 0;
      t += qty * (double.tryParse(r.rate.text) ?? 0);
    }
    return t;
  }

  /// Rates on every item being received → bill now (no invoice will come);
  /// on none → receipt only (the invoice becomes the bill later).
  _Pricing get _pricing {
    final receiving = _rows.values.where((r) => (double.tryParse(r.qty.text) ?? 0) > 0).toList();
    final priced = receiving.where((r) => (double.tryParse(r.rate.text) ?? 0) > 0).length;
    if (priced == 0) return _Pricing.none;
    return priced == receiving.length ? _Pricing.all : _Pricing.mixed;
  }

  bool _canSubmit() {
    if (_warehouseId == null) return false;
    return _rows.values.any((r) => (double.tryParse(r.qty.text) ?? 0) > 0);
  }

  Future<void> _submit() async {
    if (_busy) return;
    if (_warehouseId == null) {
      showRunqSnack(context, 'Pick a warehouse', kind: SnackKind.error);
      return;
    }
    final lines = <Map<String, dynamic>>[];
    final extras = <Map<String, dynamic>>[];
    for (final r in _rows.values) {
      final qty = double.tryParse(r.qty.text) ?? 0;
      // A free-text PO line has no catalog row yet — the server links one.
      if (qty <= 0) continue;
      final rate = double.tryParse(r.rate.text) ?? 0;
      final serials = r.serials.text
          .split(RegExp(r'\r?\n'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      (isExtraKey(r.poLineId) ? extras : lines).add({
        if (!isExtraKey(r.poLineId)) 'poLineId': r.poLineId,
        if (r.catalogItemId != null) 'catalogItemId': r.catalogItemId,
        'qty': qty,
        if (rate > 0) 'unitCost': rate,
        if (r.batch.text.trim().isNotEmpty) 'batchNo': r.batch.text.trim(),
        if (r.expiry.text.trim().isNotEmpty) 'expiryDate': r.expiry.text.trim(),
        if (serials.isNotEmpty) 'serialNos': serials,
      });
    }
    if (lines.isEmpty && extras.isEmpty) {
      showRunqSnack(context, 'Every row needs qty > 0', kind: SnackKind.error);
      return;
    }
    final pricing = _pricing;
    if (pricing == _Pricing.mixed) {
      showRunqSnack(context,
          'Enter a rate for every item to bill now — or clear all rates to receive only',
          kind: SnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await purchaseRepo.receive(
        widget.poId,
        warehouseId: _warehouseId!,
        receivedDate: _isoDate(_receivedDate),
        vehicleNo: _vehicleCtl.text.trim().isEmpty ? null : _vehicleCtl.text.trim(),
        lrNo: _lrCtl.text.trim().isEmpty ? null : _lrCtl.text.trim(),
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
        lines: lines,
        extraItems: extras,
        createBill: pricing == _Pricing.all,
      );
      ref.invalidate(purchaseOrderDetailProvider(widget.poId));
      ref.invalidate(purchaseOrderListProvider);
      ref.invalidate(poReceiveTemplateProvider(widget.poId));
      if (!mounted) return;
      showRunqSnack(
        context,
        res.billNumber == null ? 'GRN ${res.grnNo} posted' : 'GRN ${res.grnNo} posted · bill ${res.billNumber} created',
        kind: SnackKind.success,
      );
      context.pop();
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tplAsync = ref.watch(poReceiveTemplateProvider(widget.poId));
    _defaultWarehouse(ref.watch(invWarehousesProvider).value);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: tplAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Failed to load: $e', style: RunqText.body)),
          data: (tpl) {
            _seedRows(tpl);
            if (tpl.lines.isEmpty) {
              return Column(
                children: [
                  PurPlainAppBar(title: 'Receive ${tpl.poNumber}'),
                  Expanded(
                    child: PurEmptyState(
                      icon: Icons.local_shipping_outlined,
                      title: 'Nothing left to receive',
                      description: 'All PO lines have been fully received.',
                    ),
                  ),
                ],
              );
            }
            return Column(
              children: [
                PurPlainAppBar(title: 'Receive ${tpl.poNumber}'),
                Expanded(
                  child: ListView(
                    physics: const BouncingScrollPhysics(),
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [
                      _InvoiceAttachCard(
                        onAttach: () => context.push('/purchase/pos/${widget.poId}/scan-receive'),
                      ),
                      const SizedBox(height: 12),
                      _ReceiptInfoSection(
                        warehouseId: _warehouseId,
                        onWarehouse: (v) => setState(() => _warehouseId = v),
                        receivedDate: _receivedDate,
                        onPickDate: _pickReceivedDate,
                        vehicleCtl: _vehicleCtl,
                        lrCtl: _lrCtl,
                        onChange: () => setState(() {}),
                      ),
                      const SizedBox(height: 16),
                      _ItemsHeader(count: tpl.lines.length),
                      const SizedBox(height: 8),
                      for (final (i, line) in [...tpl.lines, ..._extras].indexed)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ReceiveLineCard(
                            index: i + 1,
                            line: line,
                            row: _rows[line.poLineId]!,
                            onChange: () => setState(() {}),
                            onRemove: isExtraKey(line.poLineId) ? () => _removeExtra(line) : null,
                          ),
                        ),
                      AddExtraItemButton(onTap: () => _addExtra(tpl)),
                      const SizedBox(height: 12),
                      PoNotesCard(controller: _notesCtl),
                      const SizedBox(height: 12),
                      ReceiveBillingNote(
                        billing: _pricing == _Pricing.all,
                        mixed: _pricing == _Pricing.mixed,
                        total: _totalValue,
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
                PoStickyBar(
                  total: _totalValue,
                  busy: _busy,
                  enabled: _canSubmit() && !_busy,
                  onCancel: _busy ? null : () => context.pop(),
                  onSave: _submit,
                  saveLabel: 'Post receipt',
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);

String _qtyText(num v) {
  final d = v.toDouble();
  if (d == d.truncateToDouble()) return d.toStringAsFixed(0);
  return d.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

// ── Receipt info section ──────────────────────────────────────────────────

class _ReceiptInfoSection extends StatelessWidget {
  final String? warehouseId;
  final ValueChanged<String?> onWarehouse;
  final DateTime receivedDate;
  final VoidCallback onPickDate;
  final TextEditingController vehicleCtl;
  final TextEditingController lrCtl;
  final VoidCallback onChange;
  const _ReceiptInfoSection({
    required this.warehouseId,
    required this.onWarehouse,
    required this.receivedDate,
    required this.onPickDate,
    required this.vehicleCtl,
    required this.lrCtl,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('RECEIPT INFO',
              style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
          const SizedBox(height: 10),
          inv_picker.WarehousePicker(
            value: warehouseId,
            allowAll: false,
            label: 'Warehouse',
            onChanged: onWarehouse,
          ),
          const SizedBox(height: 10),
          PoDateChip(
            label: 'Received date',
            icon: Icons.event_rounded,
            value: prettyShortDate(_isoDate(receivedDate)),
            onTap: onPickDate,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: PoLabelledField(
                  label: 'Vehicle no',
                  controller: vehicleCtl,
                  hint: 'Optional',
                  onChanged: onChange,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PoLabelledField(
                  label: 'LR / docket',
                  controller: lrCtl,
                  hint: 'Optional',
                  onChanged: onChange,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Items header ──────────────────────────────────────────────────────────

class _ItemsHeader extends StatelessWidget {
  final int count;
  const _ItemsHeader({required this.count});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 0),
      child: Row(
        children: [
          Text('ITEMS RECEIVED',
              style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
            decoration: BoxDecoration(
              color: PurColors.violetSubtle,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('$count',
                style: RunqText.micro.copyWith(
                    color: PurColors.brand(context), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ── Receive line card ─────────────────────────────────────────────────────

class _ReceiveLineCard extends StatefulWidget {
  final int index;
  final ReceiveTemplateLine line;
  final _RowState row;
  final VoidCallback onChange;
  /// Set for an item added at receipt (not on the PO) — shows a remove action.
  final VoidCallback? onRemove;
  const _ReceiveLineCard({
    required this.index,
    required this.line,
    required this.row,
    required this.onChange,
    this.onRemove,
  });

  @override
  State<_ReceiveLineCard> createState() => _ReceiveLineCardState();
}

class _ReceiveLineCardState extends State<_ReceiveLineCard> {
  bool _trackingOpen = false;

  Future<void> _pickExpiry() async {
    final current = DateTime.tryParse(widget.row.expiry.text);
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: PurColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      widget.row.expiry.text = _isoDate(picked);
      widget.onChange();
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    final l = widget.line;
    final r = widget.row;
    final tracked = r.stockTracked;
    final extra = widget.onRemove != null;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6, offset: const Offset(0, 1)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 24, height: 24,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${widget.index}',
                    style: RunqText.micro.copyWith(
                        color: brand, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(l.description,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
              if (extra)
                InkWell(
                  onTap: widget.onRemove,
                  child: Icon(Icons.close_rounded, size: 18, color: t.muted),
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (extra) ...[
            const _MetaPill(label: 'Added now — joins the PO on receipt', icon: Icons.add_circle_outline_rounded),
            const SizedBox(height: 10),
          ],
          Row(
            children: [
              Expanded(
                child: PoLabelledField(
                  label: 'Receive qty',
                  controller: r.qty,
                  isNumber: true,
                  hint: '0',
                  onChanged: () {
                    widget.onChange();
                    setState(() {});
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PoLabelledField(
                  label: 'Rate',
                  controller: r.rate,
                  isNumber: true,
                  hint: '0.00',
                  onChanged: () {
                    widget.onChange();
                    setState(() {});
                  },
                ),
              ),
            ],
          ),
          if ((l.hsnSacCode ?? '').isNotEmpty || !tracked) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6, runSpacing: 6,
              children: [
                if ((l.hsnSacCode ?? '').isNotEmpty)
                  _MetaPill(label: 'HSN ${l.hsnSacCode}'),
                if (!tracked)
                  _MetaPill(
                    label: 'Not stock-tracked',
                    icon: Icons.layers_clear_outlined,
                  ),
              ],
            ),
          ],
          if (tracked) ...[
            const SizedBox(height: 4),
            InkWell(
              onTap: () => setState(() => _trackingOpen = !_trackingOpen),
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Icon(
                      _trackingOpen
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 18, color: brand,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _trackingOpen ? 'Hide batch / expiry / serials' : 'Batch / expiry / serials',
                      style: RunqText.caption.copyWith(
                          color: brand, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
            AnimatedSize(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              alignment: Alignment.topCenter,
              child: _trackingOpen
                  ? Column(
                      children: [
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Expanded(
                              child: PoLabelledField(
                                label: 'Batch',
                                controller: r.batch,
                                hint: 'Optional',
                                onChanged: widget.onChange,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _ExpiryChip(
                                value: r.expiry.text,
                                onTap: _pickExpiry,
                                onClear: r.expiry.text.isEmpty
                                    ? null
                                    : () {
                                        r.expiry.clear();
                                        widget.onChange();
                                        setState(() {});
                                      },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        PoLabelledField(
                          label: 'Serials (one per line)',
                          controller: r.serials,
                          hint: 'Optional',
                          maxLines: 3,
                          onChanged: widget.onChange,
                        ),
                      ],
                    )
                  : const SizedBox.shrink(),
            ),
          ],
        ],
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  final String label;
  final IconData? icon;
  const _MetaPill({required this.label, this.icon});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: t.muted),
            const SizedBox(width: 4),
          ],
          Text(label, style: RunqText.micro.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

class _ExpiryChip extends StatelessWidget {
  final String value;
  final VoidCallback onTap;
  final VoidCallback? onClear;
  const _ExpiryChip({required this.value, required this.onTap, this.onClear});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final has = value.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('EXPIRY',
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
        const SizedBox(height: 4),
        Material(
          color: t.bgWarm,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 10, 6, 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: t.hairline),
              ),
              child: Row(
                children: [
                  Icon(Icons.event_rounded, size: 16, color: PurColors.brand(context)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      has ? prettyShortDate(value) : 'Optional',
                      style: RunqText.body.copyWith(color: has ? t.ink : t.muted2),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (onClear != null)
                    IconButton(
                      onPressed: onClear,
                      icon: Icon(Icons.close_rounded, size: 14, color: t.muted2),
                      visualDensity: VisualDensity.compact,
                      constraints: const BoxConstraints.tightFor(width: 24, height: 24),
                      padding: EdgeInsets.zero,
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Invoice attach card ───────────────────────────────────────────────────

/// Optional invoice attach card. Visible at the top of every PO receive so
/// the natural reading order goes invoice → receipt info → lines. Without
/// it the receiver types the rate on each line and only the GRN posts.
class _InvoiceAttachCard extends StatelessWidget {
  final VoidCallback onAttach;
  const _InvoiceAttachCard({required this.onAttach});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40, height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: PurColors.violetSubtle,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.description_outlined,
                size: 20, color: PurColors.brand(context)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Optional · Attach vendor invoice',
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  "With it, qty + rate + tax come from the vendor's bill. Without it, enter the rate per line and only the GRN posts.",
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: PurPrimaryButton(
                    label: 'Attach invoice',
                    icon: Icons.upload_outlined,
                    onPressed: onAttach,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Row state ─────────────────────────────────────────────────────────────

class _RowState {
  final String poLineId;
  final String description;
  final String? catalogItemId;
  final bool stockTracked;
  final TextEditingController qty;
  final TextEditingController rate;
  final TextEditingController batch;
  final TextEditingController expiry;
  final TextEditingController serials;

  _RowState.fromTemplate(ReceiveTemplateLine l)
      : poLineId = l.poLineId,
        description = l.description,
        catalogItemId = l.catalogItemId,
        stockTracked = l.inventoryItemId != null,
        qty = TextEditingController(text: _qtyText(l.qtyOpen)),
        rate = TextEditingController(
            text: l.unitRate > 0 ? l.unitRate.toStringAsFixed(2) : ''),
        batch = TextEditingController(),
        expiry = TextEditingController(),
        serials = TextEditingController();

  void dispose() {
    qty.dispose();
    rate.dispose();
    batch.dispose();
    expiry.dispose();
    serials.dispose();
  }
}

enum _Pricing { none, all, mixed }
