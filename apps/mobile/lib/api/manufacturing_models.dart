// Manufacturing Phase 1 mobile models — mirrors server shapes from
// packages/types/src/manufacturing/. Decimal fields come as strings from
// the API and are parsed to double via [_num].

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

int _int(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

bool _bool(Object? v) {
  if (v == null) return false;
  if (v is bool) return v;
  return v.toString() == 'true';
}

// ── BOM models ────────────────────────────────────────────────────────────

/// Lightweight BOM row for list screens.
class BomListRow {
  final String id;
  final String bomCode;
  final String name;
  final String outputItemId;
  final String outputItemName;

  /// Where the output product sits in the category tree — drives the list's
  /// section headers. A product filed on a root category has a category but
  /// no subcategory, so [outputSubcategory] is often null.
  final String? outputCategory;
  final String? outputSubcategory;
  final double outputQty;
  final String outputUom;
  final int version;
  final bool isActive;
  final String? effectiveFrom;
  final String? notes;
  final int lineCount;
  final String createdAt;

  BomListRow({
    required this.id,
    required this.bomCode,
    required this.name,
    required this.outputItemId,
    required this.outputItemName,
    this.outputCategory,
    this.outputSubcategory,
    required this.outputQty,
    required this.outputUom,
    required this.version,
    required this.isActive,
    required this.lineCount,
    required this.createdAt,
    this.effectiveFrom,
    this.notes,
  });

  factory BomListRow.fromJson(Map<String, dynamic> j) => BomListRow(
        id: j['id'] as String,
        bomCode: j['bomCode'] as String,
        name: j['name'] as String,
        outputItemId: j['outputItemId'] as String,
        outputItemName: (j['outputItemName'] as String?) ?? '',
        outputCategory: j['outputCategory'] as String?,
        outputSubcategory: j['outputSubcategory'] as String?,
        outputQty: _num(j['outputQty']),
        outputUom: (j['outputUom'] as String?) ?? '',
        version: _int(j['version']),
        isActive: _bool(j['isActive']),
        lineCount: _int(j['lineCount']),
        createdAt: (j['createdAt'] as String?) ?? '',
        effectiveFrom: j['effectiveFrom'] as String?,
        notes: j['notes'] as String?,
      );
}

/// One input line in a BOM.
class BomLine {
  final String id;
  final String bomId;
  final int lineNo;
  final String inputItemId;
  final String inputItemName;
  final double qtyPerOutput;
  final String inputUom;
  final double scrapPct;
  final bool isOptional;
  final String? notes;

  BomLine({
    required this.id,
    required this.bomId,
    required this.lineNo,
    required this.inputItemId,
    required this.inputItemName,
    required this.qtyPerOutput,
    required this.inputUom,
    required this.scrapPct,
    required this.isOptional,
    this.notes,
  });

  factory BomLine.fromJson(Map<String, dynamic> j) => BomLine(
        id: j['id'] as String,
        bomId: (j['bomId'] as String?) ?? '',
        lineNo: _int(j['lineNo']),
        inputItemId: j['inputItemId'] as String,
        inputItemName: (j['inputItemName'] as String?) ?? '',
        qtyPerOutput: _num(j['qtyPerOutput']),
        inputUom: (j['inputUom'] as String?) ?? '',
        scrapPct: _num(j['scrapPct']),
        isOptional: _bool(j['isOptional']),
        notes: j['notes'] as String?,
      );
}

/// Full BOM with header + lines.
class Bom {
  final String id;
  final String bomCode;
  final String name;
  final String outputItemId;
  final String outputItemName;
  final double outputQty;
  final String outputUom;
  final int version;
  final bool isActive;
  /// Output is branded only at dispatch, so it keeps no stock of its own — a
  /// short delivery note runs this recipe on the spot. See migration 0186.
  final bool allowAutoRepack;
  final String? effectiveFrom;
  final String? notes;
  final List<BomLine> lines;
  /// Count of WOs that reference this BOM. Drives the edit-warn banner
  /// without a second list query.
  final int linkedWoCount;
  final String createdAt;
  final String updatedAt;

  Bom({
    required this.id,
    required this.bomCode,
    required this.name,
    required this.outputItemId,
    required this.outputItemName,
    required this.outputQty,
    required this.outputUom,
    required this.version,
    required this.isActive,
    required this.lines,
    this.allowAutoRepack = false,
    required this.createdAt,
    required this.updatedAt,
    this.linkedWoCount = 0,
    this.effectiveFrom,
    this.notes,
  });

  factory Bom.fromJson(Map<String, dynamic> j) => Bom(
        id: j['id'] as String,
        bomCode: j['bomCode'] as String,
        name: j['name'] as String,
        outputItemId: j['outputItemId'] as String,
        outputItemName: (j['outputItemName'] as String?) ?? '',
        outputQty: _num(j['outputQty']),
        outputUom: (j['outputUom'] as String?) ?? '',
        version: _int(j['version']),
        isActive: _bool(j['isActive']),
        allowAutoRepack: _bool(j['allowAutoRepack']),
        lines: (j['lines'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(BomLine.fromJson)
            .toList(),
        createdAt: (j['createdAt'] as String?) ?? '',
        updatedAt: (j['updatedAt'] as String?) ?? '',
        linkedWoCount: _int(j['linkedWoCount']),
        effectiveFrom: j['effectiveFrom'] as String?,
        notes: j['notes'] as String?,
      );
}

// ── Work Order models ─────────────────────────────────────────────────────

/// Lightweight WO row for list screens.
class WorkOrderListRow {
  final String id;
  final String woNumber;
  final String bomId;
  final String bomCode;
  final String bomName;
  final int bomVersion;
  final double plannedQty;
  final String outputUom;
  final String outputItemName;
  final String warehouseId;
  final String warehouseName;
  final String? shift;
  final String scheduledFor;
  final String status;
  final double outputQty;
  final double consumedValue;
  final double outputValue;
  final String? qcStatus;
  final String createdAt;

  WorkOrderListRow({
    required this.id,
    required this.woNumber,
    required this.bomId,
    required this.bomCode,
    required this.bomName,
    required this.bomVersion,
    required this.plannedQty,
    required this.outputUom,
    required this.outputItemName,
    required this.warehouseId,
    required this.warehouseName,
    required this.scheduledFor,
    required this.status,
    required this.outputQty,
    required this.consumedValue,
    required this.outputValue,
    required this.createdAt,
    this.shift,
    this.qcStatus,
  });

  factory WorkOrderListRow.fromJson(Map<String, dynamic> j) => WorkOrderListRow(
        id: j['id'] as String,
        woNumber: j['woNumber'] as String,
        bomId: j['bomId'] as String,
        bomCode: (j['bomCode'] as String?) ?? '',
        bomName: (j['bomName'] as String?) ?? '',
        bomVersion: _int(j['bomVersion']),
        plannedQty: _num(j['plannedQty']),
        outputUom: (j['outputUom'] as String?) ?? '',
        outputItemName: (j['outputItemName'] as String?) ?? '',
        warehouseId: (j['warehouseId'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        shift: j['shift'] as String?,
        scheduledFor: (j['scheduledFor'] as String?) ?? '',
        status: j['status'] as String,
        outputQty: _num(j['outputQty']),
        consumedValue: _num(j['consumedValue']),
        outputValue: _num(j['outputValue']),
        qcStatus: j['qcStatus'] as String?,
        createdAt: (j['createdAt'] as String?) ?? '',
      );

  /// Human-readable status label.
  String get statusLabel => switch (status) {
        'in_progress' => 'In Progress',
        'completed' => 'Completed',
        'closed' => 'Closed',
        'cancelled' => 'Cancelled',
        _ => 'Draft',
      };

  bool get isDraft => status == 'draft';
  bool get isInProgress => status == 'in_progress';
  bool get isCompleted => status == 'completed';
  // `completed` is NOT closed: close is what posts the GL entry and brings
  // finished goods into stock, so lumping the two hid the Close action entirely.
  bool get isClosed => status == 'closed';
  bool get isCancelled => status == 'cancelled';
}

/// Expected input line (derived from BOM snapshot at WO create time).
class WorkOrderExpectedLine {
  final String bomLineId;
  final String inputItemId;
  final String inputItemName;
  final double qtyPerOutput;
  final String inputUom;
  final double scrapPct;
  final bool isOptional;

  /// Expected qty = qtyPerOutput × plannedQty × (1 + scrapPct/100)
  double expectedQty(double plannedQty) =>
      qtyPerOutput * plannedQty * (1 + scrapPct / 100);

  WorkOrderExpectedLine({
    required this.bomLineId,
    required this.inputItemId,
    required this.inputItemName,
    required this.qtyPerOutput,
    required this.inputUom,
    required this.scrapPct,
    required this.isOptional,
  });

  factory WorkOrderExpectedLine.fromJson(Map<String, dynamic> j) =>
      WorkOrderExpectedLine(
        bomLineId: (j['bomLineId'] as String?) ?? '',
        inputItemId: j['inputItemId'] as String,
        inputItemName: (j['inputItemName'] as String?) ?? '',
        qtyPerOutput: _num(j['qtyPerOutput']),
        inputUom: (j['inputUom'] as String?) ?? '',
        scrapPct: _num(j['scrapPct']),
        isOptional: _bool(j['isOptional']),
      );
}

/// Full WO with header + expected lines (BOM snapshot).
class WorkOrder {
  final String id;
  final String woNumber;
  final String bomId;
  final String bomCode;
  final String bomName;
  final int bomVersion;
  final double plannedQty;
  final String outputUom;
  final String outputItemId;
  final String outputItemName;
  final String warehouseId;
  final String warehouseName;
  final String? shift;
  final String scheduledFor;
  final String status;
  final String? startedAt;
  final String? completedAt;
  final String? closedAt;
  final double outputQty;
  final double consumedValue;
  final double outputValue;
  final double yieldVariance;
  final String? qcStatus;
  final String? jeId;
  final List<WorkOrderExpectedLine> expectedLines;
  final String createdAt;
  final String updatedAt;

  WorkOrder({
    required this.id,
    required this.woNumber,
    required this.bomId,
    required this.bomCode,
    required this.bomName,
    required this.bomVersion,
    required this.plannedQty,
    required this.outputUom,
    required this.outputItemId,
    required this.outputItemName,
    required this.warehouseId,
    required this.warehouseName,
    required this.scheduledFor,
    required this.status,
    required this.outputQty,
    required this.consumedValue,
    required this.outputValue,
    required this.yieldVariance,
    required this.expectedLines,
    required this.createdAt,
    required this.updatedAt,
    this.shift,
    this.startedAt,
    this.completedAt,
    this.closedAt,
    this.qcStatus,
    this.jeId,
  });

  factory WorkOrder.fromJson(Map<String, dynamic> j) => WorkOrder(
        id: j['id'] as String,
        woNumber: j['woNumber'] as String,
        bomId: j['bomId'] as String,
        bomCode: (j['bomCode'] as String?) ?? '',
        bomName: (j['bomName'] as String?) ?? '',
        bomVersion: _int(j['bomVersion']),
        plannedQty: _num(j['plannedQty']),
        outputUom: (j['outputUom'] as String?) ?? '',
        outputItemId: (j['outputItemId'] as String?) ?? '',
        outputItemName: (j['outputItemName'] as String?) ?? '',
        warehouseId: (j['warehouseId'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        shift: j['shift'] as String?,
        scheduledFor: (j['scheduledFor'] as String?) ?? '',
        status: j['status'] as String,
        startedAt: j['startedAt'] as String?,
        completedAt: j['completedAt'] as String?,
        closedAt: j['closedAt'] as String?,
        outputQty: _num(j['outputQty']),
        consumedValue: _num(j['consumedValue']),
        outputValue: _num(j['outputValue']),
        yieldVariance: _num(j['yieldVariance']),
        qcStatus: j['qcStatus'] as String?,
        jeId: j['jeId'] as String?,
        expectedLines: ((j['expected'] ?? j['expectedLines']) as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(WorkOrderExpectedLine.fromJson)
            .toList(),
        createdAt: (j['createdAt'] as String?) ?? '',
        updatedAt: (j['updatedAt'] as String?) ?? '',
      );

  bool get isDraft => status == 'draft';
  bool get isInProgress => status == 'in_progress';
  bool get isCompleted => status == 'completed';
  // `completed` is NOT closed: close is what posts the GL entry and brings
  // finished goods into stock, so lumping the two hid the Close action entirely.
  bool get isClosed => status == 'closed';
  bool get isCancelled => status == 'cancelled';
}

// ── Phase 2 models ────────────────────────────────────────────────────────

/// One recorded consumption row for a WO.
class WoConsumptionRow {
  final String id;
  final String woId;
  final String? bomLineId;
  final String inputItemId;
  final String inputItemName;
  final String? batchNo;
  final String warehouseId;
  final String warehouseName;
  final double qty;
  final String uom;
  final double unitCost;
  final double value;
  final String consumedAt;
  final String? notes;

  WoConsumptionRow({
    required this.id,
    required this.woId,
    required this.inputItemId,
    required this.inputItemName,
    required this.warehouseId,
    required this.warehouseName,
    required this.qty,
    required this.uom,
    required this.unitCost,
    required this.value,
    required this.consumedAt,
    this.bomLineId,
    this.batchNo,
    this.notes,
  });

  factory WoConsumptionRow.fromJson(Map<String, dynamic> j) => WoConsumptionRow(
        id: j['id'] as String,
        woId: (j['woId'] as String?) ?? '',
        bomLineId: j['bomLineId'] as String?,
        inputItemId: (j['inputItemId'] as String?) ?? '',
        inputItemName: (j['inputItemName'] as String?) ?? '',
        batchNo: j['batchNo'] as String?,
        warehouseId: (j['warehouseId'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        qty: _num(j['qty']),
        uom: (j['uom'] as String?) ?? '',
        unitCost: _num(j['unitCost']),
        value: _num(j['value']),
        consumedAt: (j['consumedAt'] as String?) ?? '',
        notes: j['notes'] as String?,
      );
}

/// One recorded output row for a WO.
class WoOutputRow {
  final String id;
  final String woId;
  final String outputItemId;
  final String outputItemName;
  final String batchNo;
  final String warehouseId;
  final String warehouseName;
  final double qty;
  final String uom;
  final double unitCost;
  final double value;
  final String? expiryDate;
  final String producedAt;
  final String? notes;

  WoOutputRow({
    required this.id,
    required this.woId,
    required this.outputItemId,
    required this.outputItemName,
    required this.batchNo,
    required this.warehouseId,
    required this.warehouseName,
    required this.qty,
    required this.uom,
    required this.unitCost,
    required this.value,
    required this.producedAt,
    this.expiryDate,
    this.notes,
  });

  factory WoOutputRow.fromJson(Map<String, dynamic> j) => WoOutputRow(
        id: j['id'] as String,
        woId: (j['woId'] as String?) ?? '',
        outputItemId: (j['outputItemId'] as String?) ?? '',
        outputItemName: (j['outputItemName'] as String?) ?? '',
        batchNo: (j['batchNo'] as String?) ?? '',
        warehouseId: (j['warehouseId'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        qty: _num(j['qty']),
        uom: (j['uom'] as String?) ?? '',
        unitCost: _num(j['unitCost']),
        value: _num(j['value']),
        expiryDate: j['expiryDate'] as String?,
        producedAt: (j['producedAt'] as String?) ?? '',
        notes: j['notes'] as String?,
      );
}

/// FEFO-suggested batch for consumption entry.
class SuggestedBatch {
  final String batchNo;
  final double availableQty;
  final double unitCost;
  final String? expiryDate;

  SuggestedBatch({
    required this.batchNo,
    required this.availableQty,
    required this.unitCost,
    this.expiryDate,
  });

  factory SuggestedBatch.fromJson(Map<String, dynamic> j) => SuggestedBatch(
        batchNo: (j['batchNo'] as String?) ?? '',
        availableQty: _num(j['availableQty']),
        unitCost: _num(j['unitCost']),
        expiryDate: j['expiryDate'] as String?,
      );
}

/// Live costing preview for a WO.
class WoCostingPreview {
  final String woId;
  final double consumedValue;
  final double actualOutputQty;
  final double expectedOutputQty;
  final double perUnitOutputCost;
  final double varianceQty;
  final double varianceValue;

  WoCostingPreview({
    required this.woId,
    required this.consumedValue,
    required this.actualOutputQty,
    required this.expectedOutputQty,
    required this.perUnitOutputCost,
    required this.varianceQty,
    required this.varianceValue,
  });

  factory WoCostingPreview.fromJson(Map<String, dynamic> j) => WoCostingPreview(
        woId: (j['woId'] as String?) ?? '',
        consumedValue: _num(j['consumedValue']),
        actualOutputQty: _num(j['actualOutputQty']),
        expectedOutputQty: _num(j['expectedOutputQty']),
        perUnitOutputCost: _num(j['perUnitOutputCost']),
        varianceQty: _num(j['varianceQty']),
        varianceValue: _num(j['varianceValue']),
      );
}

/// Result returned by the close endpoint — may carry warnings.
class WoCloseResult {
  final WorkOrder wo;
  final List<String> warnings;

  WoCloseResult({required this.wo, required this.warnings});

  factory WoCloseResult.fromJson(Map<String, dynamic> j) => WoCloseResult(
        wo: WorkOrder.fromJson((j['data'] as Map).cast<String, dynamic>()),
        warnings: (j['warnings'] as List? ?? const []).cast<String>(),
      );
}

// ── Phase 3 models ────────────────────────────────────────────────────────

/// Dashboard payload from `GET /manufacturing/dashboard`.
class MfgDashboard {
  final int activeBomCount;
  final int draftWoCount;
  final int scheduledTodayCount;
  final int inProgressCount;
  /// Runs finished today, closed or not — a completed run stops being
  /// "in progress" immediately, so that tile read 0 all afternoon.
  final int completedTodayCount;
  final int wosCompletedPendingClose;
  final double todayPlannedOutput;
  final double todayActualOutput;
  final double? weekVariancePct;
  final List<MfgTopBom> topBomsThisWeek;

  MfgDashboard({
    required this.activeBomCount,
    required this.draftWoCount,
    required this.scheduledTodayCount,
    required this.inProgressCount,
    this.completedTodayCount = 0,
    required this.wosCompletedPendingClose,
    required this.todayPlannedOutput,
    required this.todayActualOutput,
    required this.topBomsThisWeek,
    this.weekVariancePct,
  });

  factory MfgDashboard.fromJson(Map<String, dynamic> j) => MfgDashboard(
        activeBomCount: _int(j['activeBomCount']),
        draftWoCount: _int(j['draftWoCount']),
        scheduledTodayCount: _int(j['scheduledTodayCount']),
        inProgressCount: _int(j['inProgressCount']),
        completedTodayCount: (j['completedTodayCount'] as num?)?.toInt() ?? 0,
        wosCompletedPendingClose: _int(j['wosCompletedPendingClose']),
        todayPlannedOutput: _num(j['todayPlannedOutput']),
        todayActualOutput: _num(j['todayActualOutput']),
        weekVariancePct: j['weekVariancePct'] == null
            ? null
            : _num(j['weekVariancePct']),
        topBomsThisWeek: (j['topBomsThisWeek'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(MfgTopBom.fromJson)
            .toList(),
      );
}

/// One entry in `MfgDashboard.topBomsThisWeek`.
class MfgTopBom {
  final String bomId;
  final String bomCode;
  final String bomName;
  final int runs;

  MfgTopBom({
    required this.bomId,
    required this.bomCode,
    required this.bomName,
    required this.runs,
  });

  factory MfgTopBom.fromJson(Map<String, dynamic> j) => MfgTopBom(
        bomId: (j['bomId'] as String?) ?? '',
        bomCode: (j['bomCode'] as String?) ?? '',
        bomName: (j['bomName'] as String?) ?? '',
        runs: _int(j['runs']),
      );
}

/// One WO row from `GET /manufacturing/reports/wo-summary`.
class WoSummaryRow {
  final String woId;
  final String woNumber;
  final String bomCode;
  final String bomName;
  final String outputItemName;
  final String warehouseName;
  final String scheduledFor;
  final String status;
  final double plannedQty;
  final double actualOutputQty;
  final double consumedValue;
  final double outputValue;
  final double yieldVariance;
  final double? yieldVariancePct;
  final String? closedAt;

  WoSummaryRow({
    required this.woId,
    required this.woNumber,
    required this.bomCode,
    required this.bomName,
    required this.outputItemName,
    required this.warehouseName,
    required this.scheduledFor,
    required this.status,
    required this.plannedQty,
    required this.actualOutputQty,
    required this.consumedValue,
    required this.outputValue,
    required this.yieldVariance,
    this.yieldVariancePct,
    this.closedAt,
  });

  factory WoSummaryRow.fromJson(Map<String, dynamic> j) => WoSummaryRow(
        woId: (j['woId'] as String?) ?? '',
        woNumber: (j['woNumber'] as String?) ?? '',
        bomCode: (j['bomCode'] as String?) ?? '',
        bomName: (j['bomName'] as String?) ?? '',
        outputItemName: (j['outputItemName'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        scheduledFor: (j['scheduledFor'] as String?) ?? '',
        status: (j['status'] as String?) ?? '',
        plannedQty: _num(j['plannedQty']),
        actualOutputQty: _num(j['actualOutputQty']),
        consumedValue: _num(j['consumedValue']),
        outputValue: _num(j['outputValue']),
        yieldVariance: _num(j['yieldVariance']),
        yieldVariancePct: j['yieldVariancePct'] == null
            ? null
            : _num(j['yieldVariancePct']),
        closedAt: j['closedAt'] as String?,
      );
}

/// One bucket row from `GET /manufacturing/reports/yield-trend`.
class YieldTrendPoint {
  final String bucketDate;
  final String bomId;
  final String bomCode;
  final int runs;
  final double plannedQty;
  final double actualOutputQty;
  final double? yieldPct;

  YieldTrendPoint({
    required this.bucketDate,
    required this.bomId,
    required this.bomCode,
    required this.runs,
    required this.plannedQty,
    required this.actualOutputQty,
    this.yieldPct,
  });

  factory YieldTrendPoint.fromJson(Map<String, dynamic> j) => YieldTrendPoint(
        bucketDate: (j['bucketDate'] as String?) ?? '',
        bomId: (j['bomId'] as String?) ?? '',
        bomCode: (j['bomCode'] as String?) ?? '',
        runs: _int(j['runs']),
        plannedQty: _num(j['plannedQty']),
        actualOutputQty: _num(j['actualOutputQty']),
        yieldPct: j['yieldPct'] == null ? null : _num(j['yieldPct']),
      );
}

// ── Unplanned production ("Record Production") ──────────────────────────────

/// One FEFO-allocated batch slice within a [ProductionAllocation].
class ProductionAllocationBatch {
  final String? batchNo;
  final double qty;
  final double unitCost;
  final String? expiryDate;

  ProductionAllocationBatch({
    this.batchNo,
    required this.qty,
    required this.unitCost,
    this.expiryDate,
  });

  factory ProductionAllocationBatch.fromJson(Map<String, dynamic> j) =>
      ProductionAllocationBatch(
        batchNo: j['batchNo'] as String?,
        qty: _num(j['qty']),
        unitCost: _num(j['unitCost']),
        expiryDate: j['expiryDate'] as String?,
      );

  Map<String, dynamic> toJson() => {
        if (batchNo != null) 'batchNo': batchNo,
        'qty': qty,
        'unitCost': unitCost,
        if (expiryDate != null) 'expiryDate': expiryDate,
      };
}

/// One BOM input, backflushed + FEFO-allocated for a production run.
class ProductionAllocation {
  final String? bomLineId;
  final String inputItemId;
  final String inputItemName;
  final String uom;
  final double requiredQty;
  final double availableQty;
  final bool isOptional;
  final List<ProductionAllocationBatch> batches;

  ProductionAllocation({
    this.bomLineId,
    required this.inputItemId,
    required this.inputItemName,
    required this.uom,
    required this.requiredQty,
    required this.availableQty,
    required this.isOptional,
    required this.batches,
  });

  /// Sum of the allocated batch quantities — what will actually be consumed
  /// once the operator's edits (if any) are applied.
  double get allocatedQty => batches.fold(0.0, (s, b) => s + b.qty);

  factory ProductionAllocation.fromJson(Map<String, dynamic> j) =>
      ProductionAllocation(
        bomLineId: j['bomLineId'] as String?,
        inputItemId: j['inputItemId'] as String,
        inputItemName: (j['inputItemName'] as String?) ?? '',
        uom: (j['uom'] as String?) ?? '',
        requiredQty: _num(j['requiredQty']),
        availableQty: _num(j['availableQty']),
        isOptional: _bool(j['isOptional']),
        batches: (j['batches'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ProductionAllocationBatch.fromJson)
            .toList(),
      );

  ProductionAllocation copyWith({List<ProductionAllocationBatch>? batches}) =>
      ProductionAllocation(
        bomLineId: bomLineId,
        inputItemId: inputItemId,
        inputItemName: inputItemName,
        uom: uom,
        requiredQty: requiredQty,
        availableQty: availableQty,
        isOptional: isOptional,
        batches: batches ?? this.batches,
      );
}

/// An input the BOM demands but the warehouse can't cover. Blocks posting.
class ProductionShortage {
  final String inputItemId;
  final String inputItemName;
  final String uom;
  final double requiredQty;
  final double availableQty;
  final double shortQty;

  ProductionShortage({
    required this.inputItemId,
    required this.inputItemName,
    required this.uom,
    required this.requiredQty,
    required this.availableQty,
    required this.shortQty,
  });

  factory ProductionShortage.fromJson(Map<String, dynamic> j) => ProductionShortage(
        inputItemId: (j['inputItemId'] as String?) ?? '',
        inputItemName: (j['inputItemName'] as String?) ?? '',
        uom: (j['uom'] as String?) ?? '',
        requiredQty: _num(j['requiredQty']),
        availableQty: _num(j['availableQty']),
        shortQty: _num(j['shortQty']),
      );
}

/// Server-computed preview for an unplanned production run — what the BOM
/// backflushes, FEFO-allocated against on-hand stock in the target warehouse.
class ProductionPreview {
  final String bomId;
  final int bomVersion;
  final String bomCode;
  final String bomName;
  final String outputItemId;
  final String outputItemName;
  final String outputUom;
  final double runs;
  final double producedQty;
  final String warehouseId;
  final String warehouseName;
  final bool outputTracksBatches;
  final List<ProductionAllocation> allocations;
  final List<ProductionShortage> shortages;
  final double estimatedInputValue;

  ProductionPreview({
    required this.bomId,
    required this.bomVersion,
    required this.bomCode,
    required this.bomName,
    required this.outputItemId,
    required this.outputItemName,
    required this.outputUom,
    required this.runs,
    required this.producedQty,
    required this.warehouseId,
    required this.warehouseName,
    required this.outputTracksBatches,
    required this.allocations,
    required this.shortages,
    required this.estimatedInputValue,
  });

  factory ProductionPreview.fromJson(Map<String, dynamic> j) => ProductionPreview(
        bomId: (j['bomId'] as String?) ?? '',
        bomVersion: _int(j['bomVersion']),
        bomCode: (j['bomCode'] as String?) ?? '',
        bomName: (j['bomName'] as String?) ?? '',
        outputItemId: (j['outputItemId'] as String?) ?? '',
        outputItemName: (j['outputItemName'] as String?) ?? '',
        outputUom: (j['outputUom'] as String?) ?? '',
        runs: _num(j['runs']),
        producedQty: _num(j['producedQty']),
        warehouseId: (j['warehouseId'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        outputTracksBatches: _bool(j['outputTracksBatches']),
        allocations: (j['allocations'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ProductionAllocation.fromJson)
            .toList(),
        shortages: (j['shortages'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ProductionShortage.fromJson)
            .toList(),
        estimatedInputValue: _num(j['estimatedInputValue']),
      );
}

/// Minimal item row for the item pickers used in BOM create/edit.
class MfgItemRow {
  final String id;
  final String name;
  final String sku;
  final String uom;
  final String itemClass;
  /// Whether the item is batch-tracked. Pickers use it to decide if a batch
  /// field is even worth showing — posting a batch on an item that doesn't
  /// track them is rejected by the ledger, and vice versa.
  final bool trackBatches;

  MfgItemRow({
    required this.id,
    required this.name,
    required this.sku,
    required this.uom,
    required this.itemClass,
    this.trackBatches = false,
  });

  factory MfgItemRow.fromJson(Map<String, dynamic> j) => MfgItemRow(
        id: j['id'] as String,
        name: j['name'] as String,
        sku: (j['sku'] as String?) ?? '',
        // /masters/items returns the UoM in `unit`; keep `uom` as a fallback
        // in case any caller still hands us the renamed shape.
        uom: (j['unit'] as String?) ?? (j['uom'] as String?) ?? '',
        itemClass: (j['itemClass'] as String?) ?? '',
        trackBatches: j['trackBatches'] == true,
      );
}

// ── Reclaim models ────────────────────────────────────────────────────────
//
// Reclaim = unsold finished goods cut open so the material inside goes back
// into the raw-material pool. The recovered material enters at raw-material
// cost; the packaging and processing already spent on it is written off, and
// that shortfall is `lossValue`.

class ReclaimLine {
  final String id;
  final String fgItemId;
  final String fgItemName;
  final String? fgBatchNo;
  final double fgQty;
  final double fgValue;
  final String recoveredItemId;
  final String recoveredItemName;
  final String recoveredUom;
  final String? recoveredBatchNo;
  final double recoveredQty;
  final double recoveredValue;
  final String? expiryDate;

  ReclaimLine({
    required this.id,
    required this.fgItemId,
    required this.fgItemName,
    required this.fgBatchNo,
    required this.fgQty,
    required this.fgValue,
    required this.recoveredItemId,
    required this.recoveredItemName,
    required this.recoveredUom,
    required this.recoveredBatchNo,
    required this.recoveredQty,
    required this.recoveredValue,
    required this.expiryDate,
  });

  factory ReclaimLine.fromJson(Map<String, dynamic> j) => ReclaimLine(
        id: (j['id'] as String?) ?? '',
        fgItemId: (j['fgItemId'] as String?) ?? '',
        fgItemName: (j['fgItemName'] as String?) ?? '',
        fgBatchNo: j['fgBatchNo'] as String?,
        fgQty: _num(j['fgQty']),
        fgValue: _num(j['fgValue']),
        recoveredItemId: (j['recoveredItemId'] as String?) ?? '',
        recoveredItemName: (j['recoveredItemName'] as String?) ?? '',
        recoveredUom: (j['recoveredUom'] as String?) ?? '',
        recoveredBatchNo: j['recoveredBatchNo'] as String?,
        recoveredQty: _num(j['recoveredQty']),
        recoveredValue: _num(j['recoveredValue']),
        expiryDate: j['expiryDate'] as String?,
      );
}

class Reclaim {
  final String id;
  final String reclaimNo;
  final String warehouseId;
  final String warehouseName;
  final String reclaimDate;
  final String status;
  final String? notes;
  final double fgValue;
  final double recoveredValue;
  final double lossValue;
  final List<ReclaimLine> lines;

  Reclaim({
    required this.id,
    required this.reclaimNo,
    required this.warehouseId,
    required this.warehouseName,
    required this.reclaimDate,
    required this.status,
    required this.notes,
    required this.fgValue,
    required this.recoveredValue,
    required this.lossValue,
    required this.lines,
  });

  factory Reclaim.fromJson(Map<String, dynamic> j) => Reclaim(
        id: (j['id'] as String?) ?? '',
        reclaimNo: (j['reclaimNo'] as String?) ?? '',
        warehouseId: (j['warehouseId'] as String?) ?? '',
        warehouseName: (j['warehouseName'] as String?) ?? '',
        reclaimDate: (j['reclaimDate'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'draft',
        notes: j['notes'] as String?,
        fgValue: _num(j['fgValue']),
        recoveredValue: _num(j['recoveredValue']),
        lossValue: _num(j['lossValue']),
        lines: (j['lines'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ReclaimLine.fromJson)
            .toList(),
      );
}

/// One product the technician can tear down this morning, with everything the
/// screen would otherwise have to ask for already worked out server-side:
/// how much raw material a single pack releases, and what that material can
/// be turned into. Both come from the active BOMs, so a new recipe shows up
/// here without a code change.
class ReclaimOption {
  final String fgItemId;
  final String fgItemName;
  final String? fgUnit;
  final double onHandQty;
  final String recoveredItemId;
  final String recoveredItemName;
  final String? recoveredUnit;
  final double yieldPerUnit;
  /// What tearing down the whole shelf would release — the ceiling on this
  /// row, shown so the technician can sanity-check before typing.
  final double projectedRecoveryQty;
  /// Axis-2 category tree: leaf and its parent. Both null when uncategorised.
  final String? categoryName;
  final String? categoryGroup;
  final List<ReclaimDestination> destinations;

  ReclaimOption({
    required this.fgItemId,
    required this.fgItemName,
    required this.fgUnit,
    required this.onHandQty,
    required this.recoveredItemId,
    required this.recoveredItemName,
    required this.recoveredUnit,
    required this.yieldPerUnit,
    required this.projectedRecoveryQty,
    required this.categoryName,
    required this.categoryGroup,
    required this.destinations,
  });

  factory ReclaimOption.fromJson(Map<String, dynamic> j) => ReclaimOption(
        fgItemId: (j['fgItemId'] as String?) ?? '',
        fgItemName: (j['fgItemName'] as String?) ?? '',
        fgUnit: j['fgUnit'] as String?,
        onHandQty: _num(j['onHandQty']),
        recoveredItemId: (j['recoveredItemId'] as String?) ?? '',
        recoveredItemName: (j['recoveredItemName'] as String?) ?? '',
        recoveredUnit: j['recoveredUnit'] as String?,
        yieldPerUnit: _num(j['yieldPerUnit']),
        projectedRecoveryQty: _num(j['projectedRecoveryQty']),
        categoryName: j['categoryName'] as String?,
        categoryGroup: j['categoryGroup'] as String?,
        destinations: (j['destinations'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ReclaimDestination.fromJson)
            .toList(),
      );
}

class ReclaimDestination {
  final String itemId;
  final String itemName;
  ReclaimDestination({required this.itemId, required this.itemName});
  factory ReclaimDestination.fromJson(Map<String, dynamic> j) => ReclaimDestination(
        itemId: (j['itemId'] as String?) ?? '',
        itemName: (j['itemName'] as String?) ?? '',
      );
}
