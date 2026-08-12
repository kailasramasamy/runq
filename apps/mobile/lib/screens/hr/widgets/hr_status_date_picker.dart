// Status-aware date picker for the HR Time flows.
//
// A bare `showDatePicker` gives you a grid of anonymous numbers, so picking
// the day (or the end of a span) to mark meant remembering what was already
// on each date. This renders the same `HrMonthCalendar` the Time tab uses —
// every day painted with its real status — and returns the tapped date.
//
// Status comes from `hrAttendanceMonthProvider`, the same joiner behind the
// employee-detail Time tab (attendance rows → holidays → weekly offs →
// unmarked/upcoming), so a day can never read differently here than it does
// on the calendar the user just came from.
//
// Days outside [firstDate]..[lastDate] stay visible but dimmed and
// untappable — the surrounding month is context, not a target.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_month_calendar.dart';
import 'hr_sheet_bits.dart';

/// Returns the picked day, or null if dismissed.
Future<DateTime?> showHrStatusDatePicker(
  BuildContext context, {
  required String employeeId,
  required DateTime initialDate,
  required DateTime firstDate,
  required DateTime lastDate,
  required String title,

  /// Optional line under the title — e.g. what the picked date will do.
  String? subtitle,
}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _StatusDatePickerSheet(
      employeeId: employeeId,
      initialDate: _dayOnly(initialDate),
      firstDate: _dayOnly(firstDate),
      lastDate: _dayOnly(lastDate),
      title: title,
      subtitle: subtitle,
    ),
  );
}

class _StatusDatePickerSheet extends ConsumerStatefulWidget {
  final String employeeId;
  final DateTime initialDate, firstDate, lastDate;
  final String title;
  final String? subtitle;

  const _StatusDatePickerSheet({
    required this.employeeId,
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
    required this.title,
    required this.subtitle,
  });

  @override
  ConsumerState<_StatusDatePickerSheet> createState() =>
      _StatusDatePickerSheetState();
}

class _StatusDatePickerSheetState
    extends ConsumerState<_StatusDatePickerSheet> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    _month = DateTime(widget.initialDate.year, widget.initialDate.month);
  }

  /// Paging stops at the month holding each bound — there is nothing
  /// selectable beyond them, so letting the user walk into empty months
  /// would only be a dead end.
  bool get _canPrev =>
      _month.isAfter(DateTime(widget.firstDate.year, widget.firstDate.month));
  bool get _canNext =>
      _month.isBefore(DateTime(widget.lastDate.year, widget.lastDate.month));

  void _step(int delta) =>
      setState(() => _month = DateTime(_month.year, _month.month + delta));

  bool _selectable(DateTime d) =>
      !d.isBefore(widget.firstDate) && !d.isAfter(widget.lastDate);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final monthAsync = ref.watch(hrAttendanceMonthProvider(HrMonthQuery(
      employeeId: widget.employeeId,
      year: _month.year,
      month: _month.month,
    )));

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(RunqRadii.hero)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const HrSheetGrabber(),
              const SizedBox(height: 14),
              Text(widget.title, style: RunqText.h3.copyWith(color: t.ink)),
              if ((widget.subtitle?.trim() ?? '').isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(widget.subtitle!,
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
              const SizedBox(height: 6),
              HrMonthStepper(
                month: _month,
                onPrev: _canPrev ? () => _step(-1) : null,
                onNext: _canNext ? () => _step(1) : null,
              ),
              const SizedBox(height: 6),
              _grid(monthAsync),
              const SizedBox(height: 12),
              _legend(monthAsync),
            ],
          ),
        ),
      ),
    );
  }

  /// The grid renders immediately on a plain weekday/weekend reading and
  /// repaints once the month resolves — waiting on the fetch would stall a
  /// picker the user opened to tap one date. An error degrades the same way:
  /// dates stay pickable, they just lose their colour.
  Widget _grid(AsyncValue<HrAttendanceMonth> monthAsync) {
    final m = monthAsync.asData?.value;
    return HrMonthCalendar(
      month: _month,
      selected: widget.initialDate,
      selectableDay: _selectable,
      statusFor: m == null ? _fallbackStatus : m.statusFor,
      onTapDay: (d) => Navigator.of(context).pop(d),
    );
  }

  static String _fallbackStatus(DateTime d) {
    final today = DateTime.now();
    return _dayOnly(d).isAfter(_dayOnly(today)) ? 'upcoming' : 'unmarked';
  }

  Widget _legend(AsyncValue<HrAttendanceMonth> monthAsync) {
    final t = RT(context);
    if (monthAsync.isLoading) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 12,
            height: 12,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: HrColors.brand(context)),
          ),
          const SizedBox(width: 8),
          Text('Loading statuses…',
              style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      );
    }
    final m = monthAsync.asData?.value;
    if (m == null) {
      return Text('Could not load statuses for this month',
          style: RunqText.caption.copyWith(color: t.muted2));
    }
    final statuses = <String>{
      for (var d = 1; d <= m.query.last.day; d++)
        m.statusFor(DateTime(m.query.year, m.query.month, d)),
    }..remove('upcoming');
    return HrCalendarLegend(statuses: statuses);
  }
}

DateTime _dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);
