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

/// A stretch where the whole job stopped — rain, a stalled site, a festival.
/// `toDate` null means it is still stopped and nobody has said when work
/// restarts; resuming stamps the day before the first day back.
class HrContractPause {
  final String id;
  final DateTime fromDate;
  final DateTime? toDate;
  final String? reason;

  /// Resume responses only: the pause covered no days and was deleted.
  final bool removed;

  HrContractPause({
    required this.id,
    required this.fromDate,
    this.toDate,
    this.reason,
    this.removed = false,
  });

  bool coversDay(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    final from = DateTime(fromDate.year, fromDate.month, fromDate.day);
    if (day.isBefore(from)) return false;
    if (toDate == null) return true;
    final to = DateTime(toDate!.year, toDate!.month, toDate!.day);
    return !day.isAfter(to);
  }

  factory HrContractPause.fromJson(Map<String, dynamic> j) => HrContractPause(
        id: _strOr(j['id'], ''),
        fromDate: _dt(j['fromDate']) ?? DateTime.now(),
        toDate: _dt(j['toDate']),
        reason: _str(j['reason']),
        removed: _bool(j['removed']),
      );
}

/// Where the work stands today, derived server-side from the pause windows.
/// `pause_scheduled` is a pause booked ahead — still running until then.
class HrPauseState {
  /// 'running' | 'paused' | 'pause_scheduled'
  final String state;
  final DateTime? since, until;
  final String? reason;

  const HrPauseState({required this.state, this.since, this.until, this.reason});

  static const running = HrPauseState(state: 'running');

  bool get isPaused => state == 'paused';
  bool get isScheduled => state == 'pause_scheduled';

  factory HrPauseState.fromJson(Map<String, dynamic>? j) {
    if (j == null) return running;
    return HrPauseState(
      state: _strOr(j['state'], 'running'),
      // 'paused' carries `since`; 'pause_scheduled' carries `from`.
      since: _dt(j['since']) ?? _dt(j['from']),
      until: _dt(j['until']),
      reason: _str(j['reason']),
    );
  }
}

/// Money handed over against a settlement. A crew is paid as the cash comes
/// in, so a settlement can carry several of these.
class HrSettlementPayment {
  final String id;
  final double amount;
  final DateTime paymentDate;
  final String paymentMethod;
  final String? reference, notes;
  final DateTime? voidedAt;

  HrSettlementPayment({
    required this.id,
    required this.amount,
    required this.paymentDate,
    required this.paymentMethod,
    this.reference,
    this.notes,
    this.voidedAt,
  });

  bool get isVoided => voidedAt != null;

  factory HrSettlementPayment.fromJson(Map<String, dynamic> j) => HrSettlementPayment(
        id: _strOr(j['id'], ''),
        amount: _num(j['amount']),
        paymentDate: _dt(j['paymentDate']) ?? DateTime.now(),
        paymentMethod: _strOr(j['paymentMethod'], 'bank_transfer'),
        reference: _str(j['reference']),
        notes: _str(j['notes']),
        voidedAt: _dt(j['voidedAt']),
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

  /// Days in the priced window the job was stopped, already excluded above.
  final int pausedDays;

  /// Days actually worked so far, net of leave, half days and pauses. On a
  /// crew this is the sum across everyone — man-days, not calendar days.
  final double daysWorked;

  /// What was taken out to get there.
  final int leaveDays, halfDays;
  final List<HrSettlementLine> lines;

  HrContractBalance({
    required this.throughDate,
    required this.earned,
    required this.advancesPaid,
    required this.netPayable,
    required this.isOpenEnded,
    this.pausedDays = 0,
    this.daysWorked = 0,
    this.leaveDays = 0,
    this.halfDays = 0,
    required this.lines,
  });

  /// Says why the count is short of the calendar — the immediate follow-up
  /// question whenever it is. Empty when nothing was taken out.
  String get excludedNote {
    final parts = <String>[
      if (leaveDays > 0) '$leaveDays leave',
      if (halfDays > 0) '$halfDays half',
      if (pausedDays > 0) '$pausedDays paused',
    ];
    return parts.join(', ');
  }

  factory HrContractBalance.fromJson(Map<String, dynamic> j) => HrContractBalance(
        throughDate: _dt(j['throughDate']) ?? DateTime.now(),
        earned: _num(j['earned']),
        advancesPaid: _num(j['advancesPaid']),
        netPayable: _num(j['netPayable']),
        isOpenEnded: _bool(j['isOpenEnded']),
        pausedDays: _int(j['pausedDays']),
        daysWorked: _num(j['daysWorked']),
        leaveDays: _int(j['leaveDays']),
        halfDays: _int(j['halfDays']),
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

  /// Disbursed so far. Short of `netPayable` means part-paid — the status
  /// stays 'approved' until the two meet.
  final double amountPaid;

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
    this.amountPaid = 0,
    required this.status,
    this.lines = const [],
  });

  /// What is still to be handed over. Never negative.
  double get amountDue {
    final due = netPayable - amountPaid;
    return due > 0 ? due : 0;
  }

  bool get isPartlyPaid => amountPaid > 0 && amountDue > 0;

  /// Payable, and someone has to hand the money over.
  bool get awaitsPayment => status == 'approved' && amountDue > 0;

  factory HrSettlement.fromJson(Map<String, dynamic> j) => HrSettlement(
        id: _strOr(j['id'], ''),
        settlementNumber: _strOr(j['settlementNumber'], ''),
        fromDate: _dt(j['fromDate']) ?? DateTime.now(),
        toDate: _dt(j['toDate']) ?? DateTime.now(),
        earned: _num(j['earned']),
        advancesRecovered: _num(j['advancesRecovered']),
        otherDeductions: _num(j['otherDeductions']),
        netPayable: _num(j['netPayable']),
        amountPaid: _num(j['amountPaid']),
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

  /// Where the work stands today. Present on both list and detail.
  final HrPauseState pauseState;

  /// Detail only.
  final List<HrContractMember> members;
  final List<HrAdvance> advances;
  final List<HrSettlement> settlements;
  final List<HrContractDay> dayLog;
  final List<HrContractPause> pauses;
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
    HrPauseState? pauseState,
    this.members = const [],
    this.advances = const [],
    this.settlements = const [],
    this.dayLog = const [],
    this.pauses = const [],
    this.balance,
  }) : pauseState = pauseState ?? HrPauseState.running;

  bool get isActive => status == 'active';

  /// Paused is not a status of its own — the contract is still active, it
  /// just is not accruing today.
  bool get isPausedNow => isActive && pauseState.isPaused;

  /// Terms and pauses freeze once a settlement exists.
  bool get canChangePauses => isActive && liveSettlement == null;

  /// Is a day inside a pause? Used by the calendar, which must not read a
  /// stopped day as worked.
  bool isPausedOn(DateTime d) => pauses.any((p) => p.coversDay(d));
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
        pauses: _list(j['pauses'], HrContractPause.fromJson),
        pauseState: HrPauseState.fromJson(
          j['pauseState'] is Map<String, dynamic>
              ? j['pauseState'] as Map<String, dynamic>
              : null,
        ),
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

  /// Paused days already excluded from `earned`.
  final int pausedDays;
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
    this.pausedDays = 0,
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
        pausedDays: _int(j['pausedDays']),
        lines: _list(j['lines'], HrSettlementLine.fromJson),
        warnings: _stringList(j['warnings']),
      );
}
