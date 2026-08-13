// Models + repo + providers for the HR phase-next features:
// geo check-in, regularizations, tax declarations, loans, FNF,
// onboarding, letters, helpdesk tickets, performance.
//
// Kept in one file so a future excision of the HR module stays single-PR.

library;

import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import 'api_config.dart';
import '../providers/auth_provider.dart';

// ─── HELPERS (duplicated locally — see hr_models.dart) ─────────────────────

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

String? _str(Object? v) => v == null ? null : v.toString();
String _strOr(Object? v, String fallback) => v == null ? fallback : v.toString();
bool _bool(Object? v) => v == true;
DateTime? _dt(Object? v) => v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) return (res['data'] as Map).cast<String, dynamic>();
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}
dynamic _dataRaw(dynamic res) => res is Map ? res['data'] : res;
List<Map<String, dynamic>> _dataList(dynamic res) {
  if (res is Map && res['data'] is List) return (res['data'] as List).cast<Map<String, dynamic>>();
  if (res is List) return res.cast<Map<String, dynamic>>();
  return [];
}

// ─── MODELS ────────────────────────────────────────────────────────────────

class HrPunch {
  final String id;
  final DateTime punchAt;
  final String kind;
  final double? lat, lng;
  final bool insideFence;
  final String? selfieUrl, notes;
  HrPunch({required this.id, required this.punchAt, required this.kind, this.lat, this.lng, required this.insideFence, this.selfieUrl, this.notes});
  factory HrPunch.fromJson(Map<String, dynamic> j) => HrPunch(
    id: _strOr(j['id'], ''),
    punchAt: _dt(j['punchAt']) ?? DateTime.now(),
    kind: _strOr(j['kind'], 'in'),
    lat: j['latitude'] == null ? null : _num(j['latitude']),
    lng: j['longitude'] == null ? null : _num(j['longitude']),
    insideFence: _bool(j['insideFence']),
    selfieUrl: _str(j['selfieUrl']),
    notes: _str(j['notes']),
  );
}

class HrRegularization {
  final String id;
  final DateTime date;
  final String? requestedCheckIn, requestedCheckOut, requestedStatus;
  final String reason, status;
  final String? rejectionReason;
  HrRegularization({required this.id, required this.date, this.requestedCheckIn, this.requestedCheckOut, this.requestedStatus, required this.reason, required this.status, this.rejectionReason});
  factory HrRegularization.fromJson(Map<String, dynamic> j) => HrRegularization(
    id: _strOr(j['id'], ''),
    date: _dt(j['date']) ?? DateTime.now(),
    requestedCheckIn: _str(j['requestedCheckIn']),
    requestedCheckOut: _str(j['requestedCheckOut']),
    requestedStatus: _str(j['requestedStatus']),
    reason: _strOr(j['reason'], ''),
    status: _strOr(j['status'], 'pending'),
    rejectionReason: _str(j['rejectionReason']),
  );
}

class HrTaxDeclaration {
  final String id, financialYear, regime, status;
  final double section80c, section80d, section80g, section80ccd1b;
  final double hraTotal, ltaTotal, homeLoanInterest, otherDeductions;
  final String? notes, rejectionReason;
  HrTaxDeclaration({
    required this.id, required this.financialYear, required this.regime, required this.status,
    required this.section80c, required this.section80d, required this.section80g, required this.section80ccd1b,
    required this.hraTotal, required this.ltaTotal, required this.homeLoanInterest, required this.otherDeductions,
    this.notes, this.rejectionReason,
  });
  factory HrTaxDeclaration.fromJson(Map<String, dynamic> j) => HrTaxDeclaration(
    id: _strOr(j['id'], ''),
    financialYear: _strOr(j['financialYear'], ''),
    regime: _strOr(j['regime'], 'new'),
    status: _strOr(j['status'], 'draft'),
    section80c: _num(j['section80c']),
    section80d: _num(j['section80d']),
    section80g: _num(j['section80g']),
    section80ccd1b: _num(j['section80ccd1b']),
    hraTotal: _num(j['hraTotal']),
    ltaTotal: _num(j['ltaTotal']),
    homeLoanInterest: _num(j['homeLoanInterest']),
    otherDeductions: _num(j['otherDeductions']),
    notes: _str(j['notes']),
    rejectionReason: _str(j['rejectionReason']),
  );
  double get total => section80c + section80d + section80g + section80ccd1b + hraTotal + ltaTotal + homeLoanInterest + otherDeductions;
}

class HrLoan {
  final String id, kind, status;
  final double principal, emiAmount, outstanding;
  final int totalInstalments, firstEmiMonth, firstEmiYear;
  final DateTime disbursedOn;
  final String? reason;
  final String? rejectionReason;
  HrLoan({required this.id, required this.kind, required this.status, required this.principal, required this.emiAmount, required this.outstanding, required this.totalInstalments, required this.firstEmiMonth, required this.firstEmiYear, required this.disbursedOn, this.reason, this.rejectionReason});
  factory HrLoan.fromJson(Map<String, dynamic> j) => HrLoan(
    id: _strOr(j['id'], ''),
    kind: _strOr(j['kind'], 'advance'),
    status: _strOr(j['status'], 'draft'),
    principal: _num(j['principal']),
    emiAmount: _num(j['emiAmount']),
    outstanding: _num(j['outstanding']),
    totalInstalments: _int(j['totalInstalments']),
    firstEmiMonth: _int(j['firstEmiMonth']),
    firstEmiYear: _int(j['firstEmiYear']),
    disbursedOn: _dt(j['disbursedOn']) ?? DateTime.now(),
    reason: _str(j['reason']),
    rejectionReason: _str(j['rejectionReason']),
  );
}

class HrLoanPolicy {
  final bool employeeRequestsEnabled, managerApprovalRequired;
  final int minTenureDays, maxPctOfMonthlyCtc, maxActiveLoans;
  final List<String>? allowedKinds;
  HrLoanPolicy({required this.employeeRequestsEnabled, required this.managerApprovalRequired, required this.minTenureDays, required this.maxPctOfMonthlyCtc, required this.maxActiveLoans, this.allowedKinds});
  factory HrLoanPolicy.fromJson(Map<String, dynamic> j) => HrLoanPolicy(
    employeeRequestsEnabled: j['employeeRequestsEnabled'] == true,
    managerApprovalRequired: j['managerApprovalRequired'] == true,
    minTenureDays: _int(j['minTenureDays']),
    maxPctOfMonthlyCtc: _int(j['maxPctOfMonthlyCtc']),
    maxActiveLoans: _int(j['maxActiveLoans']),
    allowedKinds: (j['allowedKinds'] as List?)?.map((e) => e.toString()).toList(),
  );
}

class HrLoanEligibility {
  final bool eligible, hasReportingManager;
  final List<String> reasons;
  final HrLoanPolicy policy;
  final double maxAmount, monthlyCtc;
  final int activeLoanCount, tenureDays;
  HrLoanEligibility({required this.eligible, required this.hasReportingManager, required this.reasons, required this.policy, required this.maxAmount, required this.monthlyCtc, required this.activeLoanCount, required this.tenureDays});
  factory HrLoanEligibility.fromJson(Map<String, dynamic> j) => HrLoanEligibility(
    eligible: j['eligible'] == true,
    hasReportingManager: j['hasReportingManager'] == true,
    reasons: ((j['reasons'] as List?) ?? []).map((e) => e.toString()).toList(),
    policy: HrLoanPolicy.fromJson((j['policy'] as Map?)?.cast<String, dynamic>() ?? const {}),
    maxAmount: _num(j['maxAmount']),
    monthlyCtc: _num(j['monthlyCtc']),
    activeLoanCount: _int(j['activeLoanCount']),
    tenureDays: _int(j['tenureDays']),
  );
}

class HrLoanInstalment {
  final String id;
  final int sequence, dueMonth, dueYear;
  final double amount, paidAmount;
  final String? paidPayrollRunId;
  final DateTime? paidAt;
  HrLoanInstalment({required this.id, required this.sequence, required this.dueMonth, required this.dueYear, required this.amount, this.paidAmount = 0, this.paidPayrollRunId, this.paidAt});
  factory HrLoanInstalment.fromJson(Map<String, dynamic> j) => HrLoanInstalment(
    id: _strOr(j['id'], ''),
    sequence: _int(j['sequence']),
    dueMonth: _int(j['dueMonth']),
    dueYear: _int(j['dueYear']),
    amount: _num(j['amount']),
    paidAmount: _num(j['paidAmount']),
    paidPayrollRunId: _str(j['paidPayrollRunId']),
    paidAt: _dt(j['paidAt']),
  );
  bool get isPaid => paidAt != null;
  bool get isPartPaid => !isPaid && paidAmount > 0;
}

class HrLoanDetail {
  final HrLoan loan;
  final List<HrLoanInstalment> instalments;
  HrLoanDetail({required this.loan, required this.instalments});
  factory HrLoanDetail.fromJson(Map<String, dynamic> j) => HrLoanDetail(
    loan: HrLoan.fromJson(j),
    instalments: ((j['instalments'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrLoanInstalment.fromJson).toList(),
  );
}

class HrTeamLoanRequest {
  final String id, kind, status;
  final double principal, emiAmount;
  final int totalInstalments, firstEmiMonth, firstEmiYear;
  final String? reason, firstName, lastName, employeeCode;
  HrTeamLoanRequest({required this.id, required this.kind, required this.status, required this.principal, required this.emiAmount, required this.totalInstalments, required this.firstEmiMonth, required this.firstEmiYear, this.reason, this.firstName, this.lastName, this.employeeCode});
  factory HrTeamLoanRequest.fromJson(Map<String, dynamic> j) => HrTeamLoanRequest(
    id: _strOr(j['id'], ''),
    kind: _strOr(j['kind'], 'advance'),
    status: _strOr(j['status'], 'requested'),
    principal: _num(j['principal']),
    emiAmount: _num(j['emiAmount']),
    totalInstalments: _int(j['totalInstalments']),
    firstEmiMonth: _int(j['firstEmiMonth']),
    firstEmiYear: _int(j['firstEmiYear']),
    reason: _str(j['reason']),
    firstName: _str(j['firstName']),
    lastName: _str(j['lastName']),
    employeeCode: _str(j['employeeCode']),
  );
  String get employeeName => [firstName, lastName].where((s) => s != null && s.isNotEmpty).join(' ');
}

class HrOnboardingItem {
  final String id, title, kind, assignedRole;
  final int sequence;
  final String? instructions, notes, documentKind, attachmentId, attachmentFileName, attachmentMime;
  final bool isCompleted;
  final DateTime? completedAt;
  HrOnboardingItem({required this.id, required this.title, required this.kind, required this.assignedRole, required this.sequence, this.instructions, this.notes, required this.isCompleted, this.completedAt, this.documentKind, this.attachmentId, this.attachmentFileName, this.attachmentMime});
  factory HrOnboardingItem.fromJson(Map<String, dynamic> j) => HrOnboardingItem(
    id: _strOr(j['id'], ''),
    title: _strOr(j['title'], ''),
    kind: _strOr(j['kind'], 'task'),
    assignedRole: _strOr(j['assignedRole'], 'employee'),
    sequence: _int(j['sequence']),
    instructions: _str(j['instructions']),
    notes: _str(j['notes']),
    isCompleted: _bool(j['isCompleted']),
    completedAt: _dt(j['completedAt']),
    documentKind: _str(j['documentKind']),
    attachmentId: _str(j['attachmentId']),
    attachmentFileName: _str(j['attachmentFileName']),
    attachmentMime: _str(j['attachmentMime']),
  );
  bool get isEmployeeAssigned => assignedRole == 'employee';
}

class HrOnboardingWorkflow {
  final String id, status;
  final DateTime? startedAt, completedAt;
  final List<HrOnboardingItem> items;
  HrOnboardingWorkflow({required this.id, required this.status, this.startedAt, this.completedAt, required this.items});
  factory HrOnboardingWorkflow.fromJson(Map<String, dynamic> j) => HrOnboardingWorkflow(
    id: _strOr(j['id'], ''),
    status: _strOr(j['status'], 'in_progress'),
    startedAt: _dt(j['startedAt']),
    completedAt: _dt(j['completedAt']),
    items: ((j['items'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrOnboardingItem.fromJson).toList(),
  );
}

class HrLetter {
  final String id, kind, status;
  final String? subject, renderedBody, requestedReason;
  final DateTime? issuedAt, createdAt;
  HrLetter({required this.id, required this.kind, required this.status, this.subject, this.renderedBody, this.issuedAt, this.createdAt, this.requestedReason});
  factory HrLetter.fromJson(Map<String, dynamic> j) => HrLetter(
    id: _strOr(j['id'], ''),
    kind: _strOr(j['kind'], 'other'),
    status: _strOr(j['status'], 'draft'),
    subject: _str(j['subject']),
    renderedBody: _str(j['renderedBody']),
    issuedAt: _dt(j['issuedAt']),
    createdAt: _dt(j['createdAt']),
    requestedReason: _str(j['requestedReason']),
  );
}

class HrTicket {
  final String id, ticketNumber, subject, status, priority, category;
  final String? description;
  final int slaHours;
  final DateTime createdAt;
  final DateTime? agentEscalatedAt;
  HrTicket({
    required this.id, required this.ticketNumber, required this.subject,
    required this.status, required this.priority, required this.category,
    this.description, required this.slaHours, required this.createdAt,
    this.agentEscalatedAt,
  });
  factory HrTicket.fromJson(Map<String, dynamic> j) => HrTicket(
    id: _strOr(j['id'], ''),
    ticketNumber: _strOr(j['ticketNumber'], ''),
    subject: _strOr(j['subject'], ''),
    status: _strOr(j['status'], 'open'),
    priority: _strOr(j['priority'], 'normal'),
    category: _strOr(j['category'], 'general'),
    description: _str(j['description']),
    slaHours: _int(j['slaHours']),
    createdAt: _dt(j['createdAt']) ?? DateTime.now(),
    agentEscalatedAt: _dt(j['agentEscalatedAt']),
  );
}

class HrTicketDetail {
  final HrTicket ticket;
  final List<HrTicketComment> comments;
  HrTicketDetail({required this.ticket, required this.comments});
}

class HrLetterTemplate {
  final String id, name, kind;
  final String? subject;
  HrLetterTemplate({required this.id, required this.name, required this.kind, this.subject});
  factory HrLetterTemplate.fromJson(Map<String, dynamic> j) => HrLetterTemplate(
    id: _strOr(j['id'], ''),
    name: _strOr(j['name'], ''),
    kind: _strOr(j['kind'], ''),
    subject: _str(j['subject']),
  );
}

class HrEmployeeLetter {
  final String id, kind, status, renderedBody;
  final String? subject, pdfUrl;
  final DateTime? issuedAt;
  HrEmployeeLetter({
    required this.id,
    required this.kind,
    required this.status,
    required this.renderedBody,
    this.subject,
    this.pdfUrl,
    this.issuedAt,
  });
  factory HrEmployeeLetter.fromJson(Map<String, dynamic> j) => HrEmployeeLetter(
    id: _strOr(j['id'], ''),
    kind: _strOr(j['kind'], ''),
    status: _strOr(j['status'], ''),
    renderedBody: _strOr(j['renderedBody'], ''),
    subject: _str(j['subject']),
    pdfUrl: _str(j['pdfUrl']),
    issuedAt: _dt(j['issuedAt']),
  );
}

class HrTicketComment {
  final String id, body;
  final String? authorEmail, authorName, authorRole, authorUserId;
  final DateTime createdAt;
  final bool isAgentDraft;
  final String? agentConfidence;
  final List<Map<String, dynamic>> agentCitations;
  final Map<String, dynamic> agentMetadata;
  HrTicketComment({
    required this.id,
    required this.body,
    this.authorEmail,
    this.authorName,
    this.authorRole,
    this.authorUserId,
    required this.createdAt,
    this.isAgentDraft = false,
    this.agentConfidence,
    this.agentCitations = const [],
    this.agentMetadata = const {},
  });
  bool get isEscalationNote => agentMetadata['escalated'] == true;
  factory HrTicketComment.fromJson(Map<String, dynamic> j) => HrTicketComment(
    id: _strOr(j['id'], ''),
    body: _strOr(j['body'], ''),
    authorEmail: _str(j['authorEmail']),
    authorName: _str(j['authorName']),
    authorRole: _str(j['authorRole']),
    authorUserId: _str(j['authorUserId']),
    createdAt: _dt(j['createdAt']) ?? DateTime.now(),
    isAgentDraft: j['isAgentDraft'] == true,
    agentConfidence: _str(j['agentConfidence']),
    agentCitations: ((j['agentCitations'] as List?) ?? []).cast<Map<String, dynamic>>(),
    agentMetadata: (j['agentMetadata'] as Map?)?.cast<String, dynamic>() ?? const {},
  );
}

class HrPerformanceGoal {
  final String id, title, status, cycleId;
  final double weight;
  final double? selfRating, managerRating, finalRating;
  final int? progressPct;
  final String? description, comments;
  final String? cycleName, cycleStatus, cycleStartDate, cycleEndDate;
  HrPerformanceGoal({
    required this.id, required this.title, required this.status,
    required this.weight, required this.cycleId,
    this.selfRating, this.managerRating, this.finalRating, this.progressPct,
    this.description, this.comments,
    this.cycleName, this.cycleStatus, this.cycleStartDate, this.cycleEndDate,
  });
  factory HrPerformanceGoal.fromJson(Map<String, dynamic> j) => HrPerformanceGoal(
    id: _strOr(j['id'], ''),
    title: _strOr(j['title'], ''),
    status: _strOr(j['status'], 'active'),
    weight: _num(j['weight']),
    cycleId: _strOr(j['cycleId'], ''),
    selfRating: j['selfRating'] == null ? null : _num(j['selfRating']),
    managerRating: j['managerRating'] == null ? null : _num(j['managerRating']),
    finalRating: j['finalRating'] == null ? null : _num(j['finalRating']),
    progressPct: j['progressPct'] == null ? null : _int(j['progressPct']),
    description: _str(j['description']),
    comments: _str(j['comments']),
    cycleName: _str(j['cycleName']),
    cycleStatus: _str(j['cycleStatus']),
    cycleStartDate: _str(j['cycleStartDate']),
    cycleEndDate: _str(j['cycleEndDate']),
  );
}

class HrPerformanceReview {
  final String id, status;
  final String? cycleId;
  final double? selfOverallRating, managerOverallRating, finalOverallRating;
  final double? computedSelfScore, computedManagerScore;
  final String? selfComments, managerComments, employeeAckComment;
  HrPerformanceReview({required this.id, required this.status, this.cycleId, this.selfOverallRating, this.managerOverallRating, this.finalOverallRating, this.computedSelfScore, this.computedManagerScore, this.selfComments, this.managerComments, this.employeeAckComment});

  /// Display value — the explicit overall rating, falling back to the
  /// weighted score derived from goal-level ratings.
  double? get displaySelf => selfOverallRating ?? computedSelfScore;
  double? get displayManager => managerOverallRating ?? computedManagerScore;

  factory HrPerformanceReview.fromJson(Map<String, dynamic> j) => HrPerformanceReview(
    id: _strOr(j['id'], ''),
    status: _strOr(j['status'], 'pending'),
    cycleId: _str(j['cycleId']),
    selfOverallRating: j['selfOverallRating'] == null ? null : _num(j['selfOverallRating']),
    managerOverallRating: j['managerOverallRating'] == null ? null : _num(j['managerOverallRating']),
    finalOverallRating: j['finalOverallRating'] == null ? null : _num(j['finalOverallRating']),
    computedSelfScore: j['computedSelfScore'] == null ? null : _num(j['computedSelfScore']),
    computedManagerScore: j['computedManagerScore'] == null ? null : _num(j['computedManagerScore']),
    selfComments: _str(j['selfComments']),
    managerComments: _str(j['managerComments']),
    employeeAckComment: _str(j['employeeAckComment']),
  );
}

class HrPerformanceBundle {
  final List<HrPerformanceGoal> goals;
  final List<HrPerformanceReview> reviews;
  HrPerformanceBundle({required this.goals, required this.reviews});
}

// ─── REPO ──────────────────────────────────────────────────────────────────

class HrPhaseNextRepo {
  // Punches
  Future<Map<String, dynamic>> punch({
    required String kind,
    double? lat, double? lng, double? accuracy,
    String? selfieUrl, String? notes,
  }) async {
    final res = await apiClient.post('/hr/me/punch', {
      'kind': kind,
      if (lat != null) 'latitude': lat,
      if (lng != null) 'longitude': lng,
      if (accuracy != null) 'accuracyMeters': accuracy,
      if (selfieUrl != null) 'selfieUrl': selfieUrl,
      if (notes != null) 'notes': notes,
    });
    return _data(res);
  }

  // Upload a selfie file and return the S3 storage key. Callers then pass
  // that key as `selfieUrl` to [punch]. Separate from the JSON punch
  // endpoint so a failed selfie upload doesn't block the punch itself.
  Future<String> uploadPunchSelfie(File file) async {
    final res = await apiClient.upload(
      '/hr/me/punch-selfie',
      file,
      mimeType: 'image/jpeg',
    );
    final d = _data(res);
    final key = d['storageKey'];
    if (key is! String || key.isEmpty) {
      throw Exception('Selfie upload returned no storage key');
    }
    return key;
  }
  Future<List<HrPunch>> myPunches() async {
    final res = await apiClient.get('/hr/me/punches');
    return _dataList(res).map(HrPunch.fromJson).toList();
  }

  // Regularizations
  Future<List<HrRegularization>> myRegularizations() async {
    final res = await apiClient.get('/hr/me/regularizations');
    return _dataList(res).map(HrRegularization.fromJson).toList();
  }
  Future<HrRegularization> createRegularization({
    required DateTime date,
    String? checkIn, String? checkOut, String? requestedStatus,
    required String reason,
  }) async {
    final res = await apiClient.post('/hr/me/regularizations', {
      'date': '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
      if (checkIn != null) 'requestedCheckIn': checkIn,
      if (checkOut != null) 'requestedCheckOut': checkOut,
      if (requestedStatus != null) 'requestedStatus': requestedStatus,
      'reason': reason,
    });
    return HrRegularization.fromJson(_data(res));
  }
  Future<void> cancelRegularization(String id) async {
    await apiClient.put('/hr/me/regularizations/$id/cancel', {});
  }
  Future<List<HrRegularization>> pendingRegularizations() async {
    final res = await apiClient.get('/hr/regularizations?status=pending');
    return _dataList(res).map(HrRegularization.fromJson).toList();
  }
  Future<void> reviewRegularization(String id, {required bool approved, String? rejectionReason}) async {
    await apiClient.put('/hr/regularizations/$id/review', {
      'approved': approved,
      if (rejectionReason != null) 'rejectionReason': rejectionReason,
    });
  }

  // Tax declarations
  Future<List<HrTaxDeclaration>> myTaxDeclarations() async {
    final res = await apiClient.get('/hr/me/tax-declarations');
    return _dataList(res).map(HrTaxDeclaration.fromJson).toList();
  }
  Future<HrTaxDeclaration> upsertMyTaxDeclaration({
    required String financialYear,
    required String regime,
    required Map<String, double> sections,
    String? notes,
  }) async {
    final res = await apiClient.post('/hr/me/tax-declarations', {
      'financialYear': financialYear,
      'regime': regime,
      ...sections,
      if (notes != null) 'notes': notes,
    });
    return HrTaxDeclaration.fromJson(_data(res));
  }
  Future<void> submitMyTaxDeclaration(String id) async {
    await apiClient.put('/hr/me/tax-declarations/$id/submit', {});
  }
  Future<void> withdrawMyTaxDeclaration(String id) async {
    await apiClient.put('/hr/me/tax-declarations/$id/withdraw', {});
  }

  // Loans
  Future<List<HrLoan>> myLoans() async {
    final res = await apiClient.get('/hr/me/loans');
    return _dataList(res).map(HrLoan.fromJson).toList();
  }
  Future<HrLoanDetail> myLoanDetail(String id) async {
    final res = await apiClient.get('/hr/me/loans/$id');
    return HrLoanDetail.fromJson(_data(res));
  }
  Future<HrLoanEligibility> loanEligibility() async {
    final res = await apiClient.get('/hr/me/loans/eligibility');
    return HrLoanEligibility.fromJson(_data(res));
  }
  Future<List<HrTeamLoanRequest>> teamLoanRequests() async {
    final res = await apiClient.get('/hr/me/team-loan-requests');
    return _dataList(res).map(HrTeamLoanRequest.fromJson).toList();
  }
  Future<void> managerApproveLoan(String id) async {
    await apiClient.put('/hr/loans/$id/manager-approve', {});
  }
  Future<void> managerRejectLoan(String id, String reason) async {
    await apiClient.put('/hr/loans/$id/manager-reject', {'rejectionReason': reason});
  }
  Future<HrLoan> requestLoan({
    required String kind,
    required double principal,
    required int totalInstalments,
    required int firstEmiMonth,
    required int firstEmiYear,
    String? reason,
  }) async {
    final res = await apiClient.post('/hr/me/loans', {
      'kind': kind,
      'principal': principal,
      'totalInstalments': totalInstalments,
      'firstEmiMonth': firstEmiMonth,
      'firstEmiYear': firstEmiYear,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    });
    return HrLoan.fromJson(_data(res));
  }
  Future<void> withdrawMyLoan(String id) async {
    await apiClient.delete('/hr/me/loans/$id');
  }

  // Onboarding
  Future<HrOnboardingWorkflow?> myOnboarding() async {
    final res = await apiClient.get('/hr/me/onboarding');
    final raw = _dataRaw(res);
    if (raw == null || raw is! Map) return null;
    return HrOnboardingWorkflow.fromJson(raw.cast<String, dynamic>());
  }
  Future<void> completeOnboardingItem(String id, {String? notes}) async {
    await apiClient.put('/hr/onboarding/items/$id/complete', {
      if (notes != null) 'notes': notes,
    });
  }
  Future<void> uploadOnboardingDocument({
    required String itemId,
    required File file,
    String? mimeType,
  }) async {
    await apiClient.upload(
      '/hr/me/onboarding/items/$itemId/upload',
      file,
      mimeType: mimeType,
    );
  }

  // Letters
  Future<List<HrLetter>> myLetters() async {
    final res = await apiClient.get('/hr/me/letters');
    return _dataList(res).map(HrLetter.fromJson).toList();
  }
  Future<HrLetter> requestLetter({required String kind, required String reason}) async {
    final res = await apiClient.post('/hr/me/letters', {
      'kind': kind,
      'reason': reason,
    });
    return HrLetter.fromJson(_data(res));
  }
  Future<void> withdrawLetterRequest(String id) async {
    await apiClient.delete('/hr/me/letters/$id');
  }
  Future<List<int>> downloadLetterPdf(String id) async {
    return apiClient.getBytes('/hr/me/letters/$id/pdf');
  }

  // Tickets
  Future<List<HrTicket>> myTickets() async {
    final res = await apiClient.get('/hr/me/tickets');
    return _dataList(res).map(HrTicket.fromJson).toList();
  }
  Future<HrTicket> createTicket({
    required String subject,
    String? description,
    String category = 'general',
    String priority = 'normal',
  }) async {
    final res = await apiClient.post('/hr/me/tickets', {
      'subject': subject,
      if (description != null) 'description': description,
      'category': category,
      'priority': priority,
    });
    return HrTicket.fromJson(_data(res));
  }
  Future<HrTicketDetail> ticket(String id) async {
    final res = await apiClient.get('/hr/tickets/$id');
    final d = _data(res);
    final comments = ((d['comments'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrTicketComment.fromJson).toList();
    return HrTicketDetail(ticket: HrTicket.fromJson(d), comments: comments);
  }
  Future<void> commentOnTicket(String id, String body) async {
    await apiClient.post('/hr/tickets/$id/comments', {'body': body});
  }
  Future<void> acceptAgentDraft(String ticketId, String commentId, {String? body}) async {
    await apiClient.post(
      '/hr/tickets/$ticketId/agent-drafts/$commentId/accept',
      body == null ? {} : {'body': body},
    );
  }
  Future<void> discardAgentDraft(String ticketId, String commentId) async {
    await apiClient.delete('/hr/tickets/$ticketId/agent-drafts/$commentId');
  }

  // Letters (self-service)
  Future<List<HrLetterTemplate>> myLetterTemplates() async {
    final res = await apiClient.get('/hr/me/letter-templates');
    final list = (res['data'] as List?) ?? [];
    return list.cast<Map<String, dynamic>>().map(HrLetterTemplate.fromJson).toList();
  }
  Future<HrEmployeeLetter> issueLetterInstantly({required String templateId, String? reason}) async {
    final res = await apiClient.post('/hr/me/letters/instant', {
      'templateId': templateId,
      if (reason != null) 'reason': reason,
    });
    return HrEmployeeLetter.fromJson(_data(res));
  }

  /// Build the WS URL for a specific helpdesk ticket. Caller manages the channel
  /// lifecycle and reconnect logic.
  Uri helpdeskWsUrl({required String token, required String ticketId}) {
    final base = ApiConfig.baseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    return Uri.parse('$base/hr/helpdesk/ws?ticketId=$ticketId&token=$token');
  }

  // Performance
  Future<HrPerformanceBundle> myPerformance() async {
    final res = await apiClient.get('/hr/me/performance');
    final d = _data(res);
    final goals = ((d['goals'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrPerformanceGoal.fromJson).toList();
    final reviews = ((d['reviews'] as List?) ?? []).cast<Map<String, dynamic>>().map(HrPerformanceReview.fromJson).toList();
    return HrPerformanceBundle(goals: goals, reviews: reviews);
  }
  Future<void> selfSubmitReview(String id, {String? selfComments, double? selfOverallRating}) async {
    await apiClient.put('/hr/performance/reviews/$id/self-submit', {
      if (selfComments != null) 'selfComments': selfComments,
      if (selfOverallRating != null) 'selfOverallRating': selfOverallRating,
    });
  }
  Future<void> selfRateGoal(String goalId, {required double rating, String? comments}) async {
    await apiClient.put('/hr/performance/goals/$goalId', {
      'selfRating': rating,
      if (comments != null && comments.trim().isNotEmpty) 'comments': comments.trim(),
    });
  }
  Future<void> updateGoalProgress(String goalId, int progressPct) async {
    await apiClient.put('/hr/performance/goals/$goalId', {'progressPct': progressPct});
  }
  Future<void> acknowledgeReview(String reviewId, {String? comment}) async {
    await apiClient.put('/hr/performance/reviews/$reviewId/acknowledge', {
      if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
    });
  }
}

final hrPhaseNextRepo = HrPhaseNextRepo();

// ─── PROVIDERS ─────────────────────────────────────────────────────────────

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

final myPunchesProvider = FutureProvider<List<HrPunch>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myPunches()));
final myRegularizationsProvider = FutureProvider<List<HrRegularization>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myRegularizations()));
final pendingRegularizationsProvider = FutureProvider<List<HrRegularization>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.pendingRegularizations()));
final myTaxDeclarationsProvider = FutureProvider<List<HrTaxDeclaration>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myTaxDeclarations()));
final myLoansProvider = FutureProvider<List<HrLoan>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myLoans()));
final loanEligibilityProvider = FutureProvider<HrLoanEligibility>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.loanEligibility()));
final teamLoanRequestsProvider = FutureProvider<List<HrTeamLoanRequest>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.teamLoanRequests()));
final myLoanDetailProvider = FutureProvider.family<HrLoanDetail, String>((ref, id) async => _watchAuth(ref, () => hrPhaseNextRepo.myLoanDetail(id)));
final myOnboardingProvider = FutureProvider<HrOnboardingWorkflow?>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myOnboarding()));
final myLettersProvider = FutureProvider<List<HrLetter>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myLetters()));
final myTicketsProvider = FutureProvider<List<HrTicket>>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myTickets()));
final myPerformanceProvider = FutureProvider<HrPerformanceBundle>((ref) async => _watchAuth(ref, () => hrPhaseNextRepo.myPerformance()));
final ticketProvider = FutureProvider.family<HrTicketDetail, String>((ref, id) async => _watchAuth(ref, () => hrPhaseNextRepo.ticket(id)));
