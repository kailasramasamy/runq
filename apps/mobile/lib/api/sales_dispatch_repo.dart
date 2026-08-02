// Invoice → dispatch lane. Kept out of InventoryRepo (already ~450 lines)
// but hitting the same /inventory prefix.

library;

import 'api_client.dart';
import 'inventory_models.dart';
import 'sales_dispatch_models.dart';

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

/// One page of the dispatch queue plus how many rows exist behind it.
typedef PendingPage = ({List<InvPendingDispatch> rows, int total});

class SalesDispatchRepo {
  /// Issued invoices whose goods haven't left yet.
  ///
  /// [from] matters: without a floor, a tenant that invoiced for years before
  /// dispatch tracking existed opens this list on its whole back catalogue.
  ///
  /// Returns [total] alongside the page because the rows are capped — a
  /// caller that counts `rows.length` for a badge reports the page size, not
  /// how much work is actually waiting.
  Future<PendingPage> pending({String? from, String? q}) async {
    final qp = <String, String>{'limit': '100'};
    if (from != null && from.isNotEmpty) qp['from'] = from;
    if (q != null && q.isNotEmpty) qp['q'] = q;
    final res = await apiClient.get('/inventory/sales-dispatch/pending?${_qs(qp)}');
    final rows = _dataList(res).map(InvPendingDispatch.fromJson).toList();
    final total = res is Map ? (res['total'] as num?)?.toInt() : null;
    return (rows: rows, total: total ?? rows.length);
  }

  /// Line-by-line plan for the confirm screen — remaining qty, FEFO batch
  /// suggestion, and what's actually on hand to send it from.
  Future<InvDispatchPreview> preview(String invoiceId, String warehouseId) async {
    final res = await apiClient.get(
      '/inventory/sales-dispatch/$invoiceId/preview?warehouseId=$warehouseId',
    );
    return InvDispatchPreview.fromJson(_data(res));
  }

  /// Creates the draft DN. Stock has NOT moved when this returns — call
  /// [InventoryRepo.dispatchDn] next. Split on purpose: a shortage then
  /// leaves an editable draft instead of a half-posted ledger.
  Future<InvDn> createDraft({
    required String invoiceId,
    required String warehouseId,
    required String dispatchDate,
    String? vehicleNo,
    String? lrNo,
    required List<InvDispatchLineInput> lines,
  }) async {
    final res = await apiClient.post('/inventory/sales-dispatch/$invoiceId', {
      'warehouseId': warehouseId,
      'dispatchDate': dispatchDate,
      if (vehicleNo != null && vehicleNo.isNotEmpty) 'vehicleNo': vehicleNo,
      if (lrNo != null && lrNo.isNotEmpty) 'lrNo': lrNo,
      'lines': lines.map((l) => l.toJson()).toList(),
    });
    return InvDn.fromJson(_data(res));
  }

  /// Remember a description → item mapping so future invoices self-resolve.
  Future<void> saveItemAlias({required String sourceName, required String itemId}) async {
    await apiClient.post('/inventory/sales-dispatch/item-aliases', {
      'sourceName': sourceName,
      'itemId': itemId,
    });
  }

  String _qs(Map<String, String> qp) =>
      qp.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
}

final salesDispatchRepo = SalesDispatchRepo();
