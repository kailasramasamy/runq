// Confirm screen for the invoice → dispatch lane.
//
// The server has already worked out what's still owed on each line and which
// batch FEFO suggests; this screen exists so a human can trim a quantity or
// override a batch before stock actually moves. Posting is two calls on
// purpose — draft, then dispatch — so a short-stock rejection leaves an
// editable draft rather than a half-posted ledger.
//
// The screen is built around one question: "is this safe to send?" Shortages
// are surfaced at the top and on the line, and the confirm button states the
// count it is about to move rather than a generic verb.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../api/sales_dispatch_models.dart';
import '../../api/sales_dispatch_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';
import '../../widgets/runq_snack.dart';

class InventoryDispatchInvoiceScreen extends ConsumerStatefulWidget {
  const InventoryDispatchInvoiceScreen({super.key, required this.invoiceId});
  final String invoiceId;
  @override
  ConsumerState<InventoryDispatchInvoiceScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryDispatchInvoiceScreen> {
  String? _warehouseId;
  final _vehicleCtrl = TextEditingController();
  bool _posting = false;

  /// Operator overrides, keyed by invoice line. Absent means "use the
  /// server's suggestion" — we never copy the whole preview into state, so a
  /// refresh can't silently resurrect stale quantities.
  final _qty = <String, double>{};
  final _batch = <String, String>{};

  @override
  void dispose() {
    _vehicleCtrl.dispose();
    super.dispose();
  }

  /// Land on the obvious warehouse so single-godown tenants never tap here:
  /// the one flagged default, else the only active one. A multi-warehouse
  /// tenant with no default still has to choose — guessing there would send
  /// stock out of the wrong godown.
  void _autoSelectWarehouse(List<InvWarehouse> warehouses) {
    if (_warehouseId != null) return;
    final active = warehouses.where((w) => w.isActive).toList();
    final pick = active.where((w) => w.isDefault).firstOrNull ??
        (active.length == 1 ? active.first : null);
    if (pick == null) return;
    // Can't mutate picker state during build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _warehouseId == null) {
        setState(() => _warehouseId = pick.id);
      }
    });
  }

  double _qtyFor(InvDispatchPreviewLine l) => _qty[l.invoiceLineId] ?? l.remainingQty;
  String _batchFor(InvDispatchPreviewLine l) =>
      _batch[l.invoiceLineId] ?? l.suggestedBatchNo ?? '';

  /// Lines the operator has actually asked to send.
  List<InvDispatchPreviewLine> _selected(InvDispatchPreview p) =>
      p.shippable.where((l) => _qtyFor(l) > 0).toList();

  /// Selected lines asking for more than the warehouse could supply. The
  /// ledger would reject these, so we say so before the round-trip. Counts
  /// stock the dispatch would make on the spot, or every made-on-demand line
  /// would be flagged as short at its normal zero.
  List<InvDispatchPreviewLine> _shortages(InvDispatchPreview p) =>
      _selected(p).where((l) => _qtyFor(l) > l.coverQty).toList();

  Future<void> _submit(InvDispatchPreview preview) async {
    final wh = _warehouseId;
    if (wh == null) return _toast('Pick a warehouse', kind: SnackKind.warning);
    final selected = _selected(preview);
    if (selected.isEmpty) {
      return _toast('Nothing to dispatch', kind: SnackKind.warning);
    }

    setState(() => _posting = true);
    try {
      final dn = await salesDispatchRepo.createDraft(
        invoiceId: widget.invoiceId,
        warehouseId: wh,
        dispatchDate: DateTime.now().toIso8601String().substring(0, 10),
        vehicleNo: _vehicleCtrl.text,
        lines: selected
            .map((l) => InvDispatchLineInput(
                  itemId: l.itemId!,
                  invoiceLineId: l.invoiceLineId,
                  qty: _qtyFor(l),
                  batchNo: _batchFor(l),
                  uom: l.uom,
                ))
            .toList(),
      );
      try {
        await inventoryRepo.dispatchDn(dn.id);
        _toast('${dn.dnNo} dispatched — stock updated',
            kind: SnackKind.success);
      } catch (e) {
        // Draft survives; the operator fixes the batch and posts from there.
        _toast('Draft ${dn.dnNo} saved, but stock did not post',
            kind: SnackKind.warning, detail: snackErrorText(e));
      }
      ref.invalidate(invPendingDispatchProvider);
      ref.invalidate(invDnListProvider(null));
      ref.invalidate(invKpisProvider);
      if (mounted) context.pushReplacement('/inventory/delivery/${dn.id}');
    } catch (e) {
      _toast(snackErrorText(e), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  void _toast(String msg, {SnackKind kind = SnackKind.info, String? detail}) {
    if (!mounted) return;
    showRunqSnack(context, msg, kind: kind, description: detail);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    ref.watch(invWarehousesProvider).whenData(_autoSelectWarehouse);

    final wh = _warehouseId;
    final preview = wh == null
        ? null
        : ref.watch(invDispatchPreviewProvider(
            (invoiceId: widget.invoiceId, warehouseId: wh)));
    final p = preview?.valueOrNull;

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(title: 'Dispatch invoice', onBack: () => context.pop()),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          if (p != null) ...[
            _InvoiceHeader(preview: p),
            const SizedBox(height: 12),
          ],
          _DespatchDetails(
            warehouseId: _warehouseId,
            onWarehouse: (v) => setState(() => _warehouseId = v),
            vehicleCtrl: _vehicleCtrl,
          ),
          const SizedBox(height: 16),
          if (preview == null)
            _Hint(text: 'Pick a warehouse to see what can be sent.')
          else
            preview.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => _Hint(text: 'Failed to load: $e'),
              data: (data) => _Lines(
                preview: data,
                shortages: _shortages(data),
                qtyFor: _qtyFor,
                batchFor: _batchFor,
                onQty: (l, v) => setState(() => _qty[l.invoiceLineId] = v),
                onBatch: (l, v) => setState(() => _batch[l.invoiceLineId] = v),
              ),
            ),
        ],
      ),
      bottomNavigationBar: p == null
          ? null
          : _ConfirmBar(
              count: _selected(p).length,
              shortages: _shortages(p).length,
              posting: _posting,
              onConfirm: () => _submit(p),
            ),
    );
  }
}

/// Who and what, pinned above the form. Without this the operator is editing
/// quantities with no on-screen proof of which invoice they belong to.
class _InvoiceHeader extends StatelessWidget {
  const _InvoiceHeader({required this.preview});
  final InvDispatchPreview preview;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: InvColors.amberSubtle,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.receipt_long_outlined,
                size: 19, color: InvColors.brand(context)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(preview.invoiceNumber, style: RunqText.bodyStrong),
                const SizedBox(height: 2),
                Text(preview.customerName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DespatchDetails extends StatelessWidget {
  const _DespatchDetails({
    required this.warehouseId,
    required this.onWarehouse,
    required this.vehicleCtrl,
  });
  final String? warehouseId;
  final ValueChanged<String?> onWarehouse;
  final TextEditingController vehicleCtrl;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WarehousePicker(value: warehouseId, onChanged: onWarehouse, allowAll: false),
        const SizedBox(height: 10),
        TextField(
          controller: vehicleCtrl,
          textCapitalization: TextCapitalization.characters,
          style: RunqText.body.copyWith(color: t.ink),
          decoration: InputDecoration(
            labelText: 'Vehicle no (optional)',
            labelStyle: RunqText.caption.copyWith(color: t.muted),
            hintText: 'KA01AB1234',
            hintStyle: RunqText.body.copyWith(color: t.muted2),
            prefixIcon: Icon(Icons.local_shipping_outlined, size: 18, color: t.muted),
            filled: true,
            fillColor: t.surface,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            border: _fieldBorder(t.hairline),
            enabledBorder: _fieldBorder(t.hairline),
            focusedBorder: _fieldBorder(InvColors.brand(context)),
          ),
        ),
      ],
    );
  }
}

OutlineInputBorder _fieldBorder(Color c) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: c),
    );

class _Lines extends StatelessWidget {
  const _Lines({
    required this.preview,
    required this.shortages,
    required this.qtyFor,
    required this.batchFor,
    required this.onQty,
    required this.onBatch,
  });

  final InvDispatchPreview preview;
  final List<InvDispatchPreviewLine> shortages;
  final double Function(InvDispatchPreviewLine) qtyFor;
  final String Function(InvDispatchPreviewLine) batchFor;
  final void Function(InvDispatchPreviewLine, double) onQty;
  final void Function(InvDispatchPreviewLine, String) onBatch;

  @override
  Widget build(BuildContext context) {
    final shippable = preview.lines.where((l) => l.shippable).toList();
    final skipped = preview.lines.where((l) => !l.shippable).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (shortages.isNotEmpty) ...[
          _ShortageBanner(lines: shortages),
          const SizedBox(height: 12),
        ],
        if (shippable.isNotEmpty) ...[
          InvSectionHeader(title: 'Sending (${shippable.length})'),
          for (final l in shippable) ...[
            _LineCard(
              line: l,
              qty: qtyFor(l),
              batch: batchFor(l),
              onQty: (v) => onQty(l, v),
              onBatch: (v) => onBatch(l, v),
            ),
            const SizedBox(height: 8),
          ],
        ] else
          _Hint(text: 'Nothing on this invoice can move stock.'),
        if (skipped.isNotEmpty) ...[
          const SizedBox(height: 8),
          InvSectionHeader(title: 'Not moving stock (${skipped.length})'),
          _SkippedCard(lines: skipped),
        ],
      ],
    );
  }
}

/// Named, countable, and above the fold. A red number buried on a line card
/// is easy to scroll past and turns into a failed post.
class _ShortageBanner extends StatelessWidget {
  const _ShortageBanner({required this.lines});
  final List<InvDispatchPreviewLine> lines;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: InvColors.errorBg,
        border: Border.all(color: InvColors.error.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 17, color: InvColors.error),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Not enough stock on ${lines.length} line${lines.length == 1 ? '' : 's'}',
                  style: RunqText.bodyStrong.copyWith(color: InvColors.error),
                ),
                const SizedBox(height: 2),
                Text(
                  '${lines.map((l) => l.itemName ?? l.description).join(', ')}. '
                  'Lower the quantity, or send anyway and fix the draft if it is rejected.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.line,
    required this.qty,
    required this.batch,
    required this.onQty,
    required this.onBatch,
  });

  final InvDispatchPreviewLine line;
  final double qty;
  final String batch;
  final ValueChanged<double> onQty;
  final ValueChanged<String> onBatch;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final short = qty > line.coverQty;
    return InvCard(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product on the left, the one editable number on the right — a
          // line is two text rows tall, so a full invoice fits on a screen.
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // UOM belongs with the product, not the number: "Buffalo
                    // Milk 1L" is the thing; the quantity is how many.
                    Text.rich(
                      TextSpan(
                        text: line.itemName ?? line.description,
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        children: line.uom == null
                            ? null
                            : [
                                TextSpan(
                                  text: '  ${line.uom}',
                                  style: RunqText.caption.copyWith(color: t.muted2),
                                ),
                              ],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 5),
                    Wrap(
                      spacing: 5,
                      runSpacing: 4,
                      children: [
                        // Invoiced/sent only matter once a part shipment has
                        // happened; until then "/ 11" in the field says it,
                        // and repeating it here is noise.
                        if (line.dispatchedQty > 0) ...[
                          _Stat(label: 'Invoiced', value: _n(line.invoicedQty)),
                          _Stat(label: 'Sent', value: _n(line.dispatchedQty)),
                        ],
                        _Stat(
                          // A made-on-demand SKU reads "0 (+240 to make)" —
                          // the zero is real, and so is the ability to ship.
                          label: line.repackFrom == null ? 'Stock' : 'Stock / to make',
                          value: line.repackFrom == null
                              ? _n(line.availableQty)
                              : '${_n(line.availableQty)} (+${_n(line.repackFrom!.capacityQty)})',
                          alert: short,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _QtyField(
                initial: qty,
                max: line.remainingQty,
                short: short,
                onChanged: onQty,
              ),
            ],
          ),
          if (line.trackBatches) ...[
            const SizedBox(height: 8),
            _BatchField(
              initial: batch,
              suggested: line.suggestedBatchNo,
              onChanged: onBatch,
            ),
          ],
          if (qty < line.remainingQty && qty > 0) ...[
            const SizedBox(height: 6),
            Text(
              '${_n(line.remainingQty - qty)} ${line.uom ?? ''} stays on the invoice'.trim(),
              style: RunqText.micro.copyWith(color: t.muted2),
            ),
          ],
        ],
      ),
    );
  }
}

/// Controller that highlights its whole value the first time the field is
/// focused. Every quantity here arrives pre-filled with the remaining qty, so
/// editing almost always means replacing the number — without this the
/// operator backspaces digit by digit before typing.
///
/// Selection is applied post-frame because the tap that grants focus places a
/// caret of its own during that same frame.
mixin _SelectAllOnFocus<T extends StatefulWidget> on State<T> {
  late final TextEditingController textCtrl;
  late final FocusNode focusNode;

  void initSelectAll(String initial) {
    textCtrl = TextEditingController(text: initial);
    focusNode = FocusNode()..addListener(_handleFocus);
  }

  void _handleFocus() {
    if (!focusNode.hasFocus) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !focusNode.hasFocus) return;
      textCtrl.selection =
          TextSelection(baseOffset: 0, extentOffset: textCtrl.text.length);
    });
  }

  void disposeSelectAll() {
    focusNode.removeListener(_handleFocus);
    focusNode.dispose();
    textCtrl.dispose();
  }
}

/// Quantity is the one number that decides how much stock moves, so it gets
/// the tallest target on the card and its unit inline rather than in a label.
class _QtyField extends StatefulWidget {
  const _QtyField({
    required this.initial,
    required this.max,
    required this.short,
    required this.onChanged,
  });
  final double initial;
  final double max;
  final bool short;
  final ValueChanged<double> onChanged;

  @override
  State<_QtyField> createState() => _QtyFieldState();
}

class _QtyFieldState extends State<_QtyField> with _SelectAllOnFocus {
  @override
  void initState() {
    super.initState();
    initSelectAll(_n(widget.initial));
  }

  @override
  void dispose() {
    disposeSelectAll();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final short = widget.short;
    final border = short ? InvColors.error : t.hairline;
    return SizedBox(
      width: 104,
      child: TextField(
        controller: textCtrl,
        focusNode: focusNode,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
        textAlign: TextAlign.right,
        style: RunqText.h4.copyWith(color: short ? InvColors.error : t.ink),
        decoration: InputDecoration(
          // "/ 11" carries the cap inline — no label or helper row needed,
          // which is what made this field three times taller than its content.
          suffixText: '/ ${_n(widget.max)}',
          suffixStyle: RunqText.caption.copyWith(color: t.muted2),
          // Unfilled: the card is already a surface, so a second wash inside
          // it reads as a disabled control rather than an editable one.
          filled: false,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          border: _fieldBorder(border),
          enabledBorder: _fieldBorder(border),
          focusedBorder: _fieldBorder(short ? InvColors.error : InvColors.brand(context)),
        ),
        onChanged: (v) => widget.onChanged(double.tryParse(v) ?? 0),
      ),
    );
  }
}

class _BatchField extends StatefulWidget {
  const _BatchField({
    required this.initial,
    required this.suggested,
    required this.onChanged,
  });
  final String initial;
  final String? suggested;
  final ValueChanged<String> onChanged;

  @override
  State<_BatchField> createState() => _BatchFieldState();
}

class _BatchFieldState extends State<_BatchField> with _SelectAllOnFocus {
  @override
  void initState() {
    super.initState();
    initSelectAll(widget.initial);
  }

  @override
  void dispose() {
    disposeSelectAll();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: textCtrl,
      focusNode: focusNode,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        // Prefix says the pick came from first-expiry-first-out, so an
        // operator overriding it knows what they're overriding — and it
        // costs no vertical space, unlike a label or helper row.
        prefixIcon: Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 6, 0),
          child: Text(widget.suggested == null ? 'Batch' : 'FEFO',
              style: RunqText.micro.copyWith(color: t.muted2)),
        ),
        prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
        hintText: 'none suggested',
        hintStyle: RunqText.caption.copyWith(color: t.muted2),
        filled: false,
        isDense: true,
        contentPadding: const EdgeInsets.fromLTRB(0, 9, 10, 9),
        border: _fieldBorder(t.hairline),
        enabledBorder: _fieldBorder(t.hairline),
        focusedBorder: _fieldBorder(InvColors.brand(context)),
      ),
      onChanged: widget.onChanged,
    );
  }
}

/// Lines that legitimately move nothing, folded into one quiet card so they
/// don't compete with the ones being edited — but never hidden outright.
class _SkippedCard extends StatelessWidget {
  const _SkippedCard({required this.lines});
  final List<InvDispatchPreviewLine> lines;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < lines.length; i++) ...[
            if (i > 0) Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Divider(height: 1, thickness: 1, color: t.hairlineSoft),
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    lines[i].itemName ?? lines[i].description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ),
                const SizedBox(width: 8),
                Text(_skipReason(lines[i]),
                    style: RunqText.micro.copyWith(color: t.muted2)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

String _skipReason(InvDispatchPreviewLine l) => switch (l.resolution) {
      InvLineResolution.notStocked => 'not stocked',
      InvLineResolution.unmapped => 'unmapped',
      _ => 'fully sent',
    };

/// States what is about to happen, so "Confirm" is never a blind tap.
class _ConfirmBar extends StatelessWidget {
  const _ConfirmBar({
    required this.count,
    required this.shortages,
    required this.posting,
    required this.onConfirm,
  });
  final int count;
  final int shortages;
  final bool posting;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairlineSoft)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (shortages > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  '$shortages line${shortages == 1 ? '' : 's'} short on stock — '
                  'the post may be rejected',
                  style: RunqText.micro.copyWith(color: InvColors.error),
                ),
              ),
            InvPrimaryButton(
              label: posting
                  ? 'Posting…'
                  : count == 0
                      ? 'Nothing selected'
                      : 'Dispatch $count line${count == 1 ? '' : 's'}',
              icon: Icons.local_shipping_outlined,
              busy: posting,
              onTap: (posting || count == 0) ? null : onConfirm,
            ),
          ],
        ),
      ),
    );
  }
}

/// Neutral facts are outlined, not filled — a solid wash on a white card
/// reads as a disabled control. Only the alert state earns a fill.
class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.alert = false});
  final String label;
  final String value;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: alert ? InvColors.errorBg : null,
        border: Border.all(color: alert ? Colors.transparent : t.hairline),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text.rich(
        TextSpan(
          text: '$label ',
          style: RunqText.micro.copyWith(color: alert ? InvColors.error : t.muted2),
          children: [
            TextSpan(
              text: value,
              style: RunqText.micro.copyWith(
                color: alert ? InvColors.error : t.ink2,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(text, style: RunqText.caption.copyWith(color: t.muted)),
    );
  }
}

String _n(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
