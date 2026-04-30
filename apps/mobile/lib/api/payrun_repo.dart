import 'api_client.dart';
import 'payrun_models.dart';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) {
    return (res['data'] as Map).cast<String, dynamic>();
  }
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}

List<Map<String, dynamic>> _dataList(dynamic res) {
  if (res is Map && res['data'] is List) {
    return (res['data'] as List).cast<Map<String, dynamic>>();
  }
  if (res is List) return res.cast<Map<String, dynamic>>();
  return [];
}

class PayRunRepo {
  Future<PaymentQueue> queue() async {
    final res = await apiClient.get('/ap/payment-runs/queue');
    return PaymentQueue.fromJson(_data(res));
  }

  Future<List<PaymentRun>> list({String? status}) async {
    final qp = <String, String>{'page': '1', 'limit': '50'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final res = await apiClient
        .get('/ap/payment-runs?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(PaymentRun.fromJson).toList();
  }

  Future<PaymentRunWithLines> get(String id) async {
    final res = await apiClient.get('/ap/payment-runs/$id');
    return PaymentRunWithLines.fromJson(_data(res));
  }

  Future<PaymentRunWithLines> createFromBills(List<String> billIds,
      {String? description}) async {
    final res = await apiClient.post('/ap/payment-runs/from-bills', {
      'billIds': billIds,
      if (description != null) 'description': description,
    });
    return PaymentRunWithLines.fromJson(_data(res));
  }

  Future<void> approveLines(String runId, List<String> lineIds) async {
    await apiClient
        .post('/ap/payment-runs/$runId/approve', {'lineIds': lineIds});
  }

  Future<void> rejectLines(String runId, List<String> lineIds,
      {String? reason}) async {
    await apiClient.post('/ap/payment-runs/$runId/reject', {
      'lineIds': lineIds,
      if (reason != null) 'reason': reason,
    });
  }

  Future<void> execute(String runId, String bankAccountId) async {
    await apiClient
        .post('/ap/payment-runs/$runId/execute', {'bankAccountId': bankAccountId});
  }
}

final payRunRepo = PayRunRepo();
