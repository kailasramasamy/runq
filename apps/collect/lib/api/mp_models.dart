// Data models for the milk-procurement API. Field names + shapes mirror
// apps/web/src/hooks/queries/use-milk-procurement.ts (the canonical contract).
// The API returns Drizzle numeric columns as STRINGS — we parse to double at
// the edge so the UI only ever deals with numbers.

double _d(Object? v) => v == null
    ? 0
    : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);
double? _dn(Object? v) => v == null
    ? null
    : (v is num ? v.toDouble() : double.tryParse(v.toString()));
int _i(Object? v) =>
    v == null ? 0 : (v is num ? v.toInt() : int.tryParse(v.toString()) ?? 0);
bool _b(Object? v) => v == true;
String _s(Object? v) => (v ?? '').toString();
String? _sn(Object? v) => v?.toString();

enum MilkType { cow, buffalo, mixed, cowA1, cowA2 }

MilkType milkTypeFrom(String? s) => switch (s) {
  'cow_a1' => MilkType.cowA1,
  'cow_a2' => MilkType.cowA2,
  'buffalo' => MilkType.buffalo,
  'mixed' => MilkType.mixed,
  'cow' => MilkType.cow,
  _ => MilkType.cowA1,
};

String milkTypeLabel(MilkType m) => switch (m) {
  MilkType.cowA1 => 'Cow A1 (regular)',
  MilkType.cowA2 => 'Cow A2 (desi)',
  MilkType.buffalo => 'Buffalo',
  MilkType.mixed => 'Mixed',
  MilkType.cow => 'Cow (legacy)',
};

String milkTypeToApi(MilkType m) => switch (m) {
  MilkType.cowA1 => 'cow_a1',
  MilkType.cowA2 => 'cow_a2',
  MilkType.buffalo => 'buffalo',
  MilkType.mixed => 'mixed',
  MilkType.cow => 'cow',
};

enum Shift { am, pm }

Shift shiftFrom(String? s) => s == 'pm' ? Shift.pm : Shift.am;

/// Quality grade — drives the green/amber/red semantic everywhere.
enum Grade { a, b, c, unknown }

Grade gradeFrom(String? s) {
  switch (s) {
    case 'a':
      return Grade.a;
    case 'b':
      return Grade.b;
    case 'c':
      return Grade.c;
    default:
      return Grade.unknown;
  }
}

class MpNode {
  final String id, code, name, nodeType;
  final String? parentNodeId, payeeVendorId, payoutMode, city, state;
  final bool hasBmc, isActive;
  /// How this node closes collection and dispatches:
  ///  - `per_shift` — AM and PM close and dispatch independently (shift-tagged)
  ///  - `day`       — today AM + PM leave as one untagged tanker
  ///  - `overnight` — previous-day PM + today AM leave together; today's PM
  ///    belongs to the next pool
  /// Set on VMCCs and CCs alike.
  final String dispatchMode;
  final double? capacityLitres;
  final DateTime? createdAt;
  /// `'analyzer'` (default, fat+SNF) or `'lactometer'` (CLR-only).
  final String measurementMode;
  /// Which shifts this VMCC collects in: `'both'` (default) | `'am'` | `'pm'`.
  final String collectionShifts;
  /// Null = legacy / all types allowed. Otherwise restricts selectable types.
  final List<MilkType>? allowedMilkTypes;
  /// Node-level default milk type for new pours. Null = no preference.
  final MilkType? defaultMilkType;

  MpNode({
    required this.id,
    required this.code,
    required this.name,
    required this.nodeType,
    this.parentNodeId,
    this.payeeVendorId,
    this.payoutMode,
    this.city,
    this.state,
    this.hasBmc = false,
    this.isActive = true,
    this.dispatchMode = 'per_shift',
    this.capacityLitres,
    this.createdAt,
    this.measurementMode = 'analyzer',
    this.collectionShifts = 'both',
    this.allowedMilkTypes,
    this.defaultMilkType,
  });

  bool get isVmcc => nodeType == 'vmcc';
  bool get isCc => nodeType == 'cc';
  bool get isPp => nodeType == 'pp';
  bool get isLactometer => measurementMode == 'lactometer';

  /// Milk leaves as one untagged tanker (`day` / `overnight`) rather than one
  /// consignment per shift. Drives whether the UI offers a shift selector at all.
  bool get isPooledDispatch => dispatchMode != 'per_shift';
  bool get isOvernightPool => dispatchMode == 'overnight';

  /// The single milk type used to colour aggregate (mixed) FAT/SNF values at
  /// this node: explicit default, else the sole/first allowed type, else Cow A1.
  MilkType get effectiveMilkType =>
      defaultMilkType ??
      ((allowedMilkTypes != null && allowedMilkTypes!.isNotEmpty)
          ? allowedMilkTypes!.first
          : MilkType.cowA1);

  /// Whether this VMCC collects in the given shift ('am' | 'pm').
  bool collectsShift(String shift) => collectionShifts == 'both' || collectionShifts == shift;

  factory MpNode.fromJson(Map<String, dynamic> j) => MpNode(
    id: _s(j['id']),
    code: _s(j['code']),
    name: _s(j['name']),
    nodeType: _s(j['nodeType']),
    parentNodeId: _sn(j['parentNodeId']),
    payeeVendorId: _sn(j['payeeVendorId']),
    payoutMode: _sn(j['payoutMode']),
    city: _sn(j['city']),
    state: _sn(j['state']),
    hasBmc: _b(j['hasBmc']),
    isActive: j['isActive'] != false,
    dispatchMode: switch (j['dispatchMode']) {
      'day' => 'day',
      'overnight' => 'overnight',
      _ => 'per_shift',
    },
    capacityLitres: _dn(j['capacityLitres']),
    createdAt: j['createdAt'] == null
        ? null
        : DateTime.tryParse(j['createdAt'].toString()),
    measurementMode: j['measurementMode'] == 'lactometer' ? 'lactometer' : 'analyzer',
    collectionShifts: switch (j['collectionShifts']) { 'am' => 'am', 'pm' => 'pm', _ => 'both' },
    allowedMilkTypes: (j['allowedMilkTypes'] as List?)
        ?.map((e) => milkTypeFrom(e as String?))
        .toList(),
    defaultMilkType: j['defaultMilkType'] == null
        ? null
        : milkTypeFrom(j['defaultMilkType'] as String?),
  );
}

/// One herd row from the farmer profile (cattle_breeds JSON).
class MpBreedCount {
  const MpBreedCount({required this.breed, required this.count});
  final String breed;
  final int count;

  factory MpBreedCount.fromJson(Map<String, dynamic> j) =>
      MpBreedCount(breed: _s(j['breed']), count: _i(j['count']));
}

class MpFarmer {
  final String id, code, name, vendorId;
  /// Native-script (regional-language) name for RL display; null = use [name].
  final String? nameNative;
  final bool nameNativeVerified;
  final String? phone, village, address, aadhaar;
  final String? bankAccountName, bankAccountNumber, bankIfsc, bankName, upiId;
  /// Stored profile-photo attachment id; non-null when a photo exists.
  final String? photoDocId;
  final double? lat, lng;
  final bool isSociety, isActive;
  final MilkType defaultMilkType;
  final List<MpBreedCount> cattleBreeds;
  final int? cattleCount, inMilkCount;
  final DateTime? createdAt;
  final String? primaryNodeId, primaryNodeName;

  MpFarmer({
    required this.id,
    required this.code,
    required this.name,
    required this.vendorId,
    this.nameNative,
    this.nameNativeVerified = false,
    this.photoDocId,
    this.phone,
    this.village,
    this.address,
    this.aadhaar,
    this.bankAccountName,
    this.bankAccountNumber,
    this.bankIfsc,
    this.bankName,
    this.upiId,
    this.lat,
    this.lng,
    this.isSociety = false,
    this.isActive = true,
    this.defaultMilkType = MilkType.cowA1,
    this.cattleBreeds = const [],
    this.cattleCount,
    this.inMilkCount,
    this.createdAt,
    this.primaryNodeId,
    this.primaryNodeName,
  });

  /// True when this farmer has a stored profile photo to display.
  bool get hasPhoto => (photoDocId ?? '').isNotEmpty;

  /// First two initials for the avatar atom.
  String get initials {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  factory MpFarmer.fromJson(Map<String, dynamic> j) => MpFarmer(
    id: _s(j['id']),
    code: _s(j['code']),
    name: _s(j['name']),
    vendorId: _s(j['vendorId']),
    nameNative: _sn(j['nameNative']),
    nameNativeVerified: _b(j['nameNativeVerified']),
    photoDocId: _sn(j['photoDocId']),
    phone: _sn(j['phone']),
    village: _sn(j['village']),
    address: _sn(j['address']),
    aadhaar: _sn(j['aadhaar']),
    bankAccountName: _sn(j['bankAccountName']),
    bankAccountNumber: _sn(j['bankAccountNumber']),
    bankIfsc: _sn(j['bankIfsc']),
    bankName: _sn(j['bankName']),
    upiId: _sn(j['upiId']),
    lat: _dn(j['lat']),
    lng: _dn(j['lng']),
    isSociety: _b(j['isSociety']),
    isActive: j['isActive'] != false,
    defaultMilkType: milkTypeFrom(j['defaultMilkType'] as String?),
    cattleBreeds: (j['cattleBreeds'] as List?)
            ?.map((e) => MpBreedCount.fromJson(e as Map<String, dynamic>))
            .toList() ??
        const [],
    cattleCount: j['cattleCount'] == null ? null : _i(j['cattleCount']),
    inMilkCount: j['inMilkCount'] == null ? null : _i(j['inMilkCount']),
    createdAt: j['createdAt'] == null
        ? null
        : DateTime.tryParse(j['createdAt'].toString()),
    primaryNodeId: _sn(j['primaryNodeId']),
    primaryNodeName: _sn(j['primaryNodeName']),
  );
}

/// Result of `GET /rate-charts/resolve` — note: rates here are JSON numbers.
/// [grade] may be null for lactometer (CLR-only) nodes where no quality grade
/// is derived.
class MpRateResolution {
  final String rateChartId;
  final double baseRatePerLitre, bonusPerLitre, ratePerLitre;
  final Grade? grade;

  MpRateResolution({
    required this.rateChartId,
    required this.baseRatePerLitre,
    required this.bonusPerLitre,
    required this.ratePerLitre,
    this.grade,
  });

  factory MpRateResolution.fromJson(Map<String, dynamic> j) => MpRateResolution(
    rateChartId: _s(j['rateChartId']),
    baseRatePerLitre: _d(j['baseRatePerLitre']),
    bonusPerLitre: _d(j['bonusPerLitre']),
    ratePerLitre: _d(j['ratePerLitre']),
    grade: j['grade'] == null ? null : gradeFrom(j['grade'] as String?),
  );
}

class MpRateChart {
  final String id, name;
  final MilkType milkType;
  final String pricingMode; // matrix | flat
  final double? flatRatePerLitre;
  final String? scopeNodeId, season, effectiveFrom, effectiveTo;
  final bool isActive;

  MpRateChart({
    required this.id,
    required this.name,
    required this.milkType,
    required this.pricingMode,
    this.flatRatePerLitre,
    this.scopeNodeId,
    this.season,
    this.effectiveFrom,
    this.effectiveTo,
    this.isActive = true,
  });

  factory MpRateChart.fromJson(Map<String, dynamic> j) => MpRateChart(
    id: _s(j['id']),
    name: _s(j['name']),
    milkType: milkTypeFrom(j['milkType'] as String?),
    pricingMode: _s(j['pricingMode']),
    flatRatePerLitre: _dn(j['flatRatePerLitre']),
    scopeNodeId: _sn(j['scopeNodeId']),
    season: _sn(j['season']),
    effectiveFrom: _sn(j['effectiveFrom']),
    effectiveTo: _sn(j['effectiveTo']),
    isActive: j['isActive'] != false,
  );
}

class MpRateCell {
  final String id;
  final double fat, snf, ratePerLitre;
  /// Set on CLR (lactometer) chart cells; fat/snf are 0 for those.
  final double? clr;
  MpRateCell({
    required this.id,
    required this.fat,
    required this.snf,
    required this.ratePerLitre,
    this.clr,
  });
  factory MpRateCell.fromJson(Map<String, dynamic> j) => MpRateCell(
    id: _s(j['id']),
    fat: _d(j['fat']),
    snf: _d(j['snf']),
    ratePerLitre: _d(j['ratePerLitre']),
    clr: _dn(j['clr']),
  );
}

class MpRateRule {
  final String id, ruleType;
  final String? grade;
  final double? minQty, maxQty;
  final double bonusPerLitre;
  MpRateRule({
    required this.id,
    required this.ruleType,
    this.grade,
    this.minQty,
    this.maxQty,
    required this.bonusPerLitre,
  });
  factory MpRateRule.fromJson(Map<String, dynamic> j) => MpRateRule(
    id: _s(j['id']),
    ruleType: _s(j['ruleType']),
    grade: _sn(j['grade']),
    minQty: _dn(j['minQty']),
    maxQty: _dn(j['maxQty']),
    bonusPerLitre: _d(j['bonusPerLitre']),
  );
}

class MpRateChartDetail {
  final MpRateChart chart;
  final List<MpRateCell> cells;
  final List<MpRateRule> rules;
  MpRateChartDetail({
    required this.chart,
    required this.cells,
    required this.rules,
  });
  factory MpRateChartDetail.fromJson(Map<String, dynamic> j) =>
      MpRateChartDetail(
        chart: MpRateChart.fromJson(j),
        cells: ((j['cells'] as List?) ?? [])
            .map((e) => MpRateCell.fromJson(e as Map<String, dynamic>))
            .toList(),
        rules: ((j['rules'] as List?) ?? [])
            .map((e) => MpRateRule.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class MpPour {
  final String id, nodeId, farmerId, collectionDate;
  final Shift shift;
  final MilkType milkType;
  final double qtyLitres, ratePerLitre, lineAmount;
  // Server splits lineAmount = baseAmount + bonusAmount (rate is base+bonus).
  final double baseAmount, bonusAmount;
  final double? fat, snf, clr, water;
  final Grade qualityGrade;
  final String? receiptNo;
  final String status; // recorded | reversed

  MpPour({
    required this.id,
    required this.nodeId,
    required this.farmerId,
    required this.collectionDate,
    required this.shift,
    required this.milkType,
    required this.qtyLitres,
    required this.ratePerLitre,
    required this.lineAmount,
    this.baseAmount = 0,
    this.bonusAmount = 0,
    this.fat,
    this.snf,
    this.clr,
    this.water,
    this.qualityGrade = Grade.unknown,
    this.receiptNo,
    this.status = 'recorded',
  });

  factory MpPour.fromJson(Map<String, dynamic> j) => MpPour(
    id: _s(j['id']),
    nodeId: _s(j['nodeId']),
    farmerId: _s(j['farmerId']),
    collectionDate: _s(j['collectionDate']),
    shift: shiftFrom(j['shift'] as String?),
    milkType: milkTypeFrom(j['milkType'] as String?),
    qtyLitres: _d(j['qtyLitres']),
    ratePerLitre: _d(j['ratePerLitre']),
    lineAmount: _d(j['lineAmount']),
    baseAmount: _d(j['baseAmount']),
    bonusAmount: _d(j['bonusAmount']),
    fat: _dn(j['fat']),
    snf: _dn(j['snf']),
    clr: _dn(j['clr']),
    water: _dn(j['water']),
    qualityGrade: gradeFrom(j['qualityGrade'] as String?),
    receiptNo: _sn(j['receiptNo']),
    status: _s(j['status']),
  );
}

class MpCollectionSummary {
  final String? nodeId;
  final String from, to;
  final double totalQty, amQty, pmQty, avgFat, avgSnf, avgWater, grossAmount;
  // Per-shift qty-weighted QC + effective ₹/L, straight from the report rollup.
  final double amFat, pmFat, amSnf, pmSnf, amWater, pmWater, amRate, pmRate;
  final int pourCount, farmerCount;
  final List<MpMilkTypeSummary> byMilkType;
  final List<MpNodeSummary> byCc;

  MpCollectionSummary({
    this.nodeId,
    required this.from,
    required this.to,
    required this.totalQty,
    required this.amQty,
    required this.pmQty,
    required this.avgFat,
    required this.avgSnf,
    required this.avgWater,
    required this.grossAmount,
    required this.amFat,
    required this.pmFat,
    required this.amSnf,
    required this.pmSnf,
    required this.amWater,
    required this.pmWater,
    required this.amRate,
    required this.pmRate,
    required this.pourCount,
    required this.farmerCount,
    this.byMilkType = const [],
    this.byCc = const [],
  });

  factory MpCollectionSummary.fromJson(Map<String, dynamic> j) =>
      MpCollectionSummary(
        nodeId: _sn(j['nodeId']),
        from: _s(j['from']),
        to: _s(j['to']),
        totalQty: _d(j['totalQty']),
        amQty: _d(j['amQty']),
        pmQty: _d(j['pmQty']),
        avgFat: _d(j['avgFat']),
        avgSnf: _d(j['avgSnf']),
        avgWater: _d(j['avgWater']),
        grossAmount: _d(j['grossAmount']),
        amFat: _d(j['amFat']),
        pmFat: _d(j['pmFat']),
        amSnf: _d(j['amSnf']),
        pmSnf: _d(j['pmSnf']),
        amWater: _d(j['amWater']),
        pmWater: _d(j['pmWater']),
        amRate: _d(j['amRate']),
        pmRate: _d(j['pmRate']),
        pourCount: _i(j['pourCount']),
        farmerCount: _i(j['farmerCount']),
        byMilkType: (j['byMilkType'] as List<dynamic>? ?? const [])
            .map((e) => MpMilkTypeSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        byCc: (j['byCc'] as List<dynamic>? ?? const [])
            .map((e) => MpNodeSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// One node (chilling centre) slice of a collection summary — total qty plus
/// qty-weighted avg fat/SNF/water. Backs the admin home per-CC breakdown.
class MpNodeSummary {
  final String nodeId, nodeName, nodeCode;
  final double totalQty, amQty, pmQty, avgFat, avgSnf, avgWater;
  final double amFat, pmFat, amSnf, pmSnf, amWater, pmWater;

  MpNodeSummary({
    required this.nodeId,
    required this.nodeName,
    required this.nodeCode,
    required this.totalQty,
    required this.amQty,
    required this.pmQty,
    required this.avgFat,
    required this.avgSnf,
    required this.avgWater,
    required this.amFat,
    required this.pmFat,
    required this.amSnf,
    required this.pmSnf,
    required this.amWater,
    required this.pmWater,
  });

  factory MpNodeSummary.fromJson(Map<String, dynamic> j) => MpNodeSummary(
        nodeId: _s(j['nodeId']),
        nodeName: _s(j['nodeName']),
        nodeCode: _s(j['nodeCode']),
        totalQty: _d(j['totalQty']),
        amQty: _d(j['amQty']),
        pmQty: _d(j['pmQty']),
        avgFat: _d(j['avgFat']),
        avgSnf: _d(j['avgSnf']),
        avgWater: _d(j['avgWater']),
        amFat: _d(j['amFat']),
        pmFat: _d(j['pmFat']),
        amSnf: _d(j['amSnf']),
        pmSnf: _d(j['pmSnf']),
        amWater: _d(j['amWater']),
        pmWater: _d(j['pmWater']),
      );
}

/// One milk-type slice of a collection summary — total qty plus qty-weighted
/// avg fat/SNF/water for that type. Backs the admin home per-type breakdown.
class MpMilkTypeSummary {
  final MilkType milkType;
  final double totalQty, amQty, pmQty, avgFat, avgSnf, avgWater;
  final double amFat, pmFat, amSnf, pmSnf, amWater, pmWater;

  MpMilkTypeSummary({
    required this.milkType,
    required this.totalQty,
    required this.amQty,
    required this.pmQty,
    required this.avgFat,
    required this.avgSnf,
    required this.avgWater,
    required this.amFat,
    required this.pmFat,
    required this.amSnf,
    required this.pmSnf,
    required this.amWater,
    required this.pmWater,
  });

  factory MpMilkTypeSummary.fromJson(Map<String, dynamic> j) => MpMilkTypeSummary(
        milkType: milkTypeFrom(_sn(j['milkType'])),
        totalQty: _d(j['totalQty']),
        amQty: _d(j['amQty']),
        pmQty: _d(j['pmQty']),
        avgFat: _d(j['avgFat']),
        avgSnf: _d(j['avgSnf']),
        avgWater: _d(j['avgWater']),
        amFat: _d(j['amFat']),
        pmFat: _d(j['pmFat']),
        amSnf: _d(j['amSnf']),
        pmSnf: _d(j['pmSnf']),
        amWater: _d(j['amWater']),
        pmWater: _d(j['pmWater']),
      );
}

/// Per-day qty-weighted rollup of one node's received milk — drives the receive
/// history day list (detail rows fetched lazily when a day is expanded). The
/// source nodes counted are VMCCs at a CC, CCs at a plant; the wire field is
/// still `vmccCount` for both.
class MpReceivedDay {
  final String date;
  final double totalQty;
  final int sourceCount;
  final double? fat, snf, water;

  MpReceivedDay({
    required this.date,
    required this.totalQty,
    required this.sourceCount,
    this.fat,
    this.snf,
    this.water,
  });

  factory MpReceivedDay.fromJson(Map<String, dynamic> j) => MpReceivedDay(
    date: _s(j['date']),
    totalQty: _d(j['totalQty']),
    sourceCount: _i(j['vmccCount']),
    fat: _dn(j['fat']),
    snf: _dn(j['snf']),
    water: _dn(j['water']),
  );
}

/// Per-day qty-weighted QC rollup of recorded pours at a node (VMCC QC trend).
class MpPourDay {
  final String date;
  final double totalQty;
  final int farmerCount;
  final double? fat, snf, water;

  MpPourDay({
    required this.date,
    required this.totalQty,
    required this.farmerCount,
    this.fat,
    this.snf,
    this.water,
  });

  factory MpPourDay.fromJson(Map<String, dynamic> j) => MpPourDay(
    date: _s(j['date']),
    totalQty: _d(j['totalQty']),
    farmerCount: _i(j['farmerCount']),
    fat: _dn(j['fat']),
    snf: _dn(j['snf']),
    water: _dn(j['water']),
  );
}

class MpLedgerEntry {
  final String id, farmerId, entryType, occurredOn;
  final double amount, balanceAfter;
  MpLedgerEntry({
    required this.id,
    required this.farmerId,
    required this.entryType,
    required this.occurredOn,
    required this.amount,
    required this.balanceAfter,
  });
  factory MpLedgerEntry.fromJson(Map<String, dynamic> j) => MpLedgerEntry(
    id: _s(j['id']),
    farmerId: _s(j['farmerId']),
    entryType: _s(j['entryType']),
    occurredOn: _s(j['occurredOn']),
    amount: _d(j['amount']),
    balanceAfter: _d(j['balanceAfter']),
  );
}

class MpConsignment {
  final String id,
      consignmentNo,
      kind,
      fromNodeId,
      toNodeId,
      collectionDate,
      status;
  final Shift? shift;
  final String? containerNo;
  final double? dispatchQty,
      receiptQty,
      dispatchFat,
      dispatchSnf,
      dispatchWater,
      receiptFat,
      receiptSnf,
      receiptWater,
      varianceQty,
      variancePct;
  final bool directReceive;

  /// Milk type of the load. Nullable because legacy consignments predate the
  /// A1/A2 split and pooled BMC loads may carry none.
  final MilkType? milkType;

  MpConsignment({
    required this.id,
    required this.consignmentNo,
    required this.kind,
    required this.fromNodeId,
    required this.toNodeId,
    required this.collectionDate,
    required this.status,
    this.shift,
    this.containerNo,
    this.milkType,
    this.dispatchQty,
    this.receiptQty,
    this.dispatchFat,
    this.dispatchSnf,
    this.dispatchWater,
    this.receiptFat,
    this.receiptSnf,
    this.receiptWater,
    this.varianceQty,
    this.variancePct,
    this.directReceive = false,
  });

  bool get inTransit => status == 'in_transit';
  bool get received => status == 'received';

  /// A cancelled leg. Never `received` — callers that infer receipt from
  /// `!inTransit` will mislabel these, which is exactly how a reversed
  /// dispatch once showed up in the CC outbound list wearing a green
  /// "received" tick.
  bool get isReversed => status == 'reversed';

  factory MpConsignment.fromJson(Map<String, dynamic> j) => MpConsignment(
    id: _s(j['id']),
    consignmentNo: _s(j['consignmentNo']),
    kind: _s(j['kind']),
    fromNodeId: _s(j['fromNodeId']),
    toNodeId: _s(j['toNodeId']),
    collectionDate: _s(j['collectionDate']),
    status: _s(j['status']),
    shift: j['shift'] == null ? null : shiftFrom(j['shift'] as String?),
    containerNo: _sn(j['containerNo']),
    dispatchQty: _dn(j['dispatchQty']),
    receiptQty: _dn(j['receiptQty']),
    dispatchFat: _dn(j['dispatchFat']),
    dispatchSnf: _dn(j['dispatchSnf']),
    dispatchWater: _dn(j['dispatchWater']),
    receiptFat: _dn(j['receiptFat']),
    receiptSnf: _dn(j['receiptSnf']),
    receiptWater: _dn(j['receiptWater']),
    varianceQty: _dn(j['varianceQty']),
    variancePct: _dn(j['variancePct']),
    directReceive: j['directReceive'] == true,
    milkType: j['milkType'] == null ? null : milkTypeFrom(j['milkType'] as String?),
  );
}

/// Milk on hand for one milk type. Each type is dispatched as its own
/// consignment so the type survives to the plant's raw-milk stock.
class MpTypeAvailability {
  final String? milkType;
  final double collected, dispatched, available;
  final double? avgFat, avgSnf, avgWater;
  MpTypeAvailability({
    required this.milkType,
    required this.collected,
    required this.dispatched,
    required this.available,
    this.avgFat,
    this.avgSnf,
    this.avgWater,
  });
  factory MpTypeAvailability.fromJson(Map<String, dynamic> j) => MpTypeAvailability(
    milkType: j['milkType'] as String?,
    collected: _d(j['collected']),
    dispatched: _d(j['dispatched']),
    available: _d(j['available']),
    avgFat: _dn(j['avgFat']),
    avgSnf: _dn(j['avgSnf']),
    avgWater: _dn(j['avgWater']),
  );
}

/// A slot at a node still holding milk that was never sent onward. Unbounded in
/// the past — a shift closed weeks ago and forgotten is exactly what this is for.
class MpPendingDispatch {
  final String collectionDate;
  /// Null at a pooled (BMC / overnight) node — it dispatches its whole window as
  /// one tanker, so there is no per-shift figure to draw against.
  final String? shift;
  final double available;
  /// Closed means dispatch is unblocked and the operator can act right now. An
  /// open slot has to be closed for collection first.
  final bool closed;

  const MpPendingDispatch({
    required this.collectionDate,
    required this.shift,
    required this.available,
    required this.closed,
  });

  factory MpPendingDispatch.fromJson(Map<String, dynamic> j) => MpPendingDispatch(
    collectionDate: _s(j['collectionDate']),
    shift: j['shift'] as String?,
    available: _d(j['available']),
    closed: j['closed'] == true,
  );
}

class MpAvailability {
  final String nodeId, collectionDate, nodeType;
  final double collected, dispatched, available;
  final double? avgFat, avgSnf, avgWater;
  final List<MpTypeAvailability> byMilkType;
  MpAvailability({
    required this.nodeId,
    required this.collectionDate,
    required this.nodeType,
    required this.collected,
    required this.dispatched,
    required this.available,
    this.avgFat,
    this.avgSnf,
    this.avgWater,
    this.byMilkType = const [],
  });

  /// Types with milk still on hand, biggest first — one dispatch card each.
  List<MpTypeAvailability> get dispatchable =>
      byMilkType.where((r) => r.available > 0).toList();

  factory MpAvailability.fromJson(Map<String, dynamic> j) => MpAvailability(
    nodeId: _s(j['nodeId']),
    collectionDate: _s(j['collectionDate']),
    nodeType: _s(j['nodeType']),
    collected: _d(j['collected']),
    dispatched: _d(j['dispatched']),
    available: _d(j['available']),
    avgFat: _dn(j['avgFat']),
    avgSnf: _dn(j['avgSnf']),
    avgWater: _dn(j['avgWater']),
    byMilkType: (j['byMilkType'] as List?)
            ?.map((e) => MpTypeAvailability.fromJson(e as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

/// Which shifts have collection closed for a node on a date. A BMC node (pools
/// the whole day) is "day closed" only when both are true.
class MpShiftStatus {
  final bool am, pm;
  const MpShiftStatus({required this.am, required this.pm});
  factory MpShiftStatus.fromJson(Map<String, dynamic> j) =>
      MpShiftStatus(am: j['am'] == true, pm: j['pm'] == true);
  bool closedFor(String shift) => shift == 'am' ? am : pm;
  bool get dayClosed => am && pm;
}

class MpPayoutDeduction {
  final String id, deductionType;
  final double amount;
  MpPayoutDeduction({
    required this.id,
    required this.deductionType,
    required this.amount,
  });
  factory MpPayoutDeduction.fromJson(Map<String, dynamic> j) =>
      MpPayoutDeduction(
        id: _s(j['id']),
        deductionType: _s(j['deductionType']),
        amount: _d(j['amount']),
      );
}

class MpPayoutLine {
  final String id, farmerId;
  final double qtyLitres, grossAmount, bonusAmount, deductionTotal, netAmount;
  final String? paymentId, settledViaNodeId, statementNo;
  final DateTime? paidAt;
  final List<MpPayoutDeduction> deductions;
  // Set only by GET /payouts/my-lines (line joined with its cycle); null when
  // the line arrives inside a cycle-detail payload.
  final String? periodStart, periodEnd, cycleStatus, paymentMode, paymentDate;
  MpPayoutLine({
    required this.id,
    required this.farmerId,
    required this.qtyLitres,
    required this.grossAmount,
    required this.bonusAmount,
    required this.deductionTotal,
    required this.netAmount,
    this.paymentId,
    this.settledViaNodeId,
    this.statementNo,
    this.paidAt,
    this.deductions = const [],
    this.periodStart,
    this.periodEnd,
    this.cycleStatus,
    this.paymentMode,
    this.paymentDate,
  });

  /// Operator marked this farmer disbursed (cash/UPI). See [paidAt].
  bool get isPaid => paidAt != null;

  factory MpPayoutLine.fromJson(Map<String, dynamic> j) => MpPayoutLine(
    id: _s(j['id']),
    farmerId: _s(j['farmerId']),
    qtyLitres: _d(j['qtyLitres']),
    grossAmount: _d(j['grossAmount']),
    bonusAmount: _d(j['bonusAmount']),
    deductionTotal: _d(j['deductionTotal']),
    netAmount: _d(j['netAmount']),
    paymentId: _sn(j['paymentId']),
    settledViaNodeId: _sn(j['settledViaNodeId']),
    statementNo: _sn(j['statementNo']),
    paidAt: j['paidAt'] == null
        ? null
        : DateTime.tryParse(j['paidAt'].toString()),
    deductions: ((j['deductions'] as List?) ?? [])
        .map((e) => MpPayoutDeduction.fromJson(e as Map<String, dynamic>))
        .toList(),
    periodStart: _sn(j['periodStart']),
    periodEnd: _sn(j['periodEnd']),
    cycleStatus: _sn(j['cycleStatus']),
    paymentMode: _sn(j['paymentMode']),
    paymentDate: _sn(j['paymentDate']),
  );
}

class MpQcTest {
  final String id, subjectType, subjectId, testCode;
  final String? value, uom, verdict, createdAt;
  MpQcTest({
    required this.id,
    required this.subjectType,
    required this.subjectId,
    required this.testCode,
    this.value,
    this.uom,
    this.verdict,
    this.createdAt,
  });
  factory MpQcTest.fromJson(Map<String, dynamic> j) => MpQcTest(
    id: _s(j['id']),
    subjectType: _s(j['subjectType']),
    subjectId: _s(j['subjectId']),
    testCode: _s(j['testCode']),
    value: _sn(j['value']),
    uom: _sn(j['uom']),
    verdict: _sn(j['verdict']),
    createdAt: _sn(j['createdAt']),
  );
}

class MpPayoutCycle {
  final String id, cycleNo, periodStart, periodEnd, status;
  final String? scopeNodeId;
  final double totalQty, totalGross, totalDeductions, totalNet;
  final List<MpPayoutLine> lines;
  // Per-cycle line roll-ups (populated by the list endpoint, not the detail one).
  final int lineCount, paidCount;
  final double netTotal, paidTotal;
  MpPayoutCycle({
    required this.id,
    required this.cycleNo,
    required this.periodStart,
    required this.periodEnd,
    required this.status,
    this.scopeNodeId,
    required this.totalQty,
    required this.totalGross,
    required this.totalDeductions,
    required this.totalNet,
    this.lines = const [],
    this.lineCount = 0,
    this.paidCount = 0,
    this.netTotal = 0,
    this.paidTotal = 0,
  });

  bool get isPaid => status == 'paid';

  /// Farmers still awaiting disbursement, and the rupees outstanding.
  int get pendingCount => lineCount - paidCount;
  double get pendingTotal => (netTotal - paidTotal).clamp(0, double.infinity);
  bool get allPaid => lineCount > 0 && paidCount >= lineCount;

  factory MpPayoutCycle.fromJson(Map<String, dynamic> j) => MpPayoutCycle(
    id: _s(j['id']),
    cycleNo: _s(j['cycleNo']),
    periodStart: _s(j['periodStart']),
    periodEnd: _s(j['periodEnd']),
    status: _s(j['status']),
    scopeNodeId: _sn(j['scopeNodeId']),
    totalQty: _d(j['totalQty']),
    totalGross: _d(j['totalGross']),
    totalDeductions: _d(j['totalDeductions']),
    totalNet: _d(j['totalNet']),
    lineCount: _i(j['lineCount'] ?? 0),
    paidCount: _i(j['paidCount'] ?? 0),
    netTotal: _d(j['netTotal']),
    paidTotal: _d(j['paidTotal']),
    lines: ((j['lines'] as List?) ?? [])
        .map((e) => MpPayoutLine.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// Tenant collection/payout cadence — drives cycle-grouped farmer views.
class MpCycleConfig {
  final int? cycleDays;
  final String? cycleAnchorDate;
  final bool autoGenerateCycle;
  const MpCycleConfig({
    this.cycleDays,
    this.cycleAnchorDate,
    this.autoGenerateCycle = false,
  });

  factory MpCycleConfig.fromJson(Map<String, dynamic> j) => MpCycleConfig(
    cycleDays: j['cycleDays'] == null ? null : _i(j['cycleDays']),
    cycleAnchorDate: _sn(j['cycleAnchorDate']),
    autoGenerateCycle: _b(j['autoGenerateCycle']),
  );
}

/// Tenant support contacts — drives the Help & Support screen's contact rows.
class MpSupportConfig {
  final String? phone;
  final String? email;
  final String? whatsapp;
  const MpSupportConfig({this.phone, this.email, this.whatsapp});

  factory MpSupportConfig.fromJson(Map<String, dynamic> j) => MpSupportConfig(
    phone: _sn(j['supportPhone']),
    email: _sn(j['supportEmail']),
    whatsapp: _sn(j['supportWhatsapp']),
  );
}

/// The signed-in operator's own comp arrangement at a node + this month's
/// earning (from `GET /operators/me`). Drives the Bank & payout screen.
class MpOperatorSelf {
  final String id, nodeId, nodeName, role, compType, effectiveFrom;
  final String? name;
  final double? ratePerLitre, monthlySalary, rentAmount;
  final bool hasPayee;
  final double monthQty, monthEarning;
  final String periodStart, periodEnd;

  const MpOperatorSelf({
    required this.id,
    required this.nodeId,
    required this.nodeName,
    this.name,
    required this.role,
    required this.compType,
    required this.effectiveFrom,
    this.ratePerLitre,
    this.monthlySalary,
    this.rentAmount,
    this.hasPayee = false,
    this.monthQty = 0,
    this.monthEarning = 0,
    required this.periodStart,
    required this.periodEnd,
  });

  factory MpOperatorSelf.fromJson(Map<String, dynamic> j) => MpOperatorSelf(
    id: _s(j['id']),
    nodeId: _s(j['nodeId']),
    nodeName: _s(j['nodeName']),
    name: _sn(j['name']),
    role: _s(j['role']),
    compType: _s(j['compType']),
    effectiveFrom: _s(j['effectiveFrom']),
    ratePerLitre: _dn(j['ratePerLitre']),
    monthlySalary: _dn(j['monthlySalary']),
    rentAmount: _dn(j['rentAmount']),
    hasPayee: _b(j['hasPayee']),
    monthQty: _dn(j['monthQty']) ?? 0,
    monthEarning: _dn(j['monthEarning']) ?? 0,
    periodStart: _s(j['periodStart']),
    periodEnd: _s(j['periodEnd']),
  );
}

/// One operator's compensation for a period, as the CC/PP manager sees it on the
/// operator-payouts compute endpoint. `paidPayoutId` is set once recorded paid.
class MpOperatorPayoutLine {
  final String operatorId, nodeId, nodeName, role, compType;
  final String? name;
  final double nodeQty, commission, salary, rent, total;
  final String? paidPayoutId, paidOn;

  const MpOperatorPayoutLine({
    required this.operatorId,
    required this.nodeId,
    required this.nodeName,
    this.name,
    required this.role,
    required this.compType,
    this.nodeQty = 0,
    this.commission = 0,
    this.salary = 0,
    this.rent = 0,
    this.total = 0,
    this.paidPayoutId,
    this.paidOn,
  });

  bool get isPaid => paidPayoutId != null;

  factory MpOperatorPayoutLine.fromJson(Map<String, dynamic> j) => MpOperatorPayoutLine(
    operatorId: _s(j['operatorId']),
    nodeId: _s(j['nodeId']),
    nodeName: _s(j['nodeName']),
    name: _sn(j['name']),
    role: _s(j['role']),
    compType: _s(j['compType']),
    nodeQty: _dn(j['nodeQty']) ?? 0,
    commission: _dn(j['commission']) ?? 0,
    salary: _dn(j['salary']) ?? 0,
    rent: _dn(j['rent']) ?? 0,
    total: _dn(j['total']) ?? 0,
    paidPayoutId: _sn(j['paidPayoutId']),
    paidOn: _sn(j['paidOn']),
  );
}

enum QualityLevel { good, watch, low }

class QualityBand {
  const QualityBand({required this.goodMin, required this.watchMin});
  final double goodMin;
  final double watchMin;

  factory QualityBand.fromJson(Map<String, dynamic> j) =>
      QualityBand(goodMin: _d(j['goodMin']), watchMin: _d(j['watchMin']));
}

class QualityBands {
  const QualityBands(this._bands);
  final Map<MilkType, Map<String, QualityBand>> _bands;

  static const empty = QualityBands({});

  /// Returns null when no band is configured for [type]+[metric] (no coloring).
  QualityLevel? levelFor(MilkType type, String metric, double value) {
    final band = _bands[type]?[metric];
    if (band == null) return null;
    if (value >= band.goodMin) return QualityLevel.good;
    if (value >= band.watchMin) return QualityLevel.watch;
    return QualityLevel.low;
  }

  factory QualityBands.fromJson(Map<String, dynamic> j) {
    final bands = <MilkType, Map<String, QualityBand>>{};
    j.forEach((typeKey, metricsRaw) {
      if (metricsRaw is! Map) return;
      final metrics = <String, QualityBand>{};
      metricsRaw.forEach((metric, bandRaw) {
        if (bandRaw is Map<String, dynamic>) {
          metrics[metric.toString()] = QualityBand.fromJson(bandRaw);
        }
      });
      bands[milkTypeFrom(typeKey)] = metrics;
    });
    return QualityBands(bands);
  }
}
