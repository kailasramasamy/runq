import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/analytics_models.dart';
import '../api/analytics_repo.dart';
import 'auth_provider.dart';

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

final cashPositionProvider = FutureProvider<CashPosition?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.cashPosition()));
final arOutstandingProvider = FutureProvider<OutstandingTotal?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.arOutstanding()));
final apOutstandingProvider = FutureProvider<OutstandingTotal?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.apOutstanding()));
final salesMtdProvider = FutureProvider<SalesMtd?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.salesMtd()));
final billsDueWeekProvider = FutureProvider<BillsDueWeek?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.billsDueWeek()));
final cashForecastProvider = FutureProvider<CashForecast?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.cashForecast()));

final arAgingProvider = FutureProvider<AgingPayload?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.arAging()));
final apAgingProvider = FutureProvider<AgingPayload?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.apAging()));
final topOverdueCustomersProvider = FutureProvider<TopOverdueCustomers?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.topOverdueCustomers()));
final topVendorsBySpendProvider = FutureProvider<TopVendorsBySpend?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.topVendorsBySpend()));
final topExpenseCategoriesProvider = FutureProvider<TopExpenseCategories?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.topExpenseCategories()));

final revenueVsExpense12moProvider = FutureProvider<RevenueVsExpense12mo?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.revenueVsExpense12mo()));
final dsoTrend6moProvider = FutureProvider<DsoTrend6mo?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.dsoTrend6mo()));

final pnlSummaryProvider = FutureProvider.family<PnlSummary?, String>(
    (ref, period) => _watchAuth(ref, () => analyticsRepo.pnlSummary(period: period)));
final bsSummaryProvider = FutureProvider<BsSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.bsSummary()));
final tbSummaryProvider = FutureProvider<TbSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.trialBalanceSummary()));
final unreconciledProvider = FutureProvider<UnreconciledBankTxns?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.unreconciledBankTxns()));
final suspenseProvider = FutureProvider<SuspenseSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.suspenseSummary()));
final pendingApprovalsAnalyticsProvider =
    FutureProvider<PendingApprovalsSummary?>((ref) =>
        _watchAuth(ref, () => analyticsRepo.pendingApprovals()));
final cashRunwayProvider = FutureProvider<CashRunway?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.cashRunway()));
final grossMarginProvider = FutureProvider<GrossMargin?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.grossMargin()));
final cashFlowSummaryProvider = FutureProvider<CashFlowSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.cashFlowSummary()));

final gstr1Vs3bProvider = FutureProvider<Gstr1Vs3bSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.gstr1Vs3b()));
final gstr2bReconProvider = FutureProvider<Gstr2bReconSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.gstr2bRecon()));
final gstLiabilityProvider = FutureProvider<GstLiabilityCurrent?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.gstLiability()));
final vendorsNotFiledProvider = FutureProvider<VendorsNotFiledSummary?>((ref) =>
    _watchAuth(ref, () => analyticsRepo.vendorsNotFiled()));

/// All providers refreshed by pull-to-refresh on the analytics screen.
void invalidateAllAnalytics(WidgetRef ref) {
  ref.invalidate(cashPositionProvider);
  ref.invalidate(arOutstandingProvider);
  ref.invalidate(apOutstandingProvider);
  ref.invalidate(salesMtdProvider);
  ref.invalidate(billsDueWeekProvider);
  ref.invalidate(cashForecastProvider);
  ref.invalidate(arAgingProvider);
  ref.invalidate(apAgingProvider);
  ref.invalidate(topOverdueCustomersProvider);
  ref.invalidate(topVendorsBySpendProvider);
  ref.invalidate(topExpenseCategoriesProvider);
  ref.invalidate(revenueVsExpense12moProvider);
  ref.invalidate(dsoTrend6moProvider);
  ref.invalidate(pnlSummaryProvider);
  ref.invalidate(bsSummaryProvider);
  ref.invalidate(tbSummaryProvider);
  ref.invalidate(unreconciledProvider);
  ref.invalidate(suspenseProvider);
  ref.invalidate(pendingApprovalsAnalyticsProvider);
  ref.invalidate(cashRunwayProvider);
  ref.invalidate(grossMarginProvider);
  ref.invalidate(cashFlowSummaryProvider);
  ref.invalidate(gstr1Vs3bProvider);
  ref.invalidate(gstr2bReconProvider);
  ref.invalidate(gstLiabilityProvider);
  ref.invalidate(vendorsNotFiledProvider);
}
