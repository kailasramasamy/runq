import 'api_client.dart';
import 'analytics_models.dart';

// Some endpoints return `{ data, computedAt }` (snapshot-backed), others
// `{ data }`. Both expose `data`, so a single unwrap works.
Map<String, dynamic>? _unwrap(dynamic res) {
  if (res is Map && res['data'] is Map) return (res['data'] as Map).cast<String, dynamic>();
  if (res is Map) return res.cast<String, dynamic>();
  return null;
}

class AnalyticsRepo {
  // ── Live metrics ──────────────────────────────────────────────────────
  Future<CashPosition?> cashPosition() async {
    final m = _unwrap(await apiClient.get('/analytics/cash-position'));
    return m == null ? null : CashPosition.fromJson(m);
  }

  Future<OutstandingTotal?> arOutstanding() async {
    final m = _unwrap(await apiClient.get('/analytics/ar-outstanding'));
    return m == null ? null : OutstandingTotal.fromJson(m);
  }

  Future<OutstandingTotal?> apOutstanding() async {
    final m = _unwrap(await apiClient.get('/analytics/ap-outstanding'));
    return m == null ? null : OutstandingTotal.fromJson(m);
  }

  Future<SalesMtd?> salesMtd() async {
    final m = _unwrap(await apiClient.get('/analytics/sales-mtd'));
    return m == null ? null : SalesMtd.fromJson(m);
  }

  Future<BillsDueWeek?> billsDueWeek() async {
    final m = _unwrap(await apiClient.get('/analytics/bills-due-week'));
    return m == null ? null : BillsDueWeek.fromJson(m);
  }

  Future<CashForecast?> cashForecast() async {
    final m = _unwrap(await apiClient.get('/analytics/cash-forecast'));
    return m == null ? null : CashForecast.fromJson(m);
  }

  // ── Snapshot-backed ───────────────────────────────────────────────────
  Future<AgingPayload?> arAging() async {
    final m = _unwrap(await apiClient.get('/analytics/ar-aging'));
    return m == null ? null : AgingPayload.fromJson(m);
  }

  Future<AgingPayload?> apAging() async {
    final m = _unwrap(await apiClient.get('/analytics/ap-aging'));
    return m == null ? null : AgingPayload.fromJson(m);
  }

  Future<TopOverdueCustomers?> topOverdueCustomers() async {
    final m = _unwrap(await apiClient.get('/analytics/top-overdue-customers'));
    return m == null ? null : TopOverdueCustomers.fromJson(m);
  }

  Future<TopVendorsBySpend?> topVendorsBySpend() async {
    final m = _unwrap(await apiClient.get('/analytics/top-vendors-by-spend'));
    return m == null ? null : TopVendorsBySpend.fromJson(m);
  }

  Future<TopExpenseCategories?> topExpenseCategories() async {
    final m = _unwrap(await apiClient.get('/analytics/top-expense-categories'));
    return m == null ? null : TopExpenseCategories.fromJson(m);
  }

  Future<RevenueVsExpense12mo?> revenueVsExpense12mo() async {
    final m = _unwrap(await apiClient.get('/analytics/revenue-vs-expense-12mo'));
    return m == null ? null : RevenueVsExpense12mo.fromJson(m);
  }

  Future<DsoTrend6mo?> dsoTrend6mo() async {
    final m = _unwrap(await apiClient.get('/analytics/dso-trend-6mo'));
    return m == null ? null : DsoTrend6mo.fromJson(m);
  }

  // ── Heavy summaries (rate-limited server-side) ────────────────────────
  Future<PnlSummary?> pnlSummary({String period = 'fy'}) async {
    final m = _unwrap(await apiClient.get('/analytics/pnl-summary?period=$period'));
    return m == null ? null : PnlSummary.fromJson(m);
  }

  Future<BsSummary?> bsSummary() async {
    final m = _unwrap(await apiClient.get('/analytics/bs-summary'));
    return m == null ? null : BsSummary.fromJson(m);
  }

  Future<TbSummary?> trialBalanceSummary() async {
    final m = _unwrap(await apiClient.get('/analytics/trial-balance-summary'));
    return m == null ? null : TbSummary.fromJson(m);
  }

  Future<UnreconciledBankTxns?> unreconciledBankTxns() async {
    final m = _unwrap(await apiClient.get('/analytics/unreconciled-bank-txns'));
    return m == null ? null : UnreconciledBankTxns.fromJson(m);
  }

  Future<SuspenseSummary?> suspenseSummary() async {
    final m = _unwrap(await apiClient.get('/analytics/suspense-summary'));
    return m == null ? null : SuspenseSummary.fromJson(m);
  }

  Future<PendingApprovalsSummary?> pendingApprovals() async {
    final m = _unwrap(await apiClient.get('/analytics/pending-approvals'));
    return m == null ? null : PendingApprovalsSummary.fromJson(m);
  }

  Future<CashRunway?> cashRunway() async {
    final m = _unwrap(await apiClient.get('/analytics/cash-runway'));
    return m == null ? null : CashRunway.fromJson(m);
  }

  Future<GrossMargin?> grossMargin() async {
    final m = _unwrap(await apiClient.get('/analytics/gross-margin'));
    return m == null ? null : GrossMargin.fromJson(m);
  }

  Future<CashFlowSummary?> cashFlowSummary() async {
    final m = _unwrap(await apiClient.get('/analytics/cash-flow-summary'));
    return m == null ? null : CashFlowSummary.fromJson(m);
  }

  // ── GST ───────────────────────────────────────────────────────────────
  Future<Gstr1Vs3bSummary?> gstr1Vs3b() async {
    final m = _unwrap(await apiClient.get('/analytics/gst/gstr1-vs-3b'));
    return m == null ? null : Gstr1Vs3bSummary.fromJson(m);
  }

  Future<Gstr2bReconSummary?> gstr2bRecon() async {
    final m = _unwrap(await apiClient.get('/analytics/gst/2b-recon'));
    return m == null ? null : Gstr2bReconSummary.fromJson(m);
  }

  Future<GstLiabilityCurrent?> gstLiability() async {
    final m = _unwrap(await apiClient.get('/analytics/gst/liability-current'));
    return m == null ? null : GstLiabilityCurrent.fromJson(m);
  }

  Future<VendorsNotFiledSummary?> vendorsNotFiled() async {
    final m = _unwrap(await apiClient.get('/analytics/gst/vendors-not-filed'));
    return m == null ? null : VendorsNotFiledSummary.fromJson(m);
  }
}

final analyticsRepo = AnalyticsRepo();
