// Read-only detail for a single calendar day: what the day is, the
// punch times behind it, and the leave request that produced it.
//
// Returns an [HrDayAction] so the caller decides what to do next — the
// sheet itself never writes. Managers get a "Mark / change" button that
// pops with [HrDayAction.mark]; the calendar screen then opens the mark
// sheet on top.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_attendance_status.dart';
import 'hr_colors.dart';
import 'hr_leave_summary_cards.dart';

enum HrDayAction { mark }

Future<HrDayAction?> showHrDayDetailSheet(
  BuildContext context, {
  required DateTime day,
  required String status,
  HrAttendanceRow? row,
  HrHoliday? holiday,
  HrLeaveRequest? leave,
  required bool canMark,
}) {
  return showModalBottomSheet<HrDayAction>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) => _DayDetailSheet(
      day: day,
      status: status,
      row: row,
      holiday: holiday,
      leave: leave,
      canMark: canMark,
    ),
  );
}

class _DayDetailSheet extends StatelessWidget {
  final DateTime day;
  final String status;
  final HrAttendanceRow? row;
  final HrHoliday? holiday;
  final HrLeaveRequest? leave;
  final bool canMark;

  const _DayDetailSheet({
    required this.day,
    required this.status,
    this.row,
    this.holiday,
    this.leave,
    required this.canMark,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final pair = hrStatusColors(context, status);
    final meta = hrStatusMeta(status);

    return Container(
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(RunqRadii.hero)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _header(context, t, pair, meta),
              const SizedBox(height: 16),
              ..._facts(context, t),
              if (canMark) ...[
                const SizedBox(height: 8),
                SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: () =>
                        Navigator.of(context).pop(HrDayAction.mark),
                    icon: const Icon(Icons.edit_calendar_outlined, size: 18),
                    label: Text(
                      row == null ? 'Mark this day' : 'Change',
                      style: RunqText.bodyStrong.copyWith(color: Colors.white),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: HrColors.teal,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(RunqRadii.input),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, RunqTokens t, List<Color> pair,
      HrStatusMeta meta) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: pair[0],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Center(
            child: Text('${day.day}',
                style: RunqText.tabular(
                    size: 18, w: FontWeight.w800, color: pair[1])),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_longDate(day), style: RunqText.h4.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(
                status == 'unmarked' ? 'Attendance not marked' : meta.label,
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// One row per fact we actually have — the sheet stays short on a plain
  /// present day and grows only when there's a leave or punch behind it.
  List<Widget> _facts(BuildContext context, RunqTokens t) {
    final out = <Widget>[];
    final r = row;
    final h = holiday;
    final l = leave;

    if (h != null) out.add(_fact(t, 'Holiday', h.name));
    if (r?.checkIn != null) out.add(_fact(t, 'Check in', r!.checkIn!));
    if (r?.checkOut != null) out.add(_fact(t, 'Check out', r!.checkOut!));
    if (r?.hoursWorked != null && r!.hoursWorked! > 0) {
      out.add(_fact(t, 'Hours worked', _trim(r.hoursWorked!)));
    }
    if (r?.otHours != null && r!.otHours! > 0) {
      out.add(_fact(t, 'Overtime', '${_trim(r.otHours!)} hrs'));
    }
    if (r?.source != null) out.add(_fact(t, 'Source', _sourceLabel(r!.source!)));
    if (l != null) {
      out.add(_fact(t, 'Leave type', '${l.typeName} (${l.typeCode})'));
      out.add(_fact(t, 'Leave dates',
          '${hrLeaveRange(l.fromDate, l.toDate)} · ${hrLeaveDays(l.totalDays)}'));
      out.add(_fact(t, 'Request status', _titleCase(l.status)));
      if (l.reason != null && l.reason!.trim().isNotEmpty) {
        out.add(_fact(t, 'Reason', l.reason!.trim()));
      }
    }
    if (out.isEmpty) {
      out.add(Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          status == 'unmarked'
              ? 'Nothing recorded for this day yet.'
              : 'No further detail recorded.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      ));
    }
    return out;
  }

  Widget _fact(RunqTokens t, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
          ),
          Expanded(
            child: Text(value,
                style: RunqText.body.copyWith(color: t.ink)),
          ),
        ],
      ),
    );
  }
}

const _kMon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _kDay = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

String _longDate(DateTime d) =>
    '${_kDay[d.weekday - 1]}, ${d.day} ${_kMon[d.month - 1]}';

String _trim(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 1);

String _titleCase(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

String _sourceLabel(String s) => switch (s) {
      'manual' => 'Marked manually',
      'mobile' => 'Mobile punch',
      'biometric' => 'Biometric device',
      'import' => 'Imported',
      _ => _titleCase(s),
    };
