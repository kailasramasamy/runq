// Mobile-side models for the /analytics endpoints. Field names mirror the
// API JSON so parsing stays mechanical; the web app's use-analytics.ts is
// the source of truth for shape.

double _num(dynamic v) => v == null ? 0.0 : (v as num).toDouble();
int _int(dynamic v) => v == null ? 0 : (v as num).toInt();
String _str(dynamic v) => v?.toString() ?? '';
List<Map<String, dynamic>> _list(dynamic v) =>
    v is List ? v.cast<Map<String, dynamic>>() : const [];

class CashPositionAccount {
  final String accountId, accountName;
  final double balance;
  CashPositionAccount(this.accountId, this.accountName, this.balance);
  factory CashPositionAccount.fromJson(Map<String, dynamic> j) =>
      CashPositionAccount(_str(j['accountId']), _str(j['accountName']), _num(j['balance']));
}

class CashPosition {
  final double total;
  final List<CashPositionAccount> byAccount;
  CashPosition(this.total, this.byAccount);
  factory CashPosition.fromJson(Map<String, dynamic> j) => CashPosition(
        _num(j['total']),
        _list(j['byAccount']).map(CashPositionAccount.fromJson).toList(),
      );
}

class OutstandingTotal {
  final double total;
  final int invoiceCount;
  OutstandingTotal(this.total, this.invoiceCount);
  factory OutstandingTotal.fromJson(Map<String, dynamic> j) =>
      OutstandingTotal(_num(j['total']), _int(j['invoiceCount']));
}

class SalesMtd {
  final double amount, prevAmount;
  final int count, prevCount;
  SalesMtd(this.amount, this.count, this.prevAmount, this.prevCount);
  factory SalesMtd.fromJson(Map<String, dynamic> j) => SalesMtd(
        _num(j['amount']), _int(j['count']),
        _num(j['prevAmount']), _int(j['prevCount']),
      );
  double? get deltaPct =>
      prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null;
}

class BillDueItem {
  final String id, vendorName;
  final double balanceDue;
  BillDueItem(this.id, this.vendorName, this.balanceDue);
  factory BillDueItem.fromJson(Map<String, dynamic> j) =>
      BillDueItem(_str(j['id']), _str(j['vendorName']), _num(j['balanceDue']));
}

class BillsDueWeek {
  final List<BillDueItem> items;
  final double totalAmount;
  BillsDueWeek(this.items, this.totalAmount);
  factory BillsDueWeek.fromJson(Map<String, dynamic> j) => BillsDueWeek(
        _list(j['items']).map(BillDueItem.fromJson).toList(),
        _num(j['totalAmount']),
      );
}

class CashForecastWindow {
  final double inflow, outflow;
  final int receivableCount, payableCount;
  CashForecastWindow(this.inflow, this.outflow, this.receivableCount, this.payableCount);
  factory CashForecastWindow.fromJson(Map<String, dynamic> j) => CashForecastWindow(
        _num(j['inflow']), _num(j['outflow']),
        _int(j['receivableCount']), _int(j['payableCount']),
      );
}

class CashForecast {
  final double cashOnHand, projectedAt7d, projectedAt30d;
  final CashForecastWindow next7d, next30d;
  CashForecast(this.cashOnHand, this.projectedAt7d, this.projectedAt30d, this.next7d, this.next30d);
  factory CashForecast.fromJson(Map<String, dynamic> j) => CashForecast(
        _num(j['cashOnHand']),
        _num(j['projectedAt7d']),
        _num(j['projectedAt30d']),
        CashForecastWindow.fromJson((j['next7d'] as Map?)?.cast<String, dynamic>() ?? {}),
        CashForecastWindow.fromJson((j['next30d'] as Map?)?.cast<String, dynamic>() ?? {}),
      );
}

class AgingBucket {
  final String key;
  final double amount;
  final int count;
  AgingBucket(this.key, this.amount, this.count);
  factory AgingBucket.fromJson(Map<String, dynamic> j) =>
      AgingBucket(_str(j['key']), _num(j['amount']), _int(j['count']));
}

class AgingPayload {
  final List<AgingBucket> buckets;
  final double total;
  final int totalCount;
  AgingPayload(this.buckets, this.total, this.totalCount);
  factory AgingPayload.fromJson(Map<String, dynamic> j) => AgingPayload(
        _list(j['buckets']).map(AgingBucket.fromJson).toList(),
        _num(j['total']), _int(j['totalCount']),
      );
}

class OverdueCustomer {
  final String customerId, customerName;
  final double balanceDue;
  final int maxDaysOverdue;
  OverdueCustomer(this.customerId, this.customerName, this.balanceDue, this.maxDaysOverdue);
  factory OverdueCustomer.fromJson(Map<String, dynamic> j) => OverdueCustomer(
        _str(j['customerId']), _str(j['customerName']),
        _num(j['balanceDue']), _int(j['maxDaysOverdue']),
      );
}

class TopOverdueCustomers {
  final List<OverdueCustomer> items;
  final double totalAmount;
  TopOverdueCustomers(this.items, this.totalAmount);
  factory TopOverdueCustomers.fromJson(Map<String, dynamic> j) => TopOverdueCustomers(
        _list(j['items']).map(OverdueCustomer.fromJson).toList(),
        _num(j['totalAmount']),
      );
}

class VendorSpend {
  final String vendorId, vendorName;
  final double totalSpend;
  VendorSpend(this.vendorId, this.vendorName, this.totalSpend);
  factory VendorSpend.fromJson(Map<String, dynamic> j) => VendorSpend(
        _str(j['vendorId']), _str(j['vendorName']), _num(j['totalSpend']),
      );
}

class TopVendorsBySpend {
  final List<VendorSpend> items;
  final double totalAmount;
  TopVendorsBySpend(this.items, this.totalAmount);
  factory TopVendorsBySpend.fromJson(Map<String, dynamic> j) => TopVendorsBySpend(
        _list(j['items']).map(VendorSpend.fromJson).toList(),
        _num(j['totalAmount']),
      );
}

class ExpenseCategory {
  final String accountId, accountCode, accountName;
  final double amount;
  ExpenseCategory(this.accountId, this.accountCode, this.accountName, this.amount);
  factory ExpenseCategory.fromJson(Map<String, dynamic> j) => ExpenseCategory(
        _str(j['accountId']), _str(j['accountCode']),
        _str(j['accountName']), _num(j['amount']),
      );
}

class TopExpenseCategories {
  final List<ExpenseCategory> items;
  final double totalAmount;
  TopExpenseCategories(this.items, this.totalAmount);
  factory TopExpenseCategories.fromJson(Map<String, dynamic> j) => TopExpenseCategories(
        _list(j['items']).map(ExpenseCategory.fromJson).toList(),
        _num(j['totalAmount']),
      );
}

class RevExpMonth {
  final String month;
  final double revenue, expense;
  RevExpMonth(this.month, this.revenue, this.expense);
  factory RevExpMonth.fromJson(Map<String, dynamic> j) =>
      RevExpMonth(_str(j['month']), _num(j['revenue']), _num(j['expense']));
}

class RevenueVsExpense12mo {
  final List<RevExpMonth> months;
  final double totalRevenue, totalExpense;
  RevenueVsExpense12mo(this.months, this.totalRevenue, this.totalExpense);
  factory RevenueVsExpense12mo.fromJson(Map<String, dynamic> j) => RevenueVsExpense12mo(
        _list(j['months']).map(RevExpMonth.fromJson).toList(),
        _num(j['totalRevenue']), _num(j['totalExpense']),
      );
}

class DsoPoint {
  final String month;
  final double? dso;
  DsoPoint(this.month, this.dso);
  factory DsoPoint.fromJson(Map<String, dynamic> j) =>
      DsoPoint(_str(j['month']), j['dso'] == null ? null : _num(j['dso']));
}

class DsoTrend6mo {
  final List<DsoPoint> months;
  final double? latestDso, averageDso;
  DsoTrend6mo(this.months, this.latestDso, this.averageDso);
  factory DsoTrend6mo.fromJson(Map<String, dynamic> j) => DsoTrend6mo(
        _list(j['months']).map(DsoPoint.fromJson).toList(),
        j['latestDso'] == null ? null : _num(j['latestDso']),
        j['averageDso'] == null ? null : _num(j['averageDso']),
      );
}

class PnlPeriodInfo {
  final String from, to;
  PnlPeriodInfo(this.from, this.to);
  factory PnlPeriodInfo.fromJson(Map<String, dynamic> j) =>
      PnlPeriodInfo(_str(j['from']), _str(j['to']));
}

class PnlSummary {
  final String periodKind;
  final PnlPeriodInfo period;
  final double totalRevenue, totalExpense, grossProfit, netProfit;
  final double? netProfitDeltaPct;
  PnlSummary(this.periodKind, this.period, this.totalRevenue, this.totalExpense,
      this.grossProfit, this.netProfit, this.netProfitDeltaPct);
  factory PnlSummary.fromJson(Map<String, dynamic> j) => PnlSummary(
        _str(j['periodKind']),
        PnlPeriodInfo.fromJson((j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
        _num(j['totalRevenue']),
        _num(j['totalExpense']),
        _num(j['grossProfit']),
        _num(j['netProfit']),
        j['netProfitDeltaPct'] == null ? null : _num(j['netProfitDeltaPct']),
      );
}

class BsSummary {
  final String asOfDate;
  final double totalAssets, totalLiabilities, totalEquity;
  final bool balanced;
  BsSummary(this.asOfDate, this.totalAssets, this.totalLiabilities, this.totalEquity, this.balanced);
  factory BsSummary.fromJson(Map<String, dynamic> j) => BsSummary(
        _str(j['asOfDate']),
        _num(j['totalAssets']),
        _num(j['totalLiabilities']),
        _num(j['totalEquity']),
        j['balanced'] == true,
      );
}

class TbSummary {
  final String asOfDate;
  final int accountCount;
  final double totalDebit, totalCredit;
  final bool balanced;
  TbSummary(this.asOfDate, this.accountCount, this.totalDebit, this.totalCredit, this.balanced);
  factory TbSummary.fromJson(Map<String, dynamic> j) => TbSummary(
        _str(j['asOfDate']),
        _int(j['accountCount']),
        _num(j['totalDebit']),
        _num(j['totalCredit']),
        j['balanced'] == true,
      );
}

class UnreconciledBankTxns {
  final double total;
  final int count;
  UnreconciledBankTxns(this.total, this.count);
  factory UnreconciledBankTxns.fromJson(Map<String, dynamic> j) =>
      UnreconciledBankTxns(_num(j['total']), _int(j['count']));
}

class SuspenseSummary {
  final double totalAbsBalance;
  final int totalStuck;
  final bool clean;
  SuspenseSummary(this.totalAbsBalance, this.totalStuck, this.clean);
  factory SuspenseSummary.fromJson(Map<String, dynamic> j) => SuspenseSummary(
        _num(j['totalAbsBalance']), _int(j['totalStuck']), j['clean'] == true,
      );
}

class PendingApprovalsSummary {
  final int total;
  final int categoryCount;
  PendingApprovalsSummary(this.total, this.categoryCount);
  factory PendingApprovalsSummary.fromJson(Map<String, dynamic> j) =>
      PendingApprovalsSummary(_int(j['total']),
          (j['byEntityType'] is List ? (j['byEntityType'] as List).length : 0));
}

class CashRunway {
  final double cashOnHand, netBurn30d;
  final double? runwayMonths;
  CashRunway(this.cashOnHand, this.netBurn30d, this.runwayMonths);
  factory CashRunway.fromJson(Map<String, dynamic> j) => CashRunway(
        _num(j['cashOnHand']),
        _num(j['netBurn30d']),
        j['runwayMonths'] == null ? null : _num(j['runwayMonths']),
      );
}

class GrossMargin {
  final double revenue, cogs, grossProfit;
  final double? marginPct;
  GrossMargin(this.revenue, this.cogs, this.grossProfit, this.marginPct);
  factory GrossMargin.fromJson(Map<String, dynamic> j) => GrossMargin(
        _num(j['revenue']), _num(j['cogs']), _num(j['grossProfit']),
        j['marginPct'] == null ? null : _num(j['marginPct']),
      );
}

class CashFlowSummary {
  final double operating, investing, financing, netChange;
  CashFlowSummary(this.operating, this.investing, this.financing, this.netChange);
  factory CashFlowSummary.fromJson(Map<String, dynamic> j) => CashFlowSummary(
        _num(j['operating']), _num(j['investing']),
        _num(j['financing']), _num(j['netChange']),
      );
}

class GstPeriod {
  final String label;
  GstPeriod(this.label);
  factory GstPeriod.fromJson(Map<String, dynamic> j) => GstPeriod(_str(j['label']));
}

class Gstr1Vs3bSummary {
  final GstPeriod period;
  final bool gstr1Available, gstr3bAvailable, hasMismatch;
  final double totalTaxDelta;
  Gstr1Vs3bSummary(this.period, this.gstr1Available, this.gstr3bAvailable,
      this.hasMismatch, this.totalTaxDelta);
  factory Gstr1Vs3bSummary.fromJson(Map<String, dynamic> j) => Gstr1Vs3bSummary(
        GstPeriod.fromJson((j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
        j['gstr1Available'] == true,
        j['gstr3bAvailable'] == true,
        j['hasMismatch'] == true,
        _num(j['totalTaxDelta']),
      );
}

class Gstr2bReconSummary {
  final GstPeriod period;
  final bool has2b, reconRun;
  final int matchedCount, mismatchedCount, notInBooksCount;
  final double itcAtRisk;
  Gstr2bReconSummary(this.period, this.has2b, this.reconRun, this.matchedCount,
      this.mismatchedCount, this.notInBooksCount, this.itcAtRisk);
  factory Gstr2bReconSummary.fromJson(Map<String, dynamic> j) => Gstr2bReconSummary(
        GstPeriod.fromJson((j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
        j['has2b'] == true,
        j['reconRun'] == true,
        _int((j['matched'] as Map?)?['count']),
        _int((j['mismatched'] as Map?)?['count']),
        _int((j['notInBooks'] as Map?)?['count']),
        _num(j['itcAtRisk']),
      );
}

class GstLiabilityCurrent {
  final GstPeriod period;
  final bool has3b;
  final double totalPayable, totalCashPayable, totalItcUsed;
  GstLiabilityCurrent(this.period, this.has3b, this.totalPayable,
      this.totalCashPayable, this.totalItcUsed);
  factory GstLiabilityCurrent.fromJson(Map<String, dynamic> j) => GstLiabilityCurrent(
        GstPeriod.fromJson((j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
        j['has3b'] == true,
        _num(j['totalPayable']),
        _num(j['totalCashPayable']),
        _num(j['totalItcUsed']),
      );
}

class ItcBlockerVendor {
  final String vendorName, reason;
  final double itcAtRisk;
  ItcBlockerVendor(this.vendorName, this.reason, this.itcAtRisk);
  factory ItcBlockerVendor.fromJson(Map<String, dynamic> j) => ItcBlockerVendor(
        _str(j['vendorName']), _str(j['reason']), _num(j['itcAtRisk']),
      );
}

class VendorsNotFiledSummary {
  final GstPeriod period;
  final bool has2b;
  final List<ItcBlockerVendor> vendors;
  final double totalItcAtRisk;
  VendorsNotFiledSummary(this.period, this.has2b, this.vendors, this.totalItcAtRisk);
  factory VendorsNotFiledSummary.fromJson(Map<String, dynamic> j) => VendorsNotFiledSummary(
        GstPeriod.fromJson((j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
        j['has2b'] == true,
        _list(j['vendors']).map(ItcBlockerVendor.fromJson).toList(),
        _num(j['totalItcAtRisk']),
      );
}
