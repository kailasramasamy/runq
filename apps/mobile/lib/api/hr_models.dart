// Dart models for the HR + Payroll APIs consumed by the mobile app.
// Mirrors the shapes returned by `apps/api/src/modules/hr/*` — only fields
// the mobile UI renders are included; the rest is dropped silently.
//
// Where the same parse helpers live in `models.dart` (e.g. `_num`, `_dt`),
// we redefine local copies here so this file can be imported standalone
// without dragging in the entire Finance model graph.

library;

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

double? _numOrNull(Object? v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

int _int(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

String? _str(Object? v) => v == null ? null : v.toString();
String _strOr(Object? v, String fallback) => v == null ? fallback : v.toString();
bool _bool(Object? v) => v == true;

DateTime? _dt(Object? v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString())?.toLocal();
}

// ─── /hr/me ────────────────────────────────────────────────────────────────

/// Auth context for HR: maps the logged-in user to an employee record (by
/// email match within the tenant) and indicates whether they should see
/// manager-only surfaces.
class HrMe {
  /// The employee row matched to this user, or null when the user has no
  /// matching employee (web-only admin / CA login).
  final HrEmployeeBrief? employee;

  /// True when the user is a system owner/accountant OR when the matched
  /// employee has direct reports. Drives the persona toggle visibility.
  final bool isManager;

  /// Raw tenant role (`owner`/`accountant`/`viewer`/`hr`). Useful for
  /// finer-grained gating on the More tab.
  final String systemRole;

  /// Access scope returned by the server — one of:
  /// 'all'    org-wide read (owner/accountant/hr/client_owner)
  /// 'subset' reporting subtree + dept-head expansions
  /// 'self'   only their own data
  /// 'none'   no matched employee row
  final String scopeKind;

  /// Number of employees visible to this user. Null for org-wide scope.
  final int? visibleCount;

  HrMe({
    required this.employee,
    required this.isManager,
    required this.systemRole,
    this.scopeKind = 'all',
    this.visibleCount,
  });

  factory HrMe.fromJson(Map<String, dynamic> j) {
    final empRaw = j['employee'];
    return HrMe(
      employee: empRaw is Map<String, dynamic> ? HrEmployeeBrief.fromJson(empRaw) : null,
      isManager: _bool(j['isManager']),
      systemRole: _strOr(j['systemRole'], 'viewer'),
      scopeKind: _strOr(j['scopeKind'], 'all'),
      visibleCount: j['visibleCount'] == null ? null : _int(j['visibleCount']),
    );
  }

  String get firstName => employee?.firstName ?? '';
  String get displayName =>
      employee == null ? '' : '${employee!.firstName}${employee!.lastName != null ? ' ${employee!.lastName}' : ''}'.trim();
}

/// Lightweight employee shape returned by /hr/me — just enough to render
/// the avatar + name in the header. Full detail comes from /hr/employees/:id.
class HrEmployeeBrief {
  final String id, employeeCode, firstName;
  final String? lastName, email, photoUrl;
  final String? departmentId, designationId;
  final String status;

  HrEmployeeBrief({
    required this.id,
    required this.employeeCode,
    required this.firstName,
    this.lastName,
    this.email,
    this.photoUrl,
    this.departmentId,
    this.designationId,
    required this.status,
  });

  factory HrEmployeeBrief.fromJson(Map<String, dynamic> j) => HrEmployeeBrief(
        id: _strOr(j['id'], ''),
        employeeCode: _strOr(j['employeeCode'], ''),
        firstName: _strOr(j['firstName'], ''),
        lastName: _str(j['lastName']),
        email: _str(j['email']),
        photoUrl: _str(j['photoUrl']),
        departmentId: _str(j['departmentId']),
        designationId: _str(j['designationId']),
        status: _strOr(j['status'], 'active'),
      );

  String get displayName =>
      lastName == null || lastName!.isEmpty ? firstName : '$firstName $lastName';
}

// ─── /hr/employees/:id/invite ──────────────────────────────────────────────

class HrInviteResult {
  final String token;
  final String inviteUrl;
  final String? email;
  final DateTime expiresAt;
  /// 'sent' | 'failed' — best-effort; failure doesn't fail the request.
  final String emailDelivery;
  /// True when the server returned an existing pending invite rather than
  /// creating a new one (re-sent the email, same link).
  final bool reused;
  const HrInviteResult({
    required this.token,
    required this.inviteUrl,
    required this.email,
    required this.expiresAt,
    required this.emailDelivery,
    required this.reused,
  });
}

class HrInviteStatus {
  /// 'not_invited' | 'pending' | 'expired' | 'accepted' | 'active' |
  /// 'inactive' | 'no_email'
  final String status;
  final bool accountActive;
  final String? inviteUrl;
  final DateTime? expiresAt;
  const HrInviteStatus({
    required this.status,
    required this.accountActive,
    required this.inviteUrl,
    required this.expiresAt,
  });
}

// ─── /hr/employees ─────────────────────────────────────────────────────────

class HrEmployee {
  final String id, employeeCode, firstName;
  final String? lastName, email, phone;
  final String? departmentId, departmentName;
  final String? designationId, designationName;
  final String status;          // active | inactive | terminated | on_leave
  final String employmentType;  // permanent | contract | intern | consultant | wage
  final DateTime? joiningDate, confirmationDate, exitDate, dateOfBirth;
  final double? ctcAnnual;
  final String? photoUrl;
  // Personal
  final String? gender, bloodGroup, address;
  // Statutory
  final String? pan, aadhaar, uan, pfNumber, esiNumber;
  // Banking
  final String? bankAccountNumber, bankIfsc, bankName;
  // Wage / contract-labour fields
  final String? agency;
  final double? dailyWageRate;
  // Reporting line — only the id today; mobile resolves the name lazily
  // when it needs to render the manager card.
  final String? reportingToId;

  HrEmployee({
    required this.id,
    required this.employeeCode,
    required this.firstName,
    this.lastName,
    this.email,
    this.phone,
    this.departmentId,
    this.departmentName,
    this.designationId,
    this.designationName,
    required this.status,
    required this.employmentType,
    this.joiningDate,
    this.confirmationDate,
    this.exitDate,
    this.dateOfBirth,
    this.ctcAnnual,
    this.photoUrl,
    this.gender,
    this.bloodGroup,
    this.address,
    this.pan,
    this.aadhaar,
    this.uan,
    this.pfNumber,
    this.esiNumber,
    this.bankAccountNumber,
    this.bankIfsc,
    this.bankName,
    this.agency,
    this.dailyWageRate,
    this.reportingToId,
  });

  factory HrEmployee.fromJson(Map<String, dynamic> j) => HrEmployee(
        id: _strOr(j['id'], ''),
        employeeCode: _strOr(j['employeeCode'], ''),
        firstName: _strOr(j['firstName'], ''),
        lastName: _str(j['lastName']),
        email: _str(j['email']),
        phone: _str(j['phone']),
        departmentId: _str(j['departmentId']),
        departmentName: _str(j['departmentName']),
        designationId: _str(j['designationId']),
        designationName: _str(j['designationName']),
        status: _strOr(j['status'], 'active'),
        employmentType: _strOr(j['employmentType'], 'permanent'),
        joiningDate: _dt(j['joiningDate']),
        confirmationDate: _dt(j['confirmationDate']),
        exitDate: _dt(j['exitDate']),
        dateOfBirth: _dt(j['dateOfBirth']),
        ctcAnnual: _numOrNull(j['ctcAnnual']),
        photoUrl: _str(j['photoUrl']),
        gender: _str(j['gender']),
        bloodGroup: _str(j['bloodGroup']),
        address: _str(j['address']),
        pan: _str(j['pan']),
        aadhaar: _str(j['aadhaar']),
        uan: _str(j['uan']),
        pfNumber: _str(j['pfNumber']),
        esiNumber: _str(j['esiNumber']),
        bankAccountNumber: _str(j['bankAccountNumber']),
        bankIfsc: _str(j['bankIfsc']),
        bankName: _str(j['bankName']),
        agency: _str(j['agency']),
        dailyWageRate: _numOrNull(j['dailyWageRate']),
        reportingToId: _str(j['reportingToId']),
      );

  String get displayName =>
      lastName == null || lastName!.isEmpty ? firstName : '$firstName $lastName';

  /// PAN displayed as-is — it's already short, not strictly sensitive enough
  /// to warrant masking in an HR context.
  /// Aadhaar masked to last 4 digits to follow Indian privacy norms.
  String? get aadhaarMasked {
    final raw = (aadhaar ?? '').replaceAll(RegExp(r'\s+'), '');
    if (raw.length < 4) return null;
    final last4 = raw.substring(raw.length - 4);
    return 'XXXX XXXX $last4';
  }

  /// Bank account number masked to last 4 digits.
  String? get bankAccountMasked {
    final raw = (bankAccountNumber ?? '').trim();
    if (raw.length < 4) return null;
    return '··· ${raw.substring(raw.length - 4)}';
  }
}

class HrEmployeeListPage {
  final List<HrEmployee> data;
  final int page, limit, total, totalPages;
  HrEmployeeListPage({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  factory HrEmployeeListPage.fromJson(Map<String, dynamic> j) {
    final list = (j['data'] as List? ?? const []).cast<Map<String, dynamic>>();
    final meta = (j['meta'] as Map?)?.cast<String, dynamic>() ?? {};
    return HrEmployeeListPage(
      data: list.map(HrEmployee.fromJson).toList(),
      page: _int(meta['page']),
      limit: _int(meta['limit']),
      total: _int(meta['total']),
      totalPages: _int(meta['totalPages']),
    );
  }
}

// ─── /hr/directory/:id ─────────────────────────────────────────────────────

/// A colleague's *work profile* — what /hr/directory/:id returns. Unscoped:
/// collaboration-safe identity, the reporting line, and the resume profile.
/// Salary / bank / statutory fields are never present (the server omits
/// them), so [employee] and [manager] simply carry nulls for those.
class HrWorkProfile {
  final HrEmployee employee;
  final HrEmployee? manager;
  final List<HrEmployee> directReports;
  final HrResumeProfile? resume;

  const HrWorkProfile({
    required this.employee,
    this.manager,
    this.directReports = const [],
    this.resume,
  });

  factory HrWorkProfile.fromJson(Map<String, dynamic> j) {
    final mgr = j['manager'];
    final resume = j['resume'];
    return HrWorkProfile(
      employee: HrEmployee.fromJson(j),
      manager: mgr is Map<String, dynamic> ? HrEmployee.fromJson(mgr) : null,
      directReports: (j['directReports'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(HrEmployee.fromJson)
          .toList(),
      resume: resume is Map<String, dynamic> ? HrResumeProfile.fromJson(resume) : null,
    );
  }
}

// ─── /hr/attendance ────────────────────────────────────────────────────────

class HrAttendanceRow {
  final String id, employeeId, employeeCode, employeeName, status;
  final String? employeePhotoUrl;
  final DateTime date;
  final String? checkIn, checkOut; // stored as HH:MM strings server-side
  final double? hoursWorked, otHours;
  final String? source;

  HrAttendanceRow({
    required this.id,
    required this.employeeId,
    required this.employeeCode,
    required this.employeeName,
    this.employeePhotoUrl,
    required this.status,
    required this.date,
    this.checkIn,
    this.checkOut,
    this.hoursWorked,
    this.otHours,
    this.source,
  });

  factory HrAttendanceRow.fromJson(Map<String, dynamic> j) => HrAttendanceRow(
        id: _strOr(j['id'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        employeeCode: _strOr(j['employeeCode'], ''),
        employeeName: _strOr(j['employeeName'], '—'),
        employeePhotoUrl: _str(j['employeePhotoUrl']),
        status: _strOr(j['status'], 'present'),
        date: _dt(j['date']) ?? DateTime.now(),
        checkIn: _str(j['checkIn']),
        checkOut: _str(j['checkOut']),
        hoursWorked: _numOrNull(j['hoursWorked']),
        otHours: _numOrNull(j['otHours']),
        source: _str(j['source']),
      );
}

// ─── /hr/leave-types ───────────────────────────────────────────────────────

class HrLeaveType {
  final String id, code, name;
  final double daysPerYear;
  final bool carryForward;
  final double? maxCarryForward;
  final bool encashable;
  final bool isPaid;
  final bool isActive;
  HrLeaveType({
    required this.id,
    required this.code,
    required this.name,
    required this.daysPerYear,
    required this.carryForward,
    this.maxCarryForward,
    required this.encashable,
    required this.isPaid,
    required this.isActive,
  });

  factory HrLeaveType.fromJson(Map<String, dynamic> j) => HrLeaveType(
        id: _strOr(j['id'], ''),
        code: _strOr(j['code'], ''),
        name: _strOr(j['name'], ''),
        daysPerYear: _num(j['daysPerYear']),
        carryForward: _bool(j['carryForward']),
        maxCarryForward: _numOrNull(j['maxCarryForward']),
        encashable: _bool(j['encashable']),
        isPaid: _bool(j['isPaid']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
      );
}

// ─── /hr/leave-balances ────────────────────────────────────────────────────

class HrLeaveBalance {
  final String id, employeeId, leaveTypeId, typeName, typeCode;
  final int year;
  final double opening, accrued, used, balance;
  HrLeaveBalance({
    required this.id,
    required this.employeeId,
    required this.leaveTypeId,
    required this.typeName,
    required this.typeCode,
    required this.year,
    required this.opening,
    required this.accrued,
    required this.used,
    required this.balance,
  });

  factory HrLeaveBalance.fromJson(Map<String, dynamic> j) => HrLeaveBalance(
        id: _strOr(j['id'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        leaveTypeId: _strOr(j['leaveTypeId'], ''),
        typeName: _strOr(j['typeName'], ''),
        typeCode: _strOr(j['typeCode'], ''),
        year: _int(j['year']),
        opening: _num(j['opening']),
        accrued: _num(j['accrued']),
        used: _num(j['used']),
        balance: _num(j['balance']),
      );
}

// ─── /hr/leave-requests ────────────────────────────────────────────────────

class HrLeaveRequest {
  final String id, employeeId, employeeName, employeeCode;
  final String? employeePhotoUrl;
  final String leaveTypeId, typeName, typeCode;
  final DateTime fromDate, toDate;
  final double totalDays;
  final bool halfDay;
  final String? reason;
  final String status; // pending | approved | rejected | cancelled
  final DateTime? appliedAt;

  HrLeaveRequest({
    required this.id,
    required this.employeeId,
    required this.employeeName,
    required this.employeeCode,
    this.employeePhotoUrl,
    required this.leaveTypeId,
    required this.typeName,
    required this.typeCode,
    required this.fromDate,
    required this.toDate,
    required this.totalDays,
    required this.halfDay,
    this.reason,
    required this.status,
    this.appliedAt,
  });

  factory HrLeaveRequest.fromJson(Map<String, dynamic> j) => HrLeaveRequest(
        id: _strOr(j['id'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        employeeName: _strOr(j['employeeName'], '—'),
        employeeCode: _strOr(j['employeeCode'], ''),
        employeePhotoUrl: _str(j['employeePhotoUrl']),
        leaveTypeId: _strOr(j['leaveTypeId'], ''),
        typeName: _strOr(j['typeName'], ''),
        typeCode: _strOr(j['typeCode'], ''),
        fromDate: _dt(j['fromDate']) ?? DateTime.now(),
        toDate: _dt(j['toDate']) ?? DateTime.now(),
        // API returns the column name `days` (numeric string). The
        // earlier `totalDays` lookup quietly returned 0 for every row.
        totalDays: _num(j['days'] ?? j['totalDays']),
        halfDay: _bool(j['halfDay']),
        reason: _str(j['reason']),
        status: _strOr(j['status'], 'pending'),
        appliedAt: _dt(j['appliedAt']),
      );
}

// ─── /hr/holidays ──────────────────────────────────────────────────────────

class HrHoliday {
  final String id, name;
  final DateTime date;
  final String? type;
  HrHoliday({required this.id, required this.name, required this.date, this.type});

  factory HrHoliday.fromJson(Map<String, dynamic> j) => HrHoliday(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], 'Holiday'),
        date: _dt(j['date']) ?? DateTime.now(),
        type: _str(j['type']),
      );
}

// ─── /hr/dashboard ─────────────────────────────────────────────────────────

/// Single-month attention payload from `/hr/dashboard`. Drives the
/// manager-view "Needs attention" cards on Home — mirrors the four
/// signals the web HR dashboard surfaces above the fold.
class HrDashboard {
  final String? payrollRunId;
  final int payrollMonth;
  final int payrollYear;
  /// 'draft' | 'processed' | 'approved' | 'closed' | null (no run yet)
  final String? payrollStatus;
  final double payrollTotalNet;
  final int employeesWithoutSalary;
  final int attendanceNotMarkedToday;
  final int confirmationsDue;

  HrDashboard({
    required this.payrollRunId,
    required this.payrollMonth,
    required this.payrollYear,
    required this.payrollStatus,
    required this.payrollTotalNet,
    required this.employeesWithoutSalary,
    required this.attendanceNotMarkedToday,
    required this.confirmationsDue,
  });

  factory HrDashboard.fromJson(Map<String, dynamic> j) {
    final payroll = (j['payroll'] as Map?)?.cast<String, dynamic>() ?? {};
    return HrDashboard(
      payrollRunId: _str(payroll['runId']),
      payrollMonth: _int(payroll['month']),
      payrollYear: _int(payroll['year']),
      payrollStatus: _str(payroll['status']),
      payrollTotalNet: _num(payroll['totalNet']),
      employeesWithoutSalary: _int(j['employeesWithoutSalary']),
      attendanceNotMarkedToday: _int(j['attendanceNotMarkedToday']),
      confirmationsDue: _int(j['confirmationsDue']),
    );
  }
}

// ─── /hr/departments + /hr/designations + /hr/shifts ──────────────────────

class HrDepartment {
  final String id, name;
  final String? code;
  final bool isActive;
  final int? employeeCount;
  HrDepartment({
    required this.id,
    required this.name,
    this.code,
    this.isActive = true,
    this.employeeCount,
  });
  factory HrDepartment.fromJson(Map<String, dynamic> j) => HrDepartment(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        code: _str(j['code']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
        employeeCount: j['employeeCount'] == null ? null : _int(j['employeeCount']),
      );
}

class HrDesignation {
  final String id, name;
  final int? level;
  final bool isActive;
  HrDesignation({
    required this.id,
    required this.name,
    this.level,
    this.isActive = true,
  });
  factory HrDesignation.fromJson(Map<String, dynamic> j) => HrDesignation(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        level: j['level'] == null ? null : _int(j['level']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
      );
}

class HrShift {
  final String id, name, startTime, endTime;
  final int breakMinutes;
  final List<int> weeklyOffDays;
  final bool isNightShift, isActive;
  HrShift({
    required this.id,
    required this.name,
    required this.startTime,
    required this.endTime,
    this.breakMinutes = 0,
    this.weeklyOffDays = const [0],
    this.isNightShift = false,
    this.isActive = true,
  });
  factory HrShift.fromJson(Map<String, dynamic> j) => HrShift(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        startTime: _strOr(j['startTime'], ''),
        endTime: _strOr(j['endTime'], ''),
        breakMinutes: j['breakMinutes'] == null ? 0 : _int(j['breakMinutes']),
        weeklyOffDays: j['weeklyOffDays'] is List
            ? (j['weeklyOffDays'] as List).map(_int).toList()
            : const [0],
        isNightShift: _bool(j['isNightShift']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
      );
}

/// Upcoming compliance deadlines from `/hr/statutory-calendar`. Server
/// returns TDS deposits, Form 24Q, and PT — already due-date sorted.
class HrStatutoryDeadline {
  final String kind;      // 'tds_deposit' | 'tds_24q' | 'pt'
  final String label;
  final String sublabel;
  final DateTime dueDate;
  final String status;    // 'pending' | 'done'
  final double? amount;

  HrStatutoryDeadline({
    required this.kind,
    required this.label,
    required this.sublabel,
    required this.dueDate,
    required this.status,
    this.amount,
  });

  factory HrStatutoryDeadline.fromJson(Map<String, dynamic> j) => HrStatutoryDeadline(
        kind: _strOr(j['kind'], 'other'),
        label: _strOr(j['label'], ''),
        sublabel: _strOr(j['sublabel'], ''),
        dueDate: _dt(j['dueDate']) ?? DateTime.now(),
        status: _strOr(j['status'], 'pending'),
        amount: _numOrNull(j['amount']),
      );

  /// Days from today to dueDate (negative if overdue).
  int get daysLeft {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return dueDate.difference(today).inDays;
  }
}

/// Today's muster counts from `/hr/attendance/muster?date=YYYY-MM-DD`.
/// Six semantic buckets — matches the web HR dashboard tile layout.
class HrMuster {
  final int present, halfDay, leave, absent, holiday, weekOff;
  HrMuster({
    required this.present,
    required this.halfDay,
    required this.leave,
    required this.absent,
    required this.holiday,
    required this.weekOff,
  });

  factory HrMuster.fromJson(Map<String, dynamic> j) => HrMuster(
        present:  _int(j['present']),
        halfDay:  _int(j['half_day']),
        leave:    _int(j['leave']),
        absent:   _int(j['absent']),
        holiday:  _int(j['holiday']),
        weekOff:  _int(j['week_off']),
      );

  int get presentTodayInclHalf => present + halfDay;
}

// ─── /hr/salary-components ─────────────────────────────────────────────────

/// `type` and `calcType` are mirrored from the server enum exactly so the
/// wire value never needs translation. Use the *_label helpers for display.
const hrSalaryComponentTypes = <String>['earning', 'deduction', 'reimbursement', 'statutory'];
const hrSalaryCalcTypes = <String>['fixed', 'percent_of_basic', 'percent_of_ctc', 'formula'];

String hrSalaryComponentTypeLabel(String s) => switch (s) {
      'earning'        => 'Earning',
      'deduction'      => 'Deduction',
      'reimbursement'  => 'Reimbursement',
      'statutory'      => 'Statutory',
      _                => s,
    };
String hrSalaryCalcTypeLabel(String s) => switch (s) {
      'fixed'            => 'Fixed amount',
      'percent_of_basic' => '% of Basic',
      'percent_of_ctc'   => '% of CTC',
      'formula'          => 'Formula',
      _                  => s,
    };

class HrSalaryComponent {
  final String id, code, name, type, calcType;
  final double defaultValue;
  final bool isTaxable, isPfApplicable, isEsiApplicable, isActive;
  final int displayOrder;
  HrSalaryComponent({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    required this.calcType,
    required this.defaultValue,
    required this.isTaxable,
    required this.isPfApplicable,
    required this.isEsiApplicable,
    required this.isActive,
    required this.displayOrder,
  });

  factory HrSalaryComponent.fromJson(Map<String, dynamic> j) => HrSalaryComponent(
        id: _strOr(j['id'], ''),
        code: _strOr(j['code'], ''),
        name: _strOr(j['name'], ''),
        type: _strOr(j['type'], 'earning'),
        calcType: _strOr(j['calcType'], 'fixed'),
        defaultValue: _num(j['defaultValue']),
        isTaxable: j['isTaxable'] == null ? true : _bool(j['isTaxable']),
        isPfApplicable: _bool(j['isPfApplicable']),
        isEsiApplicable: _bool(j['isEsiApplicable']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
        displayOrder: _int(j['displayOrder']),
      );
}

// ─── /hr/salary-structures ─────────────────────────────────────────────────

/// A line on a salary structure — joins to a salary component and stores
/// the structure-specific value + calcType override. Display fields
/// (code/name/type) are populated server-side on the detail fetch.
class HrSalaryStructureLine {
  final String id;
  final String salaryComponentId;
  final String? code, name, type;
  final double value;
  final String calcType;
  HrSalaryStructureLine({
    required this.id,
    required this.salaryComponentId,
    this.code,
    this.name,
    this.type,
    required this.value,
    required this.calcType,
  });

  factory HrSalaryStructureLine.fromJson(Map<String, dynamic> j) => HrSalaryStructureLine(
        id: _strOr(j['id'], ''),
        salaryComponentId: _strOr(j['salaryComponentId'], ''),
        code: _str(j['code']),
        name: _str(j['name']),
        type: _str(j['type']),
        value: _num(j['value']),
        calcType: _strOr(j['calcType'], 'fixed'),
      );
}

class HrSalaryStructure {
  final String id, name;
  final String? description;
  final bool isActive;
  final List<HrSalaryStructureLine> components;
  HrSalaryStructure({
    required this.id,
    required this.name,
    this.description,
    required this.isActive,
    this.components = const [],
  });

  factory HrSalaryStructure.fromJson(Map<String, dynamic> j) => HrSalaryStructure(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        description: _str(j['description']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
        components: (j['components'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(HrSalaryStructureLine.fromJson)
            .toList(),
      );
}

// ─── /hr/employee-salaries ─────────────────────────────────────────────────

class HrEmployeeSalary {
  final String id;
  final String employeeId;
  final String? salaryStructureId;
  final double ctcAnnual;
  final DateTime effectiveFrom;
  final DateTime? effectiveTo;
  HrEmployeeSalary({
    required this.id,
    required this.employeeId,
    this.salaryStructureId,
    required this.ctcAnnual,
    required this.effectiveFrom,
    this.effectiveTo,
  });

  factory HrEmployeeSalary.fromJson(Map<String, dynamic> j) => HrEmployeeSalary(
        id: _strOr(j['id'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        salaryStructureId: _str(j['salaryStructureId']),
        ctcAnnual: _num(j['ctcAnnual']),
        effectiveFrom: _dt(j['effectiveFrom']) ?? DateTime.now(),
        effectiveTo: _dt(j['effectiveTo']),
      );
}

// ─── /hr/expense-claims ────────────────────────────────────────────────────

class HrExpenseClaimItem {
  final String id;
  final DateTime expenseDate;
  final String category;
  final String description;
  final double amount;
  final String? accountCode;

  HrExpenseClaimItem({
    required this.id,
    required this.expenseDate,
    required this.category,
    required this.description,
    required this.amount,
    this.accountCode,
  });

  factory HrExpenseClaimItem.fromJson(Map<String, dynamic> j) => HrExpenseClaimItem(
        id: _strOr(j['id'], ''),
        expenseDate: _dt(j['expenseDate']) ?? DateTime.now(),
        category: _strOr(j['category'], 'other'),
        description: _strOr(j['description'], ''),
        amount: _num(j['amount']),
        accountCode: _str(j['accountCode']),
      );
}

class HrExpenseClaim {
  final String id, claimNumber, claimantId, claimantName;
  /// Subject employee of the claim. Empty when the claimant has no
  /// employee record. Drives the own/team split on the Expenses tab.
  final String employeeId;
  final DateTime claimDate;
  final String? description;
  final double totalAmount;
  /// 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'
  final String status;
  final String? rejectionReason;
  final DateTime? approvedAt, reimbursedAt;
  final List<HrExpenseClaimItem> items;

  HrExpenseClaim({
    required this.id,
    required this.claimNumber,
    required this.claimantId,
    required this.claimantName,
    required this.employeeId,
    required this.claimDate,
    this.description,
    required this.totalAmount,
    required this.status,
    this.rejectionReason,
    this.approvedAt,
    this.reimbursedAt,
    this.items = const [],
  });

  factory HrExpenseClaim.fromJson(Map<String, dynamic> j) => HrExpenseClaim(
        id: _strOr(j['id'], ''),
        claimNumber: _strOr(j['claimNumber'], ''),
        claimantId: _strOr(j['claimantId'], ''),
        claimantName: _strOr(j['claimantName'], '—'),
        employeeId: _strOr(j['employeeId'], ''),
        claimDate: _dt(j['claimDate']) ?? DateTime.now(),
        description: _str(j['description']),
        totalAmount: _num(j['totalAmount']),
        status: _strOr(j['status'], 'draft'),
        rejectionReason: _str(j['rejectionReason']),
        approvedAt: _dt(j['approvedAt']),
        reimbursedAt: _dt(j['reimbursedAt']),
        items: (j['items'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(HrExpenseClaimItem.fromJson)
            .toList(),
      );

  bool get isEditable => status == 'draft';
  bool get canSubmit => status == 'draft' && items.isNotEmpty;
  bool get canApprove => status == 'submitted';
  bool get canReimburse => status == 'approved';
  bool get canDelete => status != 'reimbursed';
}

/// Canonical expense categories — matches the web's category picker so
/// validation never differs across surfaces.
const hrExpenseCategories = <String>[
  'travel',
  'meals',
  'lodging',
  'fuel',
  'office_supplies',
  'communication',
  'subscriptions',
  'professional_services',
  'training',
  'utilities',
  'repairs',
  'medical',
  'entertainment',
  'gifts',
  'other',
];

String hrExpenseCategoryLabel(String code) {
  switch (code) {
    case 'travel':                return 'Travel';
    case 'meals':                 return 'Meals';
    case 'lodging':               return 'Lodging';
    case 'fuel':                  return 'Fuel';
    case 'office_supplies':       return 'Office supplies';
    case 'communication':         return 'Communication';
    case 'subscriptions':         return 'Subscriptions';
    case 'professional_services': return 'Professional services';
    case 'training':              return 'Training';
    case 'utilities':             return 'Utilities';
    case 'repairs':               return 'Repairs';
    case 'medical':               return 'Medical';
    case 'entertainment':         return 'Entertainment';
    case 'gifts':                 return 'Gifts';
    case 'other':                 return 'Other';
    default:                      return code;
  }
}

// ─── /common/attachments/employee/:id ──────────────────────────────────────

/// Categorisation tag for HR document uploads. Matches the server's
/// `EmployeeDocumentKind` exactly so the wire value is stable.
enum HrDocumentKind {
  aadhaar,
  pan,
  passport,
  drivingLicense,
  voterId,
  addressProof,
  bankPassbook,
  photoIdCard,
  offerLetter,
  employmentContract,
  educationalCertificate,
  experienceLetter,
  relievingLetter,
  appraisalLetter,
  other,
}

extension HrDocumentKindX on HrDocumentKind {
  /// Snake_case wire value the server expects.
  String get wire => switch (this) {
        HrDocumentKind.aadhaar => 'aadhaar',
        HrDocumentKind.pan => 'pan',
        HrDocumentKind.passport => 'passport',
        HrDocumentKind.drivingLicense => 'driving_license',
        HrDocumentKind.voterId => 'voter_id',
        HrDocumentKind.addressProof => 'address_proof',
        HrDocumentKind.bankPassbook => 'bank_passbook',
        HrDocumentKind.photoIdCard => 'photo_id_card',
        HrDocumentKind.offerLetter => 'offer_letter',
        HrDocumentKind.employmentContract => 'employment_contract',
        HrDocumentKind.educationalCertificate => 'educational_certificate',
        HrDocumentKind.experienceLetter => 'experience_letter',
        HrDocumentKind.relievingLetter => 'relieving_letter',
        HrDocumentKind.appraisalLetter => 'appraisal_letter',
        HrDocumentKind.other => 'other',
      };

  /// Display label for the doc-kind picker + Documents tab section headers.
  String get label => switch (this) {
        HrDocumentKind.aadhaar => 'Aadhaar',
        HrDocumentKind.pan => 'PAN',
        HrDocumentKind.passport => 'Passport',
        HrDocumentKind.drivingLicense => 'Driving licence',
        HrDocumentKind.voterId => 'Voter ID',
        HrDocumentKind.addressProof => 'Address proof',
        HrDocumentKind.bankPassbook => 'Bank passbook',
        HrDocumentKind.photoIdCard => 'Photo ID card',
        HrDocumentKind.offerLetter => 'Offer letter',
        HrDocumentKind.employmentContract => 'Employment contract',
        HrDocumentKind.educationalCertificate => 'Educational certificate',
        HrDocumentKind.experienceLetter => 'Experience letter',
        HrDocumentKind.relievingLetter => 'Relieving letter',
        HrDocumentKind.appraisalLetter => 'Appraisal letter',
        HrDocumentKind.other => 'Other',
      };

  static HrDocumentKind? fromWire(String? v) {
    if (v == null) return null;
    for (final k in HrDocumentKind.values) {
      if (k.wire == v) return k;
    }
    return null;
  }
}

class HrDocument {
  final String id;
  final String entityType, entityId;
  final HrDocumentKind? kind;
  final String fileName, mimeType, storageKey;
  final int fileSize;
  final DateTime createdAt;
  /// Optional expiry — used to surface "expiring in N days" warnings on
  /// the row + the dashboard's expiring-docs section.
  final DateTime? expiryDate;
  final String? uploadedBy;

  HrDocument({
    required this.id,
    required this.entityType,
    required this.entityId,
    this.kind,
    required this.fileName,
    required this.mimeType,
    required this.storageKey,
    required this.fileSize,
    required this.createdAt,
    this.expiryDate,
    this.uploadedBy,
  });

  factory HrDocument.fromJson(Map<String, dynamic> j) => HrDocument(
        id: _strOr(j['id'], ''),
        entityType: _strOr(j['entityType'], 'employee'),
        entityId: _strOr(j['entityId'], ''),
        kind: HrDocumentKindX.fromWire(_str(j['documentKind'])),
        fileName: _strOr(j['fileName'], 'document'),
        mimeType: _strOr(j['mimeType'], 'application/octet-stream'),
        storageKey: _strOr(j['storageKey'], ''),
        fileSize: _int(j['fileSize']),
        createdAt: _dt(j['createdAt']) ?? DateTime.now(),
        expiryDate: _dt(j['expiryDate']),
        uploadedBy: _str(j['uploadedBy']),
      );

  bool get isImage => mimeType.startsWith('image/');
  bool get isPdf => mimeType == 'application/pdf';
  bool get isExpiringSoon =>
      expiryDate != null && expiryDate!.isBefore(DateTime.now().add(const Duration(days: 90)));
  bool get isExpired =>
      expiryDate != null && expiryDate!.isBefore(DateTime.now());
}

/// Row in the dashboard's "Expiring documents" section. Joins the
/// attachment with its owning employee so the row renders without an
/// extra fetch.
class HrExpiringDoc {
  final String id;
  final String employeeId, employeeCode, employeeName;
  final String? employeePhotoUrl;
  final HrDocumentKind? kind;
  final String fileName;
  final DateTime expiryDate;

  HrExpiringDoc({
    required this.id,
    required this.employeeId,
    required this.employeeCode,
    required this.employeeName,
    this.employeePhotoUrl,
    this.kind,
    required this.fileName,
    required this.expiryDate,
  });

  factory HrExpiringDoc.fromJson(Map<String, dynamic> j) => HrExpiringDoc(
        id: _strOr(j['id'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        employeeCode: _strOr(j['employeeCode'], ''),
        employeeName: _strOr(j['employeeName'], '—'),
        employeePhotoUrl: _str(j['employeePhotoUrl']),
        kind: HrDocumentKindX.fromWire(_str(j['documentKind'])),
        fileName: _strOr(j['fileName'], 'document'),
        expiryDate: _dt(j['expiryDate']) ?? DateTime.now(),
      );

  int get daysLeft {
    final today = DateTime.now();
    final t = DateTime(today.year, today.month, today.day);
    return expiryDate.difference(t).inDays;
  }
}

// ─── /hr/reward-types + /hr/rewards ───────────────────────────────────────

class HrRewardType {
  final String id, name, code;
  final String kind; // 'monetary' | 'recognition' | 'points'
  final String? glAccountCode;
  final int displayOrder;
  final bool isActive;

  HrRewardType({
    required this.id,
    required this.name,
    required this.code,
    required this.kind,
    this.glAccountCode,
    required this.displayOrder,
    required this.isActive,
  });

  factory HrRewardType.fromJson(Map<String, dynamic> j) => HrRewardType(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        code: _strOr(j['code'], ''),
        kind: _strOr(j['kind'], 'monetary'),
        glAccountCode: _str(j['glAccountCode']),
        displayOrder: _int(j['displayOrder']),
        isActive: j['isActive'] == null ? true : _bool(j['isActive']),
      );

  bool get isMonetary => kind == 'monetary';
  bool get isPoints => kind == 'points';
}

// ─── /hr/rewards/points/balance ───────────────────────────────────────────

class HrPointsBalance {
  final int balance;
  final int lifetime;
  final int redeemed;

  const HrPointsBalance({
    required this.balance,
    required this.lifetime,
    required this.redeemed,
  });

  factory HrPointsBalance.fromJson(Map<String, dynamic> j) => HrPointsBalance(
        balance: _int(j['balance']),
        lifetime: _int(j['lifetime']),
        redeemed: _int(j['redeemed']),
      );
}

class HrReward {
  final String id, rewardNumber, employeeId, rewardTypeId;
  final String kind; // 'monetary' | 'recognition' | 'points'
  final String amount;
  final String title;
  final String? citation;
  final DateTime awardDate;
  /// 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'paid'
  final String status;
  final String initiatedBy;
  final String? approvedBy, rejectionReason;
  final DateTime? approvedAt;
  final DateTime createdAt, updatedAt;
  // Joined display fields
  final String? employeeName, typeName, initiatorName;
  /// Non-null when this row is a redemption (kind='monetary', self-initiated,
  /// pointsUsed set). Fixed conversion: 1 point = ₹1.
  final int? pointsUsed;

  HrReward({
    required this.id,
    required this.rewardNumber,
    required this.employeeId,
    required this.rewardTypeId,
    required this.kind,
    required this.amount,
    required this.title,
    this.citation,
    required this.awardDate,
    required this.status,
    required this.initiatedBy,
    this.approvedBy,
    this.approvedAt,
    this.rejectionReason,
    required this.createdAt,
    required this.updatedAt,
    this.employeeName,
    this.typeName,
    this.initiatorName,
    this.pointsUsed,
  });

  factory HrReward.fromJson(Map<String, dynamic> j) => HrReward(
        id: _strOr(j['id'], ''),
        rewardNumber: _strOr(j['rewardNumber'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        rewardTypeId: _strOr(j['rewardTypeId'], ''),
        kind: _strOr(j['kind'], 'monetary'),
        amount: _strOr(j['amount'], '0'),
        title: _strOr(j['title'], ''),
        citation: _str(j['citation']),
        awardDate: _dt(j['awardDate']) ?? DateTime.now(),
        status: _strOr(j['status'], 'draft'),
        initiatedBy: _strOr(j['initiatedBy'], ''),
        approvedBy: _str(j['approvedBy']),
        approvedAt: _dt(j['approvedAt']),
        rejectionReason: _str(j['rejectionReason']),
        createdAt: _dt(j['createdAt']) ?? DateTime.now(),
        updatedAt: _dt(j['updatedAt']) ?? DateTime.now(),
        employeeName: _str(j['employeeName']),
        typeName: _str(j['typeName']),
        initiatorName: _str(j['initiatorName']),
        pointsUsed: j['pointsUsed'] == null ? null : _int(j['pointsUsed']),
      );

  bool get isMonetary => kind == 'monetary';
  bool get isPoints => kind == 'points';
  /// A monetary row that was initiated as a redemption by the employee.
  bool get isRedemption => pointsUsed != null;
  bool get canDelete => status == 'draft';
  double get amountNum => double.tryParse(amount) ?? 0;

  bool get isReceived =>
      status == 'approved' || status == 'posted' || status == 'paid';

  bool get isNewlyReceived {
    final at = approvedAt;
    if (!isReceived || at == null) return false;
    return DateTime.now().difference(at).inDays < 7;
  }
}

// ─── /hr/payroll-runs ──────────────────────────────────────────────────────

/// Server enum order matches the lifecycle: draft → processed → approved
/// → closed. Each step is gated by the previous one server-side.
const hrPayrollRunStatuses = <String>['draft', 'processed', 'approved', 'closed'];

class HrPayrollRun {
  final String id;
  final int month, year;
  /// 'draft' | 'processed' | 'approved' | 'closed'
  final String status;
  final int totalEmployees;
  final double totalGross, totalDeductions, totalNet;
  final DateTime? processedAt, approvedAt;
  final String? notes;
  HrPayrollRun({
    required this.id,
    required this.month,
    required this.year,
    required this.status,
    required this.totalEmployees,
    required this.totalGross,
    required this.totalDeductions,
    required this.totalNet,
    this.processedAt,
    this.approvedAt,
    this.notes,
  });

  factory HrPayrollRun.fromJson(Map<String, dynamic> j) => HrPayrollRun(
        id: _strOr(j['id'], ''),
        month: _int(j['month']),
        year: _int(j['year']),
        status: _strOr(j['status'], 'draft'),
        totalEmployees: _int(j['totalEmployees']),
        totalGross: _num(j['totalGross']),
        totalDeductions: _num(j['totalDeductions']),
        totalNet: _num(j['totalNet']),
        processedAt: _dt(j['processedAt']),
        approvedAt: _dt(j['approvedAt']),
        notes: _str(j['notes']),
      );

  /// "May 2026" — header label.
  String get periodLabel {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (month < 1 || month > 12) return '$year';
    return '${months[month - 1]} $year';
  }

  bool get canProcess => status == 'draft';
  bool get canApprove => status == 'processed';
  bool get canClose   => status == 'approved';
  bool get isClosed   => status == 'closed';
}

// ─── /hr/me/payslips + /hr/payroll-runs/:r/payslips/:p ─────────────────────

class HrPayslipLine {
  final String code, name;
  final double amount;
  HrPayslipLine({required this.code, required this.name, required this.amount});

  factory HrPayslipLine.fromJson(Map<String, dynamic> j) => HrPayslipLine(
        code: _strOr(j['code'], ''),
        name: _strOr(j['name'], ''),
        amount: _num(j['amount']),
      );
}

class HrPayslip {
  final String id, payrollRunId, employeeId;
  /// Joined fields — populated by `/hr/payroll-runs/:id/payslips` (which
  /// joins employees), null on the "my payslips" self endpoint where the
  /// employee is implicit.
  final String? employeeCode, employeeName;
  final int month, year;
  final String runStatus; // draft | processed | approved | closed
  final double workingDays, presentDays, paidDays, lopDays, otHours;
  final double gross, totalDeductions, netPay;
  final List<HrPayslipLine> earnings, deductions;

  HrPayslip({
    required this.id,
    required this.payrollRunId,
    required this.employeeId,
    this.employeeCode,
    this.employeeName,
    required this.month,
    required this.year,
    required this.runStatus,
    required this.workingDays,
    required this.presentDays,
    required this.paidDays,
    required this.lopDays,
    required this.otHours,
    required this.gross,
    required this.totalDeductions,
    required this.netPay,
    required this.earnings,
    required this.deductions,
  });

  factory HrPayslip.fromJson(Map<String, dynamic> j) {
    List<HrPayslipLine> arr(dynamic v) =>
        (v is List ? v : const []).whereType<Map<String, dynamic>>().map(HrPayslipLine.fromJson).toList();
    return HrPayslip(
      id: _strOr(j['id'], ''),
      payrollRunId: _strOr(j['payrollRunId'], ''),
      employeeId: _strOr(j['employeeId'], ''),
      employeeCode: _str(j['employeeCode']),
      employeeName: _str(j['employeeName']),
      month: _int(j['month']),
      year: _int(j['year']),
      runStatus: _strOr(j['runStatus'] ?? j['status'], 'draft'),
      workingDays: _num(j['workingDays']),
      presentDays: _num(j['presentDays']),
      paidDays: _num(j['paidDays']),
      lopDays: _num(j['lopDays']),
      otHours: _num(j['otHours']),
      gross: _num(j['gross']),
      totalDeductions: _num(j['totalDeductions']),
      netPay: _num(j['netPay']),
      earnings: arr(j['earnings']),
      deductions: arr(j['deductions']),
    );
  }

  /// "May 2026" — used in payslip lists and headers.
  String get periodLabel {
    const months = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec',
    ];
    if (month < 1 || month > 12) return '$year';
    return '${months[month - 1]} $year';
  }
}

// ─── /hr/announcements ─────────────────────────────────────────────────────

/// Manager dashboard noticeboard row. Pinned rows render first; expiresAt
/// is null when the announcement never expires.
class HrAnnouncement {
  final String id, title, body;
  /// 'all' | 'managers' — role-flavour filter, layered with department.
  final String audience;
  /// 'general' | 'policy' | 'holiday' | 'event' | 'operational'
  /// | 'celebration' | 'payroll'. Drives icon + chip colour in the feed.
  final String category;
  /// Optional department scope — null means org-wide.
  final String? departmentId;
  final String? departmentName;
  /// Relative API path to the cover image, or null for text-only posts.
  /// Mobile prepends the base URL when building the Image network call.
  final String? imageUrl;
  final bool pinned;
  final DateTime postedAt;
  final DateTime? expiresAt;
  /// Author's user_id. The mobile manager-can-edit check compares this
  /// to authProvider.user.id; admin / HR rules through canModerateAny
  /// don't need it but still appreciate the field for audit displays.
  final String? postedById;
  final String? postedByName;

  HrAnnouncement({
    required this.id,
    required this.title,
    required this.body,
    required this.audience,
    required this.category,
    this.departmentId,
    this.departmentName,
    this.imageUrl,
    required this.pinned,
    required this.postedAt,
    this.expiresAt,
    this.postedById,
    this.postedByName,
  });

  factory HrAnnouncement.fromJson(Map<String, dynamic> j) => HrAnnouncement(
        id: _strOr(j['id'], ''),
        title: _strOr(j['title'], ''),
        body: _strOr(j['body'], ''),
        audience: _strOr(j['audience'], 'all'),
        category: _strOr(j['category'], 'general'),
        departmentId: _str(j['departmentId']),
        departmentName: _str(j['departmentName']),
        imageUrl: _str(j['imageUrl']),
        pinned: _bool(j['pinned']),
        postedAt: _dt(j['postedAt']) ?? DateTime.now(),
        expiresAt: _dt(j['expiresAt']),
        postedById: _str(j['postedById']),
        postedByName: _str(j['postedByName']),
      );
}

// ─── /hr/dashboard/recent-activity ─────────────────────────────────────────

/// Rolled-up HR event for the activity feed. `kind` is one of:
///   employee_added | employee_exited | leave_approved | leave_rejected
///   salary_assigned | document_uploaded | payroll_started
class HrActivityEvent {
  final String id, kind, title;
  final DateTime occurredAt;
  final String? subject, employeeId, employeeName;

  HrActivityEvent({
    required this.id,
    required this.kind,
    required this.title,
    required this.occurredAt,
    this.subject,
    this.employeeId,
    this.employeeName,
  });

  factory HrActivityEvent.fromJson(Map<String, dynamic> j) => HrActivityEvent(
        id: _strOr(j['id'], ''),
        kind: _strOr(j['kind'], 'employee_added'),
        title: _strOr(j['title'], ''),
        occurredAt: _dt(j['occurredAt']) ?? DateTime.now(),
        subject: _str(j['subject']),
        employeeId: _str(j['employeeId']),
        employeeName: _str(j['employeeName']),
      );
}

// ─── Resume profile ─────────────────────────────────────────────────────────
// AI-extracted enrichment lifted from the employee's resume. Self-reported
// and unverified — surfaced as a "from resume" block, not an HR record.

class HrResumeExperience {
  final String company;
  final String? title, fromDate, toDate, description;
  const HrResumeExperience({
    required this.company,
    this.title,
    this.fromDate,
    this.toDate,
    this.description,
  });

  factory HrResumeExperience.fromJson(Map<String, dynamic> j) => HrResumeExperience(
        company: _strOr(j['company'], ''),
        title: _str(j['title']),
        fromDate: _str(j['fromDate']),
        toDate: _str(j['toDate']),
        description: _str(j['description']),
      );

  Map<String, dynamic> toJson() => {
        'company': company,
        'title': title,
        'fromDate': fromDate,
        'toDate': toDate,
        'description': description,
      };
}

class HrResumeEducation {
  final String degree;
  final String? institution, year, grade;
  const HrResumeEducation({
    required this.degree,
    this.institution,
    this.year,
    this.grade,
  });

  factory HrResumeEducation.fromJson(Map<String, dynamic> j) => HrResumeEducation(
        degree: _strOr(j['degree'], ''),
        institution: _str(j['institution']),
        year: _str(j['year']),
        grade: _str(j['grade']),
      );

  Map<String, dynamic> toJson() => {
        'degree': degree,
        'institution': institution,
        'year': year,
        'grade': grade,
      };
}

class HrResumeCertification {
  final String name;
  final String? issuer, year;
  const HrResumeCertification({required this.name, this.issuer, this.year});

  factory HrResumeCertification.fromJson(Map<String, dynamic> j) => HrResumeCertification(
        name: _strOr(j['name'], ''),
        issuer: _str(j['issuer']),
        year: _str(j['year']),
      );

  Map<String, dynamic> toJson() => {'name': name, 'issuer': issuer, 'year': year};
}

class HrResumeProfile {
  final String id, employeeId;
  final String? summary;
  final List<HrResumeExperience> experience;
  final List<HrResumeEducation> education;
  final List<String> skills;
  final List<HrResumeCertification> certifications;
  final List<String> languages;
  final double? totalExpYears;
  final String? sourceAttachmentId;
  final double? aiConfidence;
  final bool manuallyEdited;
  final DateTime? extractedAt;

  const HrResumeProfile({
    required this.id,
    required this.employeeId,
    this.summary,
    this.experience = const [],
    this.education = const [],
    this.skills = const [],
    this.certifications = const [],
    this.languages = const [],
    this.totalExpYears,
    this.sourceAttachmentId,
    this.aiConfidence,
    this.manuallyEdited = false,
    this.extractedAt,
  });

  static List<String> _stringList(Object? v) =>
      (v as List? ?? const []).map((e) => e.toString()).toList();

  factory HrResumeProfile.fromJson(Map<String, dynamic> j) => HrResumeProfile(
        id: _strOr(j['id'], ''),
        employeeId: _strOr(j['employeeId'], ''),
        summary: _str(j['summary']),
        experience: (j['experience'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(HrResumeExperience.fromJson)
            .toList(),
        education: (j['education'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(HrResumeEducation.fromJson)
            .toList(),
        skills: _stringList(j['skills']),
        certifications: (j['certifications'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(HrResumeCertification.fromJson)
            .toList(),
        languages: _stringList(j['languages']),
        totalExpYears: _numOrNull(j['totalExpYears']),
        sourceAttachmentId: _str(j['sourceAttachmentId']),
        aiConfidence: _numOrNull(j['aiConfidence']),
        manuallyEdited: _bool(j['manuallyEdited']),
        extractedAt: _dt(j['extractedAt']),
      );

  bool get isEmpty =>
      (summary == null || summary!.trim().isEmpty) &&
      experience.isEmpty &&
      education.isEmpty &&
      skills.isEmpty &&
      certifications.isEmpty &&
      languages.isEmpty;
}
