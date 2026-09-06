/// Models for the open cycle's running balance (GET /payouts/running) — what a
/// farmer or VMCC would be paid if the cycle were billed today. Kept out of
/// mp_models.dart, which is already long enough.
library;

double _d(Object? v) => v == null
    ? 0
    : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);
int _i(Object? v) =>
    v == null ? 0 : (v is num ? v.toInt() : int.tryParse(v.toString()) ?? 0);
String _s(Object? v) => (v ?? '').toString();
String? _sn(Object? v) => v?.toString();

/// The three debt buckets, in the order a cycle recovers them.
class MpOwedSplit {
  final double farmerSale, advance, feedLoan;
  /// Milk refused for quality. Its own bucket: lumping it into `advance` made
  /// a farmer's payment read "Advance recovery" for money taken off because
  /// their milk was sent back — wrong, and the most alarming reading available.
  final double qualityRejection;
  const MpOwedSplit({
    required this.farmerSale,
    required this.advance,
    this.qualityRejection = 0,
    required this.feedLoan,
  });

  static const zero = MpOwedSplit(farmerSale: 0, advance: 0, feedLoan: 0, qualityRejection: 0);

  double get total => farmerSale + advance + feedLoan + qualityRejection;

  factory MpOwedSplit.fromJson(Map<String, dynamic>? j) => j == null
      ? zero
      : MpOwedSplit(
          farmerSale: _d(j['farmerSale']),
          advance: _d(j['advance']),
          qualityRejection: _d(j['qualityRejection']),
          feedLoan: _d(j['feedLoan']),
        );
}

/// One farmer's position in the window still being collected into.
class MpRunningFarmer {
  final String farmerId, farmerName, farmerCode;
  final String? vmccNodeId;
  final double qtyLitres, gross, netPayable;

  /// Everything still owed, whether or not this cycle's gross can cover it.
  final MpOwedSplit outstanding;

  /// The slice of [outstanding] this cycle actually recovers.
  final MpOwedSplit deductions;

  MpRunningFarmer({
    required this.farmerId,
    required this.farmerName,
    required this.farmerCode,
    required this.vmccNodeId,
    required this.qtyLitres,
    required this.gross,
    required this.netPayable,
    required this.outstanding,
    required this.deductions,
  });

  /// Owed more than the milk covers — the rest rolls to the next cycle.
  bool get fullyAbsorbed => netPayable == 0 && gross > 0;

  factory MpRunningFarmer.fromJson(Map<String, dynamic> j) => MpRunningFarmer(
        farmerId: _s(j['farmerId']),
        farmerName: _s(j['farmerName']),
        farmerCode: _s(j['farmerCode']),
        vmccNodeId: _sn(j['vmccNodeId']),
        qtyLitres: _d(j['qtyLitres']),
        gross: _d(j['gross']),
        netPayable: _d(j['netPayable']),
        outstanding: MpOwedSplit.fromJson(j['outstanding'] as Map<String, dynamic>?),
        deductions: MpOwedSplit.fromJson(j['deductions'] as Map<String, dynamic>?),
      );
}

/// One VMCC's running settlement under a CC — milk plus its operator's comp.
class MpRunningVmcc {
  final String vmccNodeId, vmccName, vmccCode;
  final double qtyLitres, milkCost, commission, salary, rent, total;
  final int farmerCount;

  MpRunningVmcc({
    required this.vmccNodeId,
    required this.vmccName,
    required this.vmccCode,
    required this.qtyLitres,
    required this.milkCost,
    required this.commission,
    required this.salary,
    required this.rent,
    required this.total,
    required this.farmerCount,
  });

  double get operatorComp => commission + salary + rent;

  factory MpRunningVmcc.fromJson(Map<String, dynamic> j) => MpRunningVmcc(
        vmccNodeId: _s(j['vmccNodeId']),
        vmccName: _s(j['vmccName']),
        vmccCode: _s(j['vmccCode']),
        qtyLitres: _d(j['qtyLitres']),
        milkCost: _d(j['milkCost']),
        commission: _d(j['commission']),
        salary: _d(j['salary']),
        rent: _d(j['rent']),
        total: _d(j['total']),
        farmerCount: _i(j['farmerCount']),
      );
}

class MpRunningTotals {
  final double qtyLitres, gross, deductionTotal, netPayable;

  /// Operator commission/salary/rent settled on the same bill. CC-level only —
  /// a VMCC's own card is milk and dues, nothing else.
  final double operatorComp;
  final int farmerCount;

  const MpRunningTotals({
    required this.qtyLitres,
    required this.gross,
    required this.deductionTotal,
    required this.operatorComp,
    required this.netPayable,
    required this.farmerCount,
  });

  static const zero = MpRunningTotals(
      qtyLitres: 0,
      gross: 0,
      deductionTotal: 0,
      operatorComp: 0,
      netPayable: 0,
      farmerCount: 0);

  factory MpRunningTotals.fromJson(Map<String, dynamic>? j) => j == null
      ? zero
      : MpRunningTotals(
          qtyLitres: _d(j['qtyLitres']),
          gross: _d(j['gross']),
          deductionTotal: _d(j['deductionTotal']),
          operatorComp: _d(j['operatorComp']),
          netPayable: _d(j['netPayable']),
          farmerCount: _i(j['farmerCount']),
        );
}

class MpRunningBalance {
  /// null = the tenant has no cycle cadence configured, so there is no window.
  final String? periodStart, periodEnd;
  final int? cycleDays;

  /// Set once a cycle row exists for this window.
  final String? cycleId, cycleStatus;

  /// The cycle is locked/paid, so these numbers come off the generated lines
  /// rather than a live recompute — they will not move again.
  final bool frozen;

  final List<MpRunningFarmer> farmers;
  final List<MpRunningVmcc> vmccs;
  final MpRunningTotals totals;

  MpRunningBalance({
    required this.periodStart,
    required this.periodEnd,
    required this.cycleDays,
    required this.cycleId,
    required this.cycleStatus,
    required this.frozen,
    required this.farmers,
    required this.vmccs,
    required this.totals,
  });

  bool get hasWindow => periodStart != null && periodEnd != null;

  /// The single farmer row, when the call was narrowed to one.
  MpRunningFarmer? get soleFarmer => farmers.isEmpty ? null : farmers.first;

  factory MpRunningBalance.fromJson(Map<String, dynamic> j) => MpRunningBalance(
        periodStart: _sn(j['periodStart']),
        periodEnd: _sn(j['periodEnd']),
        cycleDays: j['cycleDays'] == null ? null : _i(j['cycleDays']),
        cycleId: _sn(j['cycleId']),
        cycleStatus: _sn(j['cycleStatus']),
        frozen: j['frozen'] == true,
        farmers: ((j['farmers'] as List?) ?? const [])
            .map((e) => MpRunningFarmer.fromJson(e as Map<String, dynamic>))
            .toList(),
        vmccs: ((j['vmccs'] as List?) ?? const [])
            .map((e) => MpRunningVmcc.fromJson(e as Map<String, dynamic>))
            .toList(),
        totals: MpRunningTotals.fromJson(j['totals'] as Map<String, dynamic>?),
      );
}
