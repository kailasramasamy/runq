// One raw material, opened from the floor: how much is here, and when each
// lot of it landed.
//
// The question behind the tap is always the same — "which milk do I open
// next" — and it is answered by time. A consignment number cannot be compared
// to another consignment number; `Today 10:21 AM` against `Yesterday 6:40 PM`
// can, at a glance, without reading either code. So the clock leads every row
// and the consignment drops to the last, quietest line, where it is still
// there for anyone reconciling against the register.
//
// No rupees anywhere. What the milk cost is Inventory's question, and on the
// floor it is one more number to read past.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_expiry.dart';
import '../../utils/format_qty.dart';
import '../inventory/batch_detail_sheet.dart';
import '../inventory/widgets/batch_pool.dart' show batchOriginIcon;
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Opens the pool for one raw material. [rows] are that item's on-hand rows,
/// one per (warehouse, batch) — already fetched by the caller, so the sheet
/// costs no round trip.
Future<void> showMfgMaterialSheet(
  BuildContext context, {
  required List<InvOnHandRow> rows,
}) {
  if (rows.isEmpty) return Future<void>.value();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => MfgMaterialSheet(rows: rows),
  );
}

class MfgMaterialSheet extends ConsumerWidget {
  const MfgMaterialSheet({super.key, required this.rows});

  final List<InvOnHandRow> rows;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final first = rows.first;
    // Freshest first. The floor draws FEFO, but it reads newest-down: "what
    // came in this morning" is the top of the list, and the tail is whatever
    // is still sitting from earlier. Expiry urgency rides each row, so nothing
    // about draw order is lost by ordering on arrival.
    final ordered = [...rows]..sort(_byArrivalDesc);
    final total = rows.fold<double>(0, (s, r) => s + r.qty);
    // What each lot has already gone into. One call for every lot on screen —
    // the cards render without it and fill in when it lands, so a slow trail
    // never holds up the quantity somebody opened the sheet to read.
    final usage = ref
            .watch(batchUsageProvider(BatchUsageParams(
              itemId: first.itemId,
              batchNos: ordered.map((r) => r.batchNo).toList(),
            )))
            .asData
            ?.value ??
        const <String, List<BatchUsageRun>>{};

    // Sized to its contents, capped at most of the screen. A fixed fraction
    // left a milk with one lot floating above half a screen of empty warm
    // grey; the sheet should be as tall as what is in it and no taller, and
    // only start scrolling once the lots genuinely overflow.
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.9,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: t.bgWarm,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _grabber(t),
          _Header(item: first, total: total, lots: rows.length),
          // Flexible, not Expanded: a short list takes only the height it
          // needs, a long one is handed whatever is left under the cap.
          Flexible(
            child: ListView(
              shrinkWrap: true,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              children: [
                for (final r in ordered)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _LotCard(
                      row: r,
                      madeInto: usage[r.batchNo] ?? const <BatchUsageRun>[],
                    ),
                  ),
              ],
            ),
          ),
          _UseInProduction(itemName: first.itemName),
        ]),
      ),
    );
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
}

/// Newest arrival first; anything without a timestamp sinks to the bottom
/// rather than claiming the top slot by accident.
int _byArrivalDesc(InvOnHandRow a, InvOnHandRow b) {
  final x = a.receivedAt ?? '';
  final y = b.receivedAt ?? '';
  if (x.isEmpty && y.isEmpty) return a.batchNo.compareTo(b.batchNo);
  if (x.isEmpty) return 1;
  if (y.isEmpty) return -1;
  return y.compareTo(x);
}

// ── Header ────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.item, required this.total, required this.lots});

  final InvOnHandRow item;
  final double total;
  final int lots;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unit = item.itemUnit ?? '';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              item.itemName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: RunqText.h3.copyWith(color: t.ink, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            Text(
              lots == 1 ? 'in 1 lot' : 'across $lots lots',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ]),
        ),
        const SizedBox(width: 12),
        // The number the tap was for, at the size it deserves.
        Text.rich(
          TextSpan(children: [
            TextSpan(
              text: formatItemQty(total, null, unit: item.itemUnit),
              style: RunqText.h1.copyWith(
                color: MfgColors.brand(context),
                height: 1,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (unit.isNotEmpty)
              TextSpan(
                text: ' $unit',
                style: RunqText.body.copyWith(color: t.muted),
              ),
          ]),
        ),
      ]),
    );
  }
}

// ── One lot ───────────────────────────────────────────────────────────────

/// A single batch, written the way it is chosen: when it arrived, where from,
/// how much is left, how long it has. The consignment code is the last line —
/// present for anyone reconciling, invisible to anyone deciding.
class _LotCard extends StatelessWidget {
  const _LotCard({required this.row, required this.madeInto});

  final InvOnHandRow row;

  /// The runs this lot has already fed. Empty until the trail loads, and for
  /// a lot nothing has drawn on yet.
  final List<BatchUsageRun> madeInto;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final o = row.origin;
    final unit = row.itemUnit ?? '';
    final expiry = shortExpiry(row.expiryDate);
    final source = _sourceLine(row);

    return MfgCard(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(batchOriginIcon(o?.kind), size: 16, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // The lead: when this lot landed, to the minute.
              Text(
                arrivalStamp(row.receivedAt) ?? 'Arrival not recorded',
                style: RunqText.bodyStrong.copyWith(color: t.ink),
              ),
              if (source != null) ...[
                const SizedBox(height: 2),
                Text(
                  source,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ]),
          ),
          const SizedBox(width: 8),
          Text(
            '${formatItemQty(row.qty, null, unit: row.itemUnit)}'
            '${unit.isEmpty ? '' : ' $unit'}',
            style: RunqText.bodyStrong.copyWith(color: t.ink),
          ),
        ]),
        if (expiry != null) ...[
          const SizedBox(height: 8),
          _Chip(label: 'Expires $expiry', tone: _expiryTone(row.expiryDate)),
        ],
        // What this lot has already become. "part-used · 577.9 litre drawn"
        // used to sit here, which says something left without saying what —
        // and the one thing worth knowing about a half-empty can of milk is
        // which product it went into.
        if (madeInto.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text('MADE FROM THIS LOT',
              style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
          const SizedBox(height: 4),
          for (final run in madeInto) _MadeRow(run: run),
        ],
        const SizedBox(height: 8),
        // The audit handle. Deliberately the smallest, quietest thing on the
        // card — it identifies the lot to the register, not to the operator.
        InkWell(
          onTap: () => showBatchDetailSheet(
            context,
            BatchDetailArgs(
              itemId: row.itemId,
              itemName: row.itemName,
              batchNo: row.batchNo,
              qty: row.qty,
              unit: row.itemUnit,
              expiryDate: row.expiryDate,
              warehouseName: row.warehouseName,
              origin: row.origin,
            ),
          ),
          child: Row(children: [
            Expanded(
              child: Text(
                row.batchNo.isEmpty ? 'No batch number' : row.batchNo,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
            ),
            Text('Full history',
                style: RunqText.micro.copyWith(color: MfgColors.brand(context))),
            Icon(Icons.chevron_right_rounded, size: 14, color: MfgColors.brand(context)),
          ]),
        ),
      ]),
    );
  }
}

/// Where the lot came from, minus anything the row already says. The origin
/// label leads with the source date (`Indus CC · 28 Aug PM · A2 cow`), which
/// the arrival stamp above now carries better — so the date is dropped and
/// the centre, shift and milk type kept.
String? _sourceLine(InvOnHandRow row) {
  final o = row.origin;
  final parts = <String>[
    if (o != null && o.label.isNotEmpty) _withoutDate(o.label, o.date),
    row.warehouseName,
  ].where((s) => s.isNotEmpty).toList();
  return parts.isEmpty ? null : parts.join(' → ');
}

/// Strips the `28 Aug` segment the API bakes into an origin label, along with
/// the separator it hangs off. Anything unrecognised is returned untouched —
/// a label losing a segment it needed is worse than one repeating a date.
String _withoutDate(String label, String? isoDate) {
  if (isoDate == null) return label;
  final d = DateTime.tryParse(isoDate);
  if (d == null) return label;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  final needle = '${d.day} ${months[d.month - 1]}';
  return label
      .split(' · ')
      .where((seg) => !seg.startsWith(needle))
      .join(' · ');
}

/// An arrival timestamp as the floor reads it: `Today 10:21 AM`,
/// `Yesterday 6:40 PM`, then `29 Aug, 6:40 PM` once it is older than that.
///
/// Converted to local time first — the API stamps UTC, and a late-evening
/// intake would otherwise read as the day before.
String? arrivalStamp(String? iso, {DateTime? now}) {
  if (iso == null || iso.isEmpty) return null;
  final at = DateTime.tryParse(iso)?.toLocal();
  if (at == null) return null;
  final today = now ?? DateTime.now();
  final days = DateTime(at.year, at.month, at.day)
      .difference(DateTime(today.year, today.month, today.day))
      .inDays;

  final hour12 = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final time = '$hour12:${at.minute.toString().padLeft(2, '0')} '
      '${at.hour < 12 ? 'AM' : 'PM'}';
  if (days == 0) return 'Today $time';
  if (days == -1) return 'Yesterday $time';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return '${at.day} ${months[at.month - 1]}, $time';
}

/// One run this lot fed: what came out and how much of it, and how much of
/// *this* lot went in.
///
/// The output count sits next to the product name because that is the sentence
/// being read — "A2 Desi Cow Milk · 1,041 × 500ml". When the run drew from
/// other lots as well the draw line says so ("525.8 of 1,050 litre"), because
/// the count is then the run's and not this lot's, and printing it bare would
/// credit one can of milk with packets that came from three.
class _MadeRow extends StatelessWidget {
  const _MadeRow({required this.run});
  final BatchUsageRun run;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final uom = run.drawnUom.isEmpty ? '' : ' ${run.drawnUom}';
    final when = run.producedAt == null ? null : arrivalStamp(run.producedAt);
    // How much of this lot went in — and, when the run took more from
    // elsewhere, what that was a part of.
    final draw = run.isWholeRun
        ? '${formatItemQty(run.drawnQty, null, unit: run.drawnUom)}$uom from this lot'
        : '${formatItemQty(run.drawnQty, null, unit: run.drawnUom)} of '
            '${formatItemQty(run.runDrewQty, null, unit: run.drawnUom)}$uom drawn';

    return InkWell(
      onTap: () => context.push('/manufacturing/wos/${run.woId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(Icons.precision_manufacturing_outlined, size: 13, color: brand),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (run.outputs.isEmpty)
                Text(
                  'Output not recorded yet',
                  style: RunqText.caption.copyWith(color: t.muted),
                )
              else
                for (final o in run.outputs)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 1),
                    child: Text.rich(
                      TextSpan(children: [
                        // The UoM belongs to the product, not to the number —
                        // "A2 Desi Cow Milk 500ml" is the SKU's name on the
                        // floor, and 1,041 is how many of it came out.
                        TextSpan(
                          text: o.uom.isEmpty ? o.itemName : '${o.itemName} ${o.uom}',
                          style: RunqText.caption
                              .copyWith(color: t.ink, fontWeight: FontWeight.w600),
                        ),
                        TextSpan(
                          text: ' - ',
                          style: RunqText.caption.copyWith(color: t.muted2),
                        ),
                        TextSpan(
                          text: formatItemQty(o.qty, null, unit: o.uom),
                          style: RunqText.caption
                              .copyWith(color: brand, fontWeight: FontWeight.w700),
                        ),
                      ]),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              const SizedBox(height: 1),
              Text(
                [run.woNumber, ?when, draw].join('  ·  '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
            ]),
          ),
          const SizedBox(width: 6),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(Icons.chevron_right_rounded, size: 14, color: t.muted2),
          ),
        ]),
      ),
    );
  }
}

// ── Bits ──────────────────────────────────────────────────────────────────

enum _Tone { neutral, warning, danger }

_Tone _expiryTone(String? iso) {
  final date = iso == null ? null : DateTime.tryParse(iso);
  if (date == null) return _Tone.neutral;
  final now = DateTime.now();
  final days = DateTime(date.year, date.month, date.day)
      .difference(DateTime(now.year, now.month, now.day))
      .inDays;
  if (days <= 0) return _Tone.danger;
  if (days <= 2) return _Tone.warning;
  return _Tone.neutral;
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.tone});
  final String label;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (bg, fg) = switch (tone) {
      _Tone.danger => (MfgColors.errorBg, MfgColors.error),
      _Tone.warning => (MfgColors.orangeAlertBg, MfgColors.orangeAlert),
      _Tone.neutral => (t.bgWarm, t.muted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(
        label,
        style: RunqText.caption.copyWith(color: fg, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// The only reason the floor is looking at this stock. Sitting at the bottom
/// of the sheet it turns "how much milk is there" straight into the entry,
/// instead of sending the operator back out to the FAB.
class _UseInProduction extends StatelessWidget {
  const _UseInProduction({required this.itemName});
  final String itemName;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: MfgPrimaryButton(
        label: 'Use in production',
        icon: Icons.bolt_rounded,
        onPressed: () {
          Navigator.of(context).pop();
          context.push('/manufacturing/production/new');
        },
      ),
    );
  }
}
