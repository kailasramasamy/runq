// The "Made today" / "Recently made" card for manufacturing_home_screen.dart.
// Kept in a separate file to stay under the 500-line-per-file rule; included
// via `part of`. The product folding and the run details inside it live in
// widgets/mfg_made_list.dart, shared with the full work-order list.

part of 'manufacturing_home_screen.dart';

/// The day's runs, one line per product.
///
/// Today is a single card: every row under it is from the same day, so the
/// heading carries the date and the rows need not repeat it. The fallback
/// list reaches back over whatever days it had to, so it breaks into a card
/// per day — folding two days' runs of one product into one figure would
/// state a total for no period at all.
class _MadeTodayList extends StatelessWidget {
  const _MadeTodayList({required this.rows, required this.showingFallback});

  final List<WorkOrderListRow> rows;
  final bool showingFallback;

  @override
  Widget build(BuildContext context) {
    if (!showingFallback) {
      return MfgMadeList(
        rows: rows,
        limit: _recentWoLimit,
        tileFor: (wo) => _tile(context, wo),
      );
    }
    // Days, not runs: a day shows whole or not at all, because a day's card
    // states that day's combined totals and half a day's runs would state them
    // wrong. "See all" carries the rest.
    final days = _byDay(rows).entries.take(_recentDayLimit);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final day in days) ...[
          _DayLabel(iso: day.key, runs: day.value.length),
          MfgMadeList(
            rows: day.value,
            tileFor: (wo) => _tile(context, wo),
          ),
          const SizedBox(height: 14),
        ],
      ],
    );
  }

  /// A product made by a single run — exactly the row this card has always
  /// shown. The date never rides the row: today's heading carries it, and
  /// under the fallback the day label above the card does.
  Widget _tile(BuildContext context, WorkOrderListRow wo) => MfgDocListTile(
        flat: true,
        icon: Icons.precision_manufacturing_outlined,
        leadingShift: wo.shift,
        title: wo.outputItemName,
        subtitle: wo.bomName,
        status: wo.status,
        // What came out, once anything has. A run still open has no output
        // yet, so the plan stands in — but on a closed run the planned figure
        // is the estimate, not the answer.
        rightValue: formatItemQty(
            wo.outputQty > 0 ? wo.outputQty : wo.plannedQty, null,
            unit: wo.outputUom),
        rightUnit: wo.outputUom,
        reference: wo.woNumber,
        onTap: () => context.push('/manufacturing/wos/${wo.id}'),
      );
}

/// How far back the fallback card reaches before "See all" takes over.
const int _recentDayLimit = 3;

/// Runs bucketed by the day they were *made*, in the order the server sent
/// them — grouping must not re-sort a list the server already ordered.
///
/// Keyed on [mfgMadeOn], not the schedule: a run planned on the 24th and
/// closed this morning belongs under this morning on a list of what was made.
Map<String, List<WorkOrderListRow>> _byDay(List<WorkOrderListRow> rows) {
  final out = <String, List<WorkOrderListRow>>{};
  for (final wo in rows) {
    out.putIfAbsent(mfgMadeOn(wo), () => []).add(wo);
  }
  return out;
}

/// The date above one day's card, with how many runs it holds.
class _DayLabel extends StatelessWidget {
  const _DayLabel({required this.iso, required this.runs});

  final String iso;
  final int runs;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(mfgDayLabel(iso),
                style: RunqText.label.copyWith(color: t.muted)),
          ),
          Text(runs == 1 ? '1 run' : '$runs runs',
              style: RunqText.micro.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}
