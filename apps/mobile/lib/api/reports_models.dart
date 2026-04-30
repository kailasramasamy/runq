/// Dart models mirroring runQ Reports API responses.
///
/// Only fields used by the mobile reports/cash-flow screens are mapped;
/// the rest of the server payload is intentionally dropped on the floor.
library;

double numAt(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int intAt(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

String? strAt(Object? v) => v == null ? null : v.toString();

class ReportPeriod {
  final String from;
  final String to;
  ReportPeriod({required this.from, required this.to});

  factory ReportPeriod.fromJson(Map<String, dynamic> j) => ReportPeriod(
        from: strAt(j['from']) ?? '',
        to: strAt(j['to']) ?? '',
      );
}

class ReportLineItem {
  final String accountCode;
  final String accountName;
  final double amount;
  ReportLineItem({
    required this.accountCode,
    required this.accountName,
    required this.amount,
  });

  factory ReportLineItem.fromJson(Map<String, dynamic> j) => ReportLineItem(
        accountCode: strAt(j['accountCode']) ?? '',
        accountName: strAt(j['accountName']) ?? '',
        amount: numAt(j['amount']),
      );
}

class ProfitAndLoss {
  final ReportPeriod period;
  final List<ReportLineItem> revenue;
  final double totalRevenue;
  final List<ReportLineItem> cogs;
  final double totalCogs;
  final double grossProfit;
  final List<ReportLineItem> operatingExpenses;
  final double totalOperatingExpenses;
  final double operatingProfit;
  final double profitBeforeTax;
  final double netProfit;

  ProfitAndLoss({
    required this.period,
    required this.revenue,
    required this.totalRevenue,
    required this.cogs,
    required this.totalCogs,
    required this.grossProfit,
    required this.operatingExpenses,
    required this.totalOperatingExpenses,
    required this.operatingProfit,
    required this.profitBeforeTax,
    required this.netProfit,
  });

  factory ProfitAndLoss.fromJson(Map<String, dynamic> j) {
    List<ReportLineItem> rows(Object? v) =>
        (v is List ? v : const [])
            .whereType<Map<String, dynamic>>()
            .map(ReportLineItem.fromJson)
            .toList();
    return ProfitAndLoss(
      period: ReportPeriod.fromJson(
          (j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
      revenue: rows(j['revenue']),
      totalRevenue: numAt(j['totalRevenue']),
      cogs: rows(j['cogs']),
      totalCogs: numAt(j['totalCogs']),
      grossProfit: numAt(j['grossProfit']),
      operatingExpenses: rows(j['operatingExpenses']),
      totalOperatingExpenses: numAt(j['totalOperatingExpenses']),
      operatingProfit: numAt(j['operatingProfit']),
      profitBeforeTax: numAt(j['profitBeforeTax']),
      netProfit: numAt(j['netProfit']),
    );
  }
}

class CashFlowStatement {
  final ReportPeriod period;
  final double totalOperating;
  final double totalInvesting;
  final double totalFinancing;
  final double netChange;
  final double openingBalance;
  final double closingBalance;
  final List<ReportLineItem> operating;
  final List<ReportLineItem> investing;
  final List<ReportLineItem> financing;

  CashFlowStatement({
    required this.period,
    required this.totalOperating,
    required this.totalInvesting,
    required this.totalFinancing,
    required this.netChange,
    required this.openingBalance,
    required this.closingBalance,
    required this.operating,
    required this.investing,
    required this.financing,
  });

  factory CashFlowStatement.fromJson(Map<String, dynamic> j) {
    List<ReportLineItem> rows(Object? v) =>
        (v is List ? v : const [])
            .whereType<Map<String, dynamic>>()
            .map(ReportLineItem.fromJson)
            .toList();
    return CashFlowStatement(
      period: ReportPeriod.fromJson(
          (j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
      totalOperating: numAt(j['totalOperating']),
      totalInvesting: numAt(j['totalInvesting']),
      totalFinancing: numAt(j['totalFinancing']),
      netChange: numAt(j['netChange']),
      openingBalance: numAt(j['openingBalance']),
      closingBalance: numAt(j['closingBalance']),
      operating: rows(j['operating']),
      investing: rows(j['investing']),
      financing: rows(j['financing']),
    );
  }
}

class CashFlowProjection {
  final int day;
  final double projectedBalance;
  CashFlowProjection({required this.day, required this.projectedBalance});

  factory CashFlowProjection.fromJson(Map<String, dynamic> j) =>
      CashFlowProjection(
        day: intAt(j['day']),
        projectedBalance: numAt(j['projectedBalance']),
      );
}

class CashFlowForecast {
  final double currentBalance;
  final double projectedBalance30d;
  final double projectedBalance60d;
  final double projectedBalance90d;
  final List<CashFlowProjection> projections;

  CashFlowForecast({
    required this.currentBalance,
    required this.projectedBalance30d,
    required this.projectedBalance60d,
    required this.projectedBalance90d,
    required this.projections,
  });

  factory CashFlowForecast.fromJson(Map<String, dynamic> j) {
    final raw = j['projections'];
    return CashFlowForecast(
      currentBalance: numAt(j['currentBalance']),
      projectedBalance30d: numAt(j['projectedBalance30d']),
      projectedBalance60d: numAt(j['projectedBalance60d']),
      projectedBalance90d: numAt(j['projectedBalance90d']),
      projections: (raw is List ? raw : const [])
          .whereType<Map<String, dynamic>>()
          .map(CashFlowProjection.fromJson)
          .toList(),
    );
  }
}

class CategoryAmount {
  final String label;
  final double amount;
  final double percentage;
  CategoryAmount({
    required this.label,
    required this.amount,
    required this.percentage,
  });
}

class MonthAmount {
  final String month;
  final double amount;
  final int count;
  MonthAmount({required this.month, required this.amount, required this.count});

  factory MonthAmount.fromJson(Map<String, dynamic> j) => MonthAmount(
        month: strAt(j['month']) ?? '',
        amount: numAt(j['amount']),
        count: intAt(j['count']),
      );
}

class RevenueAnalytics {
  final ReportPeriod period;
  final double total;
  final List<CategoryAmount> byCustomer;
  final List<MonthAmount> byMonth;

  RevenueAnalytics({
    required this.period,
    required this.total,
    required this.byCustomer,
    required this.byMonth,
  });

  factory RevenueAnalytics.fromJson(Map<String, dynamic> j) {
    final byCust = (j['byCustomer'] as List?) ?? const [];
    final byMon = (j['byMonth'] as List?) ?? const [];
    return RevenueAnalytics(
      period: ReportPeriod.fromJson(
          (j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
      total: numAt(j['total']),
      byCustomer: byCust
          .whereType<Map<String, dynamic>>()
          .map((c) => CategoryAmount(
                label: strAt(c['customerName']) ?? '—',
                amount: numAt(c['amount']),
                percentage: numAt(c['percentage']),
              ))
          .toList(),
      byMonth: byMon
          .whereType<Map<String, dynamic>>()
          .map(MonthAmount.fromJson)
          .toList(),
    );
  }
}

class ExpenseAnalytics {
  final ReportPeriod period;
  final double total;
  final List<CategoryAmount> byCategory;
  final List<CategoryAmount> byVendor;
  final List<MonthAmount> byMonth;

  ExpenseAnalytics({
    required this.period,
    required this.total,
    required this.byCategory,
    required this.byVendor,
    required this.byMonth,
  });

  factory ExpenseAnalytics.fromJson(Map<String, dynamic> j) {
    final byCat = (j['byCategory'] as List?) ?? const [];
    final byVen = (j['byVendor'] as List?) ?? const [];
    final byMon = (j['byMonth'] as List?) ?? const [];
    return ExpenseAnalytics(
      period: ReportPeriod.fromJson(
          (j['period'] as Map?)?.cast<String, dynamic>() ?? {}),
      total: numAt(j['total']),
      byCategory: byCat
          .whereType<Map<String, dynamic>>()
          .map((c) => CategoryAmount(
                label: strAt(c['category']) ?? '—',
                amount: numAt(c['amount']),
                percentage: numAt(c['percentage']),
              ))
          .toList(),
      byVendor: byVen
          .whereType<Map<String, dynamic>>()
          .map((c) => CategoryAmount(
                label: strAt(c['vendorName']) ?? '—',
                amount: numAt(c['amount']),
                percentage: numAt(c['percentage']),
              ))
          .toList(),
      byMonth: byMon
          .whereType<Map<String, dynamic>>()
          .map(MonthAmount.fromJson)
          .toList(),
    );
  }
}
