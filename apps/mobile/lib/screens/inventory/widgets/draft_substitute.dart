// Substituting on a delivery note that already exists, and squaring the
// invoice afterwards.
//
// The dispatch screen is not where most substitutions happen. Auto-dispatch
// meets the shortage at invoice time, ships what the shelf covers and parks
// the rest on a draft; the operator arrives hours later, at that draft. So the
// picker has to live here too, and swap the line in place — a shortfall draft
// usually carries several lines, and tearing it down to change one would drop
// the others out of the shortages queue while they are still owed.
//
// The second card is the choice that follows delivery. Leaving the invoice
// naming what was billed is coherent: the customer pays the quoted price
// either way, and the swap is on the delivery note. But the document then
// disagrees with the carton, so updating it is offered — never assumed.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../api/sales_dispatch_models.dart';
import '../../../api/sales_dispatch_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'inv_colors.dart';
import 'substitute_sheet.dart';

/// The swap action on a draft line, or a note of the swap already made.
class DraftSubstituteRow extends StatelessWidget {
  const DraftSubstituteRow({
    super.key,
    required this.dnId,
    required this.line,
    required this.options,
    required this.isDraft,
    required this.onChanged,
  });

  final String dnId;
  final InvDnLine line;
  final List<InvSubstituteOption> options;
  final bool isDraft;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (line.isSubstituted) {
      return Padding(
        padding: const EdgeInsets.only(top: 5),
        child: Row(
          children: [
            Icon(Icons.swap_horiz, size: 14, color: InvColors.brand(context)),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                line.substitutionNote?.isNotEmpty == true
                    ? 'Substituted — ${line.substitutionNote}'
                    : 'Substituted',
                style: RunqText.caption.copyWith(color: InvColors.brand(context)),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }
    if (!isDraft || options.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 5),
      child: InkWell(
        onTap: () => _pick(context),
        borderRadius: BorderRadius.circular(8),
        child: Row(
          children: [
            Icon(Icons.swap_horiz, size: 14, color: t.muted),
            const SizedBox(width: 5),
            Text('Send something else',
                style: RunqText.caption.copyWith(color: t.muted)),
            const Spacer(),
            Icon(Icons.chevron_right, size: 14, color: t.muted2),
          ],
        ),
      ),
    );
  }

  Future<void> _pick(BuildContext context) async {
    // The sheet is shared with the dispatch screen, which works off a preview
    // line. Only the name and the options matter to it, so a DN line is
    // adapted rather than the sheet duplicated.
    final choice = await showSubstituteSheet(
      context,
      line: InvDispatchPreviewLine(
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
        substitutes: options,
      ),
    );
    if (choice == null || !context.mounted) return;
    try {
      await salesDispatchRepo.substituteDraftLine(
        dnId: dnId,
        lineId: line.id,
        itemId: choice.itemId,
        note: choice.note,
      );
      await onChanged();
      if (context.mounted) {
        RunqSnack.success(context, 'Substitute set — dispatch to send it');
      }
    } catch (e) {
      if (context.mounted) {
        RunqSnack.error(context, "Couldn't substitute", description: snackErrorText(e));
      }
    }
  }
}

/// After the goods have gone: offer to make the invoice say what was sent.
///
/// Naming the substitute also charges its rate, so the line total moves — the
/// point being that an A2 line recorded at the Farm Fresh price poisons every
/// later reading of what A2 sells for. HSN and GST rate are untouched: the
/// guard refused any stand-in whose tax treatment differed.
class RelabelInvoiceCard extends StatefulWidget {
  const RelabelInvoiceCard({
    super.key,
    required this.invoiceId,
    required this.lines,
    required this.onChanged,
  });

  final String invoiceId;
  final List<InvDnLine> lines;
  final Future<void> Function() onChanged;

  @override
  State<RelabelInvoiceCard> createState() => _RelabelInvoiceCardState();
}

class _RelabelInvoiceCardState extends State<RelabelInvoiceCard> {
  final _done = <String>{};
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final swapped = widget.lines
        .where((l) => l.isSubstituted && l.invoiceLineId != null)
        .toList();
    if (swapped.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.swap_horiz, size: 15, color: t.muted),
            const SizedBox(width: 6),
            Text('Sent a substitute', style: RunqText.label.copyWith(color: t.muted)),
          ]),
          const SizedBox(height: 6),
          Text(
            'The invoice still names what was billed. Leave it, or update it to '
            "name what actually left — which charges that item's own rate, so the "
            'line total changes. HSN and tax stay as they were.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 10),
          for (final l in swapped) _row(context, l),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, InvDnLine l) {
    final t = RT(context);
    final done = _done.contains(l.id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text('Sent ${withUom(l.itemName, l.uom)}',
                style: RunqText.body.copyWith(color: t.ink),
                maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          if (done)
            Row(children: [
              Icon(Icons.check, size: 15, color: InvColors.success),
              const SizedBox(width: 4),
              Text('Updated',
                  style: RunqText.caption.copyWith(color: InvColors.success)),
            ])
          else
            TextButton(
              onPressed: _busy ? null : () => _apply(l),
              child: Text('Update invoice',
                  style: RunqText.caption.copyWith(color: InvColors.brand(context))),
            ),
        ],
      ),
    );
  }

  Future<void> _apply(InvDnLine l) async {
    setState(() => _busy = true);
    try {
      await salesDispatchRepo.relabelInvoiceLine(
        invoiceId: widget.invoiceId,
        lineId: l.invoiceLineId!,
      );
      if (mounted) setState(() => _done.add(l.id));
      await widget.onChanged();
      if (mounted) {
        RunqSnack.success(context, 'Invoice updated to show what was delivered');
      }
    } catch (e) {
      if (mounted) {
        RunqSnack.error(context, "Couldn't update the invoice",
            description: snackErrorText(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
