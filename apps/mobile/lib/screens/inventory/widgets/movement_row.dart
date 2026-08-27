// One row of the item stock audit trail, and the day header above each
// block of them. Split out of the trail screen so the screen file holds the
// screen (query, filters, paging) and this one holds how a movement reads.

library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../api/inventory_movement_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

/// Day label, that day's net movement, and where stock stood when it ended.
///
/// The closing balance is the running quantity on the day's most recent row
/// — rows arrive newest-first, so that is the first of them. Reading
/// "26 AUG · +912 −753 · 159" answers the whole day without scanning it.
class InvMovementDayHeader extends StatelessWidget {
  const InvMovementDayHeader({super.key, required this.iso, required this.rows});
  final String iso;
  final List<InvMovementRow> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    var inQty = 0.0, outQty = 0.0;
    for (final r in rows) {
      inQty += r.qtyIn;
      outQty += r.qtyOut;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: t.hairlineSoft)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              prettyShortDate(iso).toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted),
            ),
          ),
          if (inQty > 0)
            Text('+${invQty(inQty)}',
                style: RunqText.caption.copyWith(
                    color: InvColors.success, fontWeight: FontWeight.w700)),
          if (inQty > 0 && outQty > 0) const SizedBox(width: 8),
          if (outQty > 0)
            Text('−${invQty(outQty)}',
                style: RunqText.caption.copyWith(
                    color: InvColors.error, fontWeight: FontWeight.w700)),
          const SizedBox(width: 10),
          Text(
            invQty(rows.first.runningQty),
            style: RunqText.tabular(size: 12, w: FontWeight.w700)
                .copyWith(color: t.ink),
          ),
        ],
      ),
    );
  }
}

/// One movement, three lines at most:
///   time │ [kind]  document                 signed qty
///        │ counterparty · linked document   balance after
///        │ batch · warehouse · who posted it
///
/// The time sits in a fixed gutter rather than inline, so the column of
/// times reads as the timeline it is. The unit is not repeated per row — the
/// app bar already says what everything here is counted in — and neither is
/// the rate: this is a quantity trail, and the value belongs on the document.
class InvMovementListRow extends StatelessWidget {
  const InvMovementListRow({super.key, required this.row});
  final InvMovementRow row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final route = row.doc?.route;
    final tone = row.isIn ? InvColors.success : InvColors.error;
    final provenance = _provenance;

    return InkWell(
      onTap: route == null ? null : () => context.push(route),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 58,
              child: Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  prettyTime(row.postedAt),
                  style: RunqText.tabular(size: 12, w: FontWeight.w600)
                      .copyWith(color: t.muted),
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _headline(context, t, route, tone),
                  const SizedBox(height: 2),
                  _subline(t, _about),
                  if (provenance.isNotEmpty)
                    Text(
                      provenance,
                      style: RunqText.caption.copyWith(color: t.muted2),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Who the movement was with, and what it points at.
  String get _about => [
        row.doc?.party,
        row.doc?.note,
        if (row.doc?.ref != null)
          '${row.doc!.ref!.label ?? 'Ref'} ${row.doc!.ref!.no}',
      ].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

  /// Where it happened and who booked it — the third line, shown only when
  /// there is something to say.
  String get _provenance => [
        if (row.batchNo != null && row.batchNo!.isNotEmpty) row.batchNo!,
        row.warehouseName,
        if (row.postedByName != null) row.postedByName!,
      ].where((s) => s.isNotEmpty).join(' · ');

  /// What kind of movement it was, which document, how much. The kind is a
  /// pill because it is the one field on the row drawn from a fixed
  /// vocabulary — a shape the eye can sort on without reading.
  Widget _headline(BuildContext context, RunqTokens t, String? route, Color tone) {
    final doc = row.doc;
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: row.isIn ? InvColors.successBg : InvColors.errorBg,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            invMovementLabels[row.movementType] ?? row.movementType,
            style: RunqText.caption
                .copyWith(color: tone, fontWeight: FontWeight.w700),
          ),
        ),
        if (doc != null) ...[
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              doc.no,
              style: RunqText.body.copyWith(
                color: route == null ? t.ink : InvColors.brand(context),
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ] else
          const Spacer(),
        const SizedBox(width: 8),
        Text(
          '${row.isIn ? '+' : '−'}${invQty(row.qty)}',
          style: RunqText.bodyStrong.copyWith(color: tone),
        ),
      ],
    );
  }

  /// Who it was with, and where the balance stood after it.
  Widget _subline(RunqTokens t, String about) {
    return Row(
      children: [
        Expanded(
          child: Text(
            about.isEmpty ? '—' : about,
            style: RunqText.caption.copyWith(color: t.ink2),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'Bal ${invQty(row.runningQty)}',
          style: RunqText.tabular(size: 12, w: FontWeight.w600)
              .copyWith(color: t.muted),
        ),
      ],
    );
  }
}

String invQty(double v) {
  final s = v.toStringAsFixed(3);
  return s.contains('.')
      ? s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '')
      : s;
}
