// The three questions a shortage raises, asked while the operator is still
// standing on the invoice.
//
// Auto-dispatch meets the empty shelf a second after the invoice is sent, and
// everything it knows arrives in the send response. Routing that to a
// notification meant the person who caused the shortage — and who is the only
// one who can decide what to do about it — walked away unaware, and the
// decision waited on someone noticing a badge.
//
// So it is asked here, in order, and each answer is allowed to be "no":
//
//   1. This is short. Do you want to deal with it now?
//   2. Which stand-in goes instead?
//   3. Should the invoice say what was billed, or what actually left?
//
// Backing out at any point is safe: the shortfall draft is already parked and
// the shortages queue still holds it.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/inventory_models.dart';
import '../../../api/inventory_repo.dart';
import '../../../api/sales_dispatch_models.dart';
import '../../../api/sales_dispatch_repo.dart';
import '../../../providers/data_providers.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_inr.dart';
import '../../../widgets/runq_snack.dart';
import 'inv_colors.dart';
import 'substitute_sheet.dart';

/// A line the operator swapped, and what they chose to do about the invoice.
typedef _Resolved = ({InvDnLine line, String itemName, bool relabel});

/// Runs the shortage conversation. No-op unless something was actually short.
Future<void> runShortfallFlow(
  BuildContext context,
  WidgetRef ref,
  InvAutoDispatchResult result, {
  String? invoiceId,
}) async {
  if (!result.isShort) return;
  final dnId = result.dnId!;

  if (await _confirmStart(context, result) != true) return;
  if (!context.mounted) return;

  final InvDnDetail dn;
  final Map<String, List<InvSubstituteOption>> options;
  try {
    dn = await inventoryRepo.dnGet(dnId);
    options = await salesDispatchRepo.draftSubstitutes(dnId);
  } catch (e) {
    if (context.mounted) {
      RunqSnack.error(context, "Couldn't load substitutes",
          description: snackErrorText(e));
    }
    return;
  }

  final resolved = <_Resolved>[];
  var unfilled = 0;
  for (final line in dn.lines) {
    final opts = options[line.id] ?? const <InvSubstituteOption>[];
    if (!context.mounted) return;
    // Nothing declared, or nothing in stock to declare against — there is no
    // swap to offer, so this line can only be resolved by not billing it.
    if (opts.isEmpty) {
      unfilled++;
      continue;
    }

    // Question 2 — which stand-in.
    final choice = await showSubstituteSheet(
      context,
      line: _asPreviewLine(line, opts),
    );
    if (choice == null) {
      // Declined the swap — the goods still aren't going out.
      unfilled++;
      continue;
    }
    if (!context.mounted) return;

    final picked = opts.firstWhere((o) => o.itemId == choice.itemId);
    try {
      await salesDispatchRepo.substituteDraftLine(
        dnId: dnId, lineId: line.id, itemId: choice.itemId, note: choice.note,
      );
    } catch (e) {
      if (context.mounted) {
        RunqSnack.error(
            context, "Couldn't substitute ${withUom(line.itemName, line.uom)}",
            description: snackErrorText(e));
      }
      continue;
    }
    if (!context.mounted) return;

    // Question 3 — which item the invoice should name. Asked now, applied
    // after dispatch: relabelling follows delivery, so there has to be a
    // dispatched line for it to point at.
    final relabel = await _askInvoiceChoice(
      context,
      billed: withUom(line.itemName, line.uom),
      sent: withUom(picked.itemName, picked.uom),
      qty: line.qty,
      billedPrice: line.unitCost,
      sentPrice: picked.sellingPrice,
    );
    resolved.add((line: line, itemName: picked.itemName, relabel: relabel));
  }

  if (resolved.isNotEmpty) {
    try {
      await inventoryRepo.dispatchDn(dnId);
    } catch (e) {
      if (context.mounted) {
        RunqSnack.error(context, "Substitute set, but stock didn't post",
            description: snackErrorText(e));
      }
      _refresh(ref, dnId, invoiceId);
      return;
    }
    final relabel = await _applyRelabels(invoiceId, resolved);
    if (relabel.failure != null && context.mounted) {
      RunqSnack.error(context, "Dispatched, but the invoice wasn't updated",
          description: relabel.failure);
    }
  }

  // Anything still unfilled would sit on the invoice as goods owed forever.
  // The only close that leaves nothing outstanding is to stop billing for it.
  if (unfilled > 0 && invoiceId != null && context.mounted) {
    await _offerTrim(context, invoiceId, unfilled);
  }

  _refresh(ref, dnId, invoiceId);
  if (!context.mounted) return;
  RunqSnack.success(context,
      resolved.isNotEmpty ? 'Dispatched with a substitute' : 'Invoice settled');
}

/// The close for a line nothing can fill: bill only what shipped.
///
/// Offered rather than applied, because it lowers what the customer owes.
/// Declining is allowed — the shortfall draft simply stays parked, and the
/// invoice keeps asking to be paid for goods that have not gone out.
Future<void> _offerTrim(BuildContext context, String invoiceId, int count) async {
  final t = RT(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('$count line${count == 1 ? '' : 's'} still cannot be sent',
          style: RunqText.h4.copyWith(color: t.ink)),
      content: Text(
        'Nothing is available to send in their place.\n\n'
        'Bill only what actually shipped and the invoice closes with nothing '
        'outstanding. The customer is charged less. Keep it as billed and the '
        'goods stay owed, waiting on stock.',
        style: RunqText.body.copyWith(color: t.muted),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text('Keep as billed', style: RunqText.body.copyWith(color: t.muted)),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: InvColors.brand(ctx)),
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text('Bill what shipped',
              style: RunqText.bodyStrong.copyWith(color: Colors.white)),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    await salesDispatchRepo.trimInvoiceToDelivered(invoiceId);
    if (context.mounted) {
      RunqSnack.success(context, 'Invoice reduced to what was delivered');
    }
  } catch (e) {
    if (context.mounted) {
      RunqSnack.error(context, "Couldn't reduce the invoice",
          description: snackErrorText(e));
    }
  }
}

/// Relabels are best-effort: the goods have moved and the delivery note
/// already records the swap, so a refused edit — a filed return, an IRN — is
/// worth reporting but must not read as a failed dispatch.
Future<({int done, String? failure})> _applyRelabels(
  String? invoiceId,
  List<_Resolved> resolved,
) async {
  if (invoiceId == null) return (done: 0, failure: null);
  var done = 0;
  String? failure;
  for (final r in resolved.where((r) => r.relabel)) {
    final lineId = r.line.invoiceLineId;
    if (lineId == null) continue;
    try {
      await salesDispatchRepo.relabelInvoiceLine(invoiceId: invoiceId, lineId: lineId);
      done++;
    } catch (e) {
      // The dispatch stands and the delivery note carries the truth, so this
      // is not a failed shipment — but the operator asked for the invoice to
      // say something and it does not, which they have to be told. A filed
      // return or an IRN both land here with a reason worth reading.
      failure ??= snackErrorText(e);
    }
  }
  return (done: done, failure: failure);
}

/// Everything this flow can have changed.
///
/// The invoice providers matter as much as the inventory ones: relabelling
/// rewrites the line the operator is looking at, and without dropping the
/// cached detail the screen keeps rendering the item that was billed. The
/// edit had gone through — it just wasn't on screen, which is the same thing
/// from where the operator is standing.
void _refresh(WidgetRef ref, String dnId, String? invoiceId) {
  ref.invalidate(invDnDetailProvider(dnId));
  ref.invalidate(invDraftSubstitutesProvider(dnId));
  ref.invalidate(invPendingDispatchProvider);
  ref.invalidate(invShortageCountProvider);
  ref.invalidate(invShortagesProvider);
  ref.invalidate(invKpisProvider);
  if (invoiceId != null) ref.invalidate(invoiceDetailProvider(invoiceId));
  ref.invalidate(invoicesProvider);
  ref.invalidate(invoiceSummaryProvider);
}

/// Question 1 — name what is short and offer a way out of it.
///
/// Built as a sheet rather than an alert because the answer depends on data
/// the operator has to read: which items, and how many of each. An alert
/// crams that into a paragraph, where "Farm Fresh Cow Milk ×20, Buffalo Milk
/// ×8 could not be sent" is a sentence to parse rather than a list to scan.
/// Here the items are rows — name left, quantity right — so the shape of the
/// problem is legible before a single word is read.
Future<bool?> _confirmStart(BuildContext context, InvAutoDispatchResult r) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _ShortfallIntro(result: r),
  );
}

class _ShortfallIntro extends StatelessWidget {
  const _ShortfallIntro({required this.result});
  final InvAutoDispatchResult result;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final items = result.shortItems;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          // The headline carries the severity; the icon is a tint on it rather
          // than a second, competing focal point.
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: InvColors.errorBg,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(Icons.inventory_2_outlined,
                    size: 18, color: InvColors.error),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Not enough stock',
                        style: RunqText.h4.copyWith(color: t.ink)),
                    const SizedBox(height: 1),
                    Text(
                      '${items.length} line${items.length == 1 ? '' : 's'} billed '
                      'but not sent',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // The data, as data.
          Container(
            decoration: BoxDecoration(
              color: t.bgWarm,
              borderRadius: BorderRadius.circular(10),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: t.hairlineSoft),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              text: items[i].itemName,
                              style: RunqText.body.copyWith(color: t.ink),
                              children: (items[i].uom ?? '').isEmpty
                                  ? null
                                  : [
                                      // Muted and trailing: the pack size
                                      // identifies the SKU without competing
                                      // with the name for the first read.
                                      TextSpan(
                                        text: '  ${items[i].uom}',
                                        style: RunqText.caption
                                            .copyWith(color: t.muted),
                                      ),
                                    ],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text('short ${_qty(items[i].qty)}',
                            style: RunqText.bodyStrong
                                .copyWith(color: InvColors.error)),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'The invoice stands, and what is owed is saved as '
            '${result.dnNo ?? 'a draft'}. You can send a substitute now, or '
            'deal with it later from Shortages.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 16),
          // Primary action full-width beneath, not competing side by side:
          // substituting is the expected move, deferring is the escape.
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: InvColors.brand(context),
              padding: const EdgeInsets.symmetric(vertical: 14),
              minimumSize: const Size.fromHeight(0),
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Send a substitute',
                style: RunqText.bodyStrong.copyWith(color: Colors.white)),
          ),
          const SizedBox(height: 6),
          TextButton(
            style: TextButton.styleFrom(minimumSize: const Size.fromHeight(44)),
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Deal with it later',
                style: RunqText.body.copyWith(color: t.muted)),
          ),
        ],
      ),
    );
  }

  static String _qty(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

/// Question 3 — what the customer's document should name.
///
/// A sheet, and the two answers are rows rather than sentences. The old alert
/// spent three paragraphs explaining a choice between two item names, which
/// buried the only thing being decided: which name goes on the invoice. Here
/// each option shows the name it would print, with one line saying what that
/// means, and the reassurance that nothing financial moves is a footnote
/// rather than the bulk of the text.
///
/// Defaults to leaving the invoice as billed — relabelling is opt-in, so the
/// pre-selected answer is the one that changes nothing.
Future<bool> _askInvoiceChoice(
  BuildContext context, {
  required String billed,
  required String sent,
  required double qty,
  required double billedPrice,
  required double? sentPrice,
}) async {
  final choice = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _InvoiceNamingSheet(
      billed: billed,
      sent: sent,
      qty: qty,
      billedPrice: billedPrice,
      sentPrice: sentPrice,
    ),
  );
  return choice ?? false;
}

class _InvoiceNamingSheet extends StatefulWidget {
  const _InvoiceNamingSheet({
    required this.billed,
    required this.sent,
    required this.qty,
    required this.billedPrice,
    required this.sentPrice,
  });
  final String billed;
  final String sent;
  final double qty;
  final double billedPrice;

  /// Null when the stand-in has no list price — there is nothing to re-price
  /// to, so relabelling renames the line and leaves the money alone.
  final double? sentPrice;

  @override
  State<_InvoiceNamingSheet> createState() => _InvoiceNamingSheetState();
}

class _InvoiceNamingSheetState extends State<_InvoiceNamingSheet> {
  bool _relabel = false;

  /// True when choosing the substitute would actually move the money.
  bool get _repriced =>
      widget.sentPrice != null &&
      (widget.sentPrice! - widget.billedPrice).abs() > 0.005;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: InvColors.amberSubtle,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(Icons.receipt_long_outlined,
                    size: 18, color: InvColors.brand(context)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('What should the invoice say?',
                        style: RunqText.h4.copyWith(color: t.ink)),
                    const SizedBox(height: 1),
                    Text('${widget.sent} is going out instead',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _Option(
            name: widget.billed,
            note: 'Leave the invoice as billed',
            amount: widget.billedPrice * widget.qty,
            selected: !_relabel,
            onTap: () => setState(() => _relabel = false),
          ),
          const SizedBox(height: 8),
          _Option(
            name: widget.sent,
            note: _repriced
                ? 'Charge the ${_money(widget.sentPrice!)} rate for it'
                : 'Name what actually left the warehouse',
            amount: (widget.sentPrice ?? widget.billedPrice) * widget.qty,
            selected: _relabel,
            onTap: () => setState(() => _relabel = true),
          ),
          const SizedBox(height: 12),
          // The money moving is the part that needs saying plainly — the
          // customer agreed to one number and this changes it.
          Text(
            _repriced
                ? 'Naming the substitute charges its own rate, so this line '
                  'goes from ${_money(widget.billedPrice * widget.qty)} to '
                  '${_money(widget.sentPrice! * widget.qty)}. Tax and HSN are '
                  'unchanged. Tell the customer before you choose it.'
                : "This only changes the name on the line — the total, HSN and "
                  "tax don't change.",
            style: RunqText.caption.copyWith(
              color: _repriced ? InvColors.orangeAlert : t.muted,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: InvColors.brand(context),
              padding: const EdgeInsets.symmetric(vertical: 14),
              minimumSize: const Size.fromHeight(0),
            ),
            onPressed: () => Navigator.of(context).pop(_relabel),
            child: Text('Confirm',
                style: RunqText.bodyStrong.copyWith(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}

/// One of the two names the invoice could carry.
class _Option extends StatelessWidget {
  const _Option({
    required this.name,
    required this.note,
    required this.amount,
    required this.selected,
    required this.onTap,
  });
  final String name;
  final String note;

  /// What this line would come to. Shown on both options so the choice is a
  /// comparison rather than a guess.
  final double amount;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
        decoration: BoxDecoration(
          color: selected ? InvColors.amberSubtle : t.bgWarm,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? InvColors.amberHairline : Colors.transparent,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              size: 18,
              color: selected ? InvColors.brand(context) : t.muted2,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 1),
                  Text(note, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(_money(amount),
                style: RunqText.tabular(
                    size: 14, w: FontWeight.w600, color: t.ink)),
          ],
        ),
      ),
    );
  }
}

String _money(double v) => formatINR(v);

/// The sheet is shared with the dispatch screen, which works off a preview
/// line; only the name and options matter to it.
InvDispatchPreviewLine _asPreviewLine(InvDnLine line, List<InvSubstituteOption> opts) =>
    InvDispatchPreviewLine(
      invoiceLineId: line.invoiceLineId ?? line.id,
      description: line.itemName,
      invoicedQty: line.qty,
      dispatchedQty: 0,
      remainingQty: line.qty,
      itemId: line.itemId,
      itemName: line.itemName,
      uom: line.uom,
      trackBatches: line.trackBatches,
      resolution: InvLineResolution.item,
      availableQty: 0,
      substitutes: opts,
    );
