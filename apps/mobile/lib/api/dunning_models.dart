library;

import 'reports_models.dart' show numAt, intAt, strAt;

class OverdueInvoice {
  final String id;
  final String invoiceNumber;
  final String customerId;
  final String customerName;
  final String? customerPhone;
  final String? customerEmail;
  final DateTime dueDate;
  final double totalAmount;
  final double balanceDue;
  final int daysOverdue;

  OverdueInvoice({
    required this.id,
    required this.invoiceNumber,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.customerEmail,
    required this.dueDate,
    required this.totalAmount,
    required this.balanceDue,
    required this.daysOverdue,
  });

  factory OverdueInvoice.fromJson(Map<String, dynamic> j) {
    final due = strAt(j['dueDate']) ?? '';
    return OverdueInvoice(
      id: strAt(j['id']) ?? '',
      invoiceNumber: strAt(j['invoiceNumber']) ?? '',
      customerId: strAt(j['customerId']) ?? '',
      customerName: strAt(j['customerName']) ?? '—',
      customerPhone: strAt(j['customerPhone']),
      customerEmail: strAt(j['customerEmail']),
      dueDate: DateTime.tryParse(due) ?? DateTime.now(),
      totalAmount: numAt(j['totalAmount']),
      balanceDue: numAt(j['balanceDue']),
      daysOverdue: intAt(j['daysOverdue']),
    );
  }
}

/// Overdue invoices grouped by customer for the collections screen.
class CustomerArAging {
  final String customerId;
  final String customerName;
  final String? customerPhone;
  final String? customerEmail;
  final List<OverdueInvoice> invoices;

  CustomerArAging({
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.customerEmail,
    required this.invoices,
  });

  double get totalDue =>
      invoices.fold<double>(0, (s, i) => s + i.balanceDue);
  int get worstDaysOverdue =>
      invoices.fold<int>(0, (m, i) => i.daysOverdue > m ? i.daysOverdue : m);

  static List<CustomerArAging> group(List<OverdueInvoice> invoices) {
    final byCustomer = <String, List<OverdueInvoice>>{};
    for (final i in invoices) {
      byCustomer.putIfAbsent(i.customerId, () => []).add(i);
    }
    final out = byCustomer.entries.map((e) {
      final first = e.value.first;
      return CustomerArAging(
        customerId: e.key,
        customerName: first.customerName,
        customerPhone: first.customerPhone,
        customerEmail: first.customerEmail,
        invoices: e.value..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue)),
      );
    }).toList();
    out.sort((a, b) => b.totalDue.compareTo(a.totalDue));
    return out;
  }
}

/// Five aging buckets used to drive the bucket-bar visualization.
class ArAgingBuckets {
  final double current;
  final double bucket1to30;
  final double bucket31to60;
  final double bucket61to90;
  final double bucket90plus;

  ArAgingBuckets({
    required this.current,
    required this.bucket1to30,
    required this.bucket31to60,
    required this.bucket61to90,
    required this.bucket90plus,
  });

  double get total =>
      current + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus;

  factory ArAgingBuckets.from(List<OverdueInvoice> invoices) {
    double a = 0, b = 0, c = 0, d = 0;
    for (final i in invoices) {
      final days = i.daysOverdue;
      if (days <= 30) {
        a += i.balanceDue;
      } else if (days <= 60) {
        b += i.balanceDue;
      } else if (days <= 90) {
        c += i.balanceDue;
      } else {
        d += i.balanceDue;
      }
    }
    return ArAgingBuckets(
      current: 0,
      bucket1to30: a,
      bucket31to60: b,
      bucket61to90: c,
      bucket90plus: d,
    );
  }
}

class RenderedDunningMessage {
  final String channel;
  final String customerName;
  final String? customerPhone;
  final String? customerEmail;
  final String? subject;
  final String text;
  final int invoiceCount;
  final double totalDue;

  RenderedDunningMessage({
    required this.channel,
    required this.customerName,
    required this.customerPhone,
    required this.customerEmail,
    required this.subject,
    required this.text,
    required this.invoiceCount,
    required this.totalDue,
  });

  factory RenderedDunningMessage.fromJson(Map<String, dynamic> j) =>
      RenderedDunningMessage(
        channel: strAt(j['channel']) ?? '',
        customerName: strAt(j['customerName']) ?? '—',
        customerPhone: strAt(j['customerPhone']),
        customerEmail: strAt(j['customerEmail']),
        subject: strAt(j['subject']),
        text: strAt(j['text']) ?? '',
        invoiceCount: intAt(j['invoiceCount']),
        totalDue: numAt(j['totalDue']),
      );
}

class DunningRule {
  final String id;
  final String name;
  final int daysAfterDue;
  final int escalationLevel;
  final String channel;
  final bool isActive;

  DunningRule({
    required this.id,
    required this.name,
    required this.daysAfterDue,
    required this.escalationLevel,
    required this.channel,
    required this.isActive,
  });

  factory DunningRule.fromJson(Map<String, dynamic> j) => DunningRule(
        id: strAt(j['id']) ?? '',
        name: strAt(j['name']) ?? '',
        daysAfterDue: intAt(j['daysAfterDue']),
        escalationLevel: intAt(j['escalationLevel']),
        channel: strAt(j['channel']) ?? 'email',
        isActive: j['isActive'] == true,
      );
}
