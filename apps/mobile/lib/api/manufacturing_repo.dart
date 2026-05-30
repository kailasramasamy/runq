// Manufacturing Phase 1 — repo. Wraps all REST endpoints under
// `/manufacturing/boms` and `/manufacturing/wos`. Uses the same
// `apiClient` singleton as `purchase_repo.dart`.

import 'api_client.dart';
import 'manufacturing_models.dart';
import '../services/wo_run_queue.dart';

class ManufacturingRepo {
  // ── BOMs ─────────────────────────────────────────────────────────────────

  Future<({List<BomListRow> data, int total, int totalPages})> listBoms({
    String? outputItemId,
    bool? isActive,
    String? search,
    int page = 1,
    int limit = 25,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (outputItemId != null && outputItemId.isNotEmpty) qp['outputItemId'] = outputItemId;
    if (isActive != null) qp['isActive'] = '$isActive';
    if (search != null && search.isNotEmpty) qp['search'] = search;
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/boms?$qs');
    final list = (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(BomListRow.fromJson)
        .toList();
    final meta = (res['meta'] as Map?) ?? const {};
    return (
      data: list,
      total: meta['total'] is int ? meta['total'] as int : 0,
      totalPages: meta['totalPages'] is int ? meta['totalPages'] as int : 0,
    );
  }

  Future<Bom> getBom(String id) async {
    final res = await apiClient.get('/manufacturing/boms/$id');
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<Bom> createBom({
    required String bomCode,
    required String name,
    required String outputItemId,
    required double outputQty,
    required String outputUom,
    String? effectiveFrom,
    String? notes,
    required List<Map<String, dynamic>> lines,
  }) async {
    final body = <String, dynamic>{
      'bomCode': bomCode,
      'name': name,
      'outputItemId': outputItemId,
      'outputQty': outputQty,
      'outputUom': outputUom,
      if (effectiveFrom != null) 'effectiveFrom': effectiveFrom,
      if (notes != null) 'notes': notes,
      'lines': lines,
    };
    final res = await apiClient.post('/manufacturing/boms', body);
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<Bom> updateBom(String id, Map<String, dynamic> body) async {
    final res = await apiClient.put('/manufacturing/boms/$id', body);
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<Bom> cloneBom(String id, String newCode) async {
    final res = await apiClient.post('/manufacturing/boms/$id/clone', {'newCode': newCode});
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<Bom> activateBom(String id) async {
    final res = await apiClient.post('/manufacturing/boms/$id/activate', const {});
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<Bom> deactivateBom(String id) async {
    final res = await apiClient.post('/manufacturing/boms/$id/deactivate', const {});
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ── Work Orders ───────────────────────────────────────────────────────────

  Future<({List<WorkOrderListRow> data, int total, int totalPages})> listWos({
    String? status,
    String? bomId,
    String? warehouseId,
    String? scheduledFrom,
    String? scheduledTo,
    String? search,
    int page = 1,
    int limit = 25,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    if (bomId != null && bomId.isNotEmpty) qp['bomId'] = bomId;
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    if (scheduledFrom != null && scheduledFrom.isNotEmpty) qp['scheduledFrom'] = scheduledFrom;
    if (scheduledTo != null && scheduledTo.isNotEmpty) qp['scheduledTo'] = scheduledTo;
    if (search != null && search.isNotEmpty) qp['search'] = search;
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/wos?$qs');
    final list = (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(WorkOrderListRow.fromJson)
        .toList();
    final meta = (res['meta'] as Map?) ?? const {};
    return (
      data: list,
      total: meta['total'] is int ? meta['total'] as int : 0,
      totalPages: meta['totalPages'] is int ? meta['totalPages'] as int : 0,
    );
  }

  Future<WorkOrder> getWo(String id) async {
    final res = await apiClient.get('/manufacturing/wos/$id');
    return WorkOrder.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<WorkOrder> createWo({
    required String bomId,
    required double plannedQty,
    required String scheduledFor,
    required String warehouseId,
    String? shift,
  }) async {
    final body = <String, dynamic>{
      'bomId': bomId,
      'plannedQty': plannedQty,
      'scheduledFor': scheduledFor,
      'warehouseId': warehouseId,
      if (shift != null && shift.isNotEmpty) 'shift': shift,
    };
    final res = await apiClient.post('/manufacturing/wos', body);
    return WorkOrder.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<WorkOrder> updateWo(String id, Map<String, dynamic> body) async {
    final res = await apiClient.put('/manufacturing/wos/$id', body);
    return WorkOrder.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<WorkOrder> cancelWo(String id, {String? reason}) async {
    final body = reason == null ? const <String, dynamic>{} : {'reason': reason};
    final res = await apiClient.post('/manufacturing/wos/$id/cancel', body);
    return WorkOrder.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ── Phase 2: Consumption ─────────────────────────────────────────────────

  Future<List<WoConsumptionRow>> listConsumption(String woId) async {
    final res = await apiClient.get('/manufacturing/wos/$woId/consumption');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(WoConsumptionRow.fromJson)
        .toList();
  }

  /// Phase 2.5: writes route through `WoRunQueue` so a flaky network never
  /// loses the operator's entry. Returns whether the post landed live
  /// (`sent`) or was persisted offline (`queued`). Call sites refresh the
  /// consumption list either way — pending entries surface via
  /// `WoRunQueue.pendingFor(woId)`.
  Future<EnqueueOutcome> addConsumption(
    String woId, {
    String? bomLineId,
    required String inputItemId,
    String? batchNo,
    required String warehouseId,
    required double qty,
    required String uom,
    String? notes,
  }) async {
    final body = <String, dynamic>{
      'inputItemId': inputItemId,
      'warehouseId': warehouseId,
      'qty': qty,
      'uom': uom,
      if (bomLineId != null) 'bomLineId': bomLineId,
      if (batchNo != null && batchNo.isNotEmpty) 'batchNo': batchNo,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    };
    return WoRunQueue.instance.recordConsumption(woId: woId, body: body);
  }

  Future<void> deleteConsumption(String woId, String cid) async {
    await apiClient.delete('/manufacturing/wos/$woId/consumption/$cid');
  }

  // ── Phase 2: Output ───────────────────────────────────────────────────────

  Future<List<WoOutputRow>> listOutput(String woId) async {
    final res = await apiClient.get('/manufacturing/wos/$woId/output');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(WoOutputRow.fromJson)
        .toList();
  }

  /// Phase 2.5: writes route through `WoRunQueue`. See `addConsumption`.
  Future<EnqueueOutcome> addOutput(
    String woId, {
    required String outputItemId,
    String? batchNo,
    required String warehouseId,
    required double qty,
    required String uom,
    String? expiryDate,
    String? notes,
  }) async {
    final body = <String, dynamic>{
      'outputItemId': outputItemId,
      'warehouseId': warehouseId,
      'qty': qty,
      'uom': uom,
      if (batchNo != null && batchNo.isNotEmpty) 'batchNo': batchNo,
      if (expiryDate != null && expiryDate.isNotEmpty) 'expiryDate': expiryDate,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    };
    return WoRunQueue.instance.recordOutput(woId: woId, body: body);
  }

  Future<void> deleteOutput(String woId, String oid) async {
    await apiClient.delete('/manufacturing/wos/$woId/output/$oid');
  }

  // ── Phase 2: Suggested batches ───────────────────────────────────────────

  Future<List<SuggestedBatch>> getSuggestedBatches(
    String woId, {
    required String inputItemId,
    required String warehouseId,
    double? requiredQty,
  }) async {
    final qp = <String, String>{
      'inputItemId': inputItemId,
      'warehouseId': warehouseId,
      if (requiredQty != null) 'requiredQty': '$requiredQty',
    };
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/wos/$woId/suggested-batches?$qs');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(SuggestedBatch.fromJson)
        .toList();
  }

  // ── Phase 2: Costing preview ─────────────────────────────────────────────

  Future<WoCostingPreview> getCostingPreview(String woId) async {
    final res = await apiClient.get('/manufacturing/wos/$woId/preview');
    return WoCostingPreview.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ── Phase 2: Lifecycle transitions ──────────────────────────────────────

  Future<WorkOrder> startWo(String woId) async {
    final res = await apiClient.post('/manufacturing/wos/$woId/start', const {});
    return WorkOrder.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<WorkOrder> completeWo(String woId) async {
    final res = await apiClient.post('/manufacturing/wos/$woId/complete', const {});
    return WorkOrder.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<WoCloseResult> closeWo(String woId, {bool varianceAcknowledged = false}) async {
    final body = {'varianceAcknowledged': varianceAcknowledged};
    final res = await apiClient.post('/manufacturing/wos/$woId/close', body);
    return WoCloseResult.fromJson(res as Map<String, dynamic>);
  }

  // ── Phase 3: Dashboard ──────────────────────────────────────────────────

  Future<MfgDashboard> getDashboard() async {
    final res = await apiClient.get('/manufacturing/dashboard');
    return MfgDashboard.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ── Phase 3: Reports ────────────────────────────────────────────────────

  Future<List<WoSummaryRow>> getWoSummary({
    String? bomId,
    String? warehouseId,
    String? status,
    String? from,
    String? to,
  }) async {
    final qp = <String, String>{};
    if (bomId != null && bomId.isNotEmpty) qp['bomId'] = bomId;
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    if (status != null && status.isNotEmpty) qp['status'] = status;
    if (from != null && from.isNotEmpty) qp['from'] = from;
    if (to != null && to.isNotEmpty) qp['to'] = to;
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final path = qs.isEmpty
        ? '/manufacturing/reports/wo-summary'
        : '/manufacturing/reports/wo-summary?$qs';
    final res = await apiClient.get(path);
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(WoSummaryRow.fromJson)
        .toList();
  }

  Future<List<YieldTrendPoint>> getYieldTrend({
    String? bomId,
    String bucket = 'day',
    String? from,
    String? to,
  }) async {
    final qp = <String, String>{'bucket': bucket};
    if (bomId != null && bomId.isNotEmpty) qp['bomId'] = bomId;
    if (from != null && from.isNotEmpty) qp['from'] = from;
    if (to != null && to.isNotEmpty) qp['to'] = to;
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/reports/yield-trend?$qs');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(YieldTrendPoint.fromJson)
        .toList();
  }

  // ── Items search (for BOM pickers) ───────────────────────────────────────

  /// Item search for BOM pickers + ad-hoc consumption. Hits the masters
  /// items list; `itemClass` and `itemClassGroup` are optional pre-filters.
  ///
  /// `itemClassGroup='finished'` → finished_good + semi_finished (BOM output picker).
  /// `itemClassGroup='inputs'`   → raw_material + packaging + consumable (BOM input + WO ad-hoc).
  Future<List<MfgItemRow>> searchItems(
    String query, {
    String? itemClass,
    String? itemClassGroup,
  }) async {
    final qp = <String, String>{'search': query, 'limit': '30'};
    if (itemClass != null && itemClass.isNotEmpty) qp['itemClass'] = itemClass;
    if (itemClassGroup != null && itemClassGroup.isNotEmpty) {
      qp['itemClassGroup'] = itemClassGroup;
    }
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/masters/items?$qs');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(MfgItemRow.fromJson)
        .toList();
  }
}

/// Singleton repo instance, mirrors `purchaseRepo` pattern.
final manufacturingRepo = ManufacturingRepo();
