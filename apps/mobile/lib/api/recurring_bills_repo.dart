import 'api_client.dart';
import 'recurring_bill_models.dart';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) {
    return (res['data'] as Map).cast<String, dynamic>();
  }
  return res is Map ? res.cast<String, dynamic>() : {};
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class RecurringBillsRepo {
  Future<List<RecurringBill>> list() async {
    final res = await apiClient.get('/ap/recurring-bills');
    final rows = res is Map && res['data'] is List ? res['data'] as List : const [];
    return rows
        .map((e) => RecurringBill.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<RecurringBillDetail> detail(String id) async {
    final res = await apiClient.get('/ap/recurring-bills/$id');
    return RecurringBillDetail.fromJson(_data(res));
  }

  /// [startMonth] / [endMonth] must be first-of-month dates.
  Future<void> create({
    required String vendorId,
    required String title,
    required String category,
    required String frequency,
    required double amount,
    required int billDay,
    required DateTime startMonth,
    DateTime? endMonth,
  }) async {
    await apiClient.post('/ap/recurring-bills', {
      'vendorId': vendorId,
      'title': title,
      'category': category,
      'frequency': frequency,
      'expenseAccountCode': null,
      'amount': amount,
      'billDay': billDay,
      'startMonth': _isoDate(DateTime(startMonth.year, startMonth.month)),
      'endMonth': endMonth == null
          ? null
          : _isoDate(DateTime(endMonth.year, endMonth.month)),
    });
  }

  /// Amount changes apply to future months only.
  Future<void> update(String id, Map<String, dynamic> patch) async {
    await apiClient.put('/ap/recurring-bills/$id', patch);
  }

  /// Deletes an agreement and its unpaid bills; the server refuses once any
  /// payment is recorded against it.
  Future<void> delete(String id) async {
    await apiClient.delete('/ap/recurring-bills/$id');
  }

  /// Cancels (reverses) a recorded payment; its periods go back to due.
  Future<void> cancelPayment(String id, String paymentId) async {
    await apiClient.post('/ap/recurring-bills/$id/payments/$paymentId/cancel', {});
  }

  Future<RecurringPaymentResult> pay(
    String id, {
    required double amount,
    required DateTime paymentDate,
    required String bankAccountId,
    String? referenceNumber,
    required bool asAdvance,
    List<String>? billIds,
  }) async {
    final body = <String, dynamic>{
      'amount': amount,
      'paymentDate': _isoDate(paymentDate),
      'bankAccountId': bankAccountId,
      'asAdvance': asAdvance,
      if (billIds != null && billIds.isNotEmpty) 'billIds': billIds,
    };
    if (referenceNumber != null && referenceNumber.isNotEmpty) {
      body['referenceNumber'] = referenceNumber;
    }
    final res = await apiClient.post('/ap/recurring-bills/$id/payments', body);
    return RecurringPaymentResult.fromJson(_data(res));
  }

  /// First-of-month ISO string helper for callers building patch bodies.
  static String monthIso(DateTime d) => _isoDate(DateTime(d.year, d.month));
}

final recurringBillsRepo = RecurringBillsRepo();
