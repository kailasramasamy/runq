// Models + repo + providers for HR "Advances & deductions":
//   - hr_deductions: goods/canteen/damage/uniform/fine/other, recovered via
//     payroll over one or more instalments.
//   - hr_advances: the "I just handed over cash" one-shot that creates +
//     activates + disburses an HrLoan in a single call.
//
// Follows the conventions in hr_phase_next.dart (_num/_int helpers,
// _data/_dataList, repo method style, providers at the bottom). The loans
// inside HrRecoverySummary reuse HrLoan from hr_phase_next.dart rather than
// redefining it.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import 'hr_phase_next.dart';
import '../providers/auth_provider.dart';

// ─── HELPERS (duplicated locally — see hr_phase_next.dart) ─────────────────

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int _int(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

String? _str(Object? v) => v?.toString();
String _strOr(Object? v, String fallback) => v == null ? fallback : v.toString();
DateTime? _dt(Object? v) => v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

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

// ─── MODELS ────────────────────────────────────────────────────────────────

class HrDeduction {
  final String id, employeeId, category, status;
  final String firstName;
  final String? lastName, employeeCode, description;
  final double amount, instalment, outstanding;
  final int startMonth, startYear;
  final DateTime? createdAt;
  HrDeduction({
    required this.id, required this.employeeId, required this.category, required this.status,
    required this.firstName, this.lastName, this.employeeCode, this.description,
    required this.amount, required this.instalment, required this.outstanding,
    required this.startMonth, required this.startYear, this.createdAt,
  });
  factory HrDeduction.fromJson(Map<String, dynamic> j) => HrDeduction(
    id: _strOr(j['id'], ''),
    employeeId: _strOr(j['employeeId'], ''),
    category: _strOr(j['category'], 'other'),
    status: _strOr(j['status'], 'active'),
    firstName: _strOr(j['firstName'], ''),
    lastName: _str(j['lastName']),
    employeeCode: _str(j['employeeCode']),
    description: _str(j['description']),
    amount: _num(j['amount']),
    instalment: _num(j['instalment']),
    outstanding: _num(j['outstanding']),
    startMonth: _int(j['startMonth']),
    startYear: _int(j['startYear']),
    createdAt: _dt(j['createdAt']),
  );
  String get employeeName =>
      lastName == null || lastName!.isEmpty ? firstName : '$firstName $lastName';
}

class HrDeductionRecovery {
  final String id, payrollRunId;
  final double amount;
  final int month, year;
  HrDeductionRecovery({
    required this.id, required this.amount, required this.payrollRunId,
    required this.month, required this.year,
  });
  factory HrDeductionRecovery.fromJson(Map<String, dynamic> j) => HrDeductionRecovery(
    id: _strOr(j['id'], ''),
    amount: _num(j['amount']),
    payrollRunId: _strOr(j['payrollRunId'], ''),
    month: _int(j['month']),
    year: _int(j['year']),
  );
}

class HrDeductionDetail {
  final HrDeduction deduction;
  final List<HrDeductionRecovery> recoveries;
  HrDeductionDetail({required this.deduction, required this.recoveries});
  factory HrDeductionDetail.fromJson(Map<String, dynamic> j) => HrDeductionDetail(
    deduction: HrDeduction.fromJson(j),
    recoveries: ((j['recoveries'] as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(HrDeductionRecovery.fromJson)
        .toList(),
  );
}

/// Admin/HR list row for `GET /hr/loans` — the loan fields plus the
/// employee identity the endpoint flattens alongside them (same shape as
/// [HrDeduction]). Wraps rather than extends [HrLoan] so the reused model
/// stays exactly what hr_phase_next.dart defines.
class HrAdminLoan {
  final String employeeId, firstName;
  final String? lastName, employeeCode;
  final HrLoan loan;
  /// Whether cash has actually gone out against this loan (`GET /hr/loans`
  /// only) — lets the UI hide/disable amount edits and "Disburse" instead of
  /// relying purely on the server's 409.
  final bool isDisbursed;
  HrAdminLoan({
    required this.employeeId, required this.firstName, this.lastName, this.employeeCode,
    required this.loan, this.isDisbursed = false,
  });
  factory HrAdminLoan.fromJson(Map<String, dynamic> j) => HrAdminLoan(
    employeeId: _strOr(j['employeeId'], ''),
    firstName: _strOr(j['firstName'], ''),
    lastName: _str(j['lastName']),
    employeeCode: _str(j['employeeCode']),
    loan: HrLoan.fromJson(j),
    isDisbursed: j['isDisbursed'] == true,
  );
  String get employeeName =>
      lastName == null || lastName!.isEmpty ? firstName : '$firstName $lastName';
}

/// Full detail behind one advance/loan: identity + isDisbursed (from the
/// admin list) plus its instalment schedule (from `GET /hr/loans/:id`).
class HrAdvanceDetail {
  final HrAdminLoan loan;
  final List<HrLoanInstalment> instalments;
  HrAdvanceDetail({required this.loan, required this.instalments});
}

class HrRecoverySummary {
  final List<HrLoan> loans;
  final List<HrDeduction> deductions;
  final double loanOutstanding, deductionOutstanding, totalOutstanding, nextRunEstimate;
  HrRecoverySummary({
    required this.loans, required this.deductions,
    required this.loanOutstanding, required this.deductionOutstanding,
    required this.totalOutstanding, required this.nextRunEstimate,
  });
  factory HrRecoverySummary.fromJson(Map<String, dynamic> j) => HrRecoverySummary(
    loans: ((j['loans'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrLoan.fromJson).toList(),
    deductions: ((j['deductions'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrDeduction.fromJson).toList(),
    loanOutstanding: _num(j['loanOutstanding']),
    deductionOutstanding: _num(j['deductionOutstanding']),
    totalOutstanding: _num(j['totalOutstanding']),
    nextRunEstimate: _num(j['nextRunEstimate']),
  );
}

// ─── REPO ──────────────────────────────────────────────────────────────────

class HrRecoveryRepo {
  /// Admin/HR view of loans across all employees — powers the Advances
  /// tab on the recoveries screen. Defaults to active loans (the ones
  /// actually being recovered); pass status: null for every state.
  Future<List<HrAdminLoan>> adminLoans({String? employeeId, String? status = 'active'}) async {
    final qp = <String, String>{};
    if (employeeId != null && employeeId.isNotEmpty) qp['employeeId'] = employeeId;
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final qs = Uri(queryParameters: qp.isEmpty ? null : qp).query;
    final res = await apiClient.get('/hr/loans${qs.isEmpty ? '' : '?$qs'}');
    return _dataList(res).map(HrAdminLoan.fromJson).toList();
  }

  Future<List<HrDeduction>> deductions({String? employeeId, String? status}) async {
    final qp = <String, String>{};
    if (employeeId != null && employeeId.isNotEmpty) qp['employeeId'] = employeeId;
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final qs = Uri(queryParameters: qp.isEmpty ? null : qp).query;
    final res = await apiClient.get('/hr/deductions${qs.isEmpty ? '' : '?$qs'}');
    return _dataList(res).map(HrDeduction.fromJson).toList();
  }

  Future<HrDeductionDetail> deduction(String id) async {
    final res = await apiClient.get('/hr/deductions/$id');
    return HrDeductionDetail.fromJson(_data(res));
  }

  Future<HrDeduction> createDeduction({
    required String employeeId,
    required String category,
    String? description,
    required double amount,
    double? instalment,
    required int startMonth,
    required int startYear,
  }) async {
    final res = await apiClient.post('/hr/deductions', {
      'employeeId': employeeId,
      'category': category,
      if (description != null && description.isNotEmpty) 'description': description,
      'amount': amount,
      'instalment': ?instalment,
      'startMonth': startMonth,
      'startYear': startYear,
    });
    return HrDeduction.fromJson(_data(res));
  }

  Future<HrDeduction> updateDeduction(
    String id, {
    String? category,
    String? description,
    double? instalment,
    int? startMonth,
    int? startYear,
  }) async {
    final res = await apiClient.put('/hr/deductions/$id', {
      'category': ?category,
      'description': ?description,
      'instalment': ?instalment,
      'startMonth': ?startMonth,
      'startYear': ?startYear,
    });
    return HrDeduction.fromJson(_data(res));
  }

  Future<void> cancelDeduction(String id) async {
    await apiClient.put('/hr/deductions/$id/cancel', {});
  }

  Future<void> deleteDeduction(String id) async {
    await apiClient.delete('/hr/deductions/$id');
  }

  Future<HrRecoverySummary> employeeRecoverySummary(String employeeId) async {
    final res = await apiClient.get('/hr/employees/$employeeId/recovery-summary');
    return HrRecoverySummary.fromJson(_data(res));
  }

  Future<HrRecoverySummary> myRecoverySummary() async {
    final res = await apiClient.get('/hr/me/recovery-summary');
    return HrRecoverySummary.fromJson(_data(res));
  }

  Future<HrLoan> recordAdvance({
    required String employeeId,
    String kind = 'advance',
    required double amount,
    int totalInstalments = 1,
    required DateTime disbursedOn,
    required int firstEmiMonth,
    required int firstEmiYear,
    String? reason,
    String paymentMethod = 'cash',
    String? bankAccountId,
    String? reference,
  }) async {
    final res = await apiClient.post('/hr/advances', {
      'employeeId': employeeId,
      'kind': kind,
      'amount': amount,
      'totalInstalments': totalInstalments,
      'disbursedOn':
          '${disbursedOn.year.toString().padLeft(4, '0')}-${disbursedOn.month.toString().padLeft(2, '0')}-${disbursedOn.day.toString().padLeft(2, '0')}',
      'firstEmiMonth': firstEmiMonth,
      'firstEmiYear': firstEmiYear,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
      'paymentMethod': paymentMethod,
      'bankAccountId': ?bankAccountId,
      if (reference != null && reference.isNotEmpty) 'reference': reference,
    });
    final d = _data(res);
    final loanJson = d['loan'] as Map?;
    return HrLoan.fromJson((loanJson ?? d).cast<String, dynamic>());
  }

  /// Merges `GET /hr/loans/:id` (loan + instalments) with the employee-scoped
  /// admin list (identity + isDisbursed, which the detail endpoint omits).
  Future<HrAdvanceDetail> advanceDetail(String loanId, {required String employeeId}) async {
    final detailRes = await apiClient.get('/hr/loans/$loanId');
    final detailJson = _data(detailRes);
    final instalments = ((detailJson['instalments'] as List?) ?? [])
        .cast<Map<String, dynamic>>()
        .map(HrLoanInstalment.fromJson)
        .toList();
    final siblings = await adminLoans(employeeId: employeeId, status: null);
    final match = siblings.where((l) => l.loan.id == loanId);
    final loan = match.isNotEmpty
        ? match.first
        : HrAdminLoan(employeeId: employeeId, firstName: '', loan: HrLoan.fromJson(detailJson));
    return HrAdvanceDetail(loan: loan, instalments: instalments);
  }

  Future<HrLoan> updateLoan(
    String id, {
    double? principal,
    int? remainingInstalments,
    int? firstEmiMonth,
    int? firstEmiYear,
    String? reason,
  }) async {
    final res = await apiClient.put('/hr/loans/$id', {
      'principal': ?principal,
      'remainingInstalments': ?remainingInstalments,
      'firstEmiMonth': ?firstEmiMonth,
      'firstEmiYear': ?firstEmiYear,
      'reason': ?reason,
    });
    return HrLoan.fromJson(_data(res));
  }

  Future<HrLoan> writeOffLoan(String id, {String? reason}) async {
    final res = await apiClient.put('/hr/loans/$id/write-off', {
      'reason': ?reason,
    });
    return HrLoan.fromJson(_data(res));
  }

  Future<void> deleteLoan(String id) async {
    await apiClient.delete('/hr/loans/$id');
  }

  Future<void> disburseLoan(
    String id, {
    required DateTime paymentDate,
    String? bankAccountId,
    required String paymentMethod,
    String? reference,
    String? notes,
  }) async {
    await apiClient.post('/hr/loans/$id/disburse', {
      'paymentDate':
          '${paymentDate.year.toString().padLeft(4, '0')}-${paymentDate.month.toString().padLeft(2, '0')}-${paymentDate.day.toString().padLeft(2, '0')}',
      'bankAccountId': ?bankAccountId,
      'paymentMethod': paymentMethod,
      if (reference != null && reference.isNotEmpty) 'reference': reference,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
  }
}

final hrRecoveryRepo = HrRecoveryRepo();

// ─── PROVIDERS ─────────────────────────────────────────────────────────────

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

class HrDeductionsQuery {
  final String? employeeId, status;
  const HrDeductionsQuery({this.employeeId, this.status});

  @override
  bool operator ==(Object other) =>
      other is HrDeductionsQuery && other.employeeId == employeeId && other.status == status;

  @override
  int get hashCode => Object.hash(employeeId, status);
}

final hrAdminLoansProvider = FutureProvider<List<HrAdminLoan>>((ref) async {
  return _watchAuth(ref, () => hrRecoveryRepo.adminLoans());
});

class HrAdvanceDetailQuery {
  final String loanId, employeeId;
  const HrAdvanceDetailQuery({required this.loanId, required this.employeeId});

  @override
  bool operator ==(Object other) =>
      other is HrAdvanceDetailQuery && other.loanId == loanId && other.employeeId == employeeId;

  @override
  int get hashCode => Object.hash(loanId, employeeId);
}

final hrAdvanceDetailProvider =
    FutureProvider.family<HrAdvanceDetail, HrAdvanceDetailQuery>((ref, q) async {
  return _watchAuth(ref, () => hrRecoveryRepo.advanceDetail(q.loanId, employeeId: q.employeeId));
});

final hrDeductionsProvider =
    FutureProvider.family<List<HrDeduction>, HrDeductionsQuery>((ref, q) async {
  return _watchAuth(ref, () => hrRecoveryRepo.deductions(employeeId: q.employeeId, status: q.status));
});

final hrDeductionDetailProvider =
    FutureProvider.family<HrDeductionDetail, String>((ref, id) async {
  return _watchAuth(ref, () => hrRecoveryRepo.deduction(id));
});

final hrEmployeeRecoverySummaryProvider =
    FutureProvider.family<HrRecoverySummary, String>((ref, employeeId) async {
  return _watchAuth(ref, () => hrRecoveryRepo.employeeRecoverySummary(employeeId));
});

final hrMyRecoverySummaryProvider = FutureProvider<HrRecoverySummary>((ref) async {
  return _watchAuth(ref, () => hrRecoveryRepo.myRecoverySummary());
});
