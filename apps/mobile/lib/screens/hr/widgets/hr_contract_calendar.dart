// Working-day calendar for a day-rate contract.
//
// The rule this renders: **every day from the start date is worked unless
// it is marked otherwise.** Only exceptions are stored, so a cell's state
// is derived — in-term days are green by default, and go amber (leave) or
// blue (half day) when the day log says so.
//
// For a crew the calendar is per person. A member selector sits above the
// grid; "Whole crew" marks everyone at once and shades a day by how many of
// them are off, which is what makes a fifteen-person site legible.
//
// Days outside the term, and days after today on an open-ended contract,
// are dimmed and untappable — nobody can be marked absent from a day the
// contract did not cover.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_contract_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_month_calendar.dart';

/// Derived state of one day for one member.
enum ContractDayState { worked, leave, halfDay, outside }

/// Palette mirrors the attendance vocabulary elsewhere in HR so a worked
/// day reads the same here as on the muster grid. Declared for both themes
/// — a fixed amber on a dark surface is the classic unreadable-cell bug.
List<Color> contractDayColors(BuildContext context, ContractDayState s) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  if (s == ContractDayState.outside) {
    final t = RT(context);
    return [t.surface, t.muted2];
  }
  if (isDark) {
    return switch (s) {
      ContractDayState.worked => const [Color(0xFF14532D), Color(0xFF86EFAC)],
      ContractDayState.leave => const [Color(0xFF78350F), Color(0xFFFCD34D)],
      ContractDayState.halfDay => const [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
      _ => const [Color(0xFF334155), Color(0xFFCBD5E1)],
    };
  }
  return switch (s) {
    ContractDayState.worked => const [Color(0xFFDCFCE7), Color(0xFF14532D)],
    ContractDayState.leave => const [Color(0xFFFEF3C7), Color(0xFF78350F)],
    ContractDayState.halfDay => const [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
    _ => const [Color(0xFFF1F5F9), Color(0xFF475569)],
  };
}

String contractDayLabel(ContractDayState s) => switch (s) {
      ContractDayState.worked => 'Worked',
      ContractDayState.leave => 'Leave',
      ContractDayState.halfDay => 'Half day',
      ContractDayState.outside => 'Outside term',
    };

String _key(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

DateTime _dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Resolves the derived calendar without touching the network. Kept as a
/// plain class so the arithmetic can be unit-tested away from widgets.
class ContractCalendar {
  final HrContract contract;

  /// Exceptions keyed by "memberId|yyyy-mm-dd".
  final Map<String, String> _exceptions;
  final DateTime _lastAccrualDay;

  ContractCalendar(this.contract, {DateTime? today})
      : _exceptions = {
          for (final d in contract.dayLog) '${d.memberId}|${_key(d.logDate)}': d.status,
        },
        _lastAccrualDay = _resolveLastDay(contract, today ?? DateTime.now());

  /// Earnings stop at the end date, or at today when the term is open.
  static DateTime _resolveLastDay(HrContract c, DateTime today) {
    final t = _dayOnly(today);
    final end = c.endDate == null ? t : _dayOnly(c.endDate!);
    return end.isBefore(t) ? end : t;
  }

  /// The last day that currently counts — the calendar's right-hand edge.
  DateTime get lastAccrualDay => _lastAccrualDay;

  bool isInTerm(DateTime day) {
    final d = _dayOnly(day);
    return !d.isBefore(_dayOnly(contract.startDate)) && !d.isAfter(_lastAccrualDay);
  }

  ContractDayState stateFor(DateTime day, String memberId) {
    if (!isInTerm(day)) return ContractDayState.outside;
    final s = _exceptions['$memberId|${_key(day)}'];
    if (s == 'leave') return ContractDayState.leave;
    if (s == 'half_day') return ContractDayState.halfDay;
    return ContractDayState.worked;
  }

  /// Crew-wide reading of a day: worked unless *everyone* is off, and
  /// half-day when the crew is split. The counts drive the badge.
  ({ContractDayState state, int off, int total}) crewStateFor(DateTime day) {
    final members = contract.members;
    if (!isInTerm(day) || members.isEmpty) {
      return (state: ContractDayState.outside, off: 0, total: members.length);
    }
    var off = 0;
    var partial = 0;
    for (final m in members) {
      final s = stateFor(day, m.id);
      if (s == ContractDayState.leave) off++;
      if (s == ContractDayState.halfDay) partial++;
    }
    final state = off == members.length
        ? ContractDayState.leave
        : (off > 0 || partial > 0)
            ? ContractDayState.halfDay
            : ContractDayState.worked;
    return (state: state, off: off + partial, total: members.length);
  }
}

/// Month grid. Reuses [HrMonthStepper] from the attendance calendar so the
/// paging chrome is identical across HR.
class HrContractCalendar extends StatelessWidget {
  final ContractCalendar calendar;
  final DateTime month;

  /// Null = whole crew.
  final String? memberId;
  final void Function(DateTime day) onTapDay;

  const HrContractCalendar({
    super.key,
    required this.calendar,
    required this.month,
    required this.memberId,
    required this.onTapDay,
  });

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final leadingBlanks = DateTime(month.year, month.month, 1).weekday - 1;
    final rows = ((leadingBlanks + daysInMonth) / 7).ceil();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _weekdayHeader(context),
        const SizedBox(height: 6),
        ...List.generate(rows, (row) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: List.generate(7, (col) {
                final dayNum = row * 7 + col - leadingBlanks + 1;
                final blank = dayNum < 1 || dayNum > daysInMonth;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: blank
                        ? const AspectRatio(aspectRatio: 1, child: SizedBox())
                        : _cell(context, DateTime(month.year, month.month, dayNum)),
                  ),
                );
              }),
            ),
          );
        }),
      ],
    );
  }

  Widget _weekdayHeader(BuildContext context) {
    final t = RT(context);
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return Row(
      children: [
        for (final l in labels)
          Expanded(
            child: Center(
              child: Text(l, style: RunqText.micro.copyWith(color: t.muted2)),
            ),
          ),
      ],
    );
  }

  Widget _cell(BuildContext context, DateTime day) {
    final t = RT(context);
    final crew = memberId == null;
    final reading = crew ? calendar.crewStateFor(day) : null;
    final state = crew ? reading!.state : calendar.stateFor(day, memberId!);
    final pair = contractDayColors(context, state);
    final outside = state == ContractDayState.outside;

    final now = DateTime.now();
    final isToday =
        day.year == now.year && day.month == now.month && day.day == now.day;

    final cell = AspectRatio(
      aspectRatio: 1,
      child: GestureDetector(
        onTap: outside ? null : () => onTapDay(day),
        behavior: HitTestBehavior.opaque,
        child: Container(
          decoration: BoxDecoration(
            color: pair[0],
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isToday ? HrColors.brand(context) : Colors.transparent,
              width: isToday ? 1.5 : 1,
            ),
          ),
          child: Stack(
            children: [
              Center(
                child: Text(
                  '${day.day}',
                  style: RunqText.tabular(
                    size: 13,
                    w: isToday ? FontWeight.w800 : FontWeight.w600,
                    color: outside ? t.muted2 : pair[1],
                  ),
                ),
              ),
              // On the crew view, say how many are off rather than making
              // the user open every day to find out.
              if (crew && !outside && reading!.off > 0)
                Positioned(
                  right: 3,
                  top: 2,
                  child: Text(
                    '−${reading.off}',
                    style: RunqText.micro.copyWith(
                      color: pair[1],
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    return outside ? Opacity(opacity: 0.35, child: cell) : cell;
  }
}

/// Legend + the "everything counts by default" explainer. Worth the space:
/// a grid that is entirely green on a contract nobody has touched looks
/// like a bug until you know unmarked means worked.
class HrContractCalendarLegend extends StatelessWidget {
  final bool showHalfDay;
  const HrContractCalendarLegend({super.key, this.showHalfDay = true});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final states = [
      ContractDayState.worked,
      ContractDayState.leave,
      if (showHalfDay) ContractDayState.halfDay,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 6,
          children: [
            for (final s in states)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: contractDayColors(context, s)[0],
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(contractDayLabel(s),
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Every day counts as worked from the start date. Tap a day to mark '
          'leave or a half day.',
          style: RunqText.caption.copyWith(color: t.muted2),
        ),
      ],
    );
  }
}

/// Re-exported so the detail screen does not need to import the attendance
/// calendar just for the month pager.
typedef HrContractMonthStepper = HrMonthStepper;
