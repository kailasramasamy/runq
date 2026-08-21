// Line entry for a stock adjustment — direction, qty, batch and reason for
// one item. Pushed from the adjustment screen, both from an on-hand row and
// from the "Add product not on hand" picker.

import 'package:flutter/material.dart';

import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'inventory_adjustment_common.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

/// Pushes the line screen and returns the result, or null if the user backed
/// out without saving.
Future<InvAdjLineResult?> pushAdjLineScreen(
  BuildContext context, {
  required String itemName,
  String? itemSku,
  String? itemUnit,
  String? batchNo,
  bool needsBatchNo = false,
  required double availSnapshot,
  required bool initialIsOutbound,
  String? initialReason,
  double? initialQty,
}) {
  return Navigator.of(context).push<InvAdjLineResult>(
    MaterialPageRoute(
      builder: (_) => InvAdjustmentLineScreen(
        itemName: itemName,
        itemSku: itemSku,
        itemUnit: itemUnit,
        batchNo: batchNo,
        needsBatchNo: needsBatchNo,
        availSnapshot: availSnapshot,
        initialIsOutbound: initialIsOutbound,
        initialReason: initialReason,
        initialQty: initialQty,
      ),
    ),
  );
}

/// What the line screen hands back: a saved line, or an instruction to drop
/// the draft entirely.
class InvAdjLineResult {
  const InvAdjLineResult.saved({
    required this.qty,
    required this.isOutbound,
    required this.reason,
    this.batchNo,
  }) : cleared = false;
  const InvAdjLineResult.cleared()
    : qty = null,
      isOutbound = null,
      reason = null,
      batchNo = null,
      cleared = true;
  final double? qty;
  final bool? isOutbound;
  final String? reason;

  /// Typed by the user for a batch-tracked item that has no on-hand row to
  /// inherit one from. Null whenever the batch came in with the line.
  final String? batchNo;
  final bool cleared;
}

/// Qty entry for one adjustment line. A screen rather than a sheet: with a
/// direction toggle, qty, an optional batch field and six reason pills, the
/// sheet spent its life fighting the keyboard for room.
class InvAdjustmentLineScreen extends StatefulWidget {
  const InvAdjustmentLineScreen({
    super.key,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    this.batchNo,
    this.needsBatchNo = false,
    required this.availSnapshot,
    required this.initialIsOutbound,
    this.initialReason,
    this.initialQty,
  });
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String? batchNo;

  /// The item tracks batches but arrived without one — the sheet has to ask,
  /// because the stock ledger refuses a batch-tracked movement without it.
  final bool needsBatchNo;
  final double availSnapshot;
  final bool initialIsOutbound;
  final String? initialReason;
  final double? initialQty;
  @override
  State<InvAdjustmentLineScreen> createState() => _InvAdjustmentLineScreenState();
}

class _InvAdjustmentLineScreenState extends State<InvAdjustmentLineScreen> {
  final _ctrl = TextEditingController();
  final _batchCtrl = TextEditingController();
  final _focus = FocusNode();
  late bool _isOutbound;
  late String _reason;

  /// Inline message under the batch field, set when a save is blocked on it.
  String? _batchError;

  /// Decodes the Julian stamp in the suggested code. A lot code is meant to be
  /// opaque on the carton, but the person typing it needs to read it back.
  String? _stampHint;

  @override
  void initState() {
    super.initState();
    _isOutbound = widget.initialIsOutbound;
    _reason = widget.initialReason ?? invDefaultReason(_isOutbound);
    if (widget.initialQty != null) _ctrl.text = invFmtQty(widget.initialQty!);
    // Found stock has no batch to inherit, so seed one from the SKU + today
    // rather than making the user invent a code at the keypad.
    if (widget.needsBatchNo) {
      final today = DateTime.now();
      _batchCtrl.text = invSuggestBatchNo(
        sku: widget.itemSku,
        itemName: widget.itemName,
        on: today,
      );
      _stampHint = '${invJulianStamp(today)} = ${_prettyDate(today)}';
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _batchCtrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _setDirection(bool outbound) {
    if (_isOutbound == outbound) return;
    setState(() {
      _isOutbound = outbound;
      // Reset reason to a sensible default for the new direction unless
      // the current pick is valid on both sides.
      final list = outbound ? invOutboundReasonOrder : invInboundReasonOrder;
      if (!list.contains(_reason)) _reason = invDefaultReason(outbound);
    });
  }

  void _save() {
    // Drop the keyboard before any validation message. Toasts land at the
    // bottom of the screen, which is exactly where the numeric keypad sits —
    // the warning was being raised behind it, so a save looked like it had
    // silently done nothing.
    FocusScope.of(context).unfocus();

    final q = double.tryParse(_ctrl.text) ?? -1;
    if (q <= 0) {
      setState(() => _batchError = null);
      RunqSnack.warning(context, 'Enter a positive qty');
      return;
    }
    if (_isOutbound && q > widget.availSnapshot) {
      setState(() => _batchError = null);
      RunqSnack.warning(context, 'Only ${invFmtQty(widget.availSnapshot)} on hand');
      return;
    }
    final batch = _batchCtrl.text.trim();
    // Caught here rather than at save: the stock ledger rejects a batch-tracked
    // movement with no batch, and that error would land on the whole document
    // long after the user left this sheet.
    if (widget.needsBatchNo && batch.isEmpty) {
      // Marked on the field as well as toasted: the toast says what went
      // wrong, the field says where.
      setState(() => _batchError = 'Required — this item is batch-tracked.');
      RunqSnack.warning(
        context,
        'Enter a batch number',
        description: 'This item is batch-tracked.',
      );
      return;
    }
    if (_batchError != null) setState(() => _batchError = null);
    Navigator.of(context).pop(
      InvAdjLineResult.saved(
        qty: q,
        isOutbound: _isOutbound,
        reason: _reason,
        batchNo: batch.isEmpty ? null : batch,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final sub = [
      if ((widget.itemSku ?? '').isNotEmpty) widget.itemSku!,
      if ((widget.itemUnit ?? '').isNotEmpty) widget.itemUnit!,
      if ((widget.batchNo ?? '').isNotEmpty) 'Batch ${widget.batchNo!}',
    ].join(' · ');
    final unitSuffix = (widget.itemUnit ?? '').isEmpty ? '' : ' ${widget.itemUnit}';
    final reasons = _isOutbound ? invOutboundReasonOrder : invInboundReasonOrder;
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(title: 'Adjust stock', onBack: () => Navigator.of(context).pop()),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Item header
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.inventory_2_outlined, size: 18, color: t.muted),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.itemName,
                                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 15),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                if (sub.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // Direction toggle — explicit Add vs Remove choice, big
                      // enough that the user can't miss what sign is being applied.
                      InvDirectionToggle(isOutbound: _isOutbound, onChanged: _setDirection),
                      const SizedBox(height: 16),
                      InvFieldLabel(_isOutbound ? 'Qty to Remove' : 'Qty to Add'),
                      TextField(
                        controller: _ctrl,
                        focusNode: _focus,
                        style: RunqText.body.copyWith(color: t.ink, fontSize: 16),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: invInputDecoration(context, hint: '0'),
                        onSubmitted: (_) => _save(),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(Icons.inventory_outlined, size: 13, color: t.muted),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'On hand: ${invFmtQty(widget.availSnapshot)}$unitSuffix',
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                          ),
                        ],
                      ),
                      if (widget.needsBatchNo) ...[
                        const SizedBox(height: 16),
                        InvFieldLabel('Batch number'),
                        TextField(
                          controller: _batchCtrl,
                          textCapitalization: TextCapitalization.characters,
                          style: RunqText.body.copyWith(color: t.ink),
                          decoration: invInputDecoration(context, hint: 'PRODUCT-YYYYMMDD')
                              .copyWith(
                                enabledBorder: _batchError == null
                                    ? null
                                    : OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(10),
                                        borderSide: const BorderSide(color: InvColors.error),
                                      ),
                              ),
                          onChanged: (_) {
                            if (_batchError != null) {
                              setState(() => _batchError = null);
                            }
                          },
                          onSubmitted: (_) => _save(),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _batchError ??
                              'Batch-tracked with no stock here yet — filled in as '
                                  'SKU + Julian lot stamp ($_stampHint). Edit it if the '
                                  'goods carry their own lot code.',
                          style: RunqText.caption.copyWith(
                            color: _batchError == null ? t.muted : InvColors.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      InvFieldLabel('Reason'),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final r in reasons)
                            InvFilterPill(
                              label: invReasonLabels[r] ?? r,
                              active: _reason == r,
                              onTap: () => setState(() => _reason = r),
                              activeColor: _isOutbound ? InvColors.error : InvColors.success,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Sticky footer: the actions stay put while the reason pills and
            // batch field scroll, so Save never walks off under the keyboard.
            Container(
              decoration: BoxDecoration(
                color: t.surface,
                border: Border(top: BorderSide(color: t.hairline)),
              ),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Row(
                children: [
                  if (widget.initialQty != null) ...[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () =>
                            Navigator.of(context).pop(const InvAdjLineResult.cleared()),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: InvColors.error,
                          side: BorderSide(color: InvColors.error.withValues(alpha: 0.4)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: const Text('Clear'),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    flex: 2,
                    child: InvPrimaryButton(
                      label: 'Save',
                      icon: Icons.check_circle_outline,
                      onTap: _save,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// '21 Aug 2026' — decoding a lot stamp is the only date this screen prints,
/// so it carries its own formatter rather than pulling in intl.
String _prettyDate(DateTime d) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${d.day} ${months[d.month - 1]} ${d.year}';
}
