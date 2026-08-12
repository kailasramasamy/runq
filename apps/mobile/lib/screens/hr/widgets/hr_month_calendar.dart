// Month calendar grid for HR attendance.
//
// Deliberately dumb: it takes a month and a `statusFor` callback and paints
// cells. All the joining (attendance rows → holidays → weekly offs →
// unmarked/upcoming) lives in `HrAttendanceMonth`, so the mini calendar on
// the employee-detail Time tab and the full calendar screen can never
// disagree about what a given day is.
//
// Weeks start Monday to match the rest of the HR surfaces (HrWeekStrip).

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_attendance_status.dart';
import 'hr_colors.dart';

const _kWeekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const _kMonthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

String hrMonthName(int month) => _kMonthNames[month - 1];

class HrMonthCalendar extends StatelessWidget {
  final DateTime month;
  final String Function(DateTime) statusFor;
  final void Function(DateTime)? onTapDay;
  final DateTime? selected;

  /// Compact drops the cell size and hides the weekday header — used for
  /// the at-a-glance calendar embedded in the employee-detail Time tab.
  final bool compact;

  /// Days this predicate rejects are dimmed and untappable — used when the
  /// grid doubles as a bounded date picker. Null means every day is fair
  /// game, which is what the read-only Time tab wants.
  final bool Function(DateTime)? selectableDay;

  const HrMonthCalendar({
    super.key,
    required this.month,
    required this.statusFor,
    this.onTapDay,
    this.selected,
    this.compact = false,
    this.selectableDay,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    // Monday-first offset: DateTime.weekday is 1=Mon…7=Sun.
    final leadingBlanks = DateTime(month.year, month.month, 1).weekday - 1;
    final cells = leadingBlanks + daysInMonth;
    final rows = (cells / 7).ceil();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) _weekdayHeader(t),
        if (!compact) const SizedBox(height: 6),
        ...List.generate(rows, (row) {
          return Padding(
            padding: EdgeInsets.only(bottom: compact ? 4 : 6),
            child: Row(
              children: List.generate(7, (col) {
                final index = row * 7 + col;
                final dayNum = index - leadingBlanks + 1;
                final isBlank = dayNum < 1 || dayNum > daysInMonth;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: compact ? 2 : 3),
                    child: isBlank
                        ? AspectRatio(aspectRatio: 1, child: const SizedBox())
                        : _dayCell(context, DateTime(month.year, month.month, dayNum)),
                  ),
                );
              }),
            ),
          );
        }),
      ],
    );
  }

  Widget _weekdayHeader(RunqTokens t) {
    return Row(
      children: List.generate(7, (i) {
        return Expanded(
          child: Center(
            child: Text(
              _kWeekdayLabels[i],
              style: RunqText.micro.copyWith(color: t.muted2),
            ),
          ),
        );
      }),
    );
  }

  Widget _dayCell(BuildContext context, DateTime day) {
    final t = RT(context);
    final status = statusFor(day);
    final pair = hrStatusColors(context, status);
    final now = DateTime.now();
    final isToday =
        day.year == now.year && day.month == now.month && day.day == now.day;
    final isSelected = selected != null &&
        day.year == selected!.year &&
        day.month == selected!.month &&
        day.day == selected!.day;

    // A past working day with no row is the actionable case — outline it in
    // the ink colour instead of filling, so it reads as a gap not a state.
    final isGap = status == 'unmarked';
    final selectable = selectableDay?.call(day) ?? true;

    // Out-of-range days keep their status colour but drop to a third of the
    // opacity, so the month still reads as a whole while the pickable window
    // stands out.
    final cell = AspectRatio(
      aspectRatio: 1,
      child: GestureDetector(
        onTap: onTapDay == null || !selectable ? null : () => onTapDay!(day),
        behavior: HitTestBehavior.opaque,
        child: Container(
          decoration: BoxDecoration(
            color: isGap ? Colors.transparent : pair[0],
            borderRadius: BorderRadius.circular(compact ? 8 : 10),
            border: Border.all(
              color: isSelected
                  ? HrColors.brand(context)
                  : isGap
                      ? t.hairline
                      : Colors.transparent,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Stack(
            children: [
              Center(
                child: Text(
                  '${day.day}',
                  style: RunqText.tabular(
                    size: compact ? 11 : 13,
                    w: isToday ? FontWeight.w800 : FontWeight.w600,
                    color: isGap ? t.muted : pair[1],
                  ),
                ),
              ),
              if (isToday)
                Positioned(
                  bottom: compact ? 3 : 4,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      width: compact ? 3 : 4,
                      height: compact ? 3 : 4,
                      decoration: BoxDecoration(
                        color: isGap ? t.muted : pair[1],
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    return selectable ? cell : Opacity(opacity: 0.32, child: cell);
  }
}

/// Month stepper — ◀ August 2026 ▶. `onNext` is null at the current month
/// so the user can't page into a future with nothing in it.
class HrMonthStepper extends StatelessWidget {
  final DateTime month;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;
  const HrMonthStepper({
    super.key,
    required this.month,
    this.onPrev,
    this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        _arrow(context, Icons.chevron_left, onPrev),
        Expanded(
          child: Center(
            child: Text(
              '${hrMonthName(month.month)} ${month.year}',
              style: RunqText.h4.copyWith(color: t.ink),
            ),
          ),
        ),
        _arrow(context, Icons.chevron_right, onNext),
      ],
    );
  }

  Widget _arrow(BuildContext context, IconData icon, VoidCallback? onTap) {
    final t = RT(context);
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon, size: 22),
      color: onTap == null ? t.muted2 : t.ink,
      visualDensity: VisualDensity.compact,
    );
  }
}

/// Status legend. Only renders statuses that actually occur in the month
/// so the strip stays short.
class HrCalendarLegend extends StatelessWidget {
  final Set<String> statuses;
  const HrCalendarLegend({super.key, required this.statuses});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final shown = [
      ...kHrMarkableStatuses.where(statuses.contains),
      if (statuses.contains('unmarked')) 'unmarked',
    ];
    if (shown.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: shown.map((s) {
        final pair = hrStatusColors(context, s);
        final isGap = s == 'unmarked';
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: isGap ? Colors.transparent : pair[0],
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: isGap ? t.hairline : pair[0]),
              ),
            ),
            const SizedBox(width: 5),
            Text(hrStatusMeta(s).label,
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        );
      }).toList(),
    );
  }
}

/// Month totals — one pill per status that occurred, plus OT hours.
class HrMonthSummary extends StatelessWidget {
  final Map<String, int> counts;
  final double otHours;
  const HrMonthSummary({super.key, required this.counts, this.otHours = 0});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final order = [...kHrMarkableStatuses, 'unmarked']
        .where((s) => (counts[s] ?? 0) > 0)
        .toList();
    if (order.isEmpty) {
      return Text('Nothing recorded this month',
          style: RunqText.caption.copyWith(color: t.muted));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ...order.map((s) => _pill(context, s, counts[s]!)),
        if (otHours > 0) _otPill(context),
      ],
    );
  }

  Widget _pill(BuildContext context, String status, int value) {
    final pair = hrStatusColors(context, status);
    final t = RT(context);
    final isGap = status == 'unmarked';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: isGap ? t.surface : pair[0],
        borderRadius: BorderRadius.circular(RunqRadii.chip),
        border: Border.all(color: isGap ? t.hairline : Colors.transparent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$value',
              style: RunqText.tabular(
                  size: 14, w: FontWeight.w800, color: isGap ? t.muted : pair[1])),
          const SizedBox(width: 5),
          Text(hrStatusMeta(status).label,
              style: RunqText.caption
                  .copyWith(color: isGap ? t.muted : pair[1])),
        ],
      ),
    );
  }

  Widget _otPill(BuildContext context) {
    final v = otHours.toStringAsFixed(otHours % 1 == 0 ? 0 : 1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(v,
              style: RunqText.tabular(
                  size: 14, w: FontWeight.w800, color: HrColors.brand(context))),
          const SizedBox(width: 5),
          Text('OT hrs',
              style: RunqText.caption.copyWith(color: HrColors.brand(context))),
        ],
      ),
    );
  }
}
