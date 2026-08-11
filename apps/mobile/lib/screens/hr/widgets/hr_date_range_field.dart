// From/To date pair for "apply this to a span of days" flows.
//
// The start date is fixed by the caller (it's whatever the user tapped)
// and only the end moves — extending a range must never silently walk off
// the day the user aimed at. Set [singleDayOnly] to lock it shut for cases
// the server won't accept as a span, e.g. a half-day leave request.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

class HrDateRangeField extends StatelessWidget {
  final DateTime from;
  final DateTime to;

  /// Opens the end-date picker. Ignored when [singleDayOnly].
  final VoidCallback onPickEnd;

  /// Collapses the range back to a single day. Shown only when the range
  /// is longer than one day.
  final VoidCallback onReset;

  final bool singleDayOnly;

  /// Replaces the day-count line when [singleDayOnly] — say *why* the
  /// range is locked rather than showing a stuck "1 day".
  final String? lockedNote;

  const HrDateRangeField({
    super.key,
    required this.from,
    required this.to,
    required this.onPickEnd,
    required this.onReset,
    this.singleDayOnly = false,
    this.lockedNote,
  });

  int get dayCount => singleDayOnly
      ? 1
      : _dayOnly(to).difference(_dayOnly(from)).inDays + 1;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final days = dayCount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Dates', style: RunqText.label.copyWith(color: t.muted2)),
            const Spacer(),
            if (days > 1)
              GestureDetector(
                onTap: onReset,
                child: Text('Reset',
                    style: RunqText.caption.copyWith(
                        color: HrColors.brand(context),
                        fontWeight: FontWeight.w700)),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: _box(context, t, 'From', from, null)),
            const SizedBox(width: 10),
            Expanded(
              child: _box(
                context,
                t,
                'To',
                singleDayOnly ? from : to,
                singleDayOnly ? null : onPickEnd,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          singleDayOnly
              ? (lockedNote ?? 'This applies to a single date.')
              : '$days ${days == 1 ? 'day' : 'days'} will be marked.',
          style: RunqText.caption.copyWith(color: t.muted2),
        ),
      ],
    );
  }

  Widget _box(BuildContext context, RunqTokens t, String label, DateTime value,
      VoidCallback? onTap) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: enabled ? t.surface : t.inputFill,
          borderRadius: BorderRadius.circular(RunqRadii.input),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: RunqText.micro.copyWith(color: t.muted2)),
                  const SizedBox(height: 3),
                  Text(hrShortDate(value),
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                ],
              ),
            ),
            if (enabled)
              Icon(Icons.edit_calendar_outlined,
                  size: 16, color: HrColors.brand(context)),
          ],
        ),
      ),
    );
  }
}

const _kMon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _kDay = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

String hrShortDate(DateTime d) =>
    '${_kDay[d.weekday - 1]}, ${d.day} ${_kMon[d.month - 1]}';

String hrLongDate(DateTime d) =>
    '${_kDay[d.weekday - 1]}, ${d.day} ${_kMon[d.month - 1]} ${d.year}';

DateTime _dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);
