// A day's runs, one line per product — shared by the manufacturing home card
// and the full work-order list.
//
// Two runs of the same thing on the same day answer a single question — how
// much was made — and splitting them across two rows left the reader doing the
// addition. So a product made more than once in a day folds into one line with
// its combined figure, and opens onto the runs behind it. A product made by a
// single run stays exactly the row its screen has always drawn: an expander
// onto one child is a control that earns nothing.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../api/manufacturing_models.dart'
    show WorkOrderListRow, WoConsumptionRow;
import '../../../providers/manufacturing_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_qty.dart';
import 'mfg_doc_list.dart';
import 'mfg_primitives.dart';

/// One product's runs within one day, in the order the server sent them.
class _MadeGroup {
  _MadeGroup({required this.key});
  final String key;
  final List<WorkOrderListRow> rows = [];

  WorkOrderListRow get lead => rows.first;

  /// Only what the runs actually put out.
  ///
  /// A single row falls back to the plan when a run has no yield yet, which is
  /// honest sitting beside a status chip. Folded into a combined figure it
  /// would quietly add a plan to an actual and overstate the day — so the
  /// total counts yields alone and the unreported runs are stated separately.
  double get madeQty => rows.fold(0.0, (n, r) => n + r.outputQty);

  /// Runs with no yield reported yet.
  int get openCount => rows.where((r) => r.outputQty <= 0).length;
}

/// Group runs by what they made.
///
/// Keyed on the resolved output item id, never the name: names are not unique
/// across items, and editing one between two runs would split a product in
/// half. The uom joins the key because a draw states its own unit while a
/// recipe run takes the BOM's — two runs of one product can legitimately
/// differ, and litres must never be added to units. Falls back to the name
/// only when an id is genuinely absent.
///
/// Only ever called on the rows of a *single day*: summing across days would
/// state a total for no period at all.
List<_MadeGroup> _groupByProduct(List<WorkOrderListRow> rows) {
  final byKey = <String, _MadeGroup>{};
  for (final r in rows) {
    final id = (r.outputItemId ?? '').isNotEmpty ? r.outputItemId! : r.outputItemName;
    byKey.putIfAbsent('$id|${r.outputUom}', () => _MadeGroup(key: '$id|${r.outputUom}'))
        .rows
        .add(r);
  }
  return byKey.values.toList();
}

/// One day's runs as a card, folded by product.
///
/// [tileFor] draws the row for a product made by exactly one run, so each
/// screen keeps the row it already had — the home card names the BOM, the work
/// order list carries tags and the warehouse. Only the combined row and the
/// runs under it are shared.
///
/// [limit] caps *products*, never runs: trimming the runs first would leave a
/// product's total counting only the runs that survived the cut — a number
/// that is wrong rather than merely short.
class MfgMadeList extends StatefulWidget {
  const MfgMadeList({
    super.key,
    required this.rows,
    required this.tileFor,
    this.limit,
  });

  final List<WorkOrderListRow> rows;
  final Widget Function(WorkOrderListRow wo) tileFor;
  final int? limit;

  @override
  State<MfgMadeList> createState() => _MfgMadeListState();
}

class _MfgMadeListState extends State<MfgMadeList> {
  /// Products the reader has opened, by group key.
  final Set<String> _expanded = {};

  @override
  Widget build(BuildContext context) {
    var groups = _groupByProduct(widget.rows);
    if (widget.limit != null) groups = groups.take(widget.limit!).toList();
    return MfgDividedCard(
      children: [
        for (final g in groups)
          if (g.rows.length == 1) widget.tileFor(g.lead) else _combined(g),
      ],
    );
  }

  /// A product made by more than one run: the combined figure, and — once
  /// opened — the runs behind it.
  ///
  /// One widget rather than a spread, so [MfgDividedCard] rules its line
  /// between *products* and never between a heading and its own runs. Spliced
  /// in flat, every run took a full-width divider of its own and read as
  /// another product rather than as a child.
  Widget _combined(_MadeGroup g) {
    final open = _expanded.contains(g.key);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        MfgDocListTile(
          flat: true,
          // The chevron takes the icon slot: on a row that opens, the module
          // glyph said nothing the rows above had not already said.
          icon: open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
          title: g.lead.outputItemName,
          // No work-order number and no status here — the runs differ on both,
          // and naming one of them would read as though it were the whole
          // figure. They are stated per run once the group is opened.
          subtitle: '${g.rows.length} runs'
              '${g.openCount > 0 ? '  ·  ${g.openCount} yet to report' : ''}',
          rightValue: formatItemQty(g.madeQty, null, unit: g.lead.outputUom),
          rightUnit: g.lead.outputUom,
          onTap: () => setState(() {
            if (open) {
              _expanded.remove(g.key);
            } else {
              _expanded.add(g.key);
            }
          }),
        ),
        if (open)
          // Indented rule between runs, not between a run and its heading: the
          // runs are a list of their own inside the product, and without a line
          // one run's materials ran straight into the next run's number.
          for (final (i, wo) in g.rows.indexed) _RunRow(wo: wo, ruled: i > 0),
      ],
    );
  }
}

/// One run inside an opened product: when it was made, what it made, and what
/// it took to make it.
///
/// Deliberately lighter than the row above — a child that looked as heavy as
/// its heading would read as another product.
class _RunRow extends ConsumerWidget {
  const _RunRow({required this.wo, required this.ruled});

  final WorkOrderListRow wo;
  final bool ruled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Only fetched for runs the reader has actually opened onto: the card
    // shows products, and pulling every run's materials to render a collapsed
    // line would be a request per run for a number nobody asked for.
    final materials = ref.watch(woConsumptionProvider(wo.id));
    return InkWell(
      onTap: () => context.push('/manufacturing/wos/${wo.id}'),
      child: Container(
        padding: const EdgeInsets.fromLTRB(46, 10, 14, 10),
        decoration: ruled
            ? BoxDecoration(border: Border(top: BorderSide(color: t.hairline)))
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _headline(context),
            materials.whenOrNull(data: (rows) => _Materials(rows: rows)) ??
                const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }

  /// The run's number, state, when it was worked, and what came out.
  Widget _headline(BuildContext context) {
    final t = RT(context);
    final made = wo.outputQty > 0;
    return Row(children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // The pill sits with the run it describes. Held at the right edge
            // it lined up into a column of its own and read as a property of
            // the list rather than of this row.
            Row(mainAxisSize: MainAxisSize.min, children: [
              // Flexible, so a long WO number gives way to the pill rather
              // than pushing it off the end.
              Flexible(
                child: Text(
                  wo.woNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.ink),
                ),
              ),
              const SizedBox(width: 6),
              MfgStatusPill(status: wo.status),
            ]),
            const SizedBox(height: 2),
            // Two runs of one product on one day are told apart by when they
            // happened, so the clock time is the line that separates them —
            // the shift alone put both morning runs under one word. The entry
            // mode rides here too: folded into a product line, a repack would
            // otherwise lose the one label that says nobody made it by hand.
            Text(
              [
                mfgRunAt(wo),
                if ((wo.shift ?? '').isNotEmpty) wo.shift!,
                if (wo.entryMode == 'unplanned') 'Unplanned',
                if (wo.entryMode == 'auto_repack') 'Repack',
              ].join('  ·  '),
              style: RunqText.micro.copyWith(color: t.muted2),
            ),
          ],
        ),
      ),
      const SizedBox(width: 10),
      // Bare number: the product line above already states the unit, and every
      // run under it shares that unit by construction — the uom is part of the
      // grouping key. `unit:` stays because it decides how the figure is
      // formatted, not whether it is labelled.
      //
      // An em dash, not a zero: a run that has not reported is not a run that
      // made nothing.
      Text(
        made ? formatItemQty(wo.outputQty, null, unit: wo.outputUom) : '—',
        style: RunqText.caption.copyWith(
          color: made ? t.ink : t.muted2,
          fontWeight: FontWeight.w600,
        ),
      ),
    ]);
  }
}

/// What a run consumed, one line per input.
///
/// Batches are folded away: a run drawing one material from three lots is
/// still one material on this card, and three near-identical lines with FEFO
/// splits on them answer a question nobody asked of a list. The run's own page
/// still breaks them out by batch.
class _Materials extends StatelessWidget {
  const _Materials({required this.rows});

  final List<WoConsumptionRow> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final u in _byItem(rows))
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Row(children: [
                Expanded(
                  child: Text(
                    u.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.micro.copyWith(color: t.muted),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  formatItemQty(u.qty, null, unit: u.uom),
                  style: RunqText.micro.copyWith(color: t.muted),
                ),
                Text(' ${u.uom}', style: RunqText.micro.copyWith(color: t.muted2)),
              ]),
            ),
        ],
      ),
    );
  }
}

/// One input as the row states it: the material, and how much of it went in.
class _UsedInput {
  _UsedInput({required this.name, required this.uom, required this.qty});
  final String name;
  final String uom;
  double qty;
}

/// Fold a run's consumption lines to one per input.
///
/// Keyed on item *and* uom, for the same reason the products above are: a
/// material recorded in two units is two figures, never one sum.
List<_UsedInput> _byItem(List<WoConsumptionRow> rows) {
  final byKey = <String, _UsedInput>{};
  for (final r in rows) {
    final id = r.inputItemId.isNotEmpty ? r.inputItemId : r.inputItemName;
    byKey
        .putIfAbsent('$id|${r.uom}',
            () => _UsedInput(name: r.inputItemName, uom: r.uom, qty: 0))
        .qty += r.qty;
  }
  return byKey.values.toList();
}

/// The day a run was actually worked, as `yyyy-MM-dd`, falling back to the day
/// it was planned.
///
/// A run scheduled on the 24th and closed this morning was *made* today, and
/// a list of what was made has to group it under today. Converted to local
/// time first: the timestamps arrive in UTC and the server buckets them by
/// IST, so a late-evening run would otherwise read as yesterday.
String mfgMadeOn(WorkOrderListRow wo) {
  final at = _workedAt(wo);
  if (at == null) return wo.scheduledFor;
  final mm = at.month.toString().padLeft(2, '0');
  final dd = at.day.toString().padLeft(2, '0');
  return '${at.year}-$mm-$dd';
}

/// When a run was worked, as an expanded row writes it: `19 Sep, 4:32 PM`.
///
/// The clock time is what tells two runs of one product apart. A run that has
/// not started yet has no such moment, so it states its plan instead.
String mfgRunAt(WorkOrderListRow wo) {
  final at = _workedAt(wo);
  if (at == null) return 'Planned ${mfgPrettyDate(wo.scheduledFor)}';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  final h = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final mm = at.minute.toString().padLeft(2, '0');
  return '${at.day} ${months[at.month - 1]}, $h:$mm ${at.hour < 12 ? 'AM' : 'PM'}';
}

/// The moment a run was worked — closed, else finished, else started — in
/// local time. Null while it is still only planned.
DateTime? _workedAt(WorkOrderListRow wo) {
  final iso = wo.closedAt ?? wo.completedAt ?? wo.startedAt;
  return iso == null ? null : DateTime.tryParse(iso)?.toLocal();
}

/// A day heading: "Today" / "Yesterday" beat a date the reader has to decode
/// against today.
String mfgDayLabel(String iso) {
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  final now = DateTime.now();
  final days = DateTime(dt.year, dt.month, dt.day)
      .difference(DateTime(now.year, now.month, now.day))
      .inDays;
  if (days == 0) return 'Today';
  if (days == -1) return 'Yesterday';
  if (days == 1) return 'Tomorrow';
  return mfgPrettyDate(iso);
}
