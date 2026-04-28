// Dart models mirroring the runQ API response shapes.
// Only fields the mobile UI uses are included; rest is ignored.

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int _int(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

String? _str(Object? v) => v == null ? null : v.toString();
String _strOr(Object? v, String fallback) => v == null ? fallback : v.toString();
bool _bool(Object? v) => v == true;

DateTime? _dt(Object? v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString())?.toLocal();
}

class PaginatedResponse<T> {
  final List<T> data;
  final int page, limit, total, totalPages;
  PaginatedResponse({required this.data, required this.page, required this.limit, required this.total, required this.totalPages});

  factory PaginatedResponse.fromJson(Map<String, dynamic> j, T Function(Map<String, dynamic>) item) {
    final list = (j['data'] as List? ?? const []).cast<Map<String, dynamic>>().map(item).toList();
    final meta = (j['meta'] as Map?)?.cast<String, dynamic>() ?? {};
    return PaginatedResponse(
      data: list,
      page: _int(meta['page']),
      limit: _int(meta['limit']),
      total: _int(meta['total']),
      totalPages: _int(meta['totalPages']),
    );
  }
}

class DashboardSummary {
  final double outstandingPayables, outstandingReceivables, cashPosition;
  final double overdueAmount, upcomingAmount;
  final int overdueCount, upcomingCount, unreconciledTxnCount;

  DashboardSummary({
    required this.outstandingPayables,
    required this.outstandingReceivables,
    required this.cashPosition,
    required this.overdueAmount,
    required this.upcomingAmount,
    required this.overdueCount,
    required this.upcomingCount,
    required this.unreconciledTxnCount,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> j) {
    final overdue = (j['overdue'] as Map?)?.cast<String, dynamic>() ?? {};
    final payOver = (overdue['payables'] as Map?)?.cast<String, dynamic>() ?? {};
    final recOver = (overdue['receivables'] as Map?)?.cast<String, dynamic>() ?? {};
    final upcoming = (j['upcomingPayments7Days'] as Map?)?.cast<String, dynamic>() ?? {};
    return DashboardSummary(
      outstandingPayables: _num(j['totalOutstandingPayables']),
      outstandingReceivables: _num(j['totalOutstandingReceivables']),
      cashPosition: _num(j['cashPosition']),
      overdueAmount: _num(payOver['amount']) + _num(recOver['amount']),
      overdueCount: _int(payOver['count']) + _int(recOver['count']),
      upcomingAmount: _num(upcoming['amount']),
      upcomingCount: _int(upcoming['count']),
      unreconciledTxnCount: _int(j['unreconciledTxnCount']),
    );
  }
}

class ActivityEntry {
  final String id, action, entityType, entityId;
  final String? entityRef, counterparty, userName;
  final double? amount;
  final DateTime createdAt;
  ActivityEntry({
    required this.id,
    required this.action,
    required this.entityType,
    required this.entityId,
    this.entityRef,
    this.counterparty,
    this.userName,
    this.amount,
    required this.createdAt,
  });

  factory ActivityEntry.fromJson(Map<String, dynamic> j) => ActivityEntry(
        id: _strOr(j['id'], ''),
        action: _strOr(j['action'], ''),
        entityType: _strOr(j['entityType'], ''),
        entityId: _strOr(j['entityId'], ''),
        entityRef: _str(j['entityRef']),
        counterparty: _str(j['counterparty']),
        userName: _str(j['userName']),
        amount: j['amount'] == null ? null : _num(j['amount']),
        createdAt: _dt(j['createdAt']) ?? DateTime.now(),
      );
}

class GstSignal {
  final String key, label;
  final bool ok;
  final String? detail;
  GstSignal({required this.key, required this.label, required this.ok, this.detail});

  factory GstSignal.fromJson(Map<String, dynamic> j) => GstSignal(
        key: _strOr(j['key'], ''),
        label: _strOr(j['label'], ''),
        ok: _bool(j['ok']),
        detail: _str(j['detail']),
      );
}

class GstReadiness {
  final String period, periodLabel;
  final int score;
  final List<GstSignal> signals;
  final DateTime? gstr1Due, gstr3bDue;
  final bool filedExternally, preparing;
  GstReadiness({
    required this.period,
    required this.periodLabel,
    required this.score,
    required this.signals,
    this.gstr1Due,
    this.gstr3bDue,
    required this.filedExternally,
    required this.preparing,
  });

  factory GstReadiness.fromJson(Map<String, dynamic> j) {
    final dueDates = (j['dueDates'] as Map?)?.cast<String, dynamic>() ?? {};
    final signals = (j['signals'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(GstSignal.fromJson)
        .toList();
    return GstReadiness(
      period: _strOr(j['period'], ''),
      periodLabel: _strOr(j['periodLabel'], ''),
      score: _int(j['score']),
      signals: signals,
      gstr1Due: _dt(dueDates['gstr1']),
      gstr3bDue: _dt(dueDates['gstr3b']),
      filedExternally: _bool(j['filedExternally']),
      preparing: _bool(j['preparing']),
    );
  }

  GstSignal? get firstFailingSignal => signals.where((s) => !s.ok).firstOrNull;

  int? get daysToGstr1 {
    if (gstr1Due == null) return null;
    final now = DateTime.now();
    return DateTime(gstr1Due!.year, gstr1Due!.month, gstr1Due!.day)
        .difference(DateTime(now.year, now.month, now.day))
        .inDays;
  }
}

extension on Iterable<GstSignal> {
  GstSignal? get firstOrNull => isEmpty ? null : first;
}

class CashTrend {
  final List<double> spark;
  final double weeklyDelta;
  final double cashPosition;
  final int days;
  CashTrend({required this.spark, required this.weeklyDelta, required this.cashPosition, required this.days});

  factory CashTrend.fromJson(Map<String, dynamic> j) => CashTrend(
        spark: (j['spark'] as List? ?? const []).map((v) => _num(v)).toList(),
        weeklyDelta: _num(j['weeklyDelta']),
        cashPosition: _num(j['cashPosition']),
        days: _int(j['days']),
      );
}

class InvoiceSummary {
  final double totalOutstanding, overdueAmount, receivedThisMonth;
  final int overdueCount, draftCount;
  InvoiceSummary({
    required this.totalOutstanding,
    required this.overdueAmount,
    required this.receivedThisMonth,
    required this.overdueCount,
    required this.draftCount,
  });

  factory InvoiceSummary.fromJson(Map<String, dynamic> j) => InvoiceSummary(
        totalOutstanding: _num(j['totalOutstanding']),
        overdueAmount: _num(j['overdueAmount']),
        receivedThisMonth: _num(j['receivedThisMonth']),
        overdueCount: _int(j['overdueCount']),
        draftCount: _int(j['draftCount']),
      );
}

class Invoice {
  final String id, invoiceNumber, customerId, status;
  final String customerName;
  final double subtotal, taxAmount, totalAmount, amountReceived, balanceDue;
  final double cgst, sgst, igst, cess;
  final bool isInterState;
  final DateTime invoiceDate, dueDate;

  Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.customerId,
    required this.status,
    required this.customerName,
    required this.subtotal,
    required this.taxAmount,
    required this.totalAmount,
    required this.amountReceived,
    required this.balanceDue,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.cess,
    required this.isInterState,
    required this.invoiceDate,
    required this.dueDate,
  });

  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: _strOr(j['id'], ''),
        invoiceNumber: _strOr(j['invoiceNumber'], ''),
        customerId: _strOr(j['customerId'], ''),
        status: _strOr(j['status'], 'draft'),
        customerName: _strOr(j['customerName'] ?? j['customerNickname'], '—'),
        subtotal: _num(j['subtotal']),
        taxAmount: _num(j['taxAmount']),
        totalAmount: _num(j['totalAmount']),
        amountReceived: _num(j['amountReceived']),
        balanceDue: _num(j['balanceDue']),
        cgst: _num(j['cgstAmount']),
        sgst: _num(j['sgstAmount']),
        igst: _num(j['igstAmount']),
        cess: _num(j['cessAmount']),
        isInterState: _bool(j['isInterState']),
        invoiceDate: _dt(j['invoiceDate']) ?? DateTime.now(),
        dueDate: _dt(j['dueDate']) ?? DateTime.now(),
      );
}

class InvoiceItem {
  final String description, itemName;
  final double quantity, unitPrice, amount;
  InvoiceItem({required this.description, required this.itemName, required this.quantity, required this.unitPrice, required this.amount});

  factory InvoiceItem.fromJson(Map<String, dynamic> j) => InvoiceItem(
        description: _strOr(j['description'], ''),
        itemName: _strOr(j['itemName'] ?? j['description'], ''),
        quantity: _num(j['quantity']),
        unitPrice: _num(j['unitPrice']),
        amount: _num(j['amount']),
      );
}

class InvoiceWithDetails extends Invoice {
  final List<InvoiceItem> items;
  InvoiceWithDetails({
    required super.id,
    required super.invoiceNumber,
    required super.customerId,
    required super.status,
    required super.customerName,
    required super.subtotal,
    required super.taxAmount,
    required super.totalAmount,
    required super.amountReceived,
    required super.balanceDue,
    required super.cgst,
    required super.sgst,
    required super.igst,
    required super.cess,
    required super.isInterState,
    required super.invoiceDate,
    required super.dueDate,
    required this.items,
  });

  factory InvoiceWithDetails.fromJson(Map<String, dynamic> j) {
    final base = Invoice.fromJson(j);
    final items = (j['items'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvoiceItem.fromJson)
        .toList();
    return InvoiceWithDetails(
      id: base.id,
      invoiceNumber: base.invoiceNumber,
      customerId: base.customerId,
      status: base.status,
      customerName: base.customerName,
      subtotal: base.subtotal,
      taxAmount: base.taxAmount,
      totalAmount: base.totalAmount,
      amountReceived: base.amountReceived,
      balanceDue: base.balanceDue,
      cgst: base.cgst,
      sgst: base.sgst,
      igst: base.igst,
      cess: base.cess,
      isInterState: base.isInterState,
      invoiceDate: base.invoiceDate,
      dueDate: base.dueDate,
      items: items,
    );
  }
}

class InvoiceReceipt {
  final String id, paymentMethod;
  final String? referenceNumber;
  final double amount;
  final DateTime receiptDate;
  InvoiceReceipt({required this.id, required this.paymentMethod, this.referenceNumber, required this.amount, required this.receiptDate});

  factory InvoiceReceipt.fromJson(Map<String, dynamic> j) => InvoiceReceipt(
        id: _strOr(j['id'], ''),
        paymentMethod: _strOr(j['paymentMethod'], '—'),
        referenceNumber: _str(j['referenceNumber']),
        amount: _num(j['amount']),
        receiptDate: _dt(j['receiptDate']) ?? DateTime.now(),
      );
}

class Bill {
  final String id, invoiceNumber, vendorId, status, matchStatus;
  final String vendorName;
  final double subtotal, taxAmount, totalAmount, amountPaid, balanceDue;
  final bool hasPO;
  final DateTime invoiceDate, dueDate;

  Bill({
    required this.id,
    required this.invoiceNumber,
    required this.vendorId,
    required this.status,
    required this.matchStatus,
    required this.vendorName,
    required this.subtotal,
    required this.taxAmount,
    required this.totalAmount,
    required this.amountPaid,
    required this.balanceDue,
    required this.hasPO,
    required this.invoiceDate,
    required this.dueDate,
  });

  factory Bill.fromJson(Map<String, dynamic> j) => Bill(
        id: _strOr(j['id'], ''),
        invoiceNumber: _strOr(j['invoiceNumber'], ''),
        vendorId: _strOr(j['vendorId'], ''),
        status: _strOr(j['status'], 'draft'),
        matchStatus: _strOr(j['matchStatus'], 'unmatched'),
        vendorName: _strOr(j['vendorName'], '—'),
        subtotal: _num(j['subtotal']),
        taxAmount: _num(j['taxAmount']),
        totalAmount: _num(j['totalAmount']),
        amountPaid: _num(j['amountPaid']),
        balanceDue: _num(j['balanceDue']),
        hasPO: j['poId'] != null,
        invoiceDate: _dt(j['invoiceDate']) ?? DateTime.now(),
        dueDate: _dt(j['dueDate']) ?? DateTime.now(),
      );
}

class BillItem {
  final String description, itemName;
  final double quantity, unitPrice, amount;
  BillItem({required this.description, required this.itemName, required this.quantity, required this.unitPrice, required this.amount});

  factory BillItem.fromJson(Map<String, dynamic> j) => BillItem(
        description: _strOr(j['itemName'] ?? j['description'], ''),
        itemName: _strOr(j['itemName'] ?? j['description'], ''),
        quantity: _num(j['quantity']),
        unitPrice: _num(j['unitPrice']),
        amount: _num(j['amount']),
      );
}

class BillWithDetails extends Bill {
  final List<BillItem> items;
  final double cgst, sgst, igst, cess;
  final bool isInterState;
  BillWithDetails({
    required super.id,
    required super.invoiceNumber,
    required super.vendorId,
    required super.status,
    required super.matchStatus,
    required super.vendorName,
    required super.subtotal,
    required super.taxAmount,
    required super.totalAmount,
    required super.amountPaid,
    required super.balanceDue,
    required super.hasPO,
    required super.invoiceDate,
    required super.dueDate,
    required this.items,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.cess,
    required this.isInterState,
  });

  factory BillWithDetails.fromJson(Map<String, dynamic> j) {
    final base = Bill.fromJson(j);
    final items = (j['items'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(BillItem.fromJson)
        .toList();
    return BillWithDetails(
      id: base.id,
      invoiceNumber: base.invoiceNumber,
      vendorId: base.vendorId,
      status: base.status,
      matchStatus: base.matchStatus,
      vendorName: base.vendorName,
      subtotal: base.subtotal,
      taxAmount: base.taxAmount,
      totalAmount: base.totalAmount,
      amountPaid: base.amountPaid,
      balanceDue: base.balanceDue,
      hasPO: base.hasPO,
      invoiceDate: base.invoiceDate,
      dueDate: base.dueDate,
      items: items,
      cgst: _num(j['cgstAmount']),
      sgst: _num(j['sgstAmount']),
      igst: _num(j['igstAmount']),
      cess: _num(j['cessAmount']),
      isInterState: _bool(j['isInterState']),
    );
  }
}

class BillsSummary {
  final double totalOutstanding, overdueAmount, paidThisMonth;
  final int overdueCount, pendingApprovalCount;
  BillsSummary({
    required this.totalOutstanding,
    required this.overdueAmount,
    required this.paidThisMonth,
    required this.overdueCount,
    required this.pendingApprovalCount,
  });

  factory BillsSummary.fromJson(Map<String, dynamic> j) => BillsSummary(
        totalOutstanding: _num(j['totalOutstanding']),
        overdueAmount: _num(j['overdueAmount']),
        paidThisMonth: _num(j['paidThisMonth']),
        overdueCount: _int(j['overdueCount']),
        pendingApprovalCount: _int(j['pendingApprovalCount']),
      );
}

class BankAccount {
  final String id, name, bankName, accountNumber, accountType;
  final String? logoUrl;
  final double currentBalance;
  BankAccount({
    required this.id,
    required this.name,
    required this.bankName,
    required this.accountNumber,
    required this.accountType,
    required this.currentBalance,
    this.logoUrl,
  });

  factory BankAccount.fromJson(Map<String, dynamic> j) => BankAccount(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        bankName: _strOr(j['bankName'], ''),
        accountNumber: _strOr(j['accountNumber'], ''),
        accountType: _strOr(j['accountType'], 'current'),
        currentBalance: _num(j['currentBalance']),
        logoUrl: _str(j['logoUrl']),
      );

  String get masked {
    final s = accountNumber;
    if (s.length <= 4) return s;
    return '··· ${s.substring(s.length - 4)}';
  }
}

class BankTxn {
  final String id, bankAccountId, type, reconStatus;
  final String? reference, narration;
  final String? vendorId, vendorName, customerId, customerName;
  final String? glAccountName;
  final double? glConfidence;
  final double amount;
  final DateTime transactionDate;

  BankTxn({
    required this.id,
    required this.bankAccountId,
    required this.type,
    required this.reconStatus,
    this.reference,
    this.narration,
    this.vendorId,
    this.vendorName,
    this.customerId,
    this.customerName,
    this.glAccountName,
    this.glConfidence,
    required this.amount,
    required this.transactionDate,
  });

  factory BankTxn.fromJson(Map<String, dynamic> j) => BankTxn(
        id: _strOr(j['id'], ''),
        bankAccountId: _strOr(j['bankAccountId'], ''),
        type: _strOr(j['type'], 'debit'),
        reconStatus: _strOr(j['reconStatus'], 'unreconciled'),
        reference: _str(j['reference']),
        narration: _str(j['narration']),
        vendorId: _str(j['vendorId']),
        vendorName: _str(j['vendorName']),
        customerId: _str(j['customerId']),
        customerName: _str(j['customerName']),
        glAccountName: _str(j['glAccountName']),
        glConfidence: j['glConfidence'] == null ? null : _num(j['glConfidence']),
        amount: _num(j['amount']),
        transactionDate: _dt(j['transactionDate']) ?? DateTime.now(),
      );

  bool get isCredit => type == 'credit';
}

class ApprovalStep {
  final String id, status, assignedRole;
  final int stepOrder;
  final DateTime? decidedAt;
  ApprovalStep({required this.id, required this.status, required this.assignedRole, required this.stepOrder, this.decidedAt});

  factory ApprovalStep.fromJson(Map<String, dynamic> j) => ApprovalStep(
        id: _strOr(j['id'], ''),
        status: _strOr(j['status'], 'pending'),
        assignedRole: _strOr(j['assignedRole'], ''),
        stepOrder: _int(j['stepOrder']),
        decidedAt: _dt(j['decidedAt']),
      );
}

class ApprovalInstance {
  final String id, entityType, entityId, status, requestedBy;
  final DateTime requestedAt;
  final List<ApprovalStep> steps;
  final double? amount;
  final String? entityRef, entityWho;

  ApprovalInstance({
    required this.id,
    required this.entityType,
    required this.entityId,
    required this.status,
    required this.requestedBy,
    required this.requestedAt,
    required this.steps,
    this.amount,
    this.entityRef,
    this.entityWho,
  });

  factory ApprovalInstance.fromJson(Map<String, dynamic> j) {
    final steps = (j['steps'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ApprovalStep.fromJson)
        .toList();
    return ApprovalInstance(
      id: _strOr(j['id'], ''),
      entityType: _strOr(j['entityType'], ''),
      entityId: _strOr(j['entityId'], ''),
      status: _strOr(j['status'], 'pending'),
      requestedBy: _strOr(j['requestedByName'] ?? j['requestedBy'], '—'),
      requestedAt: _dt(j['requestedAt']) ?? DateTime.now(),
      steps: steps,
      amount: j['amount'] == null ? null : _num(j['amount']),
      entityRef: _str(j['entityRef']),
      entityWho: _str(j['entityWho']),
    );
  }

  ApprovalStep? get currentPendingStep {
    for (final s in steps) {
      if (s.status == 'pending') return s;
    }
    return null;
  }
}

class ExtractedBill {
  final String vendorName;
  final String? vendorGstin, invoiceNumber;
  final DateTime? invoiceDate, dueDate;
  final double subtotal, taxAmount, totalAmount;
  final double confidence;
  final List<ExtractedBillItem> items;
  final ExtractedVendorMatch? vendorMatch;

  ExtractedBill({
    required this.vendorName,
    this.vendorGstin,
    this.invoiceNumber,
    this.invoiceDate,
    this.dueDate,
    required this.subtotal,
    required this.taxAmount,
    required this.totalAmount,
    required this.confidence,
    required this.items,
    this.vendorMatch,
  });

  factory ExtractedBill.fromJson(Map<String, dynamic> j) {
    final extracted = (j['extracted'] as Map?)?.cast<String, dynamic>() ?? j;
    final items = (extracted['items'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ExtractedBillItem.fromJson)
        .toList();
    final vmRaw = j['vendorMatch'];
    return ExtractedBill(
      vendorName: _strOr(extracted['vendorName'], '—'),
      vendorGstin: _str(extracted['vendorGstin']),
      invoiceNumber: _str(extracted['invoiceNumber']),
      invoiceDate: _dt(extracted['invoiceDate']),
      dueDate: _dt(extracted['dueDate']),
      subtotal: _num(extracted['subtotal']),
      taxAmount: _num(extracted['taxAmount']),
      totalAmount: _num(extracted['totalAmount']),
      confidence: _num(j['confidence'] ?? extracted['confidence']),
      items: items,
      vendorMatch: vmRaw is Map ? ExtractedVendorMatch.fromJson(vmRaw.cast<String, dynamic>()) : null,
    );
  }
}

class ExtractedBillItem {
  final String itemName;
  final double quantity, unitPrice, amount;
  ExtractedBillItem({required this.itemName, required this.quantity, required this.unitPrice, required this.amount});

  factory ExtractedBillItem.fromJson(Map<String, dynamic> j) => ExtractedBillItem(
        itemName: _strOr(j['itemName'], ''),
        quantity: _num(j['quantity']),
        unitPrice: _num(j['unitPrice']),
        amount: _num(j['amount']),
      );
}

class ExtractedVendorMatch {
  final String id, name, matchType;
  ExtractedVendorMatch({required this.id, required this.name, required this.matchType});

  factory ExtractedVendorMatch.fromJson(Map<String, dynamic> j) => ExtractedVendorMatch(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        matchType: _strOr(j['matchType'], 'name'),
      );
}
