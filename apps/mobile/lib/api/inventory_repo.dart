// Mobile-side repo for the Inventory module. Mirrors the route surface
// in `apps/api/src/modules/inventory/*`.

library;

import 'dart:io';

import 'api_client.dart';
import 'inventory_models.dart';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) return (res['data'] as Map).cast<String, dynamic>();
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}

List<Map<String, dynamic>> _dataList(dynamic res) {
  if (res is Map && res['data'] is List) return (res['data'] as List).cast<Map<String, dynamic>>();
  if (res is List) return res.cast<Map<String, dynamic>>();
  return [];
}

class InventoryRepo {
  // ── Dashboard ──────────────────────────────────────────────────────────

  Future<InvKpis> kpis() async {
    final res = await apiClient.get('/inventory/dashboard');
    return InvKpis.fromJson(_data(res));
  }

  /// Last N stock-ledger movements with item + warehouse joins. Drives the
  /// Home "Recent activity" card and the full-feed drill-down.
  Future<List<InvActivity>> recentActivity() async {
    final res = await apiClient.get('/inventory/dashboard/recent-activity');
    return _dataList(res).map(InvActivity.fromJson).toList();
  }

  /// Most-recently-moved stock in one class bucket. Drives the Home
  /// "Finished goods" / "Raw materials available" strips.
  Future<List<InvStockHighlight>> stockHighlights({required String group, int limit = 5}) async {
    final res = await apiClient.get(
      '/inventory/dashboard/stock-highlights${_qs({'group': group, 'limit': '$limit'})}',
    );
    return _dataList(res).map(InvStockHighlight.fromJson).toList();
  }

  /// Stock value per warehouse. Splits the hero's single value figure across
  /// sites on Home.
  Future<List<InvWarehouseValue>> warehouseValues() async {
    final res = await apiClient.get('/inventory/dashboard/warehouse-breakdown');
    return _dataList(res).map(InvWarehouseValue.fromJson).toList();
  }

  // ── Warehouses ─────────────────────────────────────────────────────────

  Future<List<InvWarehouse>> warehouses() async {
    final res = await apiClient.get('/inventory/warehouses');
    return _dataList(res).map(InvWarehouse.fromJson).toList();
  }

  // ── Stock ──────────────────────────────────────────────────────────────

  Future<List<InvOnHandRow>> onHand({
    String? warehouseId,
    bool lowOnly = false,
    String? itemClassGroup,
  }) async {
    final qp = <String, String>{};
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    if (lowOnly) qp['lowOnly'] = 'true';
    if (itemClassGroup != null && itemClassGroup != 'all') {
      qp['itemClassGroup'] = itemClassGroup;
    }
    final res = await apiClient.get('/inventory/stock/on-hand${_qs(qp)}');
    return _dataList(res).map(InvOnHandRow.fromJson).toList();
  }

  // ── Items / barcode lookup ─────────────────────────────────────────────

  // Full item record from the masters module — name, sku, hsn, prices,
  // gst, category, description, ean. Used by the mobile item-detail screen.
  Future<InvItemDetail> itemDetail(String id) async {
    final res = await apiClient.get('/masters/items/$id');
    return InvItemDetail.fromJson(_data(res));
  }

  // Stock-on-hand breakdown for one item — one row per (warehouse, batch).
  Future<List<InvItemStockRow>> itemStock(String id) async {
    final res = await apiClient.get('/inventory/items/$id/stock');
    // Service returns { item, onHand: [...] } — we already have the item
    // from itemDetail, so peel out onHand.
    final body = _data(res);
    final onHand = (body['onHand'] as List?) ?? const [];
    return onHand.cast<Map<String, dynamic>>().map(InvItemStockRow.fromJson).toList();
  }

  Future<InvItem?> findByBarcode(String code) async {
    try {
      final res = await apiClient.get('/inventory/items/barcode/${Uri.encodeComponent(code)}');
      return InvItem.fromJson(_data(res));
    } catch (_) {
      return null;
    }
  }

  // ── GRN ────────────────────────────────────────────────────────────────

  Future<List<InvGrn>> grnList({String? status}) async {
    final qp = <String, String>{};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    qp['limit'] = '100';
    final res = await apiClient.get('/inventory/grn${_qs(qp)}');
    return _dataList(res).map(InvGrn.fromJson).toList();
  }

  Future<InvGrn> createGrn({
    required String warehouseId,
    String? vendorId,
    required String receivedDate,
    String? vehicleNo,
    String? notes,
    required List<InvGrnLineInput> lines,
  }) async {
    final res = await apiClient.post('/inventory/grn', {
      'warehouseId': warehouseId,
      if (vendorId != null && vendorId.isNotEmpty) 'vendorId': vendorId,
      'receivedDate': receivedDate,
      if (vehicleNo != null && vehicleNo.isNotEmpty) 'vehicleNo': vehicleNo,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return InvGrn.fromJson(_data(res));
  }

  Future<InvGrnDetail> grnGet(String id) async {
    final res = await apiClient.get('/inventory/grn/$id');
    return InvGrnDetail.fromJson(_data(res));
  }

  /// Upload an invoice image / PDF and let the server's AI extractor
  /// pre-fill GRN lines. The matcher binds each line to a catalog item
  /// where it can; unmatched lines come back with `itemId: null` so the
  /// UI can prompt the user to pick manually.
  Future<InvGrnExtractResult> extractGrnInvoice(File file) async {
    final mime = _mimeFromPath(file.path);
    final res = await apiClient.upload(
      '/inventory/grn/extract',
      file,
      fileField: 'file',
      mimeType: mime,
    );
    return InvGrnExtractResult.fromJson(_data(res));
  }

  /// Catalog search for the "Map item" picker. Hits the masters list
  /// endpoint with its existing per-word `search` param.
  Future<List<InvItem>> searchItems(String query, {int limit = 25, String? itemClassGroup}) async {
    final qp = <String, String>{
      'limit': '$limit',
      if (query.trim().isNotEmpty) 'search': query.trim(),
      if (itemClassGroup != null && itemClassGroup != 'all') 'itemClassGroup': itemClassGroup,
    };
    final res = await apiClient.get('/masters/items${_qs(qp)}');
    return _dataList(res).map(InvItem.fromJson).toList();
  }

  /// Single item as the lightweight [InvItem] (tracking flags + master rate).
  /// Used when prefilling an edit form where we only have the item id.
  Future<InvItem> itemById(String id) async {
    final res = await apiClient.get('/masters/items/$id');
    return InvItem.fromJson(_data(res));
  }

  /// Paged item-master list for the Items screen. Search + class-group filter
  /// are applied server-side; pagination meta comes back for load-more.
  Future<InvItemPage> items({
    int page = 1,
    int limit = 25,
    String? search,
    String? itemClassGroup,

    /// A single item_class, for filters finer than a group — 'semi_finished'
    /// on its own, say, which the 'finished' group would bury among the
    /// packed goods.
    String? itemClass,

    /// Items carrying no item_class at all — the "Other" pill. Mutually
    /// exclusive with the two filters above.
    bool unclassified = false,
    bool withStock = false,
    String? sort,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (unclassified) qp['unclassified'] = 'true';
    if (withStock) qp['withStock'] = 'true';
    if (sort != null) qp['sort'] = sort;
    if (search != null && search.trim().isNotEmpty) qp['search'] = search.trim();
    if (itemClassGroup != null && itemClassGroup != 'all') {
      qp['itemClassGroup'] = itemClassGroup;
    }
    if (itemClass != null && itemClass.isNotEmpty) qp['itemClass'] = itemClass;
    final res = await apiClient.get('/masters/items${_qs(qp)}');
    return InvItemPage.fromResponse(res);
  }

  /// Per-class item tallies for the items-screen filter strip. One cheap
  /// aggregate, so the pills can carry counts without paging the catalogue.
  /// Keys are item_class values plus 'unclassified'.
  Future<Map<String, int>> itemClassCounts() async {
    final res = await apiClient.get('/masters/items/class-counts');
    final data = _data(res);
    final byClass = (data['byClass'] as Map?)?.cast<String, dynamic>() ?? const {};
    return {
      for (final e in byClass.entries) e.key: (e.value as num).toInt(),
      'unclassified': (data['unclassified'] as num?)?.toInt() ?? 0,
    };
  }

  /// Active category tree (roots + nested subcategories) for the item form's
  /// category / subcategory pickers.
  Future<List<InvCategory>> categoryTree() async {
    final res = await apiClient.get('/masters/categories/tree');
    return _dataList(res).map(InvCategory.fromJson).toList();
  }

  /// Create an item in the masters module. [body] is the already-validated
  /// payload (name + optional sku / type / class / unit / hsn / prices /
  /// tracking flags). Returns the created item as [InvItemDetail].
  Future<InvItemDetail> createItem(Map<String, dynamic> body) async {
    final res = await apiClient.post('/masters/items', body);
    return InvItemDetail.fromJson(_data(res));
  }

  /// Update an item's master record. [body] carries only the fields being
  /// changed — the API's update schema is a partial. Returns the saved item
  /// so callers can render the server's derived values, not their own.
  Future<InvItemDetail> updateItem(String id, Map<String, dynamic> body) async {
    final res = await apiClient.put('/masters/items/$id', body);
    return InvItemDetail.fromJson(_data(res));
  }

  /// Price-list lines covering this item, most-specific scope first.
  Future<List<InvItemPriceLine>> itemPriceLists(String id) async {
    final res = await apiClient.get('/masters/items/$id/price-lists');
    return _dataList(res).map(InvItemPriceLine.fromJson).toList();
  }

  Future<InvGrn> postGrn(String id) async {
    final res = await apiClient.post('/inventory/grn/$id/post', const {});
    return InvGrn.fromJson(_data(res));
  }

  Future<InvGrn> cancelGrn(String id, String reason) async {
    final res = await apiClient.post('/inventory/grn/$id/cancel', {'reason': reason});
    return InvGrn.fromJson(_data(res));
  }

  // ── Delivery ───────────────────────────────────────────────────────────

  Future<List<InvDn>> dnList({String? status}) async {
    final qp = <String, String>{};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    qp['limit'] = '100';
    final res = await apiClient.get('/inventory/delivery-notes${_qs(qp)}');
    return _dataList(res).map(InvDn.fromJson).toList();
  }

  Future<InvDn> createDn({
    required String warehouseId,
    String? customerId,
    required String dispatchDate,
    String? vehicleNo,
    required List<InvDnLineInput> lines,
  }) async {
    final res = await apiClient.post('/inventory/delivery-notes', {
      'warehouseId': warehouseId,
      if (customerId != null && customerId.isNotEmpty) 'customerId': customerId,
      'dispatchDate': dispatchDate,
      if (vehicleNo != null && vehicleNo.isNotEmpty) 'vehicleNo': vehicleNo,
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return InvDn.fromJson(_data(res));
  }

  Future<InvDnDetail> dnGet(String id) async {
    final res = await apiClient.get('/inventory/delivery-notes/$id');
    return InvDnDetail.fromJson(_data(res));
  }

  Future<InvDn> updateDn({
    required String id,
    String? warehouseId,
    String? customerId,
    String? dispatchDate,
    String? vehicleNo,
    String? eWayBillNo,
    String? notes,
    required List<InvDnLineInput> lines,
  }) async {
    final body = <String, dynamic>{
      if (warehouseId != null) 'warehouseId': warehouseId,
      // customerId may be null to clear it; only send when caller wants to update
      if (customerId != null) 'customerId': customerId.isEmpty ? null : customerId,
      if (dispatchDate != null) 'dispatchDate': dispatchDate,
      if (vehicleNo != null) 'vehicleNo': vehicleNo.isEmpty ? null : vehicleNo,
      if (eWayBillNo != null) 'eWayBillNo': eWayBillNo.isEmpty ? null : eWayBillNo,
      if (notes != null) 'notes': notes.isEmpty ? null : notes,
      'lines': lines.map((l) => l.toJson()).toList(),
    };
    final res = await apiClient.put('/inventory/delivery-notes/$id', body);
    return InvDn.fromJson(_data(res));
  }

  Future<InvDn> dispatchDn(String id) async {
    final res = await apiClient.post('/inventory/delivery-notes/$id/dispatch', const {});
    return InvDn.fromJson(_data(res));
  }

  Future<InvDn> cancelDn(String id, String reason) async {
    final res = await apiClient.post('/inventory/delivery-notes/$id/cancel', {'reason': reason});
    return InvDn.fromJson(_data(res));
  }

  // ── Transfers ──────────────────────────────────────────────────────────

  Future<List<InvTransfer>> transferList({String? status}) async {
    final qp = <String, String>{'limit': '100'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final res = await apiClient.get('/inventory/transfers${_qs(qp)}');
    return _dataList(res).map(InvTransfer.fromJson).toList();
  }

  Future<InvTransferDetail> transferGet(String id) async {
    final res = await apiClient.get('/inventory/transfers/$id');
    return InvTransferDetail.fromJson(_data(res));
  }

  Future<InvTransfer> createTransfer({
    required String fromWarehouseId,
    required String toWarehouseId,
    String? vehicleNo,
    required List<InvTransferLineInput> lines,
  }) async {
    final res = await apiClient.post('/inventory/transfers', {
      'fromWarehouseId': fromWarehouseId,
      'toWarehouseId': toWarehouseId,
      if (vehicleNo != null && vehicleNo.isNotEmpty) 'vehicleNo': vehicleNo,
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return InvTransfer.fromJson(_data(res));
  }

  Future<InvTransfer> dispatchTransfer(String id) async {
    final res = await apiClient.post('/inventory/transfers/$id/dispatch', const {});
    return InvTransfer.fromJson(_data(res));
  }

  Future<InvTransfer> receiveTransfer(String id) async {
    // Default-receive uses dispatched qty per line.
    final res = await apiClient.post('/inventory/transfers/$id/receive', const {});
    return InvTransfer.fromJson(_data(res));
  }

  // ── Adjustments ────────────────────────────────────────────────────────

  Future<List<InvAdjustment>> adjustmentList({String? status}) async {
    final qp = <String, String>{'limit': '100'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final res = await apiClient.get('/inventory/adjustments${_qs(qp)}');
    return _dataList(res).map(InvAdjustment.fromJson).toList();
  }

  Future<InvAdjustment> createAdjustment({
    required String warehouseId,
    required String reason,
    required String adjustmentDate,
    String? notes,
    required List<InvAdjustmentLineInput> lines,
  }) async {
    final res = await apiClient.post('/inventory/adjustments', {
      'warehouseId': warehouseId,
      'reason': reason,
      'adjustmentDate': adjustmentDate,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return InvAdjustment.fromJson(_data(res));
  }

  Future<InvAdjustmentDetail> adjustmentGet(String id) async {
    final res = await apiClient.get('/inventory/adjustments/$id');
    return InvAdjustmentDetail.fromJson(_data(res));
  }

  Future<InvAdjustment> postAdjustment(String id) async {
    final res = await apiClient.post('/inventory/adjustments/$id/post', const {});
    return InvAdjustment.fromJson(_data(res));
  }

  /// Abandon a draft that can't be posted. The document stays on the list as
  /// cancelled rather than vanishing, so the audit trail keeps the attempt.
  Future<InvAdjustment> cancelAdjustment(String id, String reason) async {
    final res = await apiClient.post('/inventory/adjustments/$id/cancel', {'reason': reason});
    return InvAdjustment.fromJson(_data(res));
  }

  // ── Stock take ─────────────────────────────────────────────────────────

  Future<List<InvStockTake>> stockTakeList({String? status}) async {
    final qp = <String, String>{'limit': '100'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final res = await apiClient.get('/inventory/stock-takes${_qs(qp)}');
    return _dataList(res).map(InvStockTake.fromJson).toList();
  }

  Future<InvStockTakeDetail> stockTakeGet(String id) async {
    final res = await apiClient.get('/inventory/stock-takes/$id');
    return InvStockTakeDetail.fromJson(_data(res));
  }

  Future<InvStockTake> startStockTake({
    required String warehouseId,
    String scope = 'full',
    bool freeze = false,
  }) async {
    final res = await apiClient.post('/inventory/stock-takes', {
      'warehouseId': warehouseId,
      'scope': scope,
      'freeze': freeze,
    });
    return InvStockTake.fromJson(_data(res));
  }

  Future<void> upsertCountLines(String id, List<InvCountLineInput> lines) async {
    await apiClient.post('/inventory/stock-takes/$id/lines', {
      'lines': lines.map((l) => l.toJson()).toList(),
    });
  }

  Future<InvStockTake> postStockTake(String id) async {
    final res = await apiClient.post('/inventory/stock-takes/$id/post', const {});
    return InvStockTake.fromJson(_data(res));
  }

  // ── Reorder alerts ─────────────────────────────────────────────────────

  Future<List<InvReorderAlert>> reorderAlerts() async {
    final res = await apiClient.get('/inventory/stock/reorder-alerts');
    return _dataList(res).map(InvReorderAlert.fromJson).toList();
  }

  // ── Stock alerts (low + out of stock) ──────────────────────────────────

  /// [status] is 'all' | 'low' | 'out'. Omitting it returns every non-ok row.
  Future<List<InvStockAlert>> stockAlerts({
    String? status,
    String? warehouseId,
    String? search,
  }) async {
    final q = <String, String>{
      if (status != null && status != 'all') 'status': status,
      if (warehouseId != null) 'warehouseId': warehouseId,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    };
    final qs = q.isEmpty ? '' : '?${Uri(queryParameters: q).query}';
    final res = await apiClient.get('/inventory/stock/alerts$qs');
    return _dataList(res).map(InvStockAlert.fromJson).toList();
  }

  Future<InvStockAlertCounts> stockAlertCounts({String? warehouseId}) async {
    final qs = warehouseId == null
        ? ''
        : '?${Uri(queryParameters: {'warehouseId': warehouseId}).query}';
    final res = await apiClient.get('/inventory/stock/alerts/counts$qs');
    return InvStockAlertCounts.fromJson(_data(res));
  }

  /// Batches with an expiry inside the window — drives the Mfg home
  /// "Perishables on-hand" tile. `includeExpired` surfaces rows where the
  /// stock is already past its date so they don't silently roll into a WO.
  Future<List<InvExpiringBatch>> expiring({
    int withinDays = 2,
    bool includeExpired = true,
    String? warehouseId,
  }) async {
    final qp = <String, String>{'withinDays': '$withinDays'};
    if (includeExpired) qp['includeExpired'] = 'true';
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    final res = await apiClient.get('/inventory/stock/expiring${_qs(qp)}');
    return _dataList(res).map(InvExpiringBatch.fromJson).toList();
  }

  // ── Analytics ──────────────────────────────────────────────────────────

  Future<InvHealth> analyticsHealth({int window = 90, String? warehouseId}) async {
    final res = await apiClient.get(
      '/inventory/analytics/health${_qs({'window': '$window', if (warehouseId != null) 'warehouseId': warehouseId})}',
    );
    return InvHealth.fromJson(_data(res));
  }

  Future<List<InvSkuPerformance>> analyticsPerformance({
    int window = 90,
    String? warehouseId,
    int limit = 100,
  }) async {
    final res = await apiClient.get(
      '/inventory/analytics/performance${_qs({'window': '$window', 'limit': '$limit', if (warehouseId != null) 'warehouseId': warehouseId})}',
    );
    return _dataList(res).map(InvSkuPerformance.fromJson).toList();
  }

  Future<InvStockRisk> analyticsRisk({int window = 90, String? warehouseId}) async {
    final res = await apiClient.get(
      '/inventory/analytics/stock-risk${_qs({'window': '$window', if (warehouseId != null) 'warehouseId': warehouseId})}',
    );
    return InvStockRisk.fromJson(_data(res));
  }

  Future<InvForecast> analyticsForecast({
    int window = 90,
    String? warehouseId,
    int horizonDays = 60,
  }) async {
    final res = await apiClient.get(
      '/inventory/analytics/forecast${_qs({'window': '$window', 'horizonDays': '$horizonDays', if (warehouseId != null) 'warehouseId': warehouseId})}',
    );
    return InvForecast.fromJson(_data(res));
  }

  Future<List<InvTrendPoint>> analyticsTrend({
    int months = 6,
    String bucket = 'week',
    String? warehouseId,
  }) async {
    final res = await apiClient.get(
      '/inventory/analytics/trend${_qs({'months': '$months', 'bucket': bucket, if (warehouseId != null) 'warehouseId': warehouseId})}',
    );
    final d = _data(res);
    return ((d['points'] as List?) ?? [])
        .map((e) => InvTrendPoint.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<InvReplenishment> analyticsReplenishment({
    int window = 90,
    int serviceLevel = 95,
    String? warehouseId,
  }) async {
    final res = await apiClient.get(
      '/inventory/analytics/replenishment${_qs({'window': '$window', 'serviceLevel': '$serviceLevel', if (warehouseId != null) 'warehouseId': warehouseId})}',
    );
    return InvReplenishment.fromJson(_data(res));
  }

  /// Bulk-write the computed reorder points onto the item master.
  /// [mode] is 'unconfigured' (non-destructive) or 'all'. A [dryRun] returns
  /// the same counts without writing, for a confirm step.
  Future<InvApplyLevelsResult> applyReplenishment({
    int window = 90,
    int serviceLevel = 95,
    String? warehouseId,
    String mode = 'unconfigured',
    bool dryRun = false,
  }) async {
    final res = await apiClient.post('/inventory/analytics/replenishment/apply', {
      'window': window,
      'serviceLevel': serviceLevel,
      if (warehouseId != null) 'warehouseId': warehouseId,
      'mode': mode,
      'dryRun': dryRun,
    });
    return InvApplyLevelsResult.fromJson(_data(res));
  }

  /// Daily write-off register — what stock was lost each day and what it cost.
  Future<InvWriteOffReport> writeOffs({
    String? from,
    String? to,
    String? warehouseId,
    String? reason,
  }) async {
    final res = await apiClient.get('/inventory/reports/write-offs${_qs({
      if (from != null) 'from': from,
      if (to != null) 'to': to,
      if (warehouseId != null) 'warehouseId': warehouseId,
      if (reason != null) 'reason': reason,
    })}');
    return InvWriteOffReport.fromJson(_data(res));
  }

  String _qs(Map<String, String> qp) => qp.isEmpty ? '' : '?${Uri(queryParameters: qp).query}';

  String _mimeFromPath(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }
}

final inventoryRepo = InventoryRepo();
