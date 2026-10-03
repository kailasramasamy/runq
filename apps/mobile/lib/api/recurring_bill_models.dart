// Models for recurring AP agreements (rent, transport retainers).

double _n(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

String? _s(Object? v) => v?.toString();

class RecurringLastPayment {
  final String date;
  final double amount;
  const RecurringLastPayment(this.date, this.amount);
}

class RecurringBill {
  /// [frequency] is 'monthly' or 'semi_monthly' (half the amount on the 1st and the 16th).
  final String id, vendorId, vendorName, title, category, frequency;
  final String? expenseAccountCode, endMonth;
  final String startMonth;
  final double amount, billed, paid, outstanding, advanceHeld;
  final int billDay;
  final bool isActive;
  final RecurringLastPayment? lastPayment;

  const RecurringBill({
    required this.id,
    required this.vendorId,
    required this.vendorName,
    required this.title,
    required this.category,
    required this.frequency,
    required this.startMonth,
    required this.amount,
    required this.billed,
    required this.paid,
    required this.outstanding,
    required this.advanceHeld,
    required this.billDay,
    required this.isActive,
    this.expenseAccountCode,
    this.endMonth,
    this.lastPayment,
  });

  factory RecurringBill.fromJson(Map<String, dynamic> j) {
    final lp = j['lastPayment'];
    return RecurringBill(
      id: _s(j['id']) ?? '',
      vendorId: _s(j['vendorId']) ?? '',
      vendorName: _s(j['vendorName']) ?? '',
      title: _s(j['title']) ?? '',
      category: _s(j['category']) ?? 'other',
      frequency: _s(j['frequency']) ?? 'monthly',
      expenseAccountCode: _s(j['expenseAccountCode']),
      startMonth: _s(j['startMonth']) ?? '',
      endMonth: _s(j['endMonth']),
      amount: _n(j['amount']),
      billed: _n(j['billed']),
      paid: _n(j['paid']),
      outstanding: _n(j['outstanding']),
      advanceHeld: _n(j['advanceHeld']),
      billDay: (_n(j['billDay'])).toInt(),
      isActive: j['isActive'] != false,
      lastPayment: lp is Map
          ? RecurringLastPayment(_s(lp['date']) ?? '', _n(lp['amount']))
          : null,
    );
  }
}

class RecurringMonth {
  /// [label] is 'Sep 2026', or 'Sep 2026 — 1st half' on a twice-monthly agreement.
  final String id, period, label, invoiceNumber, invoiceDate, status;
  final double total, paid, balance;

  const RecurringMonth({
    required this.id,
    required this.period,
    required this.label,
    required this.invoiceNumber,
    required this.invoiceDate,
    required this.status,
    required this.total,
    required this.paid,
    required this.balance,
  });

  factory RecurringMonth.fromJson(Map<String, dynamic> j) => RecurringMonth(
        id: _s(j['id']) ?? '',
        period: _s(j['period']) ?? '',
        label: _s(j['label']) ?? '',
        invoiceNumber: _s(j['invoiceNumber']) ?? '',
        invoiceDate: _s(j['invoiceDate']) ?? '',
        status: _s(j['status']) ?? 'approved',
        total: _n(j['total']),
        paid: _n(j['paid']),
        balance: _n(j['balance']),
      );
}

class RecurringPaymentRow {
  /// [status] 'pending' = recorded on the AP payments screen, awaiting approval.
  final String id, date, status;
  final double amount, unapplied;
  final String? reference;
  /// The agreement periods this payment settled, e.g. 'Sep 2026 — 1st half · ₹47,500'.
  final List<({String label, double amount})> paidFor;

  const RecurringPaymentRow({
    required this.id,
    required this.date,
    required this.status,
    required this.amount,
    required this.unapplied,
    this.reference,
    this.paidFor = const [],
  });

  factory RecurringPaymentRow.fromJson(Map<String, dynamic> j) =>
      RecurringPaymentRow(
        id: _s(j['id']) ?? '',
        date: _s(j['date']) ?? '',
        status: _s(j['status']) ?? 'completed',
        amount: _n(j['amount']),
        unapplied: _n(j['unapplied']),
        reference: _s(j['reference']),
        paidFor: [
          for (final f in (j['paidFor'] as List? ?? const []))
            if (f is Map) (label: _s(f['label']) ?? '', amount: _n(f['amount'])),
        ],
      );
}

class RecurringBillDetail {
  final RecurringBill agreement;
  final List<RecurringMonth> months;
  final List<RecurringPaymentRow> payments;

  const RecurringBillDetail(this.agreement, this.months, this.payments);

  factory RecurringBillDetail.fromJson(Map<String, dynamic> j) {
    List<T> rows<T>(String key, T Function(Map<String, dynamic>) f) =>
        ((j[key] as List?) ?? const [])
            .map((e) => f((e as Map).cast<String, dynamic>()))
            .toList();
    return RecurringBillDetail(
      RecurringBill.fromJson(j),
      rows('months', RecurringMonth.fromJson),
      rows('payments', RecurringPaymentRow.fromJson),
    );
  }
}

class RecurringPaymentResult {
  final double paidToBills, heldAsAdvance;
  const RecurringPaymentResult(this.paidToBills, this.heldAsAdvance);

  factory RecurringPaymentResult.fromJson(Map<String, dynamic> j) =>
      RecurringPaymentResult(_n(j['paidToBills']), _n(j['heldAsAdvance']));
}
