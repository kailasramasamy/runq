import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_client.dart';
import 'api_config.dart';
import 'purchase_models.dart';

/// PP Phase 1 — Purchase Order repo. Wraps the seven REST endpoints
/// under `/purchase/pos`. Status transitions return the updated PO so
/// the provider can refresh in one shot.
class PurchaseRepo {
  Future<({List<PurchaseOrder> data, int total, int totalPages})> listPOs({
    String? status,
    String? search,
    String? vendorId,
    int page = 1,
    int limit = 25,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    if (search != null && search.isNotEmpty) qp['search'] = search;
    if (vendorId != null && vendorId.isNotEmpty) qp['vendorId'] = vendorId;
    final qs = qp.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
    final res = await apiClient.get('/purchase/pos?$qs');
    final list = (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(PurchaseOrder.fromJson)
        .toList();
    final meta = (res['meta'] as Map?) ?? const {};
    return (
      data: list,
      total: meta['total'] is int ? meta['total'] as int : 0,
      totalPages: meta['totalPages'] is int ? meta['totalPages'] as int : 0,
    );
  }

  Future<PurchaseOrderWithLines> getById(String id) async {
    final res = await apiClient.get('/purchase/pos/$id');
    return PurchaseOrderWithLines.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<PurchaseOrderWithLines> create({
    required String vendorId,
    required String poDate,
    String? expectedDate,
    String? paymentTerms,
    String? deliveryAddress,
    String? notes,
    required List<Map<String, dynamic>> lines,
    required double subtotal,
    required double taxTotal,
    required double total,
  }) async {
    final body = <String, dynamic>{
      'vendorId': vendorId,
      'poDate': poDate,
      if (expectedDate != null) 'expectedDate': expectedDate,
      if (paymentTerms != null) 'paymentTerms': paymentTerms,
      if (deliveryAddress != null) 'deliveryAddress': deliveryAddress,
      if (notes != null) 'notes': notes,
      'lines': lines,
      'subtotal': subtotal,
      'taxTotal': taxTotal,
      'total': total,
    };
    final res = await apiClient.post('/purchase/pos', body);
    return PurchaseOrderWithLines.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<PurchaseOrderWithLines> update(String id, Map<String, dynamic> body) async {
    final res = await apiClient.put('/purchase/pos/$id', body);
    return PurchaseOrderWithLines.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<PurchaseOrderWithLines> send(String id) async {
    final res = await apiClient.post('/purchase/pos/$id/send', const {});
    return PurchaseOrderWithLines.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<PurchaseOrderWithLines> close(String id, {required String reason}) async {
    final res = await apiClient.post('/purchase/pos/$id/close', {'reason': reason});
    return PurchaseOrderWithLines.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Fetch the PO as a PDF for download/share. Returns the raw bytes and the
  /// server-suggested filename (parsed from Content-Disposition) so the
  /// share sheet shows `<PO#>-<vendor>.pdf` instead of a tmp UUID.
  Future<({List<int> bytes, String? fileName})> pdfBytes(String poId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/purchase/pos/$poId/pdf?format=pdf');
    final headers = <String, String>{};
    if (apiClient.token != null) headers['Authorization'] = 'Bearer ${apiClient.token}';
    final res = await http.get(uri, headers: headers);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(statusCode: res.statusCode, message: 'Could not generate PO PDF');
    }
    final disp = res.headers['content-disposition'];
    String? fileName;
    if (disp != null && disp.isNotEmpty) {
      final m = RegExp(r'filename="?([^";]+)"?', caseSensitive: false).firstMatch(disp);
      fileName = m?.group(1)?.trim();
    }
    return (bytes: res.bodyBytes, fileName: fileName);
  }

  Future<PurchaseOrderWithLines> cancel(String id, {String? reason}) async {
    final body = reason == null ? const <String, dynamic>{} : {'reason': reason};
    final res = await apiClient.post('/purchase/pos/$id/cancel', body);
    return PurchaseOrderWithLines.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ─── PP Phase 2 — Receive against PO ───────────────────────────────────

  Future<ReceiveTemplate> getReceiveTemplate(String poId) async {
    final res = await apiClient.get('/purchase/pos/$poId/receive-template');
    return ReceiveTemplate.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  Future<ReceiveResult> receive(
    String poId, {
    required String warehouseId,
    required String receivedDate,
    String? vehicleNo,
    String? lrNo,
    String? notes,
    required List<Map<String, dynamic>> lines,
  }) async {
    final body = <String, dynamic>{
      'warehouseId': warehouseId,
      'receivedDate': receivedDate,
      if (vehicleNo != null) 'vehicleNo': vehicleNo,
      if (lrNo != null) 'lrNo': lrNo,
      if (notes != null) 'notes': notes,
      'lines': lines,
    };
    final res = await apiClient.post('/purchase/pos/$poId/receive', body);
    return ReceiveResult.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ─── PP Phase 4 — Direct Receipt ───────────────────────────────────────

  Future<List<DirectReceiptRow>> listDirectReceipts({
    String? warehouseId,
    String? dateFrom,
    String? dateTo,
    int page = 1,
    int limit = 50,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (warehouseId != null && warehouseId.isNotEmpty) qp['warehouseId'] = warehouseId;
    if (dateFrom != null && dateFrom.isNotEmpty) qp['dateFrom'] = dateFrom;
    if (dateTo != null && dateTo.isNotEmpty) qp['dateTo'] = dateTo;
    final qs = qp.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
    final res = await apiClient.get('/purchase/direct-receipts?$qs');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(DirectReceiptRow.fromJson)
        .toList();
  }

  Future<({String id, String grnNo})> createDirectReceipt({
    required String warehouseId,
    required String inventoryItemId,
    required String receivedAt,
    required double qty,
    required double unitRate,
    String? sourceLabel,
    String? batchNo,
    String? expiryDate,
    String? vehicleNo,
    String? lrNo,
    String? notes,
  }) async {
    final body = <String, dynamic>{
      'warehouseId': warehouseId,
      'inventoryItemId': inventoryItemId,
      'receivedAt': receivedAt,
      'qty': qty,
      'unitRate': unitRate,
      if (sourceLabel != null) 'sourceLabel': sourceLabel,
      if (batchNo != null) 'batchNo': batchNo,
      if (expiryDate != null) 'expiryDate': expiryDate,
      if (vehicleNo != null) 'vehicleNo': vehicleNo,
      if (lrNo != null) 'lrNo': lrNo,
      if (notes != null) 'notes': notes,
    };
    final res = await apiClient.post('/purchase/direct-receipts', body);
    final data = (res['data'] as Map).cast<String, dynamic>();
    return (id: data['id'] as String, grnNo: data['grnNo'] as String);
  }

  Future<void> cancelDirectReceipt(String id) async {
    await apiClient.delete('/purchase/direct-receipts/$id');
  }

  // ─── PP Phase 3 — 3-way match ──────────────────────────────────────

  /// Preview match candidates for a bill. Returns vendor's open POs +
  /// the bill's current match status. Server: POST /purchase/match/preview.
  Future<MatchPreview> previewMatch(String billId) async {
    final res = await apiClient.post('/purchase/match/preview', {'billId': billId});
    return MatchPreview.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Commit a match. Outside-tolerance commits require overrideReason
  /// per the spec. Server: POST /purchase/match/commit.
  Future<({String status, double pctDelta})> commitMatch({
    required String billId,
    required String matchedPoId,
    String? overrideReason,
  }) async {
    final body = <String, dynamic>{
      'billId': billId,
      'matchedPoId': matchedPoId,
      if (overrideReason != null) 'overrideReason': overrideReason,
    };
    final res = await apiClient.post('/purchase/match/commit', body);
    final data = (res['data'] as Map).cast<String, dynamic>();
    final raw = data['pctDelta'];
    final pct = raw is num
        ? raw.toDouble()
        : (raw == null ? 0.0 : double.tryParse(raw.toString()) ?? 0.0);
    return (status: data['status'] as String, pctDelta: pct);
  }

  /// GRNs + bills linked to a PO. Drives the PO detail "Linked
  /// documents" card.
  Future<({
    List<Map<String, dynamic>> grns,
    List<Map<String, dynamic>> bills,
    List<Map<String, dynamic>> attachments,
  })> linkedDocuments(String poId) async {
    final res = await apiClient.get('/purchase/pos/$poId/linked-documents');
    final data = (res['data'] as Map).cast<String, dynamic>();
    return (
      grns: (data['grns'] as List? ?? const []).cast<Map<String, dynamic>>(),
      bills: (data['bills'] as List? ?? const []).cast<Map<String, dynamic>>(),
      attachments: (data['attachments'] as List? ?? const []).cast<Map<String, dynamic>>(),
    );
  }

  // ─── PP Phase 5 — Scan vendor invoice on PO receive ──────────────────

  /// Upload an invoice image/PDF to the preview endpoint. Returns the
  /// extracted invoice + per-line catalog suggestions so the review screen
  /// can render before commit.
  Future<ScanPreviewResult> scanPreview(String poId, File file, {String? mimeType}) async {
    final res = await apiClient.upload(
      '/purchase/pos/$poId/scan-preview',
      file,
      mimeType: mimeType,
    );
    return ScanPreviewResult.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  /// Commit the (possibly edited) scan as a combined GRN + Bill + JE.
  Future<ScanCommitResult> scanCommit(String poId, Map<String, dynamic> payload) async {
    final res = await apiClient.post('/purchase/pos/$poId/scan-commit', payload);
    return ScanCommitResult.fromJson((res['data'] as Map).cast<String, dynamic>());
  }

  // ─── Vendor catalog (read-only for PP) ───────────────────────────────

  /// List active catalog rows for a vendor. Drives the PO-line catalog
  /// picker on mobile. Server-side this is /ap/vendors/:id/catalog.
  Future<List<VendorCatalogEntry>> listVendorCatalog(String vendorId, {String? query}) async {
    final qp = (query == null || query.isEmpty)
        ? ''
        : '?q=${Uri.encodeQueryComponent(query)}';
    final res = await apiClient.get('/ap/vendors/$vendorId/catalog$qp');
    return (res['data'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(VendorCatalogEntry.fromJson)
        .toList();
  }
}

final purchaseRepo = PurchaseRepo();
