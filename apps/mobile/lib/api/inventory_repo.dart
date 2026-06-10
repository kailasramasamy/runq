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
    return onHand
        .cast<Map<String, dynamic>>()
        .map(InvItemStockRow.fromJson)
        .toList();
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
  Future<List<InvItem>> searchItems(String query,
      {int limit = 25, String? itemClassGroup}) async {
    final qp = <String, String>{
      'limit': '$limit',
      if (query.trim().isNotEmpty) 'search': query.trim(),
      if (itemClassGroup != null && itemClassGroup != 'all')
        'itemClassGroup': itemClassGroup,
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

  Future<InvGrn> postGrn(String id) async {
    final res = await apiClient.post('/inventory/grn/$id/post', const {});
    return InvGrn.fromJson(_data(res));
  }

  Future<InvGrn> cancelGrn(String id, String reason) async {
    final res = await apiClient.post(
      '/inventory/grn/$id/cancel',
      {'reason': reason},
    );
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
    final res = await apiClient.post(
      '/inventory/delivery-notes/$id/cancel',
      {'reason': reason},
    );
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

  Future<void> upsertCountLines(
    String id,
    List<InvCountLineInput> lines,
  ) async {
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

  String _qs(Map<String, String> qp) =>
      qp.isEmpty ? '' : '?${Uri(queryParameters: qp).query}';

  String _mimeFromPath(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      default: return 'application/octet-stream';
    }
  }
}

final inventoryRepo = InventoryRepo();
