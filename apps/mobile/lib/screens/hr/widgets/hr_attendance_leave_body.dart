// Attendance & leave for one employee — the whole thing, inline.
//
// This is the employee-detail Time tab's body. It used to be a summary that
// pushed a separate full-detail screen, but the two showed the same content,
// so the push was pure friction: everything is managed here now.
//
//   ┌─ Month stepper + calendar grid (tap a day to mark) ────────────────┐
//   ├─ Month summary pills ──────────────────────────────────────────────┤
//   ├─ Leave balances for the year ──────────────────────────────────────┤
//   └─ Leave request history ────────────────────────────────────────────┘
//
// One widget serves both audiences because the server scopes the data: HR
// and owners see anyone, a manager sees their reporting tree, an employee
// sees themselves. Only [_canMark] — whether days are editable — differs.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../providers/app_role_provider.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_date_range_field.dart';
import 'hr_day_detail_sheet.dart';
import 'hr_leave_summary_cards.dart';
import 'hr_mark_attendance_sheet.dart';
import 'hr_month_calendar.dart';

class HrAttendanceLeaveBody extends ConsumerStatefulWidget {
  final String employeeId;
  final String employeeName;

  /// Bottom padding — the employee-detail tab sits above a nav bar and needs
  /// more room than a plain scaffold would.
  final double bottomPadding;

  const HrAttendanceLeaveBody({
    super.key,
    required this.employeeId,
    required this.employeeName,
    this.bottomPadding = 140,
  });

  @override
  ConsumerState<HrAttendanceLeaveBody> createState() =>
      _HrAttendanceLeaveBodyState();
}

class _HrAttendanceLeaveBodyState extends ConsumerState<HrAttendanceLeaveBody> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  bool get _atCurrentMonth {
    final now = DateTime.now();
    return _month.year == now.year && _month.month == now.month;
  }

  void _step(int delta) =>
      setState(() => _month = DateTime(_month.year, _month.month + delta));

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final query = HrMonthQuery(
      employeeId: widget.employeeId,
      year: _month.year,
      month: _month.month,
    );
    final monthAsync = ref.watch(hrAttendanceMonthProvider(query));

    // Marking is an HR-admin / manager action. The server is the real gate
    // (a viewer is limited to their own reporting subtree); this only hides
    // the affordance from a plain employee looking at their own record, who
    // should raise a regularization instead.
    final role = ref.watch(appRoleProvider);
    final me = ref.watch(hrMeProvider).asData?.value;
    final isSelf = me?.employee?.id == widget.employeeId;
    final canMark = role.canManageHrSetup || (role.canSeeManagerPersona && !isSelf);

    return RefreshIndicator(
      color: HrColors.teal,
      onRefresh: () async => ref.invalidate(hrAttendanceMonthProvider(query)),
      child: monthAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text('$e',
                textAlign: TextAlign.center,
                style: RunqText.body.copyWith(color: t.muted)),
          ],
        ),
        data: (m) => ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics:
              const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          padding: EdgeInsets.fromLTRB(16, 12, 16, widget.bottomPadding),
          children: [
            _calendarCard(t, m, canMark),
            const SizedBox(height: RunqSpacing.sectionGap),
            _label(t, 'This month'),
            HrMonthSummary(counts: m.counts, otHours: m.otHours),
            const SizedBox(height: RunqSpacing.sectionGap),
            _leaveBalances(t),
            _leaveHistory(t, m),
          ],
        ),
      ),
    );
  }

  Widget _calendarCard(RunqTokens t, HrAttendanceMonth m, bool canMark) {
    final statuses = <String>{
      for (var d = 1; d <= m.query.last.day; d++)
        m.statusFor(DateTime(m.query.year, m.query.month, d)),
    }..remove('upcoming');

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          HrMonthStepper(
            month: _month,
            onPrev: () => _step(-1),
            onNext: _atCurrentMonth ? null : () => _step(1),
          ),
          const SizedBox(height: 6),
          HrMonthCalendar(
            month: _month,
            statusFor: m.statusFor,
            onTapDay: (d) => _openDay(d, m, canMark),
          ),
          const SizedBox(height: 12),
          HrCalendarLegend(statuses: statuses),
          const SizedBox(height: 10),
          Text(
            canMark
                ? 'Tap a day to mark attendance or leave'
                : 'Tap a day to see its detail',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ],
      ),
    );
  }

  /// Whoever can mark goes straight into the editor — the date-range control
  /// lives there, and putting a read-only sheet in front of it made picking a
  /// span a two-step discovery. What that sheet showed (punch times, the
  /// leave behind the status) rides along as a context note instead.
  Future<void> _openDay(
      DateTime day, HrAttendanceMonth m, bool canMark) async {
    final status = m.statusFor(day);
    if (canMark) {
      await _mark(
        day,
        status == 'upcoming' ? null : status,
        _contextNote(day, m),
        // Only a real row or a live leave can be cleared — a holiday or a
        // Sunday is derived, so there's nothing there to delete.
        canClear: m.rowFor(day) != null || m.leaveFor(day) != null,
        clearWarning: _clearWarning(day, m),
      );
      return;
    }
    await showHrDayDetailSheet(
      context,
      day: day,
      status: status,
      row: m.rowFor(day),
      holiday: m.holidayFor(day),
      leave: m.leaveFor(day),
      canMark: false,
    );
  }

  /// One-line summary of what's already on the day, or null when it's blank.
  String? _contextNote(DateTime day, HrAttendanceMonth m) {
    final parts = <String>[];
    final h = m.holidayFor(day);
    final r = m.rowFor(day);
    final l = m.leaveFor(day);
    if (h != null) parts.add(h.name);
    if (r?.checkIn != null) {
      parts.add('In ${r!.checkIn}${r.checkOut == null ? '' : ' · Out ${r.checkOut}'}');
    }
    if (r?.otHours != null && r!.otHours! > 0) {
      parts.add('OT ${_trim(r.otHours!)}h');
    }
    if (l != null) parts.add('${l.typeName} (${l.status})');
    return parts.isEmpty ? null : parts.join(' · ');
  }

  static String _trim(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 1);

  /// What the user is really about to undo. A leave day can't be cleared on
  /// its own — the balance was deducted against the whole request — so the
  /// confirm names the span and the days coming back.
  String? _clearWarning(DateTime day, HrAttendanceMonth m) {
    final l = m.leaveFor(day);
    if (l == null) return null;
    return 'This day is part of ${l.typeName} from '
        '${hrShortDate(l.fromDate)} to ${hrShortDate(l.toDate)}. Clearing '
        'cancels the whole leave, restores ${_trim(l.totalDays)} day(s) of '
        'balance, and unmarks every day it covers.';
  }

  Future<void> _mark(
    DateTime day,
    String? status,
    String? note, {
    required bool canClear,
    required String? clearWarning,
  }) async {
    final me = ref.read(hrMeProvider).asData?.value;
    final changed = await showHrMarkAttendanceSheet(
      context,
      employeeId: widget.employeeId,
      employeeName: widget.employeeName,
      date: day,
      currentStatus: status,
      contextNote: note,
      isSelf: me?.employee?.id == widget.employeeId,
      canClear: canClear,
      clearWarning: clearWarning,
    );
    if (!changed || !mounted) return;
    ref.invalidate(hrAttendanceMonthProvider);
  }

  Widget _label(RunqTokens t, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
        child: Text(text, style: RunqText.label.copyWith(color: t.muted2)),
      );

  Widget _leaveBalances(RunqTokens t) {
    final year = _month.year;
    final async = ref.watch(hrEmployeeLeaveBalancesProvider(
        (employeeId: widget.employeeId, year: year)));
    return async.maybeWhen(
      data: (rows) {
        if (rows.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _label(t, 'Leave balances $year'),
            ...rows.map((b) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: HrLeaveBalanceCard(b: b),
                )),
            const SizedBox(height: RunqSpacing.sectionGap),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  Widget _leaveHistory(RunqTokens t, HrAttendanceMonth m) {
    if (m.leaves.isEmpty) return const SizedBox.shrink();
    final recent = [...m.leaves]
      ..sort((a, b) => b.fromDate.compareTo(a.fromDate));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _label(t, 'Leave history'),
        ...recent.take(12).map((r) => HrLeaveRequestRow(r: r)),
      ],
    );
  }
}
