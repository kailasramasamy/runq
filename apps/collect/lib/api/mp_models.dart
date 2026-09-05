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
  /// VMCC-only, read-side: this centre, its CC and the plant above them are one
  /// site, and this operator can work all three — so the whole
  /// close→dispatch→receive chain can run from one confirmed action.
  final bool fastTrackEnabled;

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
    this.fastTrackEnabled = false,
  });

  bool get isVmcc => nodeType == 'vmcc';
  bool get isCc => nodeType == 'cc';
  bool get isPp => nodeType == 'pp';
  bool get isLactometer => measurementMode == 'lactometer';

  /// Milk leaves as one untagged tanker (`day` / `overnight`) rather than one
  /// consignment per shift. Drives whether the UI offers a shift selector at all.
  bool get isPooledDispatch => dispatchMode != 'per_shift';
  bool get isOvernightPool => dispatchMode == 'overnight';

  /// Which node's payout cycle settles this node's farmers. Cycles are
  /// CC-scoped — one per CC + period — so a VMCC has none of its own: its
  /// farmers are paid by the parent CC's cycle. Asking for cycles at the VMCC
  /// itself returns nothing, which reads on screen as "no cycles yet".
  String get payoutScopeNodeId => isVmcc ? (parentNodeId ?? id) : id;

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
    fastTrackEnabled: _b(j['fastTrackEnabled']),
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

/// One (day, shift, milk type) of milk a VMCC supplied, as recorded by the
/// receiving CC. The record for a VMCC that doesn't log farmer pours — its milk
/// exists only as the CC's manual receipt, so this is what its operator reads
/// in place of a pour history. [ratePerLitre] is null when no rate chart
/// matched, in which case [amount] is not a real figure.
class MpSuppliedLine {
  final String date, toNodeId;
  final Shift shift;
  final MilkType milkType;
  /// Name of the CC that recorded the receipt — the app can't look this up
  /// itself: a VMCC operator's node scope stops at their own centre.
  final String? toNodeName;
  final double qtyLitres, amount;
  final double? fat, snf, water, ratePerLitre;

  MpSuppliedLine({
    required this.date,
    required this.shift,
    required this.milkType,
    required this.toNodeId,
    required this.qtyLitres,
    required this.amount,
    this.fat,
    this.snf,
    this.water,
    this.ratePerLitre,
    this.toNodeName,
  });

  factory MpSuppliedLine.fromJson(Map<String, dynamic> j) => MpSuppliedLine(
    date: _s(j['date']),
    shift: shiftFrom(_sn(j['shift'])),
    milkType: milkTypeFrom(_sn(j['milkType'])),
    toNodeId: _s(j['toNodeId']),
    toNodeName: _sn(j['toNodeName']),
    qtyLitres: _d(j['qtyLitres']),
    amount: _d(j['amount']),
    fat: _dn(j['fat']),
    snf: _dn(j['snf']),
    water: _dn(j['water']),
    ratePerLitre: _dn(j['ratePerLitre']),
  );
}

class MpLedgerEntry {
  final String id, farmerId, entryType, occurredOn;
  final double amount, balanceAfter;
  /// Which bucket the entry is against ('farmer_sale' | 'advance' |
  /// 'cattle_feed_loan'). Null on older rows and on plain advances.
  final String? refType;
  MpLedgerEntry({
    required this.id,
    required this.farmerId,
    required this.entryType,
    required this.occurredOn,
    required this.amount,
    required this.balanceAfter,
    this.refType,
  });
  factory MpLedgerEntry.fromJson(Map<String, dynamic> j) => MpLedgerEntry(
    id: _s(j['id']),
    farmerId: _s(j['farmerId']),
    entryType: _s(j['entryType']),
    occurredOn: _s(j['occurredOn']),
    amount: _d(j['amount']),
    balanceAfter: _d(j['balanceAfter']),
    refType: j['refType'] as String?,
  );

  /// True when this row belongs to the Sold-to-farmer ledger, not advances.
  bool get isSale => entryType == 'farmer_sale' || refType == 'farmer_sale';
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

  /// Litres sold to a trader-farmer at the gate. They come off availability
  /// the same way a dispatch does, and an operator who can't see them reads
  /// the shortfall as the app losing his milk.
  final double sold;
  final double? avgFat, avgSnf, avgWater;
  MpTypeAvailability({
    required this.milkType,
    required this.collected,
    required this.dispatched,
    required this.available,
    this.sold = 0,
    this.avgFat,
    this.avgSnf,
    this.avgWater,
  });
  factory MpTypeAvailability.fromJson(Map<String, dynamic> j) => MpTypeAvailability(
    milkType: j['milkType'] as String?,
    collected: _d(j['collected']),
    dispatched: _d(j['dispatched']),
    available: _d(j['available']),
    sold: _d(j['sold']),
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

  /// Consignments received into this slot — what the operator counts when he
  /// looks at the floor. Two tankers in from two VMCCs is two pieces of work
  /// even though they pool into one slot. Zero at a VMCC, where milk arrives as
  /// pours and the slot itself is the unit of work.
  final int sources;

  const MpPendingDispatch({
    required this.collectionDate,
    required this.shift,
    required this.available,
    required this.closed,
    this.sources = 0,
  });

  /// Pieces of work this slot represents on the dispatch tab.
  int get workUnits => sources > 0 ? sources : 1;

  factory MpPendingDispatch.fromJson(Map<String, dynamic> j) => MpPendingDispatch(
    collectionDate: _s(j['collectionDate']),
    shift: j['shift'] as String?,
    available: _d(j['available']),
    closed: j['closed'] == true,
    sources: (j['sources'] as num?)?.toInt() ?? 0,
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

/// A farmer's ledger as the API returns it: the blended balance, its split by
/// debt type, and every entry newest-first.
typedef MpFarmerLedger = ({
  double balance,
  double saleDue,
  double advanceDue,
  double feedLoanDue,
  List<MpLedgerEntry> entries,
});

/// Milk refused for quality — recorded beside the pour or receipt it came from,
/// never in place of it. Erasing the entry would withhold the money but destroy
/// the reading that justified the refusal.
class MpRejection {
  final String id, stage, collectionDate, reason, disposition, borneBy;
  final String? shift, notes, fromNodeId, reversedAt;
  final MilkType? milkType;
  final double qtyLitres;

  MpRejection({
    required this.id,
    required this.stage,
    required this.collectionDate,
    required this.reason,
    required this.disposition,
    required this.borneBy,
    required this.qtyLitres,
    this.shift,
    this.notes,
    this.fromNodeId,
    this.milkType,
    this.reversedAt,
  });

  factory MpRejection.fromJson(Map<String, dynamic> j) => MpRejection(
        id: j['id'] as String,
        stage: (j['stage'] as String?) ?? 'gate',
        collectionDate: j['collectionDate'] as String,
        reason: (j['reason'] as String?) ?? 'other',
        disposition: (j['disposition'] as String?) ?? 'returned',
        borneBy: (j['borneBy'] as String?) ?? 'company',
        qtyLitres: double.tryParse('${j['qtyLitres']}') ?? 0,
        shift: j['shift'] as String?,
        notes: j['notes'] as String?,
        fromNodeId: j['fromNodeId'] as String?,
        milkType: j['milkType'] == null ? null : milkTypeFrom(j['milkType'] as String?),
        reversedAt: j['reversedAt'] as String?,
      );

  bool get isReversed => reversedAt != null;
  bool get atGate => stage == 'gate';
}

/// One row of the rejection-rate report: a source node, a farmer, or a reason.
class MpRejectionStat {
  final String? key;
  final double rejectedQty, amount;
  final int events;
  MpRejectionStat({required this.key, required this.rejectedQty, required this.amount, required this.events});

  factory MpRejectionStat.fromJson(Map<String, dynamic> j) => MpRejectionStat(
        key: j['key'] as String?,
        rejectedQty: double.tryParse('${j['rejectedQty']}') ?? 0,
        amount: double.tryParse('${j['amount']}') ?? 0,
        events: (j['events'] as num?)?.toInt() ?? 0,
      );
}

/// Why milk was refused. Ordered as an operator would reach for them — the
/// senses first, the lab tests after.
enum RejectionReason { sour, temperature, adulterated, cobPositive, antibiotic, foreignMatter, other }

const rejectionReasonApi = <RejectionReason, String>{
  RejectionReason.sour: 'sour',
  RejectionReason.temperature: 'temperature',
  RejectionReason.adulterated: 'adulterated',
  RejectionReason.cobPositive: 'cob_positive',
  RejectionReason.antibiotic: 'antibiotic',
  RejectionReason.foreignMatter: 'foreign_matter',
  RejectionReason.other: 'other',
};

/// Goods the farmer BOUGHT from us — bulk milk a trader resells, or a product
/// (ghee, curd, paneer) off the counter. Recovered from their next payment.
class MpFarmerSale {
  final String id, saleDate, kind, unit;
  final String? shift, itemId, itemName, nodeName, reversedAt;
  /// Set on a bulk-milk line only; a product names its item instead.
  final MilkType? milkType;
  final double qty, ratePerUnit, amount;
  MpFarmerSale({
    required this.id,
    required this.saleDate,
    required this.kind,
    required this.unit,
    required this.qty,
    required this.ratePerUnit,
    required this.amount,
    this.milkType,
    this.shift,
    this.itemId,
    this.itemName,
    this.nodeName,
    this.reversedAt,
  });
  factory MpFarmerSale.fromJson(Map<String, dynamic> j) => MpFarmerSale(
        id: j['id'] as String,
        saleDate: j['saleDate'] as String,
        kind: (j['kind'] as String?) ?? 'raw_milk',
        unit: (j['unit'] as String?) ?? 'L',
        shift: j['shift'] as String?,
        milkType: j['milkType'] == null ? null : milkTypeFrom(j['milkType'] as String?),
        itemId: j['itemId'] as String?,
        itemName: j['itemName'] as String?,
        qty: double.tryParse('${j['qty']}') ?? 0,
        ratePerUnit: double.tryParse('${j['ratePerUnit']}') ?? 0,
        amount: double.tryParse('${j['amount']}') ?? 0,
        nodeName: j['nodeName'] as String?,
        reversedAt: j['reversedAt'] as String?,
      );

  bool get isMilk => kind == 'raw_milk';
  bool get isReversed => reversedAt != null;
}

/// A product an operator may sell at the counter.
class MpSellableItem {
  final String id, name;
  final String? sku, unit;
  final double? defaultSellingPrice;
  MpSellableItem({
    required this.id,
    required this.name,
    this.sku,
    this.unit,
    this.defaultSellingPrice,
  });
  factory MpSellableItem.fromJson(Map<String, dynamic> j) => MpSellableItem(
        id: j['id'] as String,
        name: j['name'] as String,
        sku: j['sku'] as String?,
        unit: j['unit'] as String?,
        defaultSellingPrice: double.tryParse('${j['defaultSellingPrice']}'),
      );
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
  // The owning cycle. Present on every payload; needed to mark a line paid from
  // a farmer-scoped list, where no cycle screen supplies the id.
  final String payoutCycleId;
  final double qtyLitres, grossAmount, bonusAmount, deductionTotal, netAmount;
  final String? paymentId, settledViaNodeId, statementNo;
  /// Bank/UPI txn reference (UTR) captured when the payout was confirmed.
  final String? paymentReference;
  final DateTime? paidAt;
  final List<MpPayoutDeduction> deductions;
  // Set only by GET /payouts/my-lines (line joined with its cycle); null when
  // the line arrives inside a cycle-detail payload.
  final String? periodStart, periodEnd, cycleStatus, paymentMode, paymentDate;
  MpPayoutLine({
    required this.id,
    required this.farmerId,
    this.payoutCycleId = '',
    required this.qtyLitres,
    required this.grossAmount,
    required this.bonusAmount,
    required this.deductionTotal,
    required this.netAmount,
    this.paymentId,
    this.settledViaNodeId,
    this.statementNo,
    this.paymentReference,
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
    payoutCycleId: _s(j['payoutCycleId']),
    qtyLitres: _d(j['qtyLitres']),
    grossAmount: _d(j['grossAmount']),
    bonusAmount: _d(j['bonusAmount']),
    deductionTotal: _d(j['deductionTotal']),
    netAmount: _d(j['netAmount']),
    paymentId: _sn(j['paymentId']),
    settledViaNodeId: _sn(j['settledViaNodeId']),
    statementNo: _sn(j['statementNo']),
    paymentReference: _sn(j['paymentReference']),
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

/// One VMCC's settlement for a cycle — the money side of a centre whose milk
/// is bought in bulk rather than farmer by farmer. [totalAmount] is milk cost
/// plus whatever operator compensation the bill folds in; [paymentDate] is set
/// once it has actually been paid out.
class MpVmccBill {
  final String id, billNo, cycleNo, periodStart, periodEnd, status;

  /// Which centre this bill settles. Present on every list response — a cycle's
  /// bills are only readable as a breakdown if each one names its VMCC.
  final String vmccNodeId, vmccName, vmccCode;
  final double qtyLitres, milkCost, commission, salary, rent, totalAmount;
  final String? paymentDate, paymentMode, txnReference;

  MpVmccBill({
    required this.id,
    required this.billNo,
    this.vmccNodeId = '',
    this.vmccName = '',
    this.vmccCode = '',
    required this.cycleNo,
    required this.periodStart,
    required this.periodEnd,
    required this.status,
    required this.qtyLitres,
    required this.milkCost,
    required this.commission,
    required this.salary,
    required this.rent,
    required this.totalAmount,
    this.paymentDate,
    this.paymentMode,
    this.txnReference,
  });

  bool get isPaid => status == 'paid';
  bool get isReversed => status == 'reversed';

  /// Operator compensation folded into the bill, over and above the milk.
  double get operatorComp => commission + salary + rent;

  factory MpVmccBill.fromJson(Map<String, dynamic> j) => MpVmccBill(
    id: _s(j['id']),
    billNo: _s(j['billNo']),
    vmccNodeId: _s(j['vmccNodeId']),
    vmccName: _s(j['vmccName']),
    vmccCode: _s(j['vmccCode']),
    cycleNo: _s(j['cycleNo']),
    periodStart: _s(j['periodStart']),
    periodEnd: _s(j['periodEnd']),
    status: _s(j['status']),
    qtyLitres: _d(j['qtyLitres']),
    milkCost: _d(j['milkCost']),
    commission: _d(j['commission']),
    salary: _d(j['salary']),
    rent: _d(j['rent']),
    totalAmount: _d(j['totalAmount']),
    paymentDate: _sn(j['paymentDate']),
    paymentMode: _sn(j['paymentMode']),
    txnReference: _sn(j['txnReference']),
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

  // The same roll-up for centres settled in bulk. A CC whose VMCCs are bought
  // wholesale has NO farmer lines at all — its whole cycle is these bills — so
  // reading only the line totals reported a lakh-rupee cycle as ₹0.
  final int billCount, billPaidCount;
  final double billTotal, billPaidTotal;
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
    this.billCount = 0,
    this.billPaidCount = 0,
    this.billTotal = 0,
    this.billPaidTotal = 0,
  });

  bool get isPaid => status == 'paid';

  /// True when this cycle settles centres in bulk rather than farmer by farmer.
  bool get isBillBased => billCount > 0 && lineCount == 0;

  /// Everything the cycle owes and everything already disbursed, whichever way
  /// it settles. Farmer lines and VMCC bills never cover the same milk, so they
  /// add rather than compete.
  double get payableTotal => netTotal + billTotal;
  double get disbursedTotal => paidTotal + billPaidTotal;

  /// Payees still awaiting disbursement — farmers, or centres, or both.
  int get payeeCount => lineCount + billCount;
  int get payeePaidCount => paidCount + billPaidCount;
  int get pendingCount => payeeCount - payeePaidCount;
  double get pendingTotal =>
      (payableTotal - disbursedTotal).clamp(0, double.infinity);
  bool get allPaid => payeeCount > 0 && payeePaidCount >= payeeCount;

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
    billCount: _i(j['billCount'] ?? 0),
    billPaidCount: _i(j['billPaidCount'] ?? 0),
    billTotal: _d(j['billTotal']),
    billPaidTotal: _d(j['billPaidTotal']),
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

/// Added-water % thresholds. Water runs the opposite way to FAT/SNF — lower is
/// better — so it can't ride [QualityBands], whose every band is `value >= min`.
/// It also isn't configurable: water is adulteration, not a milk characteristic
/// that shifts with breed or season, so one scale serves every tenant.
///   ≤ 2 good · ≤ 7 watch · above 7 low
const kWaterGoodMax = 2.0;
const kWaterWatchMax = 7.0;

/// Which band an added-water reading falls in (descending: lower is better).
/// Colour only — water never feeds the A/B/C pour grade.
QualityLevel waterLevel(double value) => value <= kWaterGoodMax
    ? QualityLevel.good
    : (value <= kWaterWatchMax ? QualityLevel.watch : QualityLevel.low);

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

  /// The configured thresholds themselves, for callers that must draw the
  /// bands rather than classify one value against them — the QC trend charts
  /// shade good/watch/low as zones behind the line. Null when unconfigured.
  QualityBand? bandFor(MilkType type, String metric) => _bands[type]?[metric];

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

// ── single-site fast track ──────────────────────────────────────────────────

/// One milk type's worth of milk moving up the chain in a fast-track run.
class MpFastTrackLeg {
  const MpFastTrackLeg({required this.qty, this.milkType, this.fat, this.snf});
  final double qty;
  final MilkType? milkType;
  final double? fat, snf;

  factory MpFastTrackLeg.fromJson(Map<String, dynamic> j) => MpFastTrackLeg(
    qty: _d(j['qty']),
    milkType: j['milkType'] == null ? null : milkTypeFrom(j['milkType'] as String?),
    fat: _dn(j['fat']),
    snf: _dn(j['snf']),
  );
}

/// A (date, shift) slot a close will cover. Named explicitly so the confirm
/// sheet can show that a pooled node is about to close both halves of its day.
class MpFastTrackSlot {
  const MpFastTrackSlot({required this.date, required this.shift});
  final String date;
  final Shift shift;

  factory MpFastTrackSlot.fromJson(Map<String, dynamic> j) =>
      MpFastTrackSlot(date: _s(j['date']), shift: shiftFrom(j['shift'] as String?));
}

/// What the chain will do for one VMCC — the unit the confirm sheet renders.
class MpFastTrackVmcc {
  const MpFastTrackVmcc({
    required this.vmccId, required this.vmccName,
    required this.ccId, required this.ccName,
    required this.ppId, required this.ppName,
    required this.legs, required this.vmccSlots, required this.ccSlots,
    required this.totalQty, this.shift,
  });
  final String vmccId, vmccName, ccId, ccName, ppId, ppName;
  final Shift? shift;
  final List<MpFastTrackSlot> vmccSlots, ccSlots;
  final List<MpFastTrackLeg> legs;
  final double totalQty;

  factory MpFastTrackVmcc.fromJson(Map<String, dynamic> j) => MpFastTrackVmcc(
    vmccId: _s(j['vmccId']), vmccName: _s(j['vmccName']),
    ccId: _s(j['ccId']), ccName: _s(j['ccName']),
    ppId: _s(j['ppId']), ppName: _s(j['ppName']),
    shift: j['shift'] == null ? null : shiftFrom(j['shift'] as String?),
    vmccSlots: _slots(j['vmccSlots']),
    ccSlots: _slots(j['ccSlots']),
    legs: (j['legs'] as List? ?? const [])
        .map((e) => MpFastTrackLeg.fromJson(e as Map<String, dynamic>))
        .toList(),
    totalQty: _d(j['totalQty']),
  );
}

List<MpFastTrackSlot> _slots(Object? raw) => (raw as List? ?? const [])
    .map((e) => MpFastTrackSlot.fromJson(e as Map<String, dynamic>))
    .toList();

/// A VMCC left out of a run, with the reason — always shown, never silent.
class MpFastTrackSkip {
  const MpFastTrackSkip({required this.vmccName, required this.reason});
  final String vmccName, reason;

  factory MpFastTrackSkip.fromJson(Map<String, dynamic> j) =>
      MpFastTrackSkip(vmccName: _s(j['vmccName']), reason: _s(j['reason']));
}

/// The dry run: exactly what a commit would do, with nothing written yet.
class MpFastTrackPlan {
  const MpFastTrackPlan({
    required this.collectionDate, required this.vmccs,
    required this.skipped, required this.totalQty, this.shift,
  });
  final String collectionDate;
  final Shift? shift;
  final List<MpFastTrackVmcc> vmccs;
  final List<MpFastTrackSkip> skipped;
  final double totalQty;

  bool get isEmpty => vmccs.isEmpty;

  /// The plant everything lands in. Null only when there's nothing to send.
  String? get plantName => vmccs.isEmpty ? null : vmccs.first.ppName;

  factory MpFastTrackPlan.fromJson(Map<String, dynamic> j) => MpFastTrackPlan(
    collectionDate: _s(j['collectionDate']),
    shift: j['shift'] == null ? null : shiftFrom(j['shift'] as String?),
    vmccs: (j['vmccs'] as List? ?? const [])
        .map((e) => MpFastTrackVmcc.fromJson(e as Map<String, dynamic>))
        .toList(),
    skipped: (j['skipped'] as List? ?? const [])
        .map((e) => MpFastTrackSkip.fromJson(e as Map<String, dynamic>))
        .toList(),
    totalQty: _d(j['totalQty']),
  );
}

/// Where a run stopped, if it did. Everything before it is committed and valid.
class MpFastTrackFailure {
  const MpFastTrackFailure({required this.vmccName, required this.step, required this.message});
  final String vmccName, step, message;

  factory MpFastTrackFailure.fromJson(Map<String, dynamic> j) => MpFastTrackFailure(
    vmccName: _s(j['vmccName']), step: _s(j['step']), message: _s(j['message']),
  );
}

class MpFastTrackResult {
  const MpFastTrackResult({
    required this.plan, required this.completed,
    required this.receivedQty, this.failure,
  });
  final MpFastTrackPlan plan;
  final List<String> completed;
  final double receivedQty;
  final MpFastTrackFailure? failure;

  bool get ok => failure == null;

  factory MpFastTrackResult.fromJson(Map<String, dynamic> j) => MpFastTrackResult(
    plan: MpFastTrackPlan.fromJson((j['plan'] as Map<String, dynamic>?) ?? const {}),
    completed: (j['completed'] as List? ?? const []).map((e) => e.toString()).toList(),
    receivedQty: _d(j['receivedQty']),
    failure: j['failure'] == null
        ? null
        : MpFastTrackFailure.fromJson(j['failure'] as Map<String, dynamic>),
  );
}
