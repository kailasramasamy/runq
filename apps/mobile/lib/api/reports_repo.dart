import 'api_client.dart';
import 'reports_models.dart';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) {
    return (res['data'] as Map).cast<String, dynamic>();
  }
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}

class ReportsRepo {
  Future<ProfitAndLoss> profitAndLoss(DateTime from, DateTime to) async {
    final res = await apiClient
        .get('/reports/profit-and-loss?dateFrom=${_iso(from)}&dateTo=${_iso(to)}');
    return ProfitAndLoss.fromJson(_data(res));
  }

  Future<CashFlowStatement> cashFlow(DateTime from, DateTime to) async {
    final res = await apiClient
        .get('/reports/cash-flow?dateFrom=${_iso(from)}&dateTo=${_iso(to)}');
    return CashFlowStatement.fromJson(_data(res));
  }

  Future<CashFlowForecast> cashFlowForecast({int days = 90}) async {
    final res = await apiClient.get('/reports/cash-flow-forecast?days=$days');
    return CashFlowForecast.fromJson(_data(res));
  }

  Future<RevenueAnalytics> revenueAnalytics(DateTime from, DateTime to) async {
    final res = await apiClient
        .get('/reports/revenue-analytics?dateFrom=${_iso(from)}&dateTo=${_iso(to)}');
    return RevenueAnalytics.fromJson(_data(res));
  }

  Future<ExpenseAnalytics> expenseAnalytics(DateTime from, DateTime to) async {
    final res = await apiClient
        .get('/reports/expense-analytics?dateFrom=${_iso(from)}&dateTo=${_iso(to)}');
    return ExpenseAnalytics.fromJson(_data(res));
  }

  Future<BankAccountReport> bankAccountReport(
      String accountId, DateTime from, DateTime to) async {
    final res = await apiClient.get(
        '/banking/accounts/$accountId/report?dateFrom=${_iso(from)}&dateTo=${_iso(to)}');
    return BankAccountReport.fromJson(_data(res));
  }
}

final reportsRepo = ReportsRepo();
