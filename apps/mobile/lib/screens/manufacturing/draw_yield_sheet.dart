// What came out — the second half of a draw.
//
// The milk left the pool hours ago; this is where the kettle gets accounted
// for. One field, because one number is all the operator has: how much khoa
// they made. Everything else — which lots it drew, when, what warehouse — was
// settled at draw time and is shown here only as context.
//
// The hint under the field is what the last closed draw of this product
// yielded. It is never applied and never becomes a recipe: a ratio the floor
// did not agree to would quietly turn into a number they get judged against.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_qty.dart';
import '../../widgets/runq_snack.dart';
import 'mfg_material_sheet.dart' show arrivalStamp;
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Returns true when the draw was closed.
Future<bool?> showDrawYieldSheet(BuildContext context, DrawRow draw) =>
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DrawYieldSheet(draw: draw),
    );

class DrawYieldSheet extends ConsumerStatefulWidget {
  const DrawYieldSheet({super.key, required this.draw});
  final DrawRow draw;

  @override
  ConsumerState<DrawYieldSheet> createState() => _DrawYieldSheetState();
}

class _DrawYieldSheetState extends ConsumerState<DrawYieldSheet> {
  final _qtyCtl = TextEditingController();
  DateTime? _expiry;
  bool _busy = false;

  @override
  void dispose() {
    _qtyCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final d = widget.draw;
    final hint = d.outputItemId == null
        ? null
        : ref.watch(drawYieldHintProvider(d.outputItemId!)).asData?.value;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.bgWarm,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            _grabber(t),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('What came out?',
                    style: RunqText.h3.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(d.outputItemName,
                    style: RunqText.body.copyWith(color: t.muted)),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: _drawnCard(t, d),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _qtyField(t, d, hint),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: SizedBox(
                width: double.infinity,
                child: MfgPrimaryButton(
                  label: 'Done',
                  icon: Icons.check_rounded,
                  loading: _busy,
                  onPressed: _canSubmit ? _submit : null,
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// What went in, so the number being typed has something to sit against.
  Widget _drawnCard(RunqTokens t, DrawRow d) => MfgCard(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.outbox_outlined, size: 15, color: t.muted),
            const SizedBox(width: 8),
            Expanded(
              // Named from the draw rather than fixed as "milk": the same
              // screen closes a coconut-oil or jaggery draw, and a label that
              // says milk over a drum of oil is simply wrong.
              child: Text(
                d.lines.isEmpty ? 'Taken' : '${d.lines.first.inputItemName} taken',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ),
            Text(
              '${formatItemQty(d.drawnQty, null, unit: d.drawnUom)}'
              '${d.drawnUom.isEmpty ? '' : ' ${d.drawnUom}'}',
              style: RunqText.bodyStrong.copyWith(color: t.ink),
            ),
          ]),
          for (final l in d.lines)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 23),
              child: Row(children: [
                Expanded(
                  child: Text(
                    [l.batchNo ?? 'No batch', ?arrivalStamp(l.at)].join('  ·  '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.micro.copyWith(color: t.muted2),
                  ),
                ),
                Text(
                  '${formatItemQty(l.qty, null, unit: l.uom)}'
                  '${l.uom.isEmpty ? '' : ' ${l.uom}'}',
                  style: RunqText.micro.copyWith(color: t.muted),
                ),
              ]),
            ),
        ]),
      );

  Widget _qtyField(RunqTokens t, DrawRow d, DrawYieldHint? hint) {
    final needsExpiry = _tracksBatches;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(
        controller: _qtyCtl,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
        style: RunqText.h2.copyWith(color: t.ink),
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          labelText: 'Made (${d.outputUom})',
          filled: true,
          fillColor: t.surface,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: t.hairline),
          ),
        ),
      ),
      // Last time, not a target. Stated as history so nobody reads it as the
      // number they are supposed to hit.
      if (hint != null) ...[
        const SizedBox(height: 6),
        Text(
          'Last time ${formatItemQty(hint.drawnQty, null, unit: hint.drawnUom)} '
          '${hint.drawnUom} made ${formatItemQty(hint.outputQty, null, unit: d.outputUom)} '
          '${d.outputUom}',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      ],
      if (needsExpiry) ...[
        const SizedBox(height: 10),
        InkWell(
          onTap: _pickExpiry,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: _expiry == null ? MfgColors.orangeAlert : t.hairline,
              ),
            ),
            child: Row(children: [
              Icon(Icons.event_outlined, size: 16, color: t.muted),
              const SizedBox(width: 8),
              Text(
                _expiry == null
                    ? 'Set expiry date'
                    : '${_expiry!.day}/${_expiry!.month}/${_expiry!.year}',
                style: RunqText.body.copyWith(
                  color: _expiry == null ? t.muted : t.ink,
                ),
              ),
            ]),
          ),
        ),
      ],
    ]);
  }

  Widget _grabber(RunqTokens t) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Container(
          width: 36,
          height: 4,
          decoration: BoxDecoration(
            color: t.hairline,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
      );

  /// Batch-tracked products need an expiry, and the item master says which —
  /// it travels on the draw so the field is right the first time rather than
  /// after a rejected submit.
  bool get _tracksBatches => widget.draw.outputTracksBatches || _expiryRequired;

  /// Raised if the server rejects a submit for a missing expiry anyway — a
  /// belt-and-braces path for stock whose flag changed under an open draw.
  bool _expiryRequired = false;

  bool get _canSubmit {
    final qty = double.tryParse(_qtyCtl.text.trim()) ?? 0;
    if (qty <= 0) return false;
    if (_tracksBatches && _expiry == null) return false;
    return !_busy;
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _expiry = picked);
  }

  Future<void> _submit() async {
    final qty = double.tryParse(_qtyCtl.text.trim()) ?? 0;
    setState(() => _busy = true);
    try {
      await manufacturingRepo.closeDraw(
        widget.draw.id,
        qty: qty,
        expiryDate: _expiry?.toIso8601String().substring(0, 10),
      );
      ref.invalidate(openDrawsProvider);
      ref.invalidate(mfgDashboardProvider);
      ref.invalidate(invOnHandProvider(
          (warehouseId: null, lowOnly: false, itemClassGroup: 'inputs')));
      if (!mounted) return;
      showRunqSnack(
        context,
        '${formatItemQty(qty, null, unit: widget.draw.outputUom)} '
        '${widget.draw.outputUom} ${widget.draw.outputItemName} recorded',
        kind: SnackKind.success,
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      // The server is the authority on whether this product needs an expiry;
      // surface the field rather than making the operator guess at the error.
      if (e.message.toLowerCase().contains('expiry')) {
        setState(() => _expiryRequired = true);
      }
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
