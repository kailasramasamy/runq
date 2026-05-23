// Mobile-side repo for the Inventory module. Mirrors the route surface
// in `apps/api/src/modules/inventory/*`.

library;

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

  // ── Warehouses ─────────────────────────────────────────────────────────

  Future<List<InvWarehouse>> warehouses() async {
    final res = await apiClient.get('/inventory/warehouses');
    return _dataList(res).map(InvWarehouse.fromJson).toList();
  }

  // ── Stock ──────────────────────────────────────────────────────────────

  Future<List<InvOnHandRow>> onHand({String? warehouseId, bool lowOnly = false}) async {
    final qp = <String, String>{};
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    if (lowOnly) qp['lowOnly'] = 'true';
    final res = await apiClient.get('/inventory/stock/on-hand${_qs(qp)}');
    return _dataList(res).map(InvOnHandRow.fromJson).toList();
  }

  // ── Items / barcode lookup ─────────────────────────────────────────────

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

  Future<InvGrn> postGrn(String id) async {
    final res = await apiClient.post('/inventory/grn/$id/post', const {});
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

  Future<InvDn> dispatchDn(String id) async {
    final res = await apiClient.post('/inventory/delivery-notes/$id/dispatch', const {});
    return InvDn.fromJson(_data(res));
  }

  // ── Transfers ──────────────────────────────────────────────────────────

  Future<List<InvTransfer>> transferList({String? status}) async {
    final qp = <String, String>{'limit': '100'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final res = await apiClient.get('/inventory/transfers${_qs(qp)}');
    return _dataList(res).map(InvTransfer.fromJson).toList();
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

  String _qs(Map<String, String> qp) =>
      qp.isEmpty ? '' : '?${Uri(queryParameters: qp).query}';
}

final inventoryRepo = InventoryRepo();
