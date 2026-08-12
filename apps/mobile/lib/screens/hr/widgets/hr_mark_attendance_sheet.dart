// Mark one day's attendance for an employee.
//
// Two write paths, picked by the chosen status:
//
//   leave / half_day → POST /hr/leave-requests then PUT .../review
//       {approved:true}. The approval is what writes the attendance row
//       AND increments `leave_balances.used`, so the calendar and the
//       balance can never drift apart. Requires a leave type.
//
//   present / absent / week_off / holiday → POST /hr/attendance, a plain
//       upsert on (employeeId, date). No balance is involved.
//
// Clearing is the third path — DELETE /hr/attendance, which also cancels
// the leave behind a leave-marked day. See hr_clear_day.dart.
//
// Failures land in an inline banner, never a toast: this is a modal bottom
// sheet, and a ScaffoldMessenger snack renders behind it, which made a
// rejected range mark look like a dead button.
//
// Self-marking exception: the server refuses self-approval of leave
// (LeaveRequestService.review) whatever the caller's role. When the target
// is the logged-in user's own employee record we submit the request and
// leave it pending, and say so on the button.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_attendance_status.dart';
import 'hr_clear_day.dart';
import 'hr_colors.dart';
import 'hr_date_range_field.dart';
import 'hr_mark_sheet_chips.dart';
import 'hr_sheet_bits.dart';
import 'hr_status_date_picker.dart';

/// Returns true when something was written, so callers can refresh.
Future<bool> showHrMarkAttendanceSheet(
  BuildContext context, {
  required String employeeId,
  required String employeeName,
  required DateTime date,
  String? currentStatus,
  String? contextNote,
  required bool isSelf,
  bool canClear = false,
  String? clearWarning,
}) async {
  final res = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _MarkSheet(
      employeeId: employeeId,
      employeeName: employeeName,
      date: date,
      currentStatus: currentStatus,
      contextNote: contextNote,
      isSelf: isSelf,
      canClear: canClear,
      clearWarning: clearWarning,
    ),
  );
  return res ?? false;
}

class _MarkSheet extends ConsumerStatefulWidget {
  final String employeeId, employeeName;
  final DateTime date;
  final String? currentStatus;

  /// What's already recorded for this day, one line — punch times, the
  /// leave behind a 'leave' status, the holiday name. Shown so opening
  /// straight into the editor doesn't hide what's being overwritten.
  final String? contextNote;

  final bool isSelf;

  /// Whether the day carries a marking that can be removed — an attendance
  /// row or a live leave. A blank day has nothing to clear.
  final bool canClear;

  /// What clearing will actually take with it, when the day belongs to a
  /// multi-day leave. Null for a plain one-day marking.
  final String? clearWarning;

  const _MarkSheet({
    required this.employeeId,
    required this.employeeName,
    required this.date,
    required this.currentStatus,
    required this.contextNote,
    required this.isSelf,
    required this.canClear,
    required this.clearWarning,
  });

  @override
  ConsumerState<_MarkSheet> createState() => _MarkSheetState();
}

class _MarkSheetState extends ConsumerState<_MarkSheet> {
  late String _status;
  String? _leaveTypeId;

  /// End of the range being marked. Starts equal to the tapped day — the
  /// common case is one day — and the user extends it from there.
  late DateTime _toDate;

  final _notes = TextEditingController();
  bool _saving = false;

  /// Last server refusal, shown in the sheet itself. Cleared on every new
  /// attempt so a stale message never sits next to a fresh spinner.
  String? _error;

  bool get _isLeave => _status == 'leave' || _status == 'half_day';

  /// A half day is one date by server rule (createLeaveRequestSchema
  /// refuses `halfDay` across a span), so the range control locks shut.
  bool get _singleDayOnly => _status == 'half_day';

  @override
  void initState() {
    super.initState();
    final cur = widget.currentStatus;
    _status = (cur != null && kHrMarkableStatuses.contains(cur)) ? cur : 'present';
    _toDate = widget.date;
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final typesAsync = ref.watch(hrLeaveTypesForEmployeeProvider(widget.employeeId));
    final types = typesAsync.asData?.value ?? const <HrLeaveType>[];

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.bgWarm,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(RunqRadii.hero)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const HrSheetGrabber(),
                const SizedBox(height: 14),
                _header(t),
                const SizedBox(height: 16),
                Text('Mark as', style: RunqText.label.copyWith(color: t.muted2)),
                const SizedBox(height: 8),
                HrStatusChips(
                  selected: _status,
                  onSelect: (s) => setState(() {
                    _status = s;
                    if (s == 'half_day') _toDate = widget.date;
                  }),
                ),
                const SizedBox(height: 16),
                HrDateRangeField(
                  from: widget.date,
                  to: _toDate,
                  onPickEnd: _pickEndDate,
                  onReset: () => setState(() => _toDate = widget.date),
                  singleDayOnly: _singleDayOnly,
                  lockedNote: 'A half day is always a single date.',
                ),
                if (_isLeave) ...[
                  const SizedBox(height: 16),
                  _leaveSection(t, types, typesAsync.isLoading),
                ],
                if (!_isLeave) ...[
                  const SizedBox(height: 16),
                  _notesField(),
                ],
                const SizedBox(height: 20),
                HrSheetError(message: _error),
                _saveButton(types),
                if (widget.canClear)
                  HrClearDayButton(busy: _saving, onPressed: _clear),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(RunqTokens t) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(hrLongDate(widget.date), style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 2),
        Text(widget.employeeName, style: RunqText.caption.copyWith(color: t.muted)),
        if ((widget.contextNote?.trim() ?? '').isNotEmpty) ...[
          const SizedBox(height: 10),
          HrSheetNote(text: widget.contextNote),
        ],
      ],
    );
  }

  Widget _leaveSection(RunqTokens t, List<HrLeaveType> types, bool loading) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
      );
    }
    if (types.isEmpty) return const HrNoLeaveTypesNotice();

    final balances = ref
            .watch(hrEmployeeLeaveBalancesProvider(
                (employeeId: widget.employeeId, year: widget.date.year)))
            .asData
            ?.value ??
        const <HrLeaveBalance>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Leave type', style: RunqText.label.copyWith(color: t.muted2)),
        const SizedBox(height: 8),
        HrLeaveTypeChips(
          types: types,
          balances: balances,
          selectedId: _leaveTypeId,
          onSelect: (id) => setState(() => _leaveTypeId = id),
        ),
        const SizedBox(height: 14),
        _reasonField(),
        const SizedBox(height: 10),
        _balanceNotice(t),
      ],
    );
  }

  Widget _reasonField() =>
      HrSheetTextField(controller: _notes, hint: 'Reason (optional)');

  Widget _notesField() =>
      HrSheetTextField(controller: _notes, hint: 'Notes (optional)');

  Widget _balanceNotice(RunqTokens t) {
    final msg = widget.isSelf
        ? 'You can\'t approve your own leave — this will be submitted as a '
            'pending request for your approver.'
        : 'Approved immediately. The leave balance is deducted and the day is '
            'marked on the calendar.';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(widget.isSelf ? Icons.info_outline : Icons.check_circle_outline,
            size: 14, color: t.muted2),
        const SizedBox(width: 6),
        Expanded(
          child: Text(msg, style: RunqText.caption.copyWith(color: t.muted2)),
        ),
      ],
    );
  }

  Widget _saveButton(List<HrLeaveType> types) {
    final needsType = _isLeave && types.isNotEmpty && _leaveTypeId == null;
    final days = _dayCount();
    final suffix = days > 1 ? ' $days days' : '';
    final label = _isLeave && types.isNotEmpty && widget.isSelf
        ? 'Submit request$suffix'
        : 'Mark$suffix';
    return SizedBox(
      height: 50,
      child: FilledButton(
        onPressed: _saving || needsType ? null : _save,
        style: FilledButton.styleFrom(
          backgroundColor: HrColors.teal,
          disabledBackgroundColor: HrColors.teal.withValues(alpha: 0.4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(RunqRadii.input),
          ),
        ),
        child: _saving
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Text(needsType ? 'Pick a leave type' : label,
                style: RunqText.bodyStrong.copyWith(color: Colors.white)),
      ),
    );
  }

  /// The end date can only move forward from the tapped day, and is capped
  /// at [_kMaxRangeDays] — a plain-status range is written one day at a
  /// time, so an unbounded span would fire an unbounded number of requests.
  ///
  /// Uses the status-aware picker rather than Material's: extending a range
  /// overwrites every day it covers, so the user needs to see which of those
  /// days already carry a leave, a holiday, or a punched-in present.
  Future<void> _pickEndDate() async {
    final picked = await showHrStatusDatePicker(
      context,
      employeeId: widget.employeeId,
      initialDate: _toDate,
      firstDate: widget.date,
      lastDate: _dayOnly(widget.date).add(
        const Duration(days: _kMaxRangeDays - 1),
      ),
      title: 'Mark through',
      subtitle: 'Every day from ${hrShortDate(widget.date)} to the day you '
          'pick will be set to ${hrStatusMeta(_status).label.toLowerCase()}.',
    );
    if (picked != null) setState(() => _toDate = picked);
  }

  int _dayCount() =>
      _singleDayOnly ? 1 : _dayOnly(_toDate).difference(_dayOnly(widget.date)).inDays + 1;

  /// Every day in the selected range, inclusive of both ends.
  List<DateTime> _rangeDays() {
    final out = <DateTime>[];
    final end = _dayOnly(_toDate);
    var d = _dayOnly(widget.date);
    while (!d.isAfter(end)) {
      out.add(d);
      // Rebuild rather than add a Duration so month/year roll over cleanly.
      d = DateTime(d.year, d.month, d.day + 1);
    }
    return out;
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final types = ref.read(hrLeaveTypesForEmployeeProvider(widget.employeeId))
              .asData?.value ?? const <HrLeaveType>[];
      if (_isLeave && _leaveTypeId != null && types.isNotEmpty) {
        await _saveAsLeave();
      } else {
        await _saveAsStamp();
      }
      hrInvalidateAttendance(ref);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _explain(e.message);
      });
    }
  }

  /// The server's overlap refusal is true but unhelpful mid-range: the user
  /// picked a span and one day inside it already carries a leave. Say which
  /// way out — the whole request is rejected, not just the clashing day.
  String _explain(String message) {
    if (!message.toLowerCase().contains('overlapping')) return message;
    final where = _dayCount() > 1
        ? 'somewhere in ${hrShortDate(widget.date)} – ${hrShortDate(_toDate)}'
        : 'on ${hrShortDate(widget.date)}';
    return 'A leave already exists $where, so nothing was marked. Clear that '
        'leave first, or pick a range that avoids it.';
  }

  Future<void> _clear() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final cleared = await confirmAndClearDay(
        context,
        ref,
        employeeId: widget.employeeId,
        date: widget.date,
        leaveWarning: widget.clearWarning,
      );
      if (!mounted) return;
      if (cleared == null) {
        setState(() => _saving = false);
        return;
      }
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.message;
      });
    }
  }

  Future<void> _saveAsLeave() async {
    final req = await hrRepo.applyLeave(
      employeeId: widget.employeeId,
      leaveTypeId: _leaveTypeId!,
      fromDate: widget.date,
      toDate: _singleDayOnly ? widget.date : _toDate,
      halfDay: _singleDayOnly,
      reason: _notes.text.trim(),
    );
    // Self-service can't self-approve — leave it pending for the approver.
    if (widget.isSelf) return;
    await hrRepo.reviewLeave(id: req.id, approved: true);
  }

  /// One upsert per day rather than `/hr/attendance/bulk`, which is gated
  /// to owner/accountant/hr — a manager marking their own report's week
  /// would 403 on the bulk route but is allowed on the single-day one.
  Future<void> _saveAsStamp() async {
    for (final day in _rangeDays()) {
      await hrRepo.stampAttendance(
        employeeId: widget.employeeId,
        date: day,
        status: _status,
        source: 'manual',
        notes: _notes.text.trim(),
      );
    }
  }
}

/// Upper bound on a single mark. Long enough for a maternity block or a
/// factory shutdown, short enough that the per-day stamp loop stays sane.
const _kMaxRangeDays = 62;

DateTime _dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);
