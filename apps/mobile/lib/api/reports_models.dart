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

  factory CashFlowProjection.fromJson(Map<String, dynamic> j) {
    final dateStr = j['date'];
    int day = 0;
    if (dateStr is String && dateStr.isNotEmpty) {
      final parsed = DateTime.tryParse(dateStr);
      if (parsed != null) {
        final now = DateTime.now();
        final today = DateTime(now.year, now.month, now.day);
        final d = DateTime(parsed.year, parsed.month, parsed.day);
        day = d.difference(today).inDays;
      }
    } else {
      day = intAt(j['day']);
    }
    return CashFlowProjection(
      day: day,
      projectedBalance: numAt(j['projected'] ?? j['projectedBalance']),
    );
  }
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

  /// GL account behind this slice, where the report exposes one — it lets a
  /// category row drill through to the transactions that make up its total.
  /// Null both for uncategorized rows and for reports that group by something
  /// other than a GL account (customer, vendor).
  final String? glAccountId;

  CategoryAmount({
    required this.label,
    required this.amount,
    required this.percentage,
    this.glAccountId,
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

class MonthInOut {
  final String month;
  final double moneyIn, moneyOut;
  MonthInOut({required this.month, required this.moneyIn, required this.moneyOut});

  factory MonthInOut.fromJson(Map<String, dynamic> j) => MonthInOut(
        month: strAt(j['month']) ?? '',
        moneyIn: numAt(j['moneyIn']),
        moneyOut: numAt(j['moneyOut']),
      );
}

/// Per-bank-account report: cash in/out on one account, broken down by category.
class BankAccountReport {
  final double moneyIn, moneyOut, net;
  final int txnCount;
  final List<CategoryAmount> spendByCategory;
  final List<CategoryAmount> incomeByCategory;
  final List<MonthInOut> byMonth;

  BankAccountReport({
    required this.moneyIn,
    required this.moneyOut,
    required this.net,
    required this.txnCount,
    required this.spendByCategory,
    required this.incomeByCategory,
    required this.byMonth,
  });

  static List<CategoryAmount> _cats(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map<String, dynamic>>()
      .map((c) => CategoryAmount(
            label: strAt(c['name']) ?? '—',
            amount: numAt(c['amount']),
            percentage: numAt(c['percentage']),
            glAccountId: strAt(c['accountId']),
          ))
      .toList();

  factory BankAccountReport.fromJson(Map<String, dynamic> j) {
    final s = (j['summary'] as Map?)?.cast<String, dynamic>() ?? {};
    return BankAccountReport(
      moneyIn: numAt(s['moneyIn']),
      moneyOut: numAt(s['moneyOut']),
      net: numAt(s['net']),
      txnCount: intAt(s['txnCount']),
      spendByCategory: _cats(j['spendByCategory']),
      incomeByCategory: _cats(j['incomeByCategory']),
      byMonth: ((j['byMonth'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(MonthInOut.fromJson)
          .toList(),
    );
  }
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

/// One row of the monthly P&L: an amount per month plus the period total.
class MonthlyPnlRow {
  final String key;
  final String label;
  final List<double> values;
  final double total;
  MonthlyPnlRow({required this.key, required this.label, required this.values, required this.total});

  factory MonthlyPnlRow.fromJson(Map<String, dynamic> j) => MonthlyPnlRow(
        key: strAt(j['key']) ?? '',
        label: strAt(j['label']) ?? '',
        values: (j['values'] is List ? j['values'] as List : const []).map(numAt).toList(),
        total: numAt(j['total']),
      );
}

class MonthlyPnlSection {
  /// revenue | milk | expenses | nonOperating
  final String key;
  final String label;
  final List<MonthlyPnlRow> lines;
  final MonthlyPnlRow totals;
  MonthlyPnlSection({required this.key, required this.label, required this.lines, required this.totals});

  factory MonthlyPnlSection.fromJson(Map<String, dynamic> j) => MonthlyPnlSection(
        key: strAt(j['key']) ?? '',
        label: strAt(j['label']) ?? '',
        lines: (j['lines'] is List ? j['lines'] as List : const [])
            .whereType<Map<String, dynamic>>()
            .map(MonthlyPnlRow.fromJson)
            .toList(),
        totals: MonthlyPnlRow.fromJson((j['totals'] as Map?)?.cast<String, dynamic>() ?? const {}),
      );
}

/// Management P&L month by month — milk by pour date, stock movements left
/// out, capital items below operating profit. Mirrors the web Monthly view.
class MonthlyPnl {
  final List<String> months;
  final List<MonthlyPnlSection> sections;
  final MonthlyPnlRow operatingProfit;
  final MonthlyPnlRow netProfit;
  /// Profit taken out through entries booked as expenses (owner-marked).
  final MonthlyPnlRow profitBookedAsExpense;
  /// Net profit less [profitBookedAsExpense] — the official books' figure.
  final MonthlyPnlRow profitRetained;
  final MonthlyPnlRow excludedStock;
  final List<String> provisionalMonths;
  MonthlyPnl({
    required this.months,
    required this.sections,
    required this.operatingProfit,
    required this.netProfit,
    required this.profitBookedAsExpense,
    required this.profitRetained,
    required this.excludedStock,
    required this.provisionalMonths,
  });

  MonthlyPnlSection? section(String key) {
    for (final s in sections) {
      if (s.key == key) return s;
    }
    return null;
  }

  factory MonthlyPnl.fromJson(Map<String, dynamic> j) {
    MonthlyPnlRow row(String k) =>
        MonthlyPnlRow.fromJson((j[k] as Map?)?.cast<String, dynamic>() ?? const {});
    List<String> strings(Object? v) =>
        (v is List ? v : const []).map((e) => e.toString()).toList();
    return MonthlyPnl(
      months: strings(j['months']),
      sections: (j['sections'] is List ? j['sections'] as List : const [])
          .whereType<Map<String, dynamic>>()
          .map(MonthlyPnlSection.fromJson)
          .toList(),
      operatingProfit: row('operatingProfit'),
      netProfit: row('netProfit'),
      profitBookedAsExpense: row('profitBookedAsExpense'),
      profitRetained: row('profitRetained'),
      excludedStock: row('excludedStock'),
      provisionalMonths: strings(j['provisionalMonths']),
    );
  }
}

/// One source entry behind a monthly P&L figure.
/// The (journal entry, account) pair a profit mark points at.
typedef ProfitMarkRef = ({String journalEntryId, String accountId});

class MonthlyPnlEntry {
  final ProfitMarkRef? ref;
  /// An expense entry that can be marked as profit taken out (or restored).
  final bool markable;
  final String date;
  final String description;
  /// Who was paid (or who paid us). Null when the entry has no counterparty.
  final String? party;
  /// [party] was read off the bank narration, not a linked vendor/customer.
  final bool partyFromBank;
  final String source;
  final String account;
  final double amount;
  MonthlyPnlEntry({
    required this.ref,
    required this.markable,
    required this.date,
    required this.description,
    required this.party,
    required this.partyFromBank,
    required this.source,
    required this.account,
    required this.amount,
  });

  factory MonthlyPnlEntry.fromJson(Map<String, dynamic> j) {
    final r = j['ref'];
    return MonthlyPnlEntry(
        ref: r is Map
            ? (journalEntryId: r['journalEntryId'].toString(), accountId: r['accountId'].toString())
            : null,
        markable: j['markable'] == true,
        date: strAt(j['date']) ?? '',
        description: strAt(j['description']) ?? '',
        party: strAt(j['party']),
        partyFromBank: j['partyFromBank'] == true,
        source: strAt(j['source']) ?? '',
        account: strAt(j['account']) ?? '',
        amount: numAt(j['amount']),
      );
  }
}

class MonthlyPnlLineDetail {
  final String key;
  final String label;
  final double total;
  final List<MonthlyPnlEntry> entries;
  MonthlyPnlLineDetail({required this.key, required this.label, required this.total, required this.entries});

  static const profitBookedKey = 'profitBookedAsExpense';
  bool get isProfitBooked => key == profitBookedKey;

  factory MonthlyPnlLineDetail.fromJson(Map<String, dynamic> j) => MonthlyPnlLineDetail(
        key: strAt(j['key']) ?? '',
        label: strAt(j['label']) ?? '',
        total: numAt(j['total']),
        entries: (j['entries'] is List ? j['entries'] as List : const [])
            .whereType<Map<String, dynamic>>()
            .map(MonthlyPnlEntry.fromJson)
            .toList(),
      );
}
