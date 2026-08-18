// Riverpod providers for the HR + Payroll module. Every provider re-fetches
// when the auth token changes (so logout/swap clears stale data) and is
// kept narrow — list screens own their own filter providers locally.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/hr_contract_models.dart';
import '../api/hr_models.dart';
import '../api/hr_repo.dart';
import 'auth_provider.dart';

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

/// Self-context for the logged-in user. Drives the home greeting, persona
/// gate, and "my view" payslip/leave/attendance lookups across HR screens.
final hrMeProvider = FutureProvider<HrMe>((ref) async {
  return _watchAuth(ref, () => hrRepo.me());
});

class HrEmployeesQuery {
  final String? search;
  final String? status;
  final String? departmentId;
  const HrEmployeesQuery({this.search, this.status, this.departmentId});

  @override
  bool operator ==(Object other) =>
      other is HrEmployeesQuery &&
      other.search == search &&
      other.status == status &&
      other.departmentId == departmentId;

  @override
  int get hashCode => Object.hash(search, status, departmentId);
}

final hrEmployeesProvider =
    FutureProvider.family<HrEmployeeListPage, HrEmployeesQuery>((ref, q) async {
  return _watchAuth(
    ref,
    () => hrRepo.employees(search: q.search, status: q.status, departmentId: q.departmentId),
  );
});

/// Org-wide directory lookup — bypasses HrAccessScope on the server and
/// returns only safe identity fields. Powers the colleague search pill so
/// employees can find anyone in the tenant, not just their own team.
final hrDirectoryProvider =
    FutureProvider.family<HrEmployeeListPage, String>((ref, query) async {
  return _watchAuth(
    ref,
    () => hrRepo.directory(search: query.trim().isEmpty ? null : query.trim()),
  );
});

final hrEmployeeProvider =
    FutureProvider.family<HrEmployee, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.employee(id));
});

/// A colleague's work profile — backs the directory detail screen. Unscoped
/// like [hrDirectoryProvider]: safe fields, reporting line and resume only,
/// never salary / bank / statutory data.
final hrWorkProfileProvider =
    FutureProvider.family<HrWorkProfile, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.directoryProfile(id));
});

/// Org-wide reporting hierarchy for the org-chart screen. Unlike
/// [hrEmployeesProvider] this is unscoped and unpaginated — the whole
/// company tree, which every employee is entitled to see.
final hrOrgChartProvider = FutureProvider<List<HrEmployee>>((ref) async {
  return _watchAuth(ref, () => hrRepo.orgChart());
});

/// AI-extracted resume profile for an employee. Null when no resume has
/// been uploaded yet. Invalidated by the detail screen after upload/edit.
final hrResumeProfileProvider =
    FutureProvider.family<HrResumeProfile?, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.resumeProfile(employeeId));
});

/// The logged-in employee's own resume profile — backs the My Resume
/// self-service screen. Invalidated after the employee uploads their resume.
final hrMyResumeProfileProvider = FutureProvider<HrResumeProfile?>((ref) async {
  return _watchAuth(ref, () => hrRepo.myResumeProfile());
});

/// App-invite state for a given employee. Watched by the detail screen so
/// the actions sheet can label the row "Send invite" vs "Resend invite"
/// vs disable it when an app account already exists.
final hrEmployeeInviteStatusProvider =
    FutureProvider.family<HrInviteStatus, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.employeeInviteStatus(id));
});

/// Attendance for the logged-in user across the current week. The Time tab
/// pages back/forward via local state, but this provider covers the default.
final hrMyAttendanceProvider =
    FutureProvider.family<List<HrAttendanceRow>, _Week>((ref, w) async {
  final me = await ref.watch(hrMeProvider.future);
  final empId = me.employee?.id;
  if (empId == null) return const [];
  return _watchAuth(
    ref,
    () => hrRepo.attendance(employeeId: empId, from: w.from, to: w.to),
  );
});

/// Holds the inclusive week range. Used as a family key for attendance.
class _Week {
  final DateTime from, to;
  const _Week(this.from, this.to);

  @override
  bool operator ==(Object other) =>
      other is _Week && other.from == from && other.to == to;

  @override
  int get hashCode => Object.hash(from, to);
}

/// Convenience: this calendar week (Mon → Sun) for the current device tz.
final hrThisWeekProvider = Provider<_Week>((ref) {
  final now = DateTime.now();
  // Monday is `weekday == 1`; clamp back to Monday of this week.
  final monday = DateTime(now.year, now.month, now.day - (now.weekday - 1));
  final sunday = monday.add(const Duration(days: 6));
  return _Week(monday, sunday);
});

final hrMyAttendanceThisWeekProvider =
    FutureProvider<List<HrAttendanceRow>>((ref) async {
  final w = ref.watch(hrThisWeekProvider);
  return ref.watch(hrMyAttendanceProvider(w).future);
});

final hrLeaveTypesProvider = FutureProvider<List<HrLeaveType>>((ref) async {
  return _watchAuth(ref, () => hrRepo.leaveTypes());
});

/// Next employee code, for the new-employee form's hint. Advisory —
/// the server assigns the real one when the record saves.
final hrNextEmployeeCodeProvider = FutureProvider<String>((ref) async {
  return _watchAuth(ref, () => hrRepo.nextEmployeeCode());
});

/// Every configured type, retired ones included. Backs the leave-types
/// admin screen only — pickers want [hrLeaveTypesProvider], which hides
/// what nobody can apply for any more.
final hrAllLeaveTypesProvider = FutureProvider<List<HrLeaveType>>((ref) async {
  return _watchAuth(ref, () => hrRepo.leaveTypes(includeInactive: true));
});

/// Self-scoped leave types — hides gender-gated types the logged-in
/// employee can't apply for (males → no ML, females → no PAT, NULL
/// gender → only 'all'-applicable types). Used by the Apply Leave sheet
/// so the dropdown matches what the balance pills show.
final hrMyLeaveTypesProvider = FutureProvider<List<HrLeaveType>>((ref) async {
  final me = await ref.watch(hrMeProvider.future);
  final empId = me.employee?.id;
  if (empId == null) {
    // No employee link → fall back to the unfiltered list. The Apply
    // sheet still works, the user just won't get the gender filter.
    return _watchAuth(ref, () => hrRepo.leaveTypes());
  }
  return _watchAuth(ref, () => hrRepo.leaveTypes(forEmployeeId: empId));
});

final hrMyLeaveBalancesProvider =
    FutureProvider<List<HrLeaveBalance>>((ref) async {
  final me = await ref.watch(hrMeProvider.future);
  final empId = me.employee?.id;
  if (empId == null) return const [];
  final year = DateTime.now().year;
  return _watchAuth(ref, () => hrRepo.leaveBalances(employeeId: empId, year: year));
});

final hrMyLeaveRequestsProvider =
    FutureProvider<List<HrLeaveRequest>>((ref) async {
  final me = await ref.watch(hrMeProvider.future);
  final empId = me.employee?.id;
  if (empId == null) return const [];
  return _watchAuth(ref, () => hrRepo.leaveRequests(employeeId: empId));
});

/// Leave balances for a specific employee + year — backs the admin
/// employee-detail Leave tab when owner/HR browses another employee.
/// (`hrMyLeaveBalancesProvider` is hardwired to the logged-in user.)
final hrEmployeeLeaveBalancesProvider = FutureProvider.family<List<HrLeaveBalance>,
    ({String employeeId, int year})>((ref, q) async {
  return _watchAuth(
    ref,
    () => hrRepo.leaveBalances(employeeId: q.employeeId, year: q.year),
  );
});

/// Leave requests for a specific employee — admin employee-detail Leave tab.
final hrEmployeeLeaveRequestsProvider =
    FutureProvider.family<List<HrLeaveRequest>, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.leaveRequests(employeeId: employeeId));
});

/// Reviewed (approved / rejected / cancelled) leave requests within the
/// caller's HR scope — backs the manager Leaves tab's "Recent decisions"
/// history section. Server returns these as part of the unfiltered
/// list; we partition them client-side from the pending pool. Sorted
/// newest-decision first by the consumer.
final hrReviewedLeaveRequestsProvider =
    FutureProvider<List<HrLeaveRequest>>((ref) async {
  final all = await _watchAuth(ref, () => hrRepo.leaveRequests());
  return all.where((r) => r.status != 'pending').toList();
});

/// Submitted expense claims awaiting this user's decision — backs the
/// manager Home Expenses quick-action badge and any future review queue
/// surface. Excludes the user's own claims (self-approval is forbidden
/// server-side anyway). Admin / HR see everyone's submitted claims;
/// managers see their team's via the existing endpoint (currently
/// returns tenant-wide for them but the self-filter is the meaningful
/// trim for the badge count).
final hrPendingExpenseClaimsProvider =
    FutureProvider<List<HrExpenseClaim>>((ref) async {
  final all = await _watchAuth(ref, () => hrRepo.expenseClaims(status: 'submitted'));
  final myUserId = ref.watch(authProvider).user?.id;
  if (myUserId == null) return all;
  return all.where((c) => c.claimantId != myUserId).toList();
});

/// Pending leave requests this user can act on — backs the manager Home
/// pending-approvals badge and the Pay → Approvals subtab.
///
/// Self-filtered: the server returns everything in the requester's
/// scope, which for a manager includes their own row. A manager
/// reviewing their own request is nonsense (self-approval), so we
/// drop those here. Admin / HR users see the full list because they
/// genuinely approve requests across the org, including any they
/// raised themselves (rare in practice but technically allowed).
final hrPendingLeaveRequestsProvider =
    FutureProvider<List<HrLeaveRequest>>((ref) async {
  final all = await _watchAuth(ref, () => hrRepo.leaveRequests(status: 'pending'));
  final me = ref.watch(hrMeProvider).asData?.value;
  final selfId = me?.employee?.id;
  final isAdminOrHr = me?.systemRole == 'owner'
      || me?.systemRole == 'accountant'
      || me?.systemRole == 'hr';
  if (selfId == null || isAdminOrHr) return all;
  return all.where((r) => r.employeeId != selfId).toList();
});

final hrHolidaysProvider = FutureProvider<List<HrHoliday>>((ref) async {
  final year = DateTime.now().year;
  return _watchAuth(ref, () => hrRepo.holidays(year: year));
});

/// Year-scoped holidays for the management screen. Lets the user page
/// between years without colliding with the home-screen current-year
/// cache.
final hrHolidaysByYearProvider =
    FutureProvider.family<List<HrHoliday>, int>((ref, year) async {
  return _watchAuth(ref, () => hrRepo.holidays(year: year));
});

final hrDashboardProvider = FutureProvider<HrDashboard>((ref) async {
  return _watchAuth(ref, () => hrRepo.dashboard());
});

/// Six-bucket muster for today — backs the manager-view tile grid.
/// Recomputed when auth changes; consumers can `ref.invalidate(...)` to
/// refresh after a manual attendance edit.
final hrMusterTodayProvider = FutureProvider<HrMuster>((ref) async {
  return _watchAuth(ref, () => hrRepo.musterToday());
});

/// Lightweight headcount lookup — just the paginated meta's `total`,
/// avoids fetching all employees just to count them. Watched by the
/// manager-view stat row.
final hrHeadcountProvider = FutureProvider<int>((ref) async {
  return _watchAuth(ref, () async {
    final page = await hrRepo.employees(limit: 1);
    return page.total;
  });
});

final hrDepartmentsProvider = FutureProvider<List<HrDepartment>>((ref) async {
  return _watchAuth(ref, () => hrRepo.departments());
});

final hrDesignationsProvider = FutureProvider<List<HrDesignation>>((ref) async {
  return _watchAuth(ref, () => hrRepo.designations());
});

final hrShiftsProvider = FutureProvider<List<HrShift>>((ref) async {
  return _watchAuth(ref, () => hrRepo.shifts());
});

/// Upcoming statutory compliance deadlines (TDS / Form 24Q / PT).
/// Drives the manager-home "Statutory calendar" section.
final hrStatutoryCalendarProvider =
    FutureProvider<List<HrStatutoryDeadline>>((ref) async {
  return _watchAuth(ref, () => hrRepo.statutoryCalendar());
});

final hrMyPayslipsProvider = FutureProvider<List<HrPayslip>>((ref) async {
  return _watchAuth(ref, () => hrRepo.myPayslips());
});

/// Payslip history for a specific employee — admin/HR Pay tab on the
/// employee-detail screen.
final hrEmployeePayslipsProvider =
    FutureProvider.family<List<HrPayslip>, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.employeePayslips(employeeId));
});

/// `self` picks the self-service endpoint: the admin payslip route is
/// owner/HR only, so an employee opening their own payslip must go via
/// /hr/me or they get a 403 dead screen.
final hrPayslipDetailProvider =
    FutureProvider.family<HrPayslip, ({String runId, String payslipId, bool self})>((ref, ids) async {
  return _watchAuth(
    ref,
    () => ids.self
        ? hrRepo.myPayslipDetail(ids.payslipId)
        : hrRepo.payslipDetail(runId: ids.runId, payslipId: ids.payslipId),
  );
});

/// Documents attached to an employee record, newest first. Backed by
/// /common/attachments/employee/:id — same endpoint the web HR page uses.
final hrEmployeeDocumentsProvider =
    FutureProvider.family<List<HrDocument>, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.documents(employeeId));
});

class HrClaimsQuery {
  final String? status;
  final String? claimantId;
  const HrClaimsQuery({this.status, this.claimantId});

  @override
  bool operator ==(Object other) =>
      other is HrClaimsQuery &&
      other.status == status &&
      other.claimantId == claimantId;

  @override
  int get hashCode => Object.hash(status, claimantId);
}

final hrExpenseClaimsProvider =
    FutureProvider.family<List<HrExpenseClaim>, HrClaimsQuery>((ref, q) async {
  return _watchAuth(
    ref,
    () => hrRepo.expenseClaims(status: q.status, claimantId: q.claimantId),
  );
});

final hrExpenseClaimProvider =
    FutureProvider.family<HrExpenseClaim, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.expenseClaim(id));
});

final hrSalaryComponentsProvider = FutureProvider<List<HrSalaryComponent>>((ref) async {
  return _watchAuth(ref, () => hrRepo.salaryComponents());
});

final hrSalaryStructuresProvider = FutureProvider<List<HrSalaryStructure>>((ref) async {
  return _watchAuth(ref, () => hrRepo.salaryStructures());
});

final hrSalaryStructureProvider =
    FutureProvider.family<HrSalaryStructure, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.salaryStructure(id));
});

final hrEmployeeSalariesProvider =
    FutureProvider.family<List<HrEmployeeSalary>, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.employeeSalaries(employeeId));
});

final hrPayrollRunsProvider = FutureProvider<List<HrPayrollRun>>((ref) async {
  return _watchAuth(ref, () => hrRepo.payrollRuns());
});

final hrPayrollRunProvider =
    FutureProvider.family<HrPayrollRun, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.payrollRun(id));
});

final hrRunPayslipsProvider =
    FutureProvider.family<List<HrPayslip>, String>((ref, runId) async {
  return _watchAuth(ref, () => hrRepo.runPayslips(runId));
});

// ─── Dashboard-derived providers ───────────────────────────────────────────

/// Employees who are away today — derived from approved leave requests
/// whose date range includes today. Sorted alphabetically. Used by the
/// "Who's out" section on the manager dashboard.
final hrWhoIsOutTodayProvider =
    FutureProvider<List<({HrLeaveRequest req})>>((ref) async {
  return _watchAuth(ref, () async {
    final approved = await hrRepo.leaveRequests(status: 'approved');
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    return approved
        .where((r) {
          final from = DateTime(r.fromDate.year, r.fromDate.month, r.fromDate.day);
          final to = DateTime(r.toDate.year, r.toDate.month, r.toDate.day);
          return !todayDate.isBefore(from) && !todayDate.isAfter(to);
        })
        .map((r) => (req: r))
        .toList();
  });
});

class HrCelebration {
  /// 'birthday' | 'anniversary'
  final String kind;
  final HrEmployee employee;
  final DateTime occursOn;
  /// Years (only meaningful for anniversaries; 0 for birthdays).
  final int years;
  HrCelebration({
    required this.kind,
    required this.employee,
    required this.occursOn,
    this.years = 0,
  });
  int get daysAway {
    final t = DateTime.now();
    return occursOn.difference(DateTime(t.year, t.month, t.day)).inDays;
  }
}

/// Birthdays + work anniversaries falling within the next 7 days. Pulls
/// the active-employee list once, then derives client-side — cheap and
/// avoids a new server endpoint.
final hrCelebrationsProvider =
    FutureProvider<List<HrCelebration>>((ref) async {
  return _watchAuth(ref, () async {
    final page = await hrRepo.employees(status: 'active', limit: 200);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final horizon = today.add(const Duration(days: 7));
    final out = <HrCelebration>[];
    DateTime? nextOccurrence(DateTime? source) {
      if (source == null) return null;
      // Project month/day onto this year; if already past, project to
      // next year. That way we capture rollover at year-end.
      var candidate = DateTime(today.year, source.month, source.day);
      if (candidate.isBefore(today)) {
        candidate = DateTime(today.year + 1, source.month, source.day);
      }
      return candidate;
    }
    for (final e in page.data) {
      final bday = nextOccurrence(e.dateOfBirth);
      if (bday != null && !bday.isAfter(horizon)) {
        out.add(HrCelebration(kind: 'birthday', employee: e, occursOn: bday));
      }
      final ann = nextOccurrence(e.joiningDate);
      if (ann != null && !ann.isAfter(horizon)) {
        final years = ann.year - e.joiningDate!.year;
        if (years > 0) {
          out.add(HrCelebration(kind: 'anniversary', employee: e, occursOn: ann, years: years));
        }
      }
    }
    out.sort((a, b) => a.occursOn.compareTo(b.occursOn));
    return out;
  });
});

class HrPeopleMoments {
  final List<HrEmployee> joinersThisMonth;
  final List<HrEmployee> exitsThisMonth;
  HrPeopleMoments({required this.joinersThisMonth, required this.exitsThisMonth});
}

/// Joiners + exits whose date falls in the current calendar month.
/// Derived from the employees list (no new endpoint).
final hrPeopleMomentsProvider =
    FutureProvider<HrPeopleMoments>((ref) async {
  return _watchAuth(ref, () async {
    final page = await hrRepo.employees(limit: 200);
    final now = DateTime.now();
    bool inThisMonth(DateTime? d) =>
        d != null && d.year == now.year && d.month == now.month;
    final joiners = page.data.where((e) => inThisMonth(e.joiningDate)).toList()
      ..sort((a, b) => a.joiningDate!.compareTo(b.joiningDate!));
    final exits = page.data.where((e) => inThisMonth(e.exitDate)).toList()
      ..sort((a, b) => a.exitDate!.compareTo(b.exitDate!));
    return HrPeopleMoments(joinersThisMonth: joiners, exitsThisMonth: exits);
  });
});

class HrAttendanceTrendPoint {
  final DateTime date;
  final int present, total;
  HrAttendanceTrendPoint({required this.date, required this.present, required this.total});
  double get ratio => total == 0 ? 0 : present / total;
}

/// 7-day rolling attendance trend. Calls /hr/attendance for the window
/// and aggregates per-day. Server-side aggregation would be cleaner but
/// avoiding a new endpoint here too.
final hrAttendanceTrend7dProvider =
    FutureProvider<List<HrAttendanceTrendPoint>>((ref) async {
  return _watchAuth(ref, () async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final start = today.subtract(const Duration(days: 6));
    final rows = await hrRepo.attendance(from: start, to: today);
    // Bucket by day.
    final byDay = <String, ({int present, int total})>{};
    String key(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    for (final r in rows) {
      final k = key(r.date);
      final cur = byDay[k] ?? (present: 0, total: 0);
      final isPresent = r.status == 'present' || r.status == 'half_day';
      byDay[k] = (
        present: cur.present + (isPresent ? 1 : 0),
        total: cur.total + 1,
      );
    }
    final out = <HrAttendanceTrendPoint>[];
    for (var i = 0; i < 7; i++) {
      final d = start.add(Duration(days: i));
      final v = byDay[key(d)] ?? (present: 0, total: 0);
      out.add(HrAttendanceTrendPoint(date: d, present: v.present, total: v.total));
    }
    return out;
  });
});

final hrExpiringDocsProvider =
    FutureProvider<List<HrExpiringDoc>>((ref) async {
  return _watchAuth(ref, () => hrRepo.expiringDocuments(daysAhead: 90));
});

/// Active announcements (pinned first, newest second, expired filtered).
/// Post / delete should invalidate this provider so the feed updates.
final hrAnnouncementsProvider =
    FutureProvider<List<HrAnnouncement>>((ref) async {
  return _watchAuth(ref, () => hrRepo.announcements());
});

/// Last 20 HR events, rolled up from leave / employees / payroll / documents.
final hrRecentActivityProvider =
    FutureProvider<List<HrActivityEvent>>((ref) async {
  return _watchAuth(ref, () => hrRepo.recentActivity());
});

// ─── Rewards ──────────────────────────────────────────────────────────────

/// Active reward types — the picker for the initiate-reward form.
final hrRewardTypesProvider = FutureProvider<List<HrRewardType>>((ref) async {
  return _watchAuth(ref, () => hrRepo.rewardTypes(activeOnly: true));
});

class HrRewardsQuery {
  final String? status;
  final String? employeeId;
  const HrRewardsQuery({this.status, this.employeeId});

  @override
  bool operator ==(Object other) =>
      other is HrRewardsQuery &&
      other.status == status &&
      other.employeeId == employeeId;

  @override
  int get hashCode => Object.hash(status, employeeId);
}

final hrRewardsProvider =
    FutureProvider.family<List<HrReward>, HrRewardsQuery>((ref, q) async {
  return _watchAuth(
    ref,
    () => hrRepo.rewards(status: q.status, employeeId: q.employeeId),
  );
});

/// Current logged-in user's points balance. Invalidated after a redemption
/// is submitted so the card reflects the new (pending) balance.
final hrPointsBalanceProvider = FutureProvider<HrPointsBalance>((ref) async {
  return _watchAuth(ref, () => hrRepo.pointsBalance());
});

// ─── Attendance calendar ───────────────────────────────────────────────────

/// Identity for a month of one employee's attendance.
class HrMonthQuery {
  final String employeeId;
  final int year, month;
  const HrMonthQuery({
    required this.employeeId,
    required this.year,
    required this.month,
  });

  DateTime get first => DateTime(year, month, 1);

  /// Last calendar day of the month — `day: 0` of the next month.
  DateTime get last => DateTime(year, month + 1, 0);

  @override
  bool operator ==(Object other) =>
      other is HrMonthQuery &&
      other.employeeId == employeeId &&
      other.year == year &&
      other.month == month;

  @override
  int get hashCode => Object.hash(employeeId, year, month);
}

String _dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// Everything the month calendar needs for one employee, resolved to a
/// per-day status. Attendance rows win; a day with no row falls back to
/// holiday → weekly-off → unmarked (past) → upcoming (future).
class HrAttendanceMonth {
  final HrMonthQuery query;
  final Map<String, HrAttendanceRow> rows;
  final Map<String, HrHoliday> holidays;
  final List<int> weeklyOffDays;
  final List<HrLeaveRequest> leaves;

  HrAttendanceMonth({
    required this.query,
    required this.rows,
    required this.holidays,
    required this.weeklyOffDays,
    required this.leaves,
  });

  HrAttendanceRow? rowFor(DateTime d) => rows[_dayKey(d)];
  HrHoliday? holidayFor(DateTime d) => holidays[_dayKey(d)];

  /// `shifts.weekly_off_days` stores JS weekday numbers (0 = Sunday);
  /// Dart's `DateTime.weekday` is 1 = Monday … 7 = Sunday.
  bool isWeeklyOff(DateTime d) => weeklyOffDays.contains(d.weekday % 7);

  /// The approved/pending leave request covering [d], if any — lets the
  /// day sheet name the leave type behind a 'leave' status.
  HrLeaveRequest? leaveFor(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    for (final l in leaves) {
      if (l.status == 'rejected' || l.status == 'cancelled') continue;
      final from = DateTime(l.fromDate.year, l.fromDate.month, l.fromDate.day);
      final to = DateTime(l.toDate.year, l.toDate.month, l.toDate.day);
      if (!day.isBefore(from) && !day.isAfter(to)) return l;
    }
    return null;
  }

  String statusFor(DateTime d) {
    final row = rowFor(d);
    if (row != null) return row.status;
    if (holidayFor(d) != null) return 'holiday';
    if (isWeeklyOff(d)) return 'week_off';
    final today = DateTime.now();
    final isFuture = DateTime(d.year, d.month, d.day)
        .isAfter(DateTime(today.year, today.month, today.day));
    return isFuture ? 'upcoming' : 'unmarked';
  }

  /// Counts per status across the month, derived the same way the grid
  /// renders — so the summary strip can never disagree with the cells.
  Map<String, int> get counts {
    final out = <String, int>{};
    for (var day = 1; day <= query.last.day; day++) {
      final s = statusFor(DateTime(query.year, query.month, day));
      if (s == 'upcoming') continue;
      out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }

  /// Overtime logged across the month, for the summary strip.
  double get otHours =>
      rows.values.fold(0.0, (sum, r) => sum + (r.otHours ?? 0));
}

/// One month of attendance for one employee, joined with holidays, the
/// employee's weekly offs, and their leave requests. Four calls, fanned
/// out in parallel; holidays and weekly-offs are cached by their own
/// providers so paging months only refetches the attendance rows.
final hrAttendanceMonthProvider =
    FutureProvider.family<HrAttendanceMonth, HrMonthQuery>((ref, q) async {
  final holidaysF = ref.watch(hrHolidaysByYearProvider(q.year).future);
  final weeklyOffF = ref.watch(hrEmployeeWeeklyOffsProvider(q.employeeId).future);
  final leavesF = ref.watch(hrEmployeeLeaveRequestsProvider(q.employeeId).future);
  final rowsF = _watchAuth(
    ref,
    () => hrRepo.attendance(employeeId: q.employeeId, from: q.first, to: q.last),
  );

  final rows = await rowsF;
  final holidays = await holidaysF;
  final weeklyOff = await weeklyOffF;
  final leaves = await leavesF;

  return HrAttendanceMonth(
    query: q,
    rows: {for (final r in rows) _dayKey(r.date): r},
    holidays: {
      for (final h in holidays)
        if (h.date.year == q.year && h.date.month == q.month) _dayKey(h.date): h,
    },
    weeklyOffDays: weeklyOff,
    leaves: leaves,
  );
});

/// Weekly-off weekdays from the employee's current shift assignment.
/// Split out from [hrAttendanceMonthProvider] so month paging reuses it.
final hrEmployeeWeeklyOffsProvider =
    FutureProvider.family<List<int>, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.employeeWeeklyOffDays(employeeId));
});

/// Leave types applicable to a specific employee — gender-filtered by the
/// server. Backs the manager's mark-attendance sheet, which picks a type
/// on someone else's behalf and must not offer types they can't take.
final hrLeaveTypesForEmployeeProvider =
    FutureProvider.family<List<HrLeaveType>, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRepo.leaveTypes(forEmployeeId: employeeId));
});

// ─── Labour contracts ─────────────────────────────────────────────────────

/// Contract list, optionally narrowed by status. Null status = every
/// contract, which is what the "All" filter chip asks for.
final hrContractsProvider =
    FutureProvider.family<List<HrContract>, String?>((ref, status) async {
  return _watchAuth(ref, () => hrRepo.contracts(status: status));
});

/// One contract with its crew, day log, advances, settlements and live
/// balance. The detail endpoint returns all of it together, so the screen
/// renders in one pass instead of stitching five loading states.
final hrContractProvider =
    FutureProvider.family<HrContract, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.contract(id));
});

/// Instalments already handed over against a settlement.
final hrSettlementPaymentsProvider =
    FutureProvider.family<List<HrSettlementPayment>, String>((ref, settlementId) async {
  return _watchAuth(ref, () => hrRepo.settlementPayments(settlementId));
});

class HrSettlementQuery {
  final String contractId;
  final DateTime? throughDate;
  final double otherDeductions;
  const HrSettlementQuery(this.contractId, {this.throughDate, this.otherDeductions = 0});

  @override
  bool operator ==(Object other) =>
      other is HrSettlementQuery &&
      other.contractId == contractId &&
      other.throughDate == throughDate &&
      other.otherDeductions == otherDeductions;

  @override
  int get hashCode => Object.hash(contractId, throughDate, otherDeductions);
}

/// Live settlement figures. Recomputed server-side from the day log on
/// every fetch, so a day marked while the sheet is open is picked up by
/// invalidating this rather than by any client-side arithmetic.
final hrSettlementPreviewProvider =
    FutureProvider.family<HrSettlementPreview, HrSettlementQuery>((ref, q) async {
  return _watchAuth(
    ref,
    () => hrRepo.settlementPreview(
      q.contractId,
      throughDate: q.throughDate,
      otherDeductions: q.otherDeductions,
    ),
  );
});
