// Undo for a mis-marked calendar day.
//
// Clearing is destructive in a way marking isn't: a day that carries a
// leave was paid for out of a balance, and that balance was deducted
// against the whole request — so the server cancels the request and wipes
// every day it spans. The confirm dialog spells that out before the call.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import 'hr_date_range_field.dart';

const _danger = Color(0xFFDC2626);

/// Confirms, then clears. Returns the cleared dates on success, null when
/// the user backed out. Errors are thrown as [ApiException] for the caller
/// to render inline — a toast would sit behind the sheet.
Future<List<DateTime>?> confirmAndClearDay(
  BuildContext context,
  WidgetRef ref, {
  required String employeeId,
  required DateTime date,
  required String? leaveWarning,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Clear ${hrShortDate(date)}?'),
      content: Text(
        leaveWarning ??
            'The marking on this day will be removed and the day goes back '
                'to unmarked.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Keep'),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: TextButton.styleFrom(foregroundColor: _danger),
          child: const Text('Clear'),
        ),
      ],
    ),
  );
  if (ok != true) return null;

  final cleared =
      await hrRepo.clearAttendanceDay(employeeId: employeeId, date: date);
  hrInvalidateAttendance(ref);
  return cleared;
}

/// Everything that can disagree with the calendar after a mark or a clear:
/// the month grid, the balances the leave was drawn from, the request
/// lists, and today's muster.
void hrInvalidateAttendance(WidgetRef ref) {
  ref.invalidate(hrAttendanceMonthProvider);
  ref.invalidate(hrEmployeeLeaveBalancesProvider);
  ref.invalidate(hrEmployeeLeaveRequestsProvider);
  ref.invalidate(hrMyLeaveBalancesProvider);
  ref.invalidate(hrMyLeaveRequestsProvider);
  ref.invalidate(hrPendingLeaveRequestsProvider);
  ref.invalidate(hrMusterTodayProvider);
}

/// Destructive footer action on the mark sheet. Only shown when the day
/// actually carries something to remove.
class HrClearDayButton extends StatelessWidget {
  final bool busy;
  final VoidCallback onPressed;
  const HrClearDayButton({super.key, required this.busy, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: busy ? null : onPressed,
      icon: const Icon(Icons.backspace_outlined, size: 16),
      style: TextButton.styleFrom(foregroundColor: _danger),
      label: const Text('Clear this marking'),
    );
  }
}
