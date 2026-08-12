// Labour contracts — three shapes, none of which needs an employee record.
//
//   solo_daily    one worker on a daily rate
//   task_lumpsum  an agreed price for a job; we deal with the crew lead
//   crew_daily    a named crew, each on their own rate
//
// Solo is a crew of one on the server, so `members` is populated for both
// day-rate shapes and empty for a task. `endDate` is null on open-ended
// work, which is the common case.
//
// Parse helpers are re-declared here rather than exported from
// hr_models.dart, which is already well past the file-size limit.

library;

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

double? _numOrNull(Object? v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

int _int(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

String? _str(Object? v) => v == null ? null : v.toString();
String _strOr(Object? v, String fallback) => v == null ? fallback : v.toString();
bool _bool(Object? v) => v == true;

DateTime? _dt(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

List<String> _stringList(Object? v) =>
    (v as List? ?? const []).map((e) => e.toString()).toList();

List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) fromJson) =>
    (v as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(fromJson)
        .toList();

/// Canonical contract-type values, in the order the form offers them.
const kContractTypes = <String>['solo_daily', 'task_lumpsum', 'crew_daily'];

String contractTypeLabel(String t) => switch (t) {
      'solo_daily' => 'Daily wage',
      'task_lumpsum' => 'Task — fixed amount',
      'crew_daily' => 'Crew — daily rates',
      _ => t,
    };

String contractTypeBlurb(String t) => switch (t) {
      'solo_daily' => 'One worker paid for the days they work.',
      'task_lumpsum' =>
        'An agreed price for the job. We deal with the crew lead and do not '
            'track who works.',
      'crew_daily' => 'A crew, each person on their own daily rate.',
      _ => '',
    };

class HrContractMember {
  final String id, name;
  final String? role;
  final double dailyRate;
  final DateTime? joinedOn, leftOn;

  HrContractMember({
    required this.id,
    required this.name,
    this.role,
    required this.dailyRate,
    this.joinedOn,
    this.leftOn,
  });

  factory HrContractMember.fromJson(Map<String, dynamic> j) => HrContractMember(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], '—'),
        role: _str(j['role']),
        dailyRate: _num(j['dailyRate']),
        joinedOn: _dt(j['joinedOn']),
        leftOn: _dt(j['leftOn']),
      );
}

/// One deviation from "worked". The absence of an entry means the day was
/// worked — the server stores exceptions only.
class HrContractDay {
  final String id, memberId;
  final DateTime logDate;

  /// 'leave' | 'half_day'  ('worked' is never stored)
  final String status;
  final String? note;

  HrContractDay({
    required this.id,
    required this.memberId,
    required this.logDate,
    required this.status,
    this.note,
  });

  factory HrContractDay.fromJson(Map<String, dynamic> j) => HrContractDay(
        id: _strOr(j['id'], ''),
        memberId: _strOr(j['memberId'], ''),
        logDate: _dt(j['logDate']) ?? DateTime.now(),
        status: _strOr(j['status'], 'leave'),
        note: _str(j['note']),
      );
}

class HrAdvance {
  final String id;
  final String? memberId;
  final double amount;
  final DateTime paidOn;
  final String paymentMethod;
  final String? reference, notes;

  /// 'paid' | 'recovered' | 'cancelled'
  final String status;

  HrAdvance({
    required this.id,
    this.memberId,
    required this.amount,
    required this.paidOn,
    required this.paymentMethod,
    this.reference,
    this.notes,
    required this.status,
  });

  factory HrAdvance.fromJson(Map<String, dynamic> j) => HrAdvance(
        id: _strOr(j['id'], ''),
        memberId: _str(j['memberId']),
        amount: _num(j['amount']),
        paidOn: _dt(j['paidOn']) ?? DateTime.now(),
        paymentMethod: _strOr(j['paymentMethod'], 'cash'),
        reference: _str(j['reference']),
        notes: _str(j['notes']),
        status: _strOr(j['status'], 'paid'),
      );
}

/// What one person is owed. A crew is settled person by person, so this is
/// the row the money is actually handed over against.
class HrSettlementLine {
  final String? memberId;
  final String memberName;
  final String? memberRole;
  final double? dailyRate;
  final double daysWorked, earned, advancesRecovered, netPayable;

  HrSettlementLine({
    this.memberId,
    required this.memberName,
    this.memberRole,
    this.dailyRate,
    required this.daysWorked,
    required this.earned,
    required this.advancesRecovered,
    required this.netPayable,
  });

  factory HrSettlementLine.fromJson(Map<String, dynamic> j) => HrSettlementLine(
        memberId: _str(j['memberId']),
        memberName: _strOr(j['memberName'], '—'),
        memberRole: _str(j['memberRole']),
        dailyRate: _numOrNull(j['dailyRate']),
        daysWorked: _num(j['daysWorked']),
        earned: _num(j['earned']),
        advancesRecovered: _num(j['advancesRecovered']),
        netPayable: _num(j['netPayable']),
      );
}

/// Running position: earned so far, less what has been advanced.
class HrContractBalance {
  final DateTime throughDate;
  final double earned, advancesPaid, netPayable;
  final bool isOpenEnded;
  final List<HrSettlementLine> lines;

  HrContractBalance({
    required this.throughDate,
    required this.earned,
    required this.advancesPaid,
    required this.netPayable,
    required this.isOpenEnded,
    required this.lines,
  });

  factory HrContractBalance.fromJson(Map<String, dynamic> j) => HrContractBalance(
        throughDate: _dt(j['throughDate']) ?? DateTime.now(),
        earned: _num(j['earned']),
        advancesPaid: _num(j['advancesPaid']),
        netPayable: _num(j['netPayable']),
        isOpenEnded: _bool(j['isOpenEnded']),
        lines: _list(j['lines'], HrSettlementLine.fromJson),
      );

  static HrContractBalance empty() => HrContractBalance(
        throughDate: DateTime.now(),
        earned: 0,
        advancesPaid: 0,
        netPayable: 0,
        isOpenEnded: false,
        lines: const [],
      );
}

class HrSettlement {
  final String id, settlementNumber;
  final DateTime fromDate, toDate;
  final double earned, advancesRecovered, otherDeductions, netPayable;

  /// 'draft' | 'approved' | 'paid' | 'cancelled'
  final String status;
  final List<HrSettlementLine> lines;

  HrSettlement({
    required this.id,
    required this.settlementNumber,
    required this.fromDate,
    required this.toDate,
    required this.earned,
    required this.advancesRecovered,
    required this.otherDeductions,
    required this.netPayable,
    required this.status,
    this.lines = const [],
  });

  factory HrSettlement.fromJson(Map<String, dynamic> j) => HrSettlement(
        id: _strOr(j['id'], ''),
        settlementNumber: _strOr(j['settlementNumber'], ''),
        fromDate: _dt(j['fromDate']) ?? DateTime.now(),
        toDate: _dt(j['toDate']) ?? DateTime.now(),
        earned: _num(j['earned']),
        advancesRecovered: _num(j['advancesRecovered']),
        otherDeductions: _num(j['otherDeductions']),
        netPayable: _num(j['netPayable']),
        status: _strOr(j['status'], 'draft'),
        lines: _list(j['lines'], HrSettlementLine.fromJson),
      );
}

class HrContract {
  final String id, contractNumber, name, leadPersonName, contractType, status;
  final String? leadPersonPhone, notes;
  final double? fixedAmount;
  final DateTime startDate;

  /// Null on open-ended work — the term runs until it is done.
  final DateTime? endDate;

  /// List rows only.
  final int memberCount;
  final double earnedToDate, advancesPaidTotal, outstanding;

  /// Detail only.
  final List<HrContractMember> members;
  final List<HrAdvance> advances;
  final List<HrSettlement> settlements;
  final List<HrContractDay> dayLog;
  final HrContractBalance? balance;

  HrContract({
    required this.id,
    required this.contractNumber,
    required this.name,
    required this.leadPersonName,
    this.leadPersonPhone,
    required this.contractType,
    this.fixedAmount,
    required this.startDate,
    this.endDate,
    required this.status,
    this.notes,
    this.memberCount = 0,
    this.earnedToDate = 0,
    this.advancesPaidTotal = 0,
    this.outstanding = 0,
    this.members = const [],
    this.advances = const [],
    this.settlements = const [],
    this.dayLog = const [],
    this.balance,
  });

  bool get isActive => status == 'active';
  bool get isOpenEnded => endDate == null;
  bool get isTask => contractType == 'task_lumpsum';
  bool get isCrew => contractType == 'crew_daily';

  /// A task contract has no days to track; the other two do.
  bool get hasCalendar => !isTask;

  /// The settlement occupying this contract's single slot, if any.
  HrSettlement? get liveSettlement {
    for (final s in settlements) {
      if (s.status != 'cancelled') return s;
    }
    return null;
  }

  /// Advances still to be recovered.
  List<HrAdvance> get livePaidAdvances =>
      advances.where((a) => a.status == 'paid').toList();

  factory HrContract.fromJson(Map<String, dynamic> j) => HrContract(
        id: _strOr(j['id'], ''),
        contractNumber: _strOr(j['contractNumber'], ''),
        name: _strOr(j['name'], '—'),
        leadPersonName: _strOr(j['leadPersonName'], '—'),
        leadPersonPhone: _str(j['leadPersonPhone']),
        contractType: _strOr(j['contractType'], 'solo_daily'),
        fixedAmount: _numOrNull(j['fixedAmount']),
        startDate: _dt(j['startDate']) ?? DateTime.now(),
        endDate: _dt(j['endDate']),
        status: _strOr(j['status'], 'active'),
        notes: _str(j['notes']),
        memberCount: _int(j['memberCount']),
        earnedToDate: _num(j['earnedToDate']),
        advancesPaidTotal: _num(j['advancesPaid']),
        outstanding: _num(j['outstanding']),
        members: _list(j['members'], HrContractMember.fromJson),
        advances: _list(j['advances'], HrAdvance.fromJson),
        settlements: _list(j['settlements'], HrSettlement.fromJson),
        dayLog: _list(j['dayLog'], HrContractDay.fromJson),
        balance: j['balance'] is Map<String, dynamic>
            ? HrContractBalance.fromJson(j['balance'] as Map<String, dynamic>)
            : null,
      );
}

/// Live settlement figures, recomputed server-side on every fetch.
class HrSettlementPreview {
  final String contractNumber, name, leadPersonName, contractType;
  final DateTime fromDate, throughDate;
  final bool isOpenEnded;
  final double earned, advancesRecovered, otherDeductions, netPayable;
  final List<HrSettlementLine> lines;
  final List<String> warnings;

  HrSettlementPreview({
    required this.contractNumber,
    required this.name,
    required this.leadPersonName,
    required this.contractType,
    required this.fromDate,
    required this.throughDate,
    required this.isOpenEnded,
    required this.earned,
    required this.advancesRecovered,
    required this.otherDeductions,
    required this.netPayable,
    required this.lines,
    required this.warnings,
  });

  /// The server refuses to draft either of these.
  bool get isEmpty => earned <= 0;
  bool get isNegative => netPayable < 0;

  factory HrSettlementPreview.fromJson(Map<String, dynamic> j) => HrSettlementPreview(
        contractNumber: _strOr(j['contractNumber'], ''),
        name: _strOr(j['name'], '—'),
        leadPersonName: _strOr(j['leadPersonName'], '—'),
        contractType: _strOr(j['contractType'], 'solo_daily'),
        fromDate: _dt(j['fromDate']) ?? DateTime.now(),
        throughDate: _dt(j['throughDate']) ?? DateTime.now(),
        isOpenEnded: _bool(j['isOpenEnded']),
        earned: _num(j['earned']),
        advancesRecovered: _num(j['advancesRecovered']),
        otherDeductions: _num(j['otherDeductions']),
        netPayable: _num(j['netPayable']),
        lines: _list(j['lines'], HrSettlementLine.fromJson),
        warnings: _stringList(j['warnings']),
      );
}
