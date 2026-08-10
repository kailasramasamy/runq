// Sales analytics read surface. Its own repo rather than another method on
// the already-large repos.dart, mirroring how the inventory module is split.

library;

import 'api_client.dart';
import 'sales_analytics_models.dart';

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

class SalesAnalyticsRepo {
  Future<SalesAnalytics> summary({
    required DateTime from,
    required DateTime to,
    String? customerId,
  }) async {
    final res = await apiClient.get(
      '/analytics/sales?dateFrom=${_isoDate(from)}&dateTo=${_isoDate(to)}'
      '${customerId == null ? '' : '&customerId=$customerId'}',
    );
    final data = res is Map && res['data'] is Map
        ? (res['data'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    return SalesAnalytics.fromJson(data);
  }
}

final salesAnalyticsRepo = SalesAnalyticsRepo();
