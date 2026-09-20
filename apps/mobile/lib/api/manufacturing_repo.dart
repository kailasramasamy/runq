// Manufacturing Phase 1 — repo. Wraps all REST endpoints under
// `/manufacturing/boms` and `/manufacturing/wos`. Uses the same
// `apiClient` singleton as `purchase_repo.dart`.

import 'api_client.dart';
import 'inventory_models.dart' show InvOnHandRow, InvWarehouse;
import 'inventory_movement_models.dart' show InvMovementPage, InvMovementQuery;
import 'manufacturing_models.dart';
import '../services/wo_run_queue.dart';

class ManufacturingRepo {
  // ── BOMs ─────────────────────────────────────────────────────────────────

  Future<({List<BomListRow> data, int total, int totalPages})> listBoms({
    String? outputItemId,
    bool? isActive,
    String? search,
    String? sort,
    /// Drop the recipes dispatch repacks on its own. Set by the pickers that
    /// ask a person what they are making; left off by the BOM list and the
    /// report filters, which still have to show them.
    bool? excludeAutoRepack,
    int page = 1,
    int limit = 25,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (outputItemId != null && outputItemId.isNotEmpty) qp['outputItemId'] = outputItemId;
    if (isActive != null) qp['isActive'] = '$isActive';
    if (excludeAutoRepack == true) qp['excludeAutoRepack'] = 'true';
    if (search != null && search.isNotEmpty) qp['search'] = search;
    if (sort != null && sort.isNotEmpty) qp['sort'] = sort;
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
    bool allowAutoRepack = false,
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
      'allowAutoRepack': allowAutoRepack,
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
    final res = await apiClient.post('/manufacturing/boms/$id/clone', {'bomCode': newCode});
    return Bom.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// 409 when work orders reference the BOM — the API's message tells the user
  /// to deactivate instead, so surface it verbatim.
  Future<void> deleteBom(String id) =>
      apiClient.delete('/manufacturing/boms/$id');

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
    String? activeOn,
    String? entryMode,
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
    if (activeOn != null && activeOn.isNotEmpty) qp['activeOn'] = activeOn;
    if (entryMode != null && entryMode.isNotEmpty) qp['entryMode'] = entryMode;
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

  /// Undo a closed run. Restores the inputs, takes the produced batch back off
  /// the shelf and leaves the WO cancelled — the corrected figures go in as a
  /// fresh entry.
  Future<WorkOrder> reverseWo(String id, {String? reason}) async {
    final body = reason == null ? const <String, dynamic>{} : {'reason': reason};
    final res = await apiClient.post('/manufacturing/wos/$id/reverse', body);
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

  // ── Unplanned production ("Record Production") ──────────────────────────

  /// Server-computed backflush + FEFO-allocation preview. Read-shaped (no
  /// side effects), so it deliberately does NOT go through `WoRunQueue` —
  /// offline surfaces a normal network error instead of a queued write.
  Future<ProductionPreview> previewProduction({
    String? bomId,
    String? outputItemId,
    required double producedQty,
    required String warehouseId,
    List<Map<String, dynamic>>? lines,
  }) async {
    final body = <String, dynamic>{
      if (bomId != null) 'bomId': bomId,
      if (outputItemId != null) 'outputItemId': outputItemId,
      'producedQty': producedQty,
      'warehouseId': warehouseId,
      if (lines != null) 'lines': lines,
    };
    final res = await apiClient.post('/manufacturing/production/preview', body);
    return ProductionPreview.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Everything on hand behind a BOM's inputs, in the order a run would draw
  /// it. Read-only, so it skips the offline queue like the preview does.
  Future<InputPool> inputPool({
    required String bomId,
    required String warehouseId,
  }) async {
    final res = await apiClient.get(
      '/manufacturing/production/pool?bomId=$bomId&warehouseId=$warehouseId',
    );
    return InputPool.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Posts the production entry. Routes through `WoRunQueue` — see
  /// `addConsumption` for the offline-queue contract. On success the server
  /// creates + closes an unplanned WO in one shot.
  Future<ProductionPostResult> recordProduction({
    String? bomId,
    String? outputItemId,
    required double producedQty,
    required String warehouseId,
    List<Map<String, dynamic>>? lines,
    String? batchNo,
    String? expiryDate,
    String? shift,
    String? producedOn,
    String? notes,
    Map<String, dynamic>? wastage,
  }) async {
    final body = <String, dynamic>{
      if (bomId != null) 'bomId': bomId,
      if (outputItemId != null) 'outputItemId': outputItemId,
      'producedQty': producedQty,
      'warehouseId': warehouseId,
      if (lines != null) 'lines': lines,
      if (batchNo != null && batchNo.isNotEmpty) 'batchNo': batchNo,
      if (expiryDate != null && expiryDate.isNotEmpty) 'expiryDate': expiryDate,
      if (shift != null && shift.isNotEmpty) 'shift': shift,
      if (producedOn != null && producedOn.isNotEmpty) 'producedOn': producedOn,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (wastage != null) 'wastage': wastage,
    };
    return WoRunQueue.instance.recordProduction(body: body);
  }

  // ── Reclaims (FG torn back down to raw material) ─────────────────────────

  Future<List<Reclaim>> listReclaims({String? status, int limit = 50}) async {
    final qp = <String, String>{'limit': '$limit'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/reclaims?$qs');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(Reclaim.fromJson)
        .toList();
  }

  /// What can be torn down at this warehouse right now. Yield per pack and the
  /// destination list are computed server-side from the BOMs.
  Future<List<ReclaimOption>> reclaimOptions(String warehouseId) async {
    final res = await apiClient
        .get('/manufacturing/reclaims/options?warehouseId=$warehouseId');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ReclaimOption.fromJson)
        .toList();
  }

  Future<Reclaim> getReclaim(String id) async {
    final res = await apiClient.get('/manufacturing/reclaims/$id');
    return Reclaim.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<Reclaim> createReclaim({
    required String warehouseId,
    required String reclaimDate,
    required List<Map<String, dynamic>> lines,
    String? notes,
    String? idempotencyKey,
  }) async {
    final body = <String, dynamic>{
      'warehouseId': warehouseId,
      'reclaimDate': reclaimDate,
      'lines': lines,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
    };
    final res = await apiClient.post('/manufacturing/reclaims', body);
    return Reclaim.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Posts the teardown. Returns the reclaim plus any yield warnings the
  /// server raised (recovered more than the BOM says the packets held).
  Future<({Reclaim data, List<String> warnings})> postReclaim(String id) async {
    final res = await apiClient.post('/manufacturing/reclaims/$id/post', const {});
    return (
      data: Reclaim.fromJson((res['data'] as Map).cast<String, dynamic>()),
      warnings: (res['warnings'] as List? ?? const []).map((w) => w.toString()).toList(),
    );
  }

  // ── Items search (for BOM pickers) ───────────────────────────────────────

  /// Item search for BOM pickers + ad-hoc consumption. Hits the masters
  /// items list; `itemClass` and `itemClassGroup` are optional pre-filters.
  ///
  /// `itemClassGroup='finished'` → finished_good + semi_finished (BOM output picker).
  /// `itemClassGroup='inputs'`   → raw_material + packaging.
  /// `itemClassGroup='bom_inputs'` → raw_material + packaging + consumable +
  ///     semi_finished (BOM input picker). Semi-finished stays in because a
  ///     recipe can legitimately consume a sub-assembly; finished and trading
  ///     goods are sold as-is and never belong on an input line.
  /// `itemClassGroup='all'`      → no class filter (ad-hoc searches).
  /// What each of [batchNos] of [itemId] was made into, keyed by batch number.
  /// One call for every lot on screen — asking per lot would be a request per
  /// card in the raw-material pool.
  Future<Map<String, BatchUsage>> batchUsage({
    required String itemId,
    required List<String> batchNos,
  }) async {
    final wanted = batchNos.where((b) => b.isNotEmpty).toList();
    if (wanted.isEmpty) return const {};
    final qs = 'itemId=${Uri.encodeQueryComponent(itemId)}'
        '&batchNos=${Uri.encodeQueryComponent(wanted.join(','))}';
    final res = await apiClient.get('/manufacturing/wos/batch-usage?$qs');
    final data = (res['data'] as Map?)?.cast<String, dynamic>() ?? const {};
    return data.map((batch, usage) => MapEntry(
          batch,
          BatchUsage.fromJson((usage as Map).cast<String, dynamic>()),
        ));
  }

  // ── Stock, through the manufacturing gate ───────────────────────────────
  //
  // The floor is granted `manufacturing` and nothing else, and every
  // /inventory/* route 403s for them. These read the same data through the
  // module they do have — see apps/api/.../manufacturing/stock.routes.ts.

  /// What is on hand. `itemClassGroup` picks the shelf: `inputs` is what a run
  /// can draw from, `finished` is what it produced.
  Future<List<InvOnHandRow>> stockOnHand({
    String? warehouseId,
    String? itemClassGroup,
  }) async {
    final qp = <String, String>{};
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    if (itemClassGroup != null && itemClassGroup != 'all') {
      qp['itemClassGroup'] = itemClassGroup;
    }
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/stock${qs.isEmpty ? '' : '?$qs'}');
    return ((res['data'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvOnHandRow.fromJson)
        .toList();
  }

  /// One lot's movement trail — the "full history" behind a stock row.
  Future<InvMovementPage> itemMovements(InvMovementQuery q) async {
    final qp = <String, String>{'page': '${q.page}', 'limit': '50'};
    if (q.warehouseId != null) qp['warehouseId'] = q.warehouseId!;
    if (q.batchNo != null) qp['batchNo'] = q.batchNo!;
    if (q.direction != null) qp['direction'] = q.direction!;
    if (q.group != null) qp['group'] = q.group!;
    if (q.type != null) qp['type'] = q.type!;
    if (q.from != null) qp['from'] = q.from!;
    if (q.to != null) qp['to'] = q.to!;
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final res = await apiClient.get('/manufacturing/stock/items/${q.itemId}/movements?$qs');
    return InvMovementPage.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<List<InvWarehouse>> warehouses() async {
    final res = await apiClient.get('/manufacturing/warehouses');
    return ((res['data'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvWarehouse.fromJson)
        .toList();
  }

  // ── Draws ───────────────────────────────────────────────────────────────

  /// Take a raw material for a product — milk, oil, jaggery, anything the
  /// pool holds. Batches are the operator's own choice; nothing here
  /// allocates for them.
  Future<DrawRow> openDraw({
    required String outputItemId,
    required String warehouseId,
    required List<DrawLineInput> lines,
    String? shift,
  }) async {
    final res = await apiClient.post('/manufacturing/draws', {
      'outputItemId': outputItemId,
      'warehouseId': warehouseId,
      if (shift != null) 'shift': shift,
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return DrawRow.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// More of the material into a draw that is already open.
  Future<DrawRow> takeMore(String drawId, List<DrawLineInput> lines) async {
    final res = await apiClient.post('/manufacturing/draws/$drawId/milk', {
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return DrawRow.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Abandon a draw — every line goes back to the lot it came from. Used when
  /// the take itself was the mistake; a draw that made something closes
  /// through [closeDraw] instead.
  Future<void> cancelDraw(String drawId, {String? reason}) =>
      apiClient.post('/manufacturing/draws/$drawId/cancel', {
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });

  /// What came out. Posts the output and closes the draw.
  Future<DrawRow> closeDraw(
    String drawId, {
    required double qty,
    String? batchNo,
    String? expiryDate,
    String? notes,
  }) async {
    final res = await apiClient.post('/manufacturing/draws/$drawId/close', {
      'qty': qty,
      if (batchNo != null && batchNo.isNotEmpty) 'batchNo': batchNo,
      if (expiryDate != null) 'expiryDate': expiryDate,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return DrawRow.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<List<DrawRow>> listDraws({bool openOnly = true}) async {
    final res = await apiClient.get('/manufacturing/draws?open=$openOnly');
    return ((res['data'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(DrawRow.fromJson)
        .toList();
  }

  /// What the last closed draw of this product yielded, or null if none has.
  Future<DrawYieldHint?> drawYieldHint(String outputItemId) async {
    final res = await apiClient.get(
      '/manufacturing/draws/yield-hint?outputItemId=${Uri.encodeQueryComponent(outputItemId)}',
    );
    final data = res['data'];
    if (data == null) return null;
    return DrawYieldHint.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<List<MfgItemRow>> searchItems(
    String query, {
    String? itemClass,
    String? itemClassGroup,
    /// Drop (false) or isolate (true) the SKUs an auto-repack BOM makes at
    /// dispatch. Set false by the pickers that ask what a person is about to
    /// make by hand — those SKUs are only ever produced by the dispatch
    /// backfill, never taken for on purpose.
    bool? madeOnDispatch,
  }) async {
    final qp = <String, String>{'search': query, 'limit': '30', 'sort': 'category'};
    if (itemClass != null && itemClass.isNotEmpty) qp['itemClass'] = itemClass;
    if (madeOnDispatch != null) qp['madeOnDispatch'] = '$madeOnDispatch';
    // 'all' is the absence of a filter — mirror inventory_repo and omit it
    // rather than relying on the server to interpret the literal.
    if (itemClassGroup != null && itemClassGroup.isNotEmpty && itemClassGroup != 'all') {
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
