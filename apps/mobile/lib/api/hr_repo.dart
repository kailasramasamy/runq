// Mobile-side repo for the HR + Payroll module. Mirrors the route surface
// in `apps/api/src/modules/hr/*`. Kept separate from `repos.dart` so HR
// stays cleanly excisable if it ever becomes its own bundle.

library;

import 'dart:io';
import 'api_client.dart';
import 'hr_models.dart';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) return (res['data'] as Map).cast<String, dynamic>();
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}

List<Map<String, dynamic>> _dataList(dynamic res) {
  if (res is Map && res['data'] is List) return (res['data'] as List).cast<Map<String, dynamic>>();
  if (res is List) return res.cast<Map<String, dynamic>>();
  return [];
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class HrRepo {
  // ── /hr/me ───────────────────────────────────────────────────────────────

  Future<HrMe> me() async {
    final res = await apiClient.get('/hr/me');
    return HrMe.fromJson(_data(res));
  }

  Future<List<HrPayslip>> myPayslips() async {
    final res = await apiClient.get('/hr/me/payslips');
    return _dataList(res).map(HrPayslip.fromJson).toList();
  }

  // ── /hr/employees ────────────────────────────────────────────────────────

  Future<HrEmployeeListPage> employees({
    String? search,
    String? status,
    String? departmentId,
    int page = 1,
    int limit = 50,
  }) async {
    final qp = <String, String>{
      'page': '$page',
      'limit': '$limit',
    };
    if (search != null && search.trim().isNotEmpty) qp['search'] = search.trim();
    if (status != null && status.isNotEmpty) qp['status'] = status;
    if (departmentId != null && departmentId.isNotEmpty) qp['departmentId'] = departmentId;
    final res = await apiClient.get('/hr/employees?${Uri(queryParameters: qp).query}');
    if (res is Map && res['data'] is List) {
      return HrEmployeeListPage.fromJson(res.cast<String, dynamic>());
    }
    return HrEmployeeListPage(data: const [], page: 1, limit: limit, total: 0, totalPages: 0);
  }

  Future<HrEmployee> employee(String id) async {
    final res = await apiClient.get('/hr/employees/$id');
    return HrEmployee.fromJson(_data(res));
  }

  // ── /hr/directory ────────────────────────────────────────────────────────
  // Org-wide colleague lookup. Returns only safe identity + contact fields
  // (no salary, no statutory ids) and ignores HrAccessScope, so an employee
  // can find anyone in the tenant — the way Slack / Teams / Keka do it.
  // Active employees only.
  Future<HrEmployeeListPage> directory({
    String? search,
    int page = 1,
    int limit = 25,
  }) async {
    final qp = <String, String>{
      'page': '$page',
      'limit': '$limit',
    };
    if (search != null && search.trim().isNotEmpty) qp['search'] = search.trim();
    final res = await apiClient.get('/hr/directory?${Uri(queryParameters: qp).query}');
    if (res is Map && res['data'] is List) {
      return HrEmployeeListPage.fromJson(res.cast<String, dynamic>());
    }
    return HrEmployeeListPage(data: const [], page: 1, limit: limit, total: 0, totalPages: 0);
  }

  /// A single colleague's work profile — safe fields, reporting line and
  /// resume. Unscoped like /hr/directory: any employee can open anyone.
  Future<HrWorkProfile> directoryProfile(String id) async {
    final res = await apiClient.get('/hr/directory/$id');
    return HrWorkProfile.fromJson(_data(res));
  }

  // ── /hr/org-chart ────────────────────────────────────────────────────────
  // Org-wide reporting hierarchy. Like /hr/directory it ignores HrAccessScope
  // so every employee sees the whole company tree; returns only structural +
  // safe identity fields. Single unpaginated payload — the chart needs the
  // entire tree, and SME headcounts keep it small.
  Future<List<HrEmployee>> orgChart() async {
    final res = await apiClient.get('/hr/org-chart');
    return _dataList(res).map(HrEmployee.fromJson).toList();
  }

  /// Create / update mirror the server's create + update schemas. The
  /// payload is intentionally typed `Map<String, dynamic>` because the
  /// shape has 25+ optional fields — passing nulls is meaningful (clears
  /// a column), so we leave it to the caller to omit absent values.
  Future<HrEmployee> createEmployee(Map<String, dynamic> body) async {
    final res = await apiClient.post('/hr/employees', body);
    return HrEmployee.fromJson(_data(res));
  }

  Future<HrEmployee> updateEmployee(String id, Map<String, dynamic> body) async {
    final res = await apiClient.put('/hr/employees/$id', body);
    return HrEmployee.fromJson(_data(res));
  }

  Future<void> deleteEmployee(String id) async {
    await apiClient.delete('/hr/employees/$id');
  }

  /// Send (or re-send) an app invite to the employee. The server reuses
  /// the existing join_tenant invite flow — on accept, a `viewer` user is
  /// created and linked to this tenant by email.
  Future<HrInviteResult> inviteEmployee(String id) async {
    final res = await apiClient.post('/hr/employees/$id/invite', {});
    final d = _data(res) as Map<String, dynamic>;
    return HrInviteResult(
      token: d['token'] as String,
      inviteUrl: d['inviteUrl'] as String,
      email: d['email'] as String?,
      expiresAt: DateTime.parse(d['expiresAt'] as String),
      emailDelivery: d['emailDelivery'] as String,
      reused: d['reused'] as bool? ?? false,
    );
  }

  /// Inspect whether an employee already has an app account, has a pending
  /// invite, or hasn't been invited yet. Drives the UI's status chip.
  Future<HrInviteStatus> employeeInviteStatus(String id) async {
    final res = await apiClient.get('/hr/employees/$id/invite-status');
    final d = _data(res) as Map<String, dynamic>;
    final latest = d['latestInvite'] as Map<String, dynamic>?;
    return HrInviteStatus(
      status: d['status'] as String,
      accountActive: d['accountActive'] as bool? ?? false,
      inviteUrl: latest?['inviteUrl'] as String?,
      expiresAt: latest?['expiresAt'] != null
          ? DateTime.parse(latest!['expiresAt'] as String)
          : null,
    );
  }

  /// Multipart upload to `/hr/employees/:id/photo`. Server resizes +
  /// re-encodes to JPEG, then stores the S3 key on `employees.photo_url`.
  Future<void> uploadEmployeePhoto(String id, File file) async {
    await apiClient.upload(
      '/hr/employees/$id/photo',
      file,
      mimeType: _guessImageMime(file.path),
    );
  }

  Future<void> deleteEmployeePhoto(String id) async {
    await apiClient.delete('/hr/employees/$id/photo');
  }

  // ── Resume profile ────────────────────────────────────────────────────────
  // AI-extracted enrichment from the employee's resume.

  /// Returns null when the employee has no resume profile yet.
  Future<HrResumeProfile?> resumeProfile(String employeeId) async {
    final res = await apiClient.get('/hr/employees/$employeeId/resume-profile');
    if (res is Map && res['data'] == null) return null;
    final d = _data(res);
    return d.isEmpty ? null : HrResumeProfile.fromJson(d);
  }

  /// Multipart upload to `/hr/employees/:id/resume`. The server stores the
  /// file and runs extraction synchronously, returning the fresh profile.
  Future<HrResumeProfile> uploadResume(String employeeId, File file, {String? mimeType}) async {
    final res = await apiClient.upload(
      '/hr/employees/$employeeId/resume',
      file,
      mimeType: mimeType,
    );
    return HrResumeProfile.fromJson(_data(res));
  }

  Future<HrResumeProfile> updateResumeProfile(String employeeId, Map<String, dynamic> body) async {
    final res = await apiClient.put('/hr/employees/$employeeId/resume-profile', body);
    return HrResumeProfile.fromJson(_data(res));
  }

  /// Self-service: the logged-in employee's own resume profile. Null when
  /// they haven't uploaded a resume yet.
  Future<HrResumeProfile?> myResumeProfile() async {
    final res = await apiClient.get('/hr/me/resume-profile');
    if (res is Map && res['data'] == null) return null;
    final d = _data(res);
    return d.isEmpty ? null : HrResumeProfile.fromJson(d);
  }

  /// Self-service: the employee uploads their own resume; the server
  /// extracts the profile and returns it.
  Future<HrResumeProfile> uploadMyResume(File file, {String? mimeType}) async {
    final res = await apiClient.upload('/hr/me/resume', file, mimeType: mimeType);
    return HrResumeProfile.fromJson(_data(res));
  }

  // ── Department + designation pickers ──────────────────────────────────

  Future<List<HrDepartment>> departments() async {
    final res = await apiClient.get('/hr/departments');
    return _dataList(res).map(HrDepartment.fromJson).toList();
  }

  Future<List<HrDesignation>> designations() async {
    final res = await apiClient.get('/hr/designations');
    return _dataList(res).map(HrDesignation.fromJson).toList();
  }

  String _guessImageMime(String path) {
    final ext = path.toLowerCase().split('.').last;
    switch (ext) {
      case 'png':  return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      case 'heic': return 'image/heic';
      default:     return 'application/octet-stream';
    }
  }

  // ── /hr/attendance ───────────────────────────────────────────────────────

  Future<List<HrAttendanceRow>> attendance({
    String? employeeId,
    DateTime? from,
    DateTime? to,
    String? status,
  }) async {
    final qp = <String, String>{};
    if (employeeId != null) qp['employeeId'] = employeeId;
    if (from != null) qp['dateFrom'] = _isoDate(from);
    if (to != null) qp['dateTo'] = _isoDate(to);
    if (status != null) qp['status'] = status;
    final res = await apiClient.get('/hr/attendance?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(HrAttendanceRow.fromJson).toList();
  }

  /// Stamps an attendance row for the given employee + date. Used by the
  /// mobile biometric check-in / check-out flow. The server upserts on
  /// (employeeId, date), so calling check-in then check-out updates the
  /// same row instead of creating two.
  Future<HrAttendanceRow> stampAttendance({
    required String employeeId,
    required DateTime date,
    String? checkIn,
    String? checkOut,
    String? notes,
    String status = 'present',
    String source = 'mobile',
  }) async {
    final body = <String, dynamic>{
      'employeeId': employeeId,
      'date': _isoDate(date),
      'status': status,
      'source': source,
      if (checkIn != null) 'checkIn': checkIn,
      if (checkOut != null) 'checkOut': checkOut,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    };
    final res = await apiClient.post('/hr/attendance', body);
    return HrAttendanceRow.fromJson(_data(res));
  }

  /// Bulk-upsert attendance rows. Server caps the batch at 1000 records.
  /// Returns the inserted/updated count from `{count}` in the response.
  Future<int> bulkStampAttendance(List<Map<String, dynamic>> records) async {
    final res = await apiClient.post('/hr/attendance/bulk', {'records': records});
    final d = _data(res);
    return _intValue(d['count']);
  }

  int _intValue(Object? v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  /// Today's muster counts — six-bucket payload the manager dashboard
  /// renders as colored tiles. Server returns `{ present, half_day,
  /// leave, absent, holiday, week_off }` under `data`.
  Future<HrMuster> musterToday([DateTime? date]) async {
    final d = date ?? DateTime.now();
    final res = await apiClient.get('/hr/attendance/muster?date=${_isoDate(d)}');
    return HrMuster.fromJson(_data(res));
  }

  // ── /hr/leave-* ──────────────────────────────────────────────────────────

  /// Pass [forEmployeeId] to scope to types applicable to that employee's
  /// gender — used by the Apply Leave sheet so an employee doesn't see
  /// types they can't actually use (e.g. males seeing Maternity). Admin
  /// screens omit it and see every configured type.
  Future<List<HrLeaveType>> leaveTypes({String? forEmployeeId}) async {
    final qp = <String, String>{};
    if (forEmployeeId != null) qp['forEmployeeId'] = forEmployeeId;
    final path = qp.isEmpty
        ? '/hr/leave-types'
        : '/hr/leave-types?${Uri(queryParameters: qp).query}';
    final res = await apiClient.get(path);
    return _dataList(res).map(HrLeaveType.fromJson).toList();
  }

  Future<List<HrLeaveBalance>> leaveBalances({String? employeeId, int? year}) async {
    final qp = <String, String>{};
    if (employeeId != null) qp['employeeId'] = employeeId;
    if (year != null) qp['year'] = '$year';
    final res = await apiClient.get('/hr/leave-balances?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(HrLeaveBalance.fromJson).toList();
  }

  Future<List<HrLeaveRequest>> leaveRequests({String? employeeId, String? status}) async {
    final qp = <String, String>{};
    if (employeeId != null) qp['employeeId'] = employeeId;
    if (status != null) qp['status'] = status;
    final res = await apiClient.get('/hr/leave-requests?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(HrLeaveRequest.fromJson).toList();
  }

  Future<HrLeaveRequest> applyLeave({
    required String employeeId,
    required String leaveTypeId,
    required DateTime fromDate,
    required DateTime toDate,
    bool halfDay = false,
    String? reason,
  }) async {
    final body = <String, dynamic>{
      'employeeId': employeeId,
      'leaveTypeId': leaveTypeId,
      'fromDate': _isoDate(fromDate),
      'toDate': _isoDate(toDate),
      'halfDay': halfDay,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    };
    final res = await apiClient.post('/hr/leave-requests', body);
    return HrLeaveRequest.fromJson(_data(res));
  }

  /// Approve / reject a pending leave request. `approved=false` requires a
  /// reason per server validation; we pass it through unchanged.
  Future<HrLeaveRequest> reviewLeave({
    required String id,
    required bool approved,
    String? rejectionReason,
  }) async {
    final body = <String, dynamic>{
      'approved': approved,
      if (rejectionReason != null) 'rejectionReason': rejectionReason,
    };
    final res = await apiClient.put('/hr/leave-requests/$id/review', body);
    return HrLeaveRequest.fromJson(_data(res));
  }

  /// Cancel an own leave request — server checks ownership + status.
  Future<HrLeaveRequest> cancelLeave(String id) async {
    final res = await apiClient.put('/hr/leave-requests/$id/cancel');
    return HrLeaveRequest.fromJson(_data(res));
  }

  /// Edit a pending leave request. Server refuses anything non-pending,
  /// recomputes `days`, and re-checks overlap (excluding this row).
  /// Pass only the fields you want to change.
  Future<HrLeaveRequest> updateLeave({
    required String id,
    String? leaveTypeId,
    DateTime? fromDate,
    DateTime? toDate,
    bool? halfDay,
    String? reason,
  }) async {
    final body = <String, dynamic>{
      if (leaveTypeId != null) 'leaveTypeId': leaveTypeId,
      if (fromDate != null) 'fromDate': _isoDate(fromDate),
      if (toDate != null) 'toDate': _isoDate(toDate),
      if (halfDay != null) 'halfDay': halfDay,
      if (reason != null) 'reason': reason,
    };
    final res = await apiClient.put('/hr/leave-requests/$id', body);
    return HrLeaveRequest.fromJson(_data(res));
  }

  // ── Leave types CRUD ────────────────────────────────────────────────────

  Future<HrLeaveType> createLeaveType({
    required String code,
    required String name,
    required double daysPerYear,
    bool carryForward = false,
    double? maxCarryForward,
    bool encashable = false,
    bool isPaid = true,
  }) async {
    final res = await apiClient.post('/hr/leave-types', {
      'code': code,
      'name': name,
      'daysPerYear': daysPerYear,
      'carryForward': carryForward,
      if (maxCarryForward != null) 'maxCarryForward': maxCarryForward,
      'encashable': encashable,
      'isPaid': isPaid,
    });
    return HrLeaveType.fromJson(_data(res));
  }

  Future<HrLeaveType> updateLeaveType(String id, {
    String? name,
    double? daysPerYear,
    bool? carryForward,
    double? maxCarryForward,
    bool? encashable,
    bool? isPaid,
    bool? isActive,
  }) async {
    final body = <String, dynamic>{
      if (name != null) 'name': name,
      if (daysPerYear != null) 'daysPerYear': daysPerYear,
      if (carryForward != null) 'carryForward': carryForward,
      if (maxCarryForward != null) 'maxCarryForward': maxCarryForward,
      if (encashable != null) 'encashable': encashable,
      if (isPaid != null) 'isPaid': isPaid,
      if (isActive != null) 'isActive': isActive,
    };
    final res = await apiClient.put('/hr/leave-types/$id', body);
    return HrLeaveType.fromJson(_data(res));
  }

  Future<void> deleteLeaveType(String id) async {
    await apiClient.delete('/hr/leave-types/$id');
  }

  // ── Leave balance adjustment ────────────────────────────────────────────

  /// Override an employee's leave balance row for a given year. Server
  /// upserts on (employeeId, leaveTypeId, year) and only touches the
  /// columns that are provided.
  Future<HrLeaveBalance> adjustLeaveBalance({
    required String employeeId,
    required String leaveTypeId,
    required int year,
    double? opening,
    double? accrued,
  }) async {
    final res = await apiClient.put('/hr/leave-balances', {
      'employeeId': employeeId,
      'leaveTypeId': leaveTypeId,
      'year': year,
      if (opening != null) 'opening': opening,
      if (accrued != null) 'accrued': accrued,
    });
    return HrLeaveBalance.fromJson(_data(res));
  }

  // ── /hr/holidays ─────────────────────────────────────────────────────────

  Future<List<HrHoliday>> holidays({int? year}) async {
    final qp = <String, String>{};
    if (year != null) qp['year'] = '$year';
    final res = await apiClient.get('/hr/holidays?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(HrHoliday.fromJson).toList();
  }

  Future<HrHoliday> createHoliday({
    required String name,
    required DateTime date,
    String? type,
  }) async {
    final res = await apiClient.post('/hr/holidays', {
      'name': name,
      'date': _isoDate(date),
      if (type != null) 'type': type,
    });
    return HrHoliday.fromJson(_data(res));
  }

  Future<HrHoliday> updateHoliday(String id, {
    String? name,
    DateTime? date,
    String? type,
  }) async {
    final body = <String, dynamic>{
      if (name != null) 'name': name,
      if (date != null) 'date': _isoDate(date),
      if (type != null) 'type': type,
    };
    final res = await apiClient.put('/hr/holidays/$id', body);
    return HrHoliday.fromJson(_data(res));
  }

  Future<void> deleteHoliday(String id) async {
    await apiClient.delete('/hr/holidays/$id');
  }

  // ── /hr/dashboard ────────────────────────────────────────────────────────

  Future<HrDashboard> dashboard() async {
    final res = await apiClient.get('/hr/dashboard');
    return HrDashboard.fromJson(_data(res));
  }

  /// Upcoming compliance deadlines — TDS deposits, Form 24Q, PT. Server
  /// returns due-date sorted, pending status only.
  Future<List<HrStatutoryDeadline>> statutoryCalendar() async {
    final res = await apiClient.get('/hr/statutory-calendar');
    return _dataList(res).map(HrStatutoryDeadline.fromJson).toList();
  }

  // ── Salary components ───────────────────────────────────────────────────

  Future<List<HrSalaryComponent>> salaryComponents() async {
    final res = await apiClient.get('/hr/salary-components');
    return _dataList(res).map(HrSalaryComponent.fromJson).toList();
  }

  Future<HrSalaryComponent> createSalaryComponent(Map<String, dynamic> body) async {
    final res = await apiClient.post('/hr/salary-components', body);
    return HrSalaryComponent.fromJson(_data(res));
  }

  Future<HrSalaryComponent> updateSalaryComponent(String id, Map<String, dynamic> body) async {
    final res = await apiClient.put('/hr/salary-components/$id', body);
    return HrSalaryComponent.fromJson(_data(res));
  }

  Future<void> deleteSalaryComponent(String id) async {
    await apiClient.delete('/hr/salary-components/$id');
  }

  Future<void> seedDefaultSalaryComponents() async {
    await apiClient.post('/hr/salary-components/seed-defaults');
  }

  // ── Salary structures ─────────────────────────────────────────────────

  Future<List<HrSalaryStructure>> salaryStructures() async {
    final res = await apiClient.get('/hr/salary-structures');
    return _dataList(res).map(HrSalaryStructure.fromJson).toList();
  }

  Future<HrSalaryStructure> salaryStructure(String id) async {
    final res = await apiClient.get('/hr/salary-structures/$id');
    return HrSalaryStructure.fromJson(_data(res));
  }

  Future<HrSalaryStructure> createSalaryStructure({
    required String name,
    String? description,
    required List<Map<String, dynamic>> components,
  }) async {
    final res = await apiClient.post('/hr/salary-structures', {
      'name': name,
      if (description != null && description.isNotEmpty) 'description': description,
      'components': components,
    });
    return HrSalaryStructure.fromJson(_data(res));
  }

  Future<HrSalaryStructure> updateSalaryStructure(String id, {
    String? name,
    String? description,
    List<Map<String, dynamic>>? components,
  }) async {
    final body = <String, dynamic>{
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (components != null) 'components': components,
    };
    final res = await apiClient.put('/hr/salary-structures/$id', body);
    return HrSalaryStructure.fromJson(_data(res));
  }

  Future<void> deleteSalaryStructure(String id) async {
    await apiClient.delete('/hr/salary-structures/$id');
  }

  // ── Employee salaries (assignment) ──────────────────────────────────────

  Future<List<HrEmployeeSalary>> employeeSalaries(String employeeId) async {
    final res = await apiClient.get(
      '/hr/employee-salaries?${Uri(queryParameters: {'employeeId': employeeId}).query}',
    );
    return _dataList(res).map(HrEmployeeSalary.fromJson).toList();
  }

  Future<HrEmployeeSalary> assignEmployeeSalary({
    required String employeeId,
    String? salaryStructureId,
    required double ctcAnnual,
    required DateTime effectiveFrom,
  }) async {
    final res = await apiClient.post('/hr/employee-salaries', {
      'employeeId': employeeId,
      if (salaryStructureId != null) 'salaryStructureId': salaryStructureId,
      'ctcAnnual': ctcAnnual,
      'effectiveFrom': _isoDate(effectiveFrom),
    });
    return HrEmployeeSalary.fromJson(_data(res));
  }

  // ── Expense claims ──────────────────────────────────────────────────────

  Future<List<HrExpenseClaim>> expenseClaims({
    String? status,
    String? claimantId,
  }) async {
    final qp = <String, String>{};
    if (status != null) qp['status'] = status;
    if (claimantId != null) qp['claimantId'] = claimantId;
    final res = await apiClient.get('/hr/expense-claims?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(HrExpenseClaim.fromJson).toList();
  }

  Future<HrExpenseClaim> expenseClaim(String id) async {
    final res = await apiClient.get('/hr/expense-claims/$id');
    return HrExpenseClaim.fromJson(_data(res));
  }

  /// Items must contain at least one entry per server validation; each
  /// item needs expenseDate, category, description, amount (positive).
  Future<HrExpenseClaim> createExpenseClaim({
    required DateTime claimDate,
    String? description,
    required List<Map<String, dynamic>> items,
  }) async {
    final res = await apiClient.post('/hr/expense-claims', {
      'claimDate': _isoDate(claimDate),
      if (description != null && description.isNotEmpty) 'description': description,
      'items': items,
    });
    return HrExpenseClaim.fromJson(_data(res));
  }

  Future<HrExpenseClaim> updateExpenseClaim(String id, {
    required DateTime claimDate,
    String? description,
    required List<Map<String, dynamic>> items,
  }) async {
    final res = await apiClient.put('/hr/expense-claims/$id', {
      'claimDate': _isoDate(claimDate),
      if (description != null && description.isNotEmpty) 'description': description,
      'items': items,
    });
    return HrExpenseClaim.fromJson(_data(res));
  }

  Future<HrExpenseClaim> submitExpenseClaim(String id) async {
    final res = await apiClient.put('/hr/expense-claims/$id/submit');
    return HrExpenseClaim.fromJson(_data(res));
  }

  Future<HrExpenseClaim> approveExpenseClaim(String id, {
    required bool approved,
    String? rejectionReason,
  }) async {
    final body = <String, dynamic>{
      'approved': approved,
      if (rejectionReason != null) 'rejectionReason': rejectionReason,
    };
    final res = await apiClient.put('/hr/expense-claims/$id/approve', body);
    return HrExpenseClaim.fromJson(_data(res));
  }

  Future<HrExpenseClaim> reimburseExpenseClaim(String id) async {
    final res = await apiClient.put('/hr/expense-claims/$id/reimburse');
    return HrExpenseClaim.fromJson(_data(res));
  }

  Future<void> deleteExpenseClaim(String id) async {
    await apiClient.delete('/hr/expense-claims/$id');
  }

  // ── Documents (via /common/attachments) ────────────────────────────────

  /// Lists every document attached to an employee, newest first. Each row
  /// includes [HrDocumentKind] when set so the UI can group by category.
  Future<List<HrDocument>> documents(String employeeId) async {
    final res = await apiClient.get('/common/attachments/employee/$employeeId');
    return _dataList(res).map(HrDocument.fromJson).toList();
  }

  /// Uploads a single file (image or PDF) against an employee record. The
  /// optional [kind] is the category tag the Documents tab groups by;
  /// optional [expiryDate] feeds the dashboard's expiring-docs section.
  Future<HrDocument> uploadDocument({
    required String employeeId,
    required File file,
    required HrDocumentKind kind,
    DateTime? expiryDate,
    String? mimeType,
  }) async {
    final fields = <String, String>{'kind': kind.wire};
    if (expiryDate != null) {
      fields['expiryDate'] = _isoDate(expiryDate);
    }
    final res = await apiClient.upload(
      '/common/attachments/employee/$employeeId',
      file,
      fields: fields,
      mimeType: mimeType,
    );
    return HrDocument.fromJson(_data(res));
  }

  /// Dashboard helper — every HR doc expiring inside the next `daysAhead`
  /// window (default 90), already employee-joined.
  Future<List<HrExpiringDoc>> expiringDocuments({int daysAhead = 90}) async {
    final res = await apiClient.get('/hr/dashboard/expiring-documents?daysAhead=$daysAhead');
    return _dataList(res).map(HrExpiringDoc.fromJson).toList();
  }

  Future<void> deleteDocument(String attachmentId) async {
    await apiClient.delete('/common/attachments/$attachmentId');
  }

  /// Streams attachment bytes for a viewer/save flow. Honoured by
  /// /common/attachments/:id/download which sets Content-Disposition.
  Future<List<int>> downloadDocument(String attachmentId) async {
    return apiClient.getBytes('/common/attachments/$attachmentId/download');
  }

  // ── Payslips (via payroll run) ──────────────────────────────────────────

  Future<HrPayslip> payslipDetail({required String runId, required String payslipId}) async {
    final res = await apiClient.get('/hr/payroll-runs/$runId/payslips/$payslipId');
    return HrPayslip.fromJson(_data(res));
  }

  // ── Payroll runs ────────────────────────────────────────────────────────

  Future<List<HrPayrollRun>> payrollRuns() async {
    final res = await apiClient.get('/hr/payroll-runs');
    return _dataList(res).map(HrPayrollRun.fromJson).toList();
  }

  Future<HrPayrollRun> payrollRun(String id) async {
    final res = await apiClient.get('/hr/payroll-runs/$id');
    return HrPayrollRun.fromJson(_data(res));
  }

  Future<List<HrPayslip>> runPayslips(String runId) async {
    final res = await apiClient.get('/hr/payroll-runs/$runId/payslips');
    return _dataList(res).map(HrPayslip.fromJson).toList();
  }

  Future<HrPayrollRun> createPayrollRun({
    required int month,
    required int year,
    String? notes,
  }) async {
    final res = await apiClient.post('/hr/payroll-runs', {
      'month': month,
      'year': year,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return HrPayrollRun.fromJson(_data(res));
  }

  Future<HrPayrollRun> processPayrollRun(String id) async {
    final res = await apiClient.post('/hr/payroll-runs/$id/process');
    return HrPayrollRun.fromJson(_data(res));
  }

  Future<HrPayrollRun> approvePayrollRun(String id) async {
    final res = await apiClient.post('/hr/payroll-runs/$id/approve');
    return HrPayrollRun.fromJson(_data(res));
  }

  Future<HrPayrollRun> closePayrollRun(String id) async {
    final res = await apiClient.post('/hr/payroll-runs/$id/close');
    return HrPayrollRun.fromJson(_data(res));
  }

  // ── Announcements ───────────────────────────────────────────────────────

  Future<List<HrAnnouncement>> announcements() async {
    final res = await apiClient.get('/hr/announcements');
    return _dataList(res).map(HrAnnouncement.fromJson).toList();
  }

  Future<HrAnnouncement> createAnnouncement({
    required String title,
    required String body,
    String audience = 'all',
    String category = 'general',
    String? departmentId,
    bool pinned = false,
    DateTime? expiresAt,
  }) async {
    final res = await apiClient.post('/hr/announcements', {
      'title': title,
      'body': body,
      'audience': audience,
      'category': category,
      if (departmentId != null) 'departmentId': departmentId,
      'pinned': pinned,
      if (expiresAt != null) 'expiresAt': expiresAt.toUtc().toIso8601String(),
    });
    return HrAnnouncement.fromJson(_data(res));
  }

  /// Multipart upload of a cover image for an announcement. Server
  /// resizes + JPEG-encodes (1600px wide, ~80 KB on a 4K phone shot).
  /// Replaces any previous image; old S3 blob is best-effort cleaned up.
  Future<void> uploadAnnouncementImage(String id, File file) async {
    await apiClient.upload(
      '/hr/announcements/$id/image',
      file,
      mimeType: _guessImageMime(file.path),
    );
  }

  /// Partial in-place edit. Only the keys present in [body] get written;
  /// the server preserves id / postedAt / posted_by_id so audit trail
  /// stays clean. Image is updated via the dedicated /image route.
  Future<HrAnnouncement> updateAnnouncement(
    String id, {
    String? title,
    String? body,
    String? audience,
    String? category,
    String? departmentId,
    bool? departmentIdNull,
    bool? pinned,
    DateTime? expiresAt,
    bool? expiresAtNull,
  }) async {
    final payload = <String, dynamic>{
      if (title != null) 'title': title,
      if (body != null) 'body': body,
      if (audience != null) 'audience': audience,
      if (category != null) 'category': category,
      if (departmentIdNull == true) 'departmentId': null
      else if (departmentId != null) 'departmentId': departmentId,
      if (pinned != null) 'pinned': pinned,
      if (expiresAtNull == true) 'expiresAt': null
      else if (expiresAt != null) 'expiresAt': expiresAt.toUtc().toIso8601String(),
    };
    final res = await apiClient.put('/hr/announcements/$id', payload);
    return HrAnnouncement.fromJson(_data(res));
  }

  Future<void> deleteAnnouncement(String id) async {
    await apiClient.delete('/hr/announcements/$id');
  }

  // ── Recent activity feed ────────────────────────────────────────────────

  Future<List<HrActivityEvent>> recentActivity() async {
    final res = await apiClient.get('/hr/dashboard/recent-activity');
    return _dataList(res).map(HrActivityEvent.fromJson).toList();
  }
}

final hrRepo = HrRepo();
