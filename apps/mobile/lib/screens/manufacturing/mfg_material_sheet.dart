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
    // Root navigator, so the shell's bottom nav cannot paint over the sheet's
    // own footer button — see showDrawYieldSheet.
    useRootNavigator: true,
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
        const <String, BatchUsage>{};

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
                      usage: usage[r.batchNo] ?? const BatchUsage(),
                    ),
                  ),
              ],
            ),
          ),
          _UseInProduction(item: first),
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
  const _LotCard({required this.row, required this.usage});

  final InvOnHandRow row;

  /// Everything that has left this lot. Empty until the trail loads, and for
  /// a lot nothing has drawn on yet.
  final BatchUsage usage;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final o = row.origin;
    final expiry = shortExpiry(row.expiryDate);

    return MfgCard(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // 1. WHEN + how long it has. The two facts that decide whether this is
        //    the can to open next.
        Row(children: [
          Icon(batchOriginIcon(o?.kind), size: 16, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              arrivalStamp(row.receivedAt) ?? 'Arrival not recorded',
              style: RunqText.bodyStrong.copyWith(color: t.ink),
            ),
          ),
          if (expiry != null)
            _Chip(label: 'Expires $expiry', tone: _expiryTone(row.expiryDate)),
        ]),
        // 2. WHERE from, and which consignment. The code rides the plant name
        //    rather than sitting alone at the foot of the card: it identifies
        //    the delivery, so it belongs with the delivery.
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 24),
          child: Text.rich(
            TextSpan(children: [
              TextSpan(
                text: _sourceLine(row) ?? '',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
              if (row.batchNo.isNotEmpty)
                TextSpan(
                  text: '  ·  ${row.batchNo}',
                  style: RunqText.micro.copyWith(color: t.muted2),
                ),
            ]),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        // 3. THE MILK: what arrived, what has gone, what is left. A balance on
        //    its own says nothing about whether the can is barely touched or
        //    nearly dry — the three numbers together do.
        const SizedBox(height: 10),
        _BalanceStrip(row: row),
        // 4. WHAT IT BECAME.
        if (usage.runs.isNotEmpty) ...[
          const SizedBox(height: 12),
          _GroupLabel('Made from this lot'),
          for (final run in usage.runs) _MadeRow(run: run),
        ],
        // 5. AND WHERE THE REST WENT. Wastage, a transfer, milk sold back to a
        //    farmer — without these the card cannot add up, and a gap between
        //    "used" and "made" is a question the floor cannot answer from the
        //    screen. 52 litres of missing milk is not a rounding difference.
        if (usage.otherOut.isNotEmpty) ...[
          const SizedBox(height: 12),
          _GroupLabel('Also went out'),
          for (final o in usage.otherOut) _OtherOutRow(out: o, unit: row.itemUnit),
        ],
        // 6. The way out to the full ledger.
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerRight,
          child: InkWell(
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
                viaManufacturing: true,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('Full history',
                    style: RunqText.micro.copyWith(color: MfgColors.brand(context))),
                Icon(Icons.chevron_right_rounded,
                    size: 14, color: MfgColors.brand(context)),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Received → used → left, for one lot.
///
/// "Left" is the number the floor acts on, so it carries the brand colour and
/// the rest sit quiet beside it as the context that makes it mean something.
/// Where the intake quantity is unknown the strip shows the balance alone
/// rather than inventing a total to subtract from.
class _BalanceStrip extends StatelessWidget {
  const _BalanceStrip({required this.row});
  final InvOnHandRow row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final received = row.origin?.receivedQty;
    final used = received == null ? null : (received - row.qty).clamp(0.0, received);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(10),
      ),
      // IntrinsicHeight so the rules span whatever the tallest column turns
      // out to be. Fixed-height dividers sat at their own arbitrary height
      // against two lines of text and read as misaligned rather than as a
      // separator between columns.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (received != null) ...[
              _Stat(label: 'Received', qty: received, unit: row.itemUnit),
              _divider(t),
              _Stat(label: 'Used', qty: used!, unit: row.itemUnit),
              _divider(t),
            ],
            _Stat(
              label: 'Left',
              qty: row.qty,
              unit: row.itemUnit,
              tone: MfgColors.brand(context),
            ),
          ],
        ),
      ),
    );
  }

  /// A hairline with air on both sides. Butted straight up against the next
  /// column it read as an underline on the label rather than a separator.
  Widget _divider(RunqTokens t) => Container(
        width: 1,
        margin: const EdgeInsets.symmetric(horizontal: 12),
        color: t.hairline,
      );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.qty, this.unit, this.tone});
  final String label;
  final double qty;
  final String? unit;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: RunqText.micro.copyWith(color: t.muted)),
        const SizedBox(height: 2),
        Text.rich(
          TextSpan(children: [
            TextSpan(
              text: formatItemQty(qty, null, unit: unit),
              style: RunqText.bodyStrong.copyWith(color: tone ?? t.ink),
            ),
            if ((unit ?? '').isNotEmpty)
              TextSpan(
                text: ' $unit',
                style: RunqText.micro.copyWith(color: t.muted),
              ),
          ]),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
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

/// One run this lot fed: the products it put out, and how much of this lot
/// went in.
///
/// One line per product — `Farm Fresh Cow Milk 500ml (50)` — with this lot's
/// draw held against the right edge of the first line. A run that made three
/// things still states its draw once: repeating it per SKU would read as
/// though each of them had taken the whole can.
///
/// When the run also drew from other lots the draw reads "525.8 / 1,050
/// litre": the count is then the run's output, not this lot's, and printing it
/// bare would credit one consignment with packets that came from three.
class _MadeRow extends StatelessWidget {
  const _MadeRow({required this.run});
  final BatchUsageRun run;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final uom = run.drawnUom.isEmpty ? '' : ' ${run.drawnUom}';
    final when = run.producedAt == null ? null : arrivalStamp(run.producedAt);
    final draw = run.isWholeRun
        ? '${formatItemQty(run.drawnQty, null, unit: run.drawnUom)}$uom'
        : '${formatItemQty(run.drawnQty, null, unit: run.drawnUom)} / '
            '${formatItemQty(run.runDrewQty, null, unit: run.drawnUom)}$uom';
    // Built once and placed in exactly one of the branches below — an empty
    // run's line or the first product's — so the two never share an instance
    // in the same tree.
    final drawText = Text(
      draw,
      style: RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600),
    );

    return InkWell(
      onTap: () => context.push('/manufacturing/wos/${run.woId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(Icons.precision_manufacturing_outlined, size: 13, color: brand),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // The SKU as the floor names it, the count riding the label, and
              // the draw on the right of the first line only.
              if (run.outputs.isEmpty)
                Row(children: [
                  Expanded(
                    child: Text('Output not recorded yet',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                  const SizedBox(width: 8),
                  drawText,
                ])
              else
                for (final (i, o) in run.outputs.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Row(children: [
                      Expanded(
                        child: Text(
                          _outputLabel(o),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: RunqText.caption
                              .copyWith(color: t.ink, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (i == 0) drawText,
                    ]),
                  ),
              // The run it belonged to.
              Text(
                [run.woNumber, ?when].join('  ·  '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
            ]),
          ),
          const SizedBox(width: 2),
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(Icons.chevron_right_rounded, size: 14, color: t.muted2),
          ),
        ]),
      ),
    );
  }
}

/// `Farm Fresh Cow Milk 500ml (50)` — the SKU the way the floor says it, with
/// the count it put out riding the label instead of holding a column of its
/// own. The packet size is part of the name here, not a unit to be formatted.
String _outputLabel(BatchUsageOutput o) {
  final name = o.uom.isEmpty ? o.itemName : '${o.itemName} ${o.uom}';
  return '$name (${formatItemQty(o.qty, null, unit: o.uom)})';
}

/// The small caps heading over a group of movements.
class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Text(
          label.toUpperCase(),
          style: RunqText.micro
              .copyWith(color: RT(context).muted2, letterSpacing: 0.3),
        ),
      );
}

/// One non-production outflow: wastage, a transfer, milk sold to a farmer.
///
/// Leads with the operator's own note where there is one — "Wastage on
/// WO-20260904-0003" or "To make Khoa" says more than the reason enum behind
/// it ever could.
class _OtherOutRow extends StatelessWidget {
  const _OtherOutRow({required this.out, required this.unit});
  final BatchUsageOtherOut out;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final u = (unit ?? '').isEmpty ? '' : ' $unit';
    final when = out.at == null ? null : arrivalStamp(out.at);
    final sub = [?out.ref, ?when].join('  ·  ');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(_icon(out.kind), size: 13, color: t.muted),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              out.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: t.ink),
            ),
            if (sub.isNotEmpty)
              Text(
                sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
          ]),
        ),
        const SizedBox(width: 8),
        Text(
          '${formatItemQty(out.qty, null, unit: unit)}$u',
          style: RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600),
        ),
        // Matches the chevron a run row carries, so every quantity in the card
        // — counts and litres alike — lands on one right edge. Without it these
        // rows ran 16px wider than the ones above and read as ragged.
        const SizedBox(width: 16),
      ]),
    );
  }

  /// Milk that was thrown away should not look like milk that was sold.
  static IconData _icon(String kind) => switch (kind) {
        'inventory_adjustment' => Icons.tune_rounded,
        'mp_farmer_sale' => Icons.storefront_outlined,
        'inventory_transfer' => Icons.swap_horiz_rounded,
        'mfg_reclaim' => Icons.recycling_rounded,
        _ => Icons.north_east_rounded,
      };
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
/// of the sheet it turns "how much milk is there" straight into taking some,
/// instead of sending the operator back out to the FAB.
/// What a BOM is allowed to consume — mirrors the API's `bom_inputs` group.
///
/// Semi-finished is in it deliberately: "Paneer - unpacked" is something the
/// plant made *and* something the next run draws from, so it earns the button
/// even though it shows up on the Made shelf.
const _consumableClasses = {
  'raw_material',
  'packaging',
  'consumable',
  'semi_finished',
};

class _UseInProduction extends StatelessWidget {
  const _UseInProduction({required this.item});
  final InvOnHandRow item;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // A packed SKU is the end of the line — nothing draws from a 400g tub of
    // curd, and offering to take it for production is an action that would
    // fail or, worse, quietly consume finished stock. The sheet still opens
    // for it; it just has nothing to offer beyond the lots.
    if (!_consumableClasses.contains(item.itemClass)) {
      return const SizedBox.shrink();
    }
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: MfgPrimaryButton(
        label: 'Take for production',
        icon: Icons.water_drop_outlined,
        onPressed: () {
          Navigator.of(context).pop();
          // Straight into a draw with this material chosen — the operator was
          // already looking at its lots, and making them pick it again on the
          // next screen is the kind of step that sends people back to a
          // stock adjustment instead.
          context.push('/manufacturing/draws/new?inputItemId=${item.itemId}');
        },
      ),
    );
  }
}
