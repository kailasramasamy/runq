// Models for the consolidated "To pay" view (GET /to-pay).

double _n(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int _i(Object? v) => _n(v).round();

List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) => v is List
    ? v.whereType<Map>().map((e) => f(e.cast<String, dynamic>())).toList()
    : <T>[];

class ToPayCategory {
  final String key, label;
  final double total, paid, balance, overdue;
  final int count, paidCount;
  const ToPayCategory({
    required this.key,
    required this.label,
    required this.total,
    required this.paid,
    required this.balance,
    required this.overdue,
    required this.count,
    required this.paidCount,
  });

  factory ToPayCategory.fromJson(Map<String, dynamic> j) => ToPayCategory(
        key: (j['key'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        total: _n(j['total']),
        paid: _n(j['paid']),
        balance: _n(j['balance']),
        overdue: _n(j['overdue']),
        count: _i(j['count']),
        paidCount: _i(j['paidCount']),
      );
}

class ToPayItem {
  final String id, category, title, subtitle, dueDate, period, status;
  final double amount, paid, balance;
  final String? webLink, mobileLink;
  /// The part of the month it covers ("1–15 Sep") when narrower than the
  /// month — milk cycles, twice-monthly rent. Null for whole-month items.
  final String? subPeriod, subPeriodStart;
  /// Set when the line rolls up a milk cycle's farmers — the cycle to open
  /// for the per-farmer breakdown, narrowed to one VMCC for a VMCC bill.
  final ({String cycleId, String? vmccNodeId})? milkCycle;
  const ToPayItem({
    required this.id,
    required this.category,
    required this.title,
    required this.subtitle,
    required this.dueDate,
    required this.period,
    required this.status,
    required this.amount,
    required this.paid,
    required this.balance,
    this.webLink,
    this.mobileLink,
    this.subPeriod,
    this.subPeriodStart,
    this.milkCycle,
  });

  factory ToPayItem.fromJson(Map<String, dynamic> j) => ToPayItem(
        id: (j['id'] ?? '').toString(),
        category: (j['category'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        subtitle: (j['subtitle'] ?? '').toString(),
        dueDate: (j['dueDate'] ?? '').toString(),
        period: (j['period'] ?? '').toString(),
        status: (j['status'] ?? 'due').toString(),
        amount: _n(j['amount']),
        paid: _n(j['paid']),
        balance: _n(j['balance']),
        webLink: j['webLink']?.toString(),
        subPeriod: j['subPeriod']?.toString(),
        subPeriodStart: j['subPeriodStart']?.toString(),
        milkCycle: _milkCycle(j['detail']),
        mobileLink: j['mobileLink']?.toString(),
      );
}

class ToPay {
  final String asOf;
  final String? month;
  final bool isMonth;
  final double total, paid, balance, overdue, thisWeek, later;
  final int overdueCount, thisWeekCount;
  final List<ToPayCategory> categories;
  final List<ToPayItem> items;
  const ToPay({
    required this.asOf,
    required this.month,
    required this.isMonth,
    required this.total,
    required this.paid,
    required this.balance,
    required this.overdue,
    required this.overdueCount,
    required this.thisWeek,
    required this.thisWeekCount,
    required this.later,
    required this.categories,
    required this.items,
  });

  factory ToPay.fromJson(Map<String, dynamic> j) => ToPay(
        asOf: (j['asOf'] ?? '').toString(),
        month: j['month']?.toString(),
        isMonth: j['scope'] == 'month',
        total: _n(j['total']),
        paid: _n(j['paid']),
        balance: _n(j['balance']),
        overdue: _n(j['overdue']),
        overdueCount: _i(j['overdueCount']),
        thisWeek: _n(j['thisWeek']),
        thisWeekCount: _i(j['thisWeekCount']),
        later: _n(j['later']),
        categories: _list(j['categories'], ToPayCategory.fromJson),
        items: _list(j['items'], ToPayItem.fromJson),
      );
}

({String cycleId, String? vmccNodeId})? _milkCycle(Object? d) {
  if (d is! Map || d['kind'] != 'milk_cycle' || d['cycleId'] == null) return null;
  return (cycleId: d['cycleId'].toString(), vmccNodeId: d['vmccNodeId']?.toString());
}
