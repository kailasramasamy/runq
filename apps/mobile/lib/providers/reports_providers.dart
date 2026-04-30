import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/reports_models.dart';
import '../api/reports_repo.dart';
import 'auth_provider.dart';

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

class DateRange {
  final DateTime from;
  final DateTime to;
  const DateRange(this.from, this.to);

  @override
  bool operator ==(Object other) =>
      other is DateRange && other.from == from && other.to == to;
  @override
  int get hashCode => Object.hash(from, to);
}

DateRange currentMonthRange([DateTime? now]) {
  final n = now ?? DateTime.now();
  return DateRange(DateTime(n.year, n.month, 1), DateTime(n.year, n.month + 1, 0));
}

DateRange lastMonthRange([DateTime? now]) {
  final n = now ?? DateTime.now();
  final firstOfThis = DateTime(n.year, n.month, 1);
  final lastOfPrev = firstOfThis.subtract(const Duration(days: 1));
  return DateRange(DateTime(lastOfPrev.year, lastOfPrev.month, 1), lastOfPrev);
}

DateRange currentQuarterRange([DateTime? now]) {
  final n = now ?? DateTime.now();
  final qStartMonth = ((n.month - 1) ~/ 3) * 3 + 1;
  final start = DateTime(n.year, qStartMonth, 1);
  final end = DateTime(n.year, qStartMonth + 3, 0);
  return DateRange(start, end);
}

DateRange currentFyRange([DateTime? now]) {
  final n = now ?? DateTime.now();
  // Indian FY: April–March.
  final fyStartYear = n.month >= 4 ? n.year : n.year - 1;
  return DateRange(
    DateTime(fyStartYear, 4, 1),
    DateTime(fyStartYear + 1, 3, 31),
  );
}

final cashFlowForecastProvider =
    FutureProvider.family<CashFlowForecast, int>((ref, days) async {
  return _watchAuth(ref, () => reportsRepo.cashFlowForecast(days: days));
});

final cashFlowStatementProvider =
    FutureProvider.family<CashFlowStatement, DateRange>((ref, r) async {
  return _watchAuth(ref, () => reportsRepo.cashFlow(r.from, r.to));
});

final profitAndLossProvider =
    FutureProvider.family<ProfitAndLoss, DateRange>((ref, r) async {
  return _watchAuth(ref, () => reportsRepo.profitAndLoss(r.from, r.to));
});

final revenueAnalyticsProvider =
    FutureProvider.family<RevenueAnalytics, DateRange>((ref, r) async {
  return _watchAuth(ref, () => reportsRepo.revenueAnalytics(r.from, r.to));
});

final expenseAnalyticsProvider =
    FutureProvider.family<ExpenseAnalytics, DateRange>((ref, r) async {
  return _watchAuth(ref, () => reportsRepo.expenseAnalytics(r.from, r.to));
});
