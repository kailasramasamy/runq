// Payload of GET /analytics/purchases — one request feeds the whole purchase
// analytics screen. Every figure is bill-basis (booked vendor bills dated in
// the window, net of debit notes), so it ties to the bills list rather than
// to a GL-basis P&L. Mirrors sales_analytics_models.dart.

library;

double _num(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class PurchaseTrendPoint {
  final DateTime bucket;
  final double spend;
  final int billCount;
  const PurchaseTrendPoint({
    required this.bucket,
    required this.spend,
    required this.billCount,
  });

  factory PurchaseTrendPoint.fromJson(Map<String, dynamic> j) => PurchaseTrendPoint(
        bucket: DateTime.parse(j['bucket'] as String),
        spend: _num(j['spend']),
        billCount: _int(j['billCount']),
      );
}

class PurchaseTopVendor {
  final String vendorId, name;
  final double spend;
  final int billCount;

  /// Percent of the listed vendors' spend, already rounded server-side.
  final double share;
  const PurchaseTopVendor({
    required this.vendorId,
    required this.name,
    required this.spend,
    required this.billCount,
    required this.share,
  });

  factory PurchaseTopVendor.fromJson(Map<String, dynamic> j) => PurchaseTopVendor(
        vendorId: j['vendorId'] as String,
        name: j['name'] as String? ?? '—',
        spend: _num(j['spend']),
        billCount: _int(j['billCount']),
        share: _num(j['share']),
      );
}

class PurchaseTopItem {
  final String description;
  final double spend, quantity;

  /// Bill lines carry no unit of measure, so the SKU is what tells two
  /// similarly-named lines apart.
  final String? sku;
  const PurchaseTopItem({
    required this.description,
    required this.spend,
    required this.quantity,
    this.sku,
  });

  factory PurchaseTopItem.fromJson(Map<String, dynamic> j) => PurchaseTopItem(
        description: j['description'] as String? ?? '—',
        spend: _num(j['spend']),
        quantity: _num(j['quantity']),
        sku: j['sku'] as String?,
      );
}

class PurchaseStatusSlice {
  final String status;
  final int count;
  final double amount;
  const PurchaseStatusSlice({
    required this.status,
    required this.count,
    required this.amount,
  });

  factory PurchaseStatusSlice.fromJson(Map<String, dynamic> j) => PurchaseStatusSlice(
        status: j['status'] as String? ?? 'approved',
        count: _int(j['count']),
        amount: _num(j['amount']),
      );
}

class PurchasePayments {
  final double paidInPeriod, outstandingFromPeriod, paidRatio;

  /// Null when nothing in the window has been paid yet.
  final int? avgDaysToPay;
  const PurchasePayments({
    required this.paidInPeriod,
    required this.outstandingFromPeriod,
    required this.paidRatio,
    this.avgDaysToPay,
  });

  factory PurchasePayments.fromJson(Map<String, dynamic> j) => PurchasePayments(
        paidInPeriod: _num(j['paidInPeriod']),
        outstandingFromPeriod: _num(j['outstandingFromPeriod']),
        paidRatio: _num(j['paidRatio']),
        avgDaysToPay: j['avgDaysToPay'] == null ? null : _int(j['avgDaysToPay']),
      );
}

class PurchaseHeadline {
  final double grossSpend, debitNotes, netSpend;
  final double taxableValue, taxAmount, avgBillValue;
  final int billCount, activeVendors;
  const PurchaseHeadline({
    required this.grossSpend,
    required this.debitNotes,
    required this.netSpend,
    required this.taxableValue,
    required this.taxAmount,
    required this.avgBillValue,
    required this.billCount,
    required this.activeVendors,
  });

  factory PurchaseHeadline.fromJson(Map<String, dynamic> j) => PurchaseHeadline(
        grossSpend: _num(j['grossSpend']),
        debitNotes: _num(j['debitNotes']),
        netSpend: _num(j['netSpend']),
        taxableValue: _num(j['taxableValue']),
        taxAmount: _num(j['taxAmount']),
        avgBillValue: _num(j['avgBillValue']),
        billCount: _int(j['billCount']),
        activeVendors: _int(j['activeVendors']),
      );
}

class PurchaseAnalytics {
  final DateTime from, to;

  /// 'day' | 'week' | 'month' — the server picks it from the range length,
  /// and the chart labels its axis accordingly.
  final String grain;
  final PurchaseHeadline headline;
  final List<PurchaseTrendPoint> trend;
  final List<PurchaseTopVendor> topVendors;
  final List<PurchaseTopItem> topItems;
  final List<PurchaseStatusSlice> statusSplit;
  final PurchasePayments payments;

  const PurchaseAnalytics({
    required this.from,
    required this.to,
    required this.grain,
    required this.headline,
    required this.trend,
    required this.topVendors,
    required this.topItems,
    required this.statusSplit,
    required this.payments,
  });

  factory PurchaseAnalytics.fromJson(Map<String, dynamic> j) {
    final period = (j['period'] as Map?)?.cast<String, dynamic>() ?? const {};
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) =>
        ((j[key] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(parse)
            .toList();
    return PurchaseAnalytics(
      from: DateTime.parse(period['from'] as String),
      to: DateTime.parse(period['to'] as String),
      grain: period['grain'] as String? ?? 'day',
      headline: PurchaseHeadline.fromJson(
          (j['headline'] as Map?)?.cast<String, dynamic>() ?? const {}),
      trend: list('trend', PurchaseTrendPoint.fromJson),
      topVendors: list('topVendors', PurchaseTopVendor.fromJson),
      topItems: list('topItems', PurchaseTopItem.fromJson),
      statusSplit: list('statusSplit', PurchaseStatusSlice.fromJson),
      payments: PurchasePayments.fromJson(
          (j['payments'] as Map?)?.cast<String, dynamic>() ?? const {}),
    );
  }

  bool get isEmpty => headline.billCount == 0;
}
