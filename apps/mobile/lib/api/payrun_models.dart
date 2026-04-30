library;

import 'reports_models.dart' show numAt, intAt, strAt;

class PaymentRun {
  final String id;
  final String runId;
  final String source;
  final String? description;
  final String status; // draft | approved | executed | cancelled
  final int totalCount;
  final double totalAmount;
  final int approvedCount;
  final double approvedAmount;
  final DateTime createdAt;

  PaymentRun({
    required this.id,
    required this.runId,
    required this.source,
    required this.description,
    required this.status,
    required this.totalCount,
    required this.totalAmount,
    required this.approvedCount,
    required this.approvedAmount,
    required this.createdAt,
  });

  factory PaymentRun.fromJson(Map<String, dynamic> j) => PaymentRun(
        id: strAt(j['id']) ?? '',
        runId: strAt(j['runId']) ?? '',
        source: strAt(j['source']) ?? '',
        description: strAt(j['description']),
        status: strAt(j['status']) ?? 'draft',
        totalCount: intAt(j['totalCount']),
        totalAmount: numAt(j['totalAmount']),
        approvedCount: intAt(j['approvedCount']),
        approvedAmount: numAt(j['approvedAmount']),
        createdAt: DateTime.tryParse(strAt(j['createdAt']) ?? '') ??
            DateTime.now(),
      );
}

class PaymentRunLine {
  final String id;
  final String runId;
  final String? vendorId;
  final String vendorName;
  final double amount;
  final String? reference;
  final String? reason;
  final DateTime? dueDate;
  final String status; // pending | approved | rejected
  final String? purchaseInvoiceId;
  final String? errorMessage;

  PaymentRunLine({
    required this.id,
    required this.runId,
    required this.vendorId,
    required this.vendorName,
    required this.amount,
    required this.reference,
    required this.reason,
    required this.dueDate,
    required this.status,
    required this.purchaseInvoiceId,
    required this.errorMessage,
  });

  factory PaymentRunLine.fromJson(Map<String, dynamic> j) => PaymentRunLine(
        id: strAt(j['id']) ?? '',
        runId: strAt(j['runId']) ?? '',
        vendorId: strAt(j['vendorId']),
        vendorName: strAt(j['vendorName']) ?? '—',
        amount: numAt(j['amount']),
        reference: strAt(j['reference']),
        reason: strAt(j['reason']),
        dueDate: DateTime.tryParse(strAt(j['dueDate']) ?? ''),
        status: strAt(j['status']) ?? 'pending',
        purchaseInvoiceId: strAt(j['purchaseInvoiceId']),
        errorMessage: strAt(j['errorMessage']),
      );
}

class PaymentRunWithLines extends PaymentRun {
  final List<PaymentRunLine> lines;
  PaymentRunWithLines({
    required super.id,
    required super.runId,
    required super.source,
    required super.description,
    required super.status,
    required super.totalCount,
    required super.totalAmount,
    required super.approvedCount,
    required super.approvedAmount,
    required super.createdAt,
    required this.lines,
  });

  factory PaymentRunWithLines.fromJson(Map<String, dynamic> j) {
    final raw = j['lines'];
    return PaymentRunWithLines(
      id: strAt(j['id']) ?? '',
      runId: strAt(j['runId']) ?? '',
      source: strAt(j['source']) ?? '',
      description: strAt(j['description']),
      status: strAt(j['status']) ?? 'draft',
      totalCount: intAt(j['totalCount']),
      totalAmount: numAt(j['totalAmount']),
      approvedCount: intAt(j['approvedCount']),
      approvedAmount: numAt(j['approvedAmount']),
      createdAt: DateTime.tryParse(strAt(j['createdAt']) ?? '') ??
          DateTime.now(),
      lines: (raw is List ? raw : const [])
          .whereType<Map<String, dynamic>>()
          .map(PaymentRunLine.fromJson)
          .toList(),
    );
  }
}

class PaymentQueueBill {
  final String id;
  final String invoiceNumber;
  final String vendorId;
  final String vendorName;
  final DateTime dueDate;
  final double balanceDue;
  final int daysOverdue;
  final String status;

  PaymentQueueBill({
    required this.id,
    required this.invoiceNumber,
    required this.vendorId,
    required this.vendorName,
    required this.dueDate,
    required this.balanceDue,
    required this.daysOverdue,
    required this.status,
  });

  factory PaymentQueueBill.fromJson(Map<String, dynamic> j) =>
      PaymentQueueBill(
        id: strAt(j['id']) ?? '',
        invoiceNumber: strAt(j['invoiceNumber']) ?? '',
        vendorId: strAt(j['vendorId']) ?? '',
        vendorName: strAt(j['vendorName']) ?? '—',
        dueDate:
            DateTime.tryParse(strAt(j['dueDate']) ?? '') ?? DateTime.now(),
        balanceDue: numAt(j['balanceDue']),
        daysOverdue: intAt(j['daysOverdue']),
        status: strAt(j['status']) ?? '',
      );
}

class PaymentQueueSummary {
  final double totalPayable;
  final double overdueAmount;
  final int overdueCount;
  final double dueThisWeek;
  final double dueThisMonth;

  PaymentQueueSummary({
    required this.totalPayable,
    required this.overdueAmount,
    required this.overdueCount,
    required this.dueThisWeek,
    required this.dueThisMonth,
  });

  factory PaymentQueueSummary.fromJson(Map<String, dynamic> j) =>
      PaymentQueueSummary(
        totalPayable: numAt(j['totalPayable']),
        overdueAmount: numAt(j['overdueAmount']),
        overdueCount: intAt(j['overdueCount']),
        dueThisWeek: numAt(j['dueThisWeek']),
        dueThisMonth: numAt(j['dueThisMonth']),
      );
}

class PaymentQueue {
  final PaymentQueueSummary summary;
  final List<PaymentQueueBill> bills;
  PaymentQueue({required this.summary, required this.bills});

  factory PaymentQueue.fromJson(Map<String, dynamic> j) {
    final s = (j['summary'] as Map?)?.cast<String, dynamic>() ?? {};
    final b = (j['bills'] as List?) ?? const [];
    return PaymentQueue(
      summary: PaymentQueueSummary.fromJson(s),
      bills: b.whereType<Map<String, dynamic>>().map(PaymentQueueBill.fromJson).toList(),
    );
  }
}
