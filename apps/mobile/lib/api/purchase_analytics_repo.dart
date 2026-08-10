// Purchase analytics read surface. Mirror of sales_analytics_repo.dart.

library;

import 'api_client.dart';
import 'purchase_analytics_models.dart';

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

class PurchaseAnalyticsRepo {
  Future<PurchaseAnalytics> summary({
    required DateTime from,
    required DateTime to,
    String? vendorId,
  }) async {
    final res = await apiClient.get(
      '/analytics/purchases?dateFrom=${_isoDate(from)}&dateTo=${_isoDate(to)}'
      '${vendorId == null ? '' : '&vendorId=$vendorId'}',
    );
    final data = res is Map && res['data'] is Map
        ? (res['data'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    return PurchaseAnalytics.fromJson(data);
  }
}

final purchaseAnalyticsRepo = PurchaseAnalyticsRepo();
