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
import '../../../widgets/runq_snack.dart';
import 'hr_attendance_status.dart';
import 'hr_colors.dart';
import 'hr_date_range_field.dart';
import 'hr_sheet_bits.dart';

/// Returns true when something was written, so callers can refresh.
Future<bool> showHrMarkAttendanceSheet(
  BuildContext context, {
  required String employeeId,
  required String employeeName,
  required DateTime date,
  String? currentStatus,
  String? contextNote,
  required bool isSelf,
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
  const _MarkSheet({
    required this.employeeId,
    required this.employeeName,
    required this.date,
    required this.currentStatus,
    required this.contextNote,
    required this.isSelf,
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
                _statusChips(),
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
                _saveButton(types),
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

  Widget _statusChips() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: kHrMarkableStatuses.map((s) {
        final meta = hrStatusMeta(s);
        final pair = hrStatusColors(context, s);
        final on = _status == s;
        final t = RT(context);
        return GestureDetector(
          onTap: () => setState(() {
            _status = s;
            if (s == 'half_day') _toDate = widget.date;
          }),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: on ? pair[0] : t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.chip),
              border: Border.all(
                color: on ? pair[1] : t.hairline,
                width: on ? 1.5 : 0.5,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(meta.icon, size: 15, color: on ? pair[1] : t.muted),
                const SizedBox(width: 6),
                Text(
                  meta.label,
                  style: RunqText.caption.copyWith(
                    color: on ? pair[1] : t.ink,
                    fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _leaveSection(RunqTokens t, List<HrLeaveType> types, bool loading) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
      );
    }
    if (types.isEmpty) return _noTypesNotice(t);

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
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: types.map((lt) => _typeChip(t, lt, balances)).toList(),
        ),
        const SizedBox(height: 14),
        _reasonField(),
        const SizedBox(height: 10),
        _balanceNotice(t),
      ],
    );
  }

  Widget _typeChip(RunqTokens t, HrLeaveType lt, List<HrLeaveBalance> balances) {
    final on = _leaveTypeId == lt.id;
    final bal = balances.where((b) => b.leaveTypeId == lt.id).firstOrNull;
    final brand = HrColors.brand(context);
    return GestureDetector(
      onTap: () => setState(() => _leaveTypeId = lt.id),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: on ? HrColors.tealSubtle : t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.chip),
          border: Border.all(
            color: on ? brand : t.hairline,
            width: on ? 1.5 : 0.5,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(lt.code,
                style: RunqText.caption.copyWith(
                  color: on ? brand : t.ink,
                  fontWeight: FontWeight.w700,
                )),
            if (bal != null) ...[
              const SizedBox(width: 6),
              Text(
                _trimNum(bal.balance),
                style: RunqText.caption.copyWith(color: on ? brand : t.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _reasonField() =>
      HrSheetTextField(controller: _notes, hint: 'Reason (optional)');

  Widget _notesField() =>
      HrSheetTextField(controller: _notes, hint: 'Notes (optional)');

  Widget _noTypesNotice(RunqTokens t) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Text(
        'No leave types configured. The day will be marked on the calendar '
        'only — no leave balance will be deducted.',
        style: RunqText.caption.copyWith(color: t.muted),
      ),
    );
  }

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
  Future<void> _pickEndDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _toDate,
      firstDate: widget.date,
      lastDate: _dayOnly(widget.date).add(
        const Duration(days: _kMaxRangeDays - 1),
      ),
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
    setState(() => _saving = true);
    try {
      final types = ref.read(hrLeaveTypesForEmployeeProvider(widget.employeeId))
              .asData?.value ?? const <HrLeaveType>[];
      if (_isLeave && _leaveTypeId != null && types.isNotEmpty) {
        await _saveAsLeave();
      } else {
        await _saveAsStamp();
      }
      _invalidate();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
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

  void _invalidate() {
    ref.invalidate(hrAttendanceMonthProvider);
    ref.invalidate(hrEmployeeLeaveBalancesProvider);
    ref.invalidate(hrEmployeeLeaveRequestsProvider);
    ref.invalidate(hrMyLeaveBalancesProvider);
    ref.invalidate(hrMyLeaveRequestsProvider);
    ref.invalidate(hrPendingLeaveRequestsProvider);
    ref.invalidate(hrMusterTodayProvider);
  }
}

/// Upper bound on a single mark. Long enough for a maternity block or a
/// factory shutdown, short enough that the per-day stamp loop stays sane.
const _kMaxRangeDays = 62;

DateTime _dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);

String _trimNum(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 1);
