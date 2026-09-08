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
      // On the ROOT navigator, or the shell's own bottom nav lands on top of
      // this sheet's footer. Opened from the home screen the sheet is a route
      // inside RootShell's Scaffold *body*, and a Scaffold paints its
      // bottomNavigationBar after the body and lifts it above the keyboard —
      // straight over the Done button, which then washed out and swallowed
      // every tap while looking for all the world like it was disabled.
      useRootNavigator: true,
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

    final media = MediaQuery.of(context);
    final keyboard = media.viewInsets.bottom;
    // The surface runs the full height and continues *behind* the keypad
    // rather than stopping above it. Padding the whole sheet up by the
    // keyboard inset left a strip of dimmed barrier between the two — a hole
    // between the sheet's bottom edge and the keyboard's top. Extending
    // underneath and insetting only the content leaves them reading as one
    // panel.
    return Container(
      constraints: BoxConstraints(maxHeight: media.size.height * 0.94),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SafeArea(
        top: false,
        // The keypad already covers the home indicator, so the safe area is
        // only owed when it is down.
        bottom: keyboard == 0,
        child: Padding(
          // Content sits above the keypad; the background behind it does not.
          padding: EdgeInsets.only(bottom: keyboard),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            _grabber(t),
            _header(t, d),
            // The middle scrolls; the footer does not. On a short phone with
            // the number pad up there is no room for both, and the button is
            // the half that must survive.
            Flexible(
              child: ListView(
                shrinkWrap: true,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                children: [
                  _drawnCard(t, d),
                  const SizedBox(height: 12),
                  _qtyField(t, d, hint),
                ],
              ),
            ),
            _footer(t),
          ]),
        ),
      ),
    );
  }

  /// The product, with the unit it is counted in beside it — "45" means
  /// nothing until you know it is 45 of a 200g pack.
  Widget _header(RunqTokens t, DrawRow d) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('What came out?',
              style: RunqText.h3.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text.rich(
            TextSpan(children: [
              TextSpan(
                text: d.outputItemName,
                style: RunqText.body.copyWith(color: t.ink),
              ),
              if (d.outputUom.isNotEmpty)
                TextSpan(
                  text: '  ${d.outputUom}',
                  style: RunqText.body.copyWith(color: t.muted),
                ),
            ]),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ]),
      );

  /// Done, and — when it is not available — the one thing still missing.
  /// A greyed button with no explanation is the most common way a form
  /// strands somebody.
  Widget _footer(RunqTokens t) {
    final blocker = _blocker;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Above the button, not below it: the reason a control is unavailable
        // has to be read before reaching for it, and anything under the
        // button competes with the keyboard for the last strip of screen.
        if (blocker != null) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: MfgColors.orangeAlertBg,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(children: [
              Icon(Icons.info_outline_rounded,
                  size: 14, color: MfgColors.orangeAlert),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  blocker,
                  style: RunqText.caption.copyWith(
                    color: MfgColors.orangeAlert,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 8),
        ],
        SizedBox(
          width: double.infinity,
          child: MfgPrimaryButton(
            label: 'Done',
            icon: Icons.check_rounded,
            loading: _busy,
            onPressed: blocker == null ? _submit : null,
          ),
        ),
      ]),
    );
  }

  /// What went in, so the number being typed has something to sit against.
  ///
  /// Lots are named by when they were received, not by consignment number: on
  /// a floor "5 Sep, 7:18 PM" places a can instantly and CON/2026-27/01901
  /// places nothing. Oldest first, which is the order it should have been
  /// drawn in.
  Widget _drawnCard(RunqTokens t, DrawRow d) => MfgCard(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.outbox_outlined, size: 16, color: MfgColors.brand(context)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                // Named from the draw rather than fixed as "milk": the same
                // screen closes a coconut-oil or jaggery draw.
                d.lines.isEmpty ? 'Taken' : d.lines.first.inputItemName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
              ),
            ),
            Text(
              '${formatItemQty(d.drawnQty, null, unit: d.drawnUom)}'
              '${d.drawnUom.isEmpty ? '' : ' ${d.drawnUom}'}',
              style: RunqText.bodyStrong.copyWith(color: MfgColors.brand(context)),
            ),
          ]),
          // One line per lot only when there is more than one — a single-lot
          // draw would just restate the total underneath itself.
          if (d.lines.length > 1) ...[
            const SizedBox(height: 8),
            Divider(height: 1, color: t.hairline),
            const SizedBox(height: 6),
            Text('FROM', style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
            for (final l in d.lines)
              Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Row(children: [
                  Container(
                    width: 4,
                    height: 4,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(color: t.muted2, shape: BoxShape.circle),
                  ),
                  Expanded(
                    child: Text(
                      _receivedLabel(l),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ),
                  Text(
                    '${formatItemQty(l.qty, null, unit: l.uom)}'
                    '${l.uom.isEmpty ? '' : ' ${l.uom}'}',
                    style: RunqText.caption.copyWith(
                        color: t.ink, fontWeight: FontWeight.w600),
                  ),
                ]),
              ),
          ] else if (d.lines.length == 1) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.only(left: 24),
              child: Text(
                _receivedLabel(d.lines.first),
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ),
          ],
        ]),
      );

  /// "Received 5 Sep, 7:18 PM", falling back to the batch number only when the
  /// lot has no recorded arrival — a code beats nothing, but only just.
  static String _receivedLabel(DrawLine l) {
    final stamp = arrivalStamp(l.receivedAt);
    if (stamp != null) return 'Received $stamp';
    return l.batchNo ?? 'No batch';
  }

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
          labelText: 'Quantity made',
          // The unit rides the field rather than the label: "45" and "200g"
          // read as one figure that way, and the label stays a label.
          suffixText: d.outputUom.isEmpty ? null : d.outputUom,
          suffixStyle: RunqText.body.copyWith(color: RT(context).muted),
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

  /// What is stopping the submit, or null when nothing is. Returning the
  /// reason rather than a bool is what lets the footer explain itself.
  String? get _blocker {
    if (_busy) return null;
    final qty = double.tryParse(_qtyCtl.text.trim()) ?? 0;
    if (qty <= 0) return 'Enter how much was made';
    if (_tracksBatches && _expiry == null) return 'Set the expiry date';
    return null;
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
      // Closing a draw finishes a run, so the home screen's "Made today" card
      // and the work-order list behind it are both stale. Invalidating only
      // the open-draw list left the run invisible until a manual refresh —
      // the operator recorded a yield and the screen showed nothing for it.
      ref.invalidate(workOrderListProvider);
      // The lot the milk came from has a new entry under "made from this lot".
      ref.invalidate(batchUsageProvider);
      // Output lands in stock and the draw's inputs already left it, so every
      // stock view behind this sheet is stale too.
      invalidateMfgStock(ref);
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
