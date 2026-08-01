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

/// Minimal item row for the item pickers used in BOM create/edit.
class MfgItemRow {
  final String id;
  final String name;
  final String sku;
  final String uom;
  final String itemClass;

  MfgItemRow({
    required this.id,
    required this.name,
    required this.sku,
    required this.uom,
    required this.itemClass,
  });

  factory MfgItemRow.fromJson(Map<String, dynamic> j) => MfgItemRow(
        id: j['id'] as String,
        name: j['name'] as String,
        sku: (j['sku'] as String?) ?? '',
        // /masters/items returns the UoM in `unit`; keep `uom` as a fallback
        // in case any caller still hands us the renamed shape.
        uom: (j['unit'] as String?) ?? (j['uom'] as String?) ?? '',
        itemClass: (j['itemClass'] as String?) ?? '',
      );
}
