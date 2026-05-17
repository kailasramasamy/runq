// Riverpod providers for the HR + Payroll module. Every provider re-fetches
// when the auth token changes (so logout/swap clears stale data) and is
// kept narrow — list screens own their own filter providers locally.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
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

final hrEmployeeProvider =
    FutureProvider.family<HrEmployee, String>((ref, id) async {
  return _watchAuth(ref, () => hrRepo.employee(id));
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

/// All pending leave requests across the tenant — backs the manager Home
/// pending-approvals card and the Pay → Approvals subtab.
final hrPendingLeaveRequestsProvider =
    FutureProvider<List<HrLeaveRequest>>((ref) async {
  return _watchAuth(ref, () => hrRepo.leaveRequests(status: 'pending'));
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

/// Upcoming statutory compliance deadlines (TDS / Form 24Q / PT).
/// Drives the manager-home "Statutory calendar" section.
final hrStatutoryCalendarProvider =
    FutureProvider<List<HrStatutoryDeadline>>((ref) async {
  return _watchAuth(ref, () => hrRepo.statutoryCalendar());
});

final hrMyPayslipsProvider = FutureProvider<List<HrPayslip>>((ref) async {
  return _watchAuth(ref, () => hrRepo.myPayslips());
});

final hrPayslipDetailProvider =
    FutureProvider.family<HrPayslip, ({String runId, String payslipId})>((ref, ids) async {
  return _watchAuth(
    ref,
    () => hrRepo.payslipDetail(runId: ids.runId, payslipId: ids.payslipId),
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
