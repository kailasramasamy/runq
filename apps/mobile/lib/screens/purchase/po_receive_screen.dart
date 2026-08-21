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
    _seeded = true;
  }

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
    for (final r in _rows.values) {
      final qty = double.tryParse(r.qty.text) ?? 0;
      if (qty <= 0 || r.catalogItemId == null) continue;
      final rate = double.tryParse(r.rate.text) ?? 0;
      // A line with no rate posts a zero-value GRN: stock valued at zero for
      // tracked items, and a GL entry with nothing to debit either way.
      if (rate <= 0) {
        showRunqSnack(context,
            'Enter a rate for ${r.description} — receiving at ₹0 posts no value',
            kind: SnackKind.error);
        return;
      }
      final serials = r.serials.text
          .split(RegExp(r'\r?\n'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      lines.add({
        'poLineId': r.poLineId,
        'catalogItemId': r.catalogItemId,
        'qty': qty,
        'unitCost': rate,
        if (r.batch.text.trim().isNotEmpty) 'batchNo': r.batch.text.trim(),
        if (r.expiry.text.trim().isNotEmpty) 'expiryDate': r.expiry.text.trim(),
        if (serials.isNotEmpty) 'serialNos': serials,
      });
    }
    if (lines.isEmpty) {
      showRunqSnack(context, 'Every row needs qty > 0', kind: SnackKind.error);
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
      );
      ref.invalidate(purchaseOrderDetailProvider(widget.poId));
      ref.invalidate(purchaseOrderListProvider);
      ref.invalidate(poReceiveTemplateProvider(widget.poId));
      if (!mounted) return;
      showRunqSnack(context, 'GRN ${res.grnNo} posted', kind: SnackKind.success);
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
                      for (var i = 0; i < tpl.lines.length; i++)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ReceiveLineCard(
                            index: i + 1,
                            line: tpl.lines[i],
                            row: _rows[tpl.lines[i].poLineId]!,
                            onChange: () => setState(() {}),
                          ),
                        ),
                      const SizedBox(height: 12),
                      PoNotesCard(controller: _notesCtl),
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
  const _ReceiveLineCard({
    required this.index,
    required this.line,
    required this.row,
    required this.onChange,
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
    final qty = double.tryParse(r.qty.text) ?? 0;
    final ordered = l.qtyOrdered.toDouble();
    final open = l.qtyOpen.toDouble();
    final receiving = qty.clamp(0, open).toDouble();
    final pct = open <= 0 ? 0.0 : (receiving / open).clamp(0.0, 1.0);
    final over = qty > open;

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
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _StatBox(label: 'Open', value: _qtyText(open)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatBox(label: 'Ordered', value: _qtyText(ordered)),
              ),
            ],
          ),
          const SizedBox(height: 10),
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
          if (over) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.warning_amber_rounded,
                    size: 14, color: PurColors.orangeAlert),
                const SizedBox(width: 4),
                Text(
                  'Exceeds open qty (${_qtyText(open)})',
                  style: RunqText.caption.copyWith(color: PurColors.orangeAlert),
                ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 4,
              backgroundColor: t.hairlineSoft,
              valueColor: AlwaysStoppedAnimation(
                  over ? PurColors.orangeAlert : PurColors.success),
            ),
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

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  const _StatBox({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
        const SizedBox(height: 2),
        Text(value,
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
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
