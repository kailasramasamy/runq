// Payload of GET /analytics/sales — one request feeds the whole sales
// analytics screen. Every figure is invoice-basis (issued invoices dated in
// the window, net of credit notes), so it ties to the invoice list rather
// than to a GL-basis P&L.

library;

double _num(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class SalesTrendPoint {
  final DateTime bucket;
  final double revenue;
  final int invoiceCount;
  const SalesTrendPoint({
    required this.bucket,
    required this.revenue,
    required this.invoiceCount,
  });

  factory SalesTrendPoint.fromJson(Map<String, dynamic> j) => SalesTrendPoint(
        bucket: DateTime.parse(j['bucket'] as String),
        revenue: _num(j['revenue']),
        invoiceCount: _int(j['invoiceCount']),
      );
}

class SalesTopCustomer {
  final String customerId, name;
  final double revenue;
  final int invoiceCount;

  /// Percent of the listed customers' revenue, already rounded server-side.
  final double share;
  const SalesTopCustomer({
    required this.customerId,
    required this.name,
    required this.revenue,
    required this.invoiceCount,
    required this.share,
  });

  factory SalesTopCustomer.fromJson(Map<String, dynamic> j) => SalesTopCustomer(
        customerId: j['customerId'] as String,
        name: j['name'] as String? ?? '—',
        revenue: _num(j['revenue']),
        invoiceCount: _int(j['invoiceCount']),
        share: _num(j['share']),
      );
}

class SalesTopItem {
  final String description;
  final double revenue, quantity;
  final String? uom;
  const SalesTopItem({
    required this.description,
    required this.revenue,
    required this.quantity,
    this.uom,
  });

  factory SalesTopItem.fromJson(Map<String, dynamic> j) => SalesTopItem(
        description: j['description'] as String? ?? '—',
        revenue: _num(j['revenue']),
        quantity: _num(j['quantity']),
        uom: j['uom'] as String?,
      );
}

class SalesStatusSlice {
  final String status;
  final int count;
  final double amount;
  const SalesStatusSlice({
    required this.status,
    required this.count,
    required this.amount,
  });

  factory SalesStatusSlice.fromJson(Map<String, dynamic> j) => SalesStatusSlice(
        status: j['status'] as String? ?? 'sent',
        count: _int(j['count']),
        amount: _num(j['amount']),
      );
}

class SalesCollections {
  final double receivedInPeriod, outstandingFromPeriod, collectedRatio;

  /// Null when nothing in the window has been paid yet.
  final int? avgDaysToPay;
  const SalesCollections({
    required this.receivedInPeriod,
    required this.outstandingFromPeriod,
    required this.collectedRatio,
    this.avgDaysToPay,
  });

  factory SalesCollections.fromJson(Map<String, dynamic> j) => SalesCollections(
        receivedInPeriod: _num(j['receivedInPeriod']),
        outstandingFromPeriod: _num(j['outstandingFromPeriod']),
        collectedRatio: _num(j['collectedRatio']),
        avgDaysToPay: j['avgDaysToPay'] == null ? null : _int(j['avgDaysToPay']),
      );
}

class SalesHeadline {
  final double grossRevenue, creditNotes, netRevenue;
  final double taxableValue, taxAmount, avgInvoiceValue;
  final int invoiceCount, activeCustomers;
  const SalesHeadline({
    required this.grossRevenue,
    required this.creditNotes,
    required this.netRevenue,
    required this.taxableValue,
    required this.taxAmount,
    required this.avgInvoiceValue,
    required this.invoiceCount,
    required this.activeCustomers,
  });

  factory SalesHeadline.fromJson(Map<String, dynamic> j) => SalesHeadline(
        grossRevenue: _num(j['grossRevenue']),
        creditNotes: _num(j['creditNotes']),
        netRevenue: _num(j['netRevenue']),
        taxableValue: _num(j['taxableValue']),
        taxAmount: _num(j['taxAmount']),
        avgInvoiceValue: _num(j['avgInvoiceValue']),
        invoiceCount: _int(j['invoiceCount']),
        activeCustomers: _int(j['activeCustomers']),
      );
}

class SalesAnalytics {
  final DateTime from, to;

  /// 'day' | 'week' | 'month' — the server picks it from the range length,
  /// and the chart labels its axis accordingly.
  final String grain;
  final SalesHeadline headline;
  final List<SalesTrendPoint> trend;
  final List<SalesTopCustomer> topCustomers;
  final List<SalesTopItem> topItems;
  final List<SalesStatusSlice> statusSplit;
  final SalesCollections collections;

  const SalesAnalytics({
    required this.from,
    required this.to,
    required this.grain,
    required this.headline,
    required this.trend,
    required this.topCustomers,
    required this.topItems,
    required this.statusSplit,
    required this.collections,
  });

  factory SalesAnalytics.fromJson(Map<String, dynamic> j) {
    final period = (j['period'] as Map?)?.cast<String, dynamic>() ?? const {};
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) =>
        ((j[key] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(parse)
            .toList();
    return SalesAnalytics(
      from: DateTime.parse(period['from'] as String),
      to: DateTime.parse(period['to'] as String),
      grain: period['grain'] as String? ?? 'day',
      headline: SalesHeadline.fromJson(
          (j['headline'] as Map?)?.cast<String, dynamic>() ?? const {}),
      trend: list('trend', SalesTrendPoint.fromJson),
      topCustomers: list('topCustomers', SalesTopCustomer.fromJson),
      topItems: list('topItems', SalesTopItem.fromJson),
      statusSplit: list('statusSplit', SalesStatusSlice.fromJson),
      collections: SalesCollections.fromJson(
          (j['collections'] as Map?)?.cast<String, dynamic>() ?? const {}),
    );
  }

  bool get isEmpty => headline.invoiceCount == 0;
}
