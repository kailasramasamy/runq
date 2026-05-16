// Dart models mirroring the runQ API response shapes.
// Only fields the mobile UI uses are included; rest is ignored.

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

double? _numOrNull(Object? v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
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
  // Total counts of all outstanding documents — let the hero card pair its
  // book-total amount with a matching total ("X of Y overdue").
  final int outstandingPayablesCount, outstandingReceivablesCount;

  DashboardSummary({
    required this.outstandingPayables,
    required this.outstandingReceivables,
    required this.cashPosition,
    required this.overdueAmount,
    required this.upcomingAmount,
    required this.overdueCount,
    required this.upcomingCount,
    required this.unreconciledTxnCount,
    required this.outstandingPayablesCount,
    required this.outstandingReceivablesCount,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> j) {
    final overdue = (j['overdue'] as Map?)?.cast<String, dynamic>() ?? {};
    final recOver = (overdue['receivables'] as Map?)?.cast<String, dynamic>() ?? {};
    final upcoming = (j['upcomingPayments7Days'] as Map?)?.cast<String, dynamic>() ?? {};
    return DashboardSummary(
      outstandingPayables: _num(j['totalOutstandingPayables']),
      outstandingReceivables: _num(j['totalOutstandingReceivables']),
      cashPosition: _num(j['cashPosition']),
      // Overdue here is receivables-only: the consumers (hero AR caption,
      // OVERDUE spotlight card) are about invoices to collect on.
      overdueAmount: _num(recOver['amount']),
      overdueCount: _int(recOver['count']),
      upcomingAmount: _num(upcoming['amount']),
      upcomingCount: _int(upcoming['count']),
      unreconciledTxnCount: _int(j['unreconciledTxnCount']),
      outstandingPayablesCount: _int(j['totalOutstandingPayablesCount']),
      outstandingReceivablesCount: _int(j['totalOutstandingReceivablesCount']),
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

/// Which filing the readiness score is rating right now.
enum ReadinessTarget { gstr1, gstr3b, nextGstr1 }

class GstReturnStatus {
  final bool exists;
  final String? status;
  const GstReturnStatus({required this.exists, this.status});

  bool get isFiled => status == 'filed';

  factory GstReturnStatus.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const GstReturnStatus(exists: false, status: null);
    return GstReturnStatus(
      exists: _bool(j['exists']),
      status: _str(j['status']),
    );
  }
}

class GstReadiness {
  final String period, periodLabel;
  final ReadinessTarget target;
  final String targetLabel;
  final int score;
  final List<GstSignal> signals;
  final DateTime? gstr1Due, gstr3bDue;
  final GstReturnStatus gstr1Status;
  final GstReturnStatus gstr3bStatus;
  final bool filedExternally, preparing;
  GstReadiness({
    required this.period,
    required this.periodLabel,
    required this.target,
    required this.targetLabel,
    required this.score,
    required this.signals,
    this.gstr1Due,
    this.gstr3bDue,
    required this.gstr1Status,
    required this.gstr3bStatus,
    required this.filedExternally,
    required this.preparing,
  });

  factory GstReadiness.fromJson(Map<String, dynamic> j) {
    final dueDates = (j['dueDates'] as Map?)?.cast<String, dynamic>() ?? {};
    final returns = (j['returns'] as Map?)?.cast<String, dynamic>() ?? {};
    final signals = (j['signals'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(GstSignal.fromJson)
        .toList();
    return GstReadiness(
      period: _strOr(j['period'], ''),
      periodLabel: _strOr(j['periodLabel'], ''),
      target: _readinessTarget(j['target']),
      targetLabel: _strOr(j['targetLabel'], 'GSTR-1'),
      score: _int(j['score']),
      signals: signals,
      gstr1Due: _dt(dueDates['gstr1']),
      gstr3bDue: _dt(dueDates['gstr3b']),
      gstr1Status: GstReturnStatus.fromJson(returns['gstr1'] as Map<String, dynamic>?),
      gstr3bStatus: GstReturnStatus.fromJson(returns['gstr3b'] as Map<String, dynamic>?),
      filedExternally: _bool(j['filedExternally']),
      preparing: _bool(j['preparing']),
    );
  }

  GstSignal? get firstFailingSignal => signals.where((s) => !s.ok).firstOrNull;

  int? get daysToGstr1 => _daysTo(gstr1Due);
  int? get daysToGstr3b => _daysTo(gstr3bDue);

  /// Days until the deadline relevant to the current target.
  /// `nextGstr1` is the upcoming month's 11th — same data as `gstr1Due` since
  /// the backend has already advanced `period` to the next cycle.
  int? get daysToTarget {
    switch (target) {
      case ReadinessTarget.gstr1:
      case ReadinessTarget.nextGstr1:
        return daysToGstr1;
      case ReadinessTarget.gstr3b:
        return daysToGstr3b;
    }
  }

  int? _daysTo(DateTime? d) {
    if (d == null) return null;
    final now = DateTime.now();
    return DateTime(d.year, d.month, d.day)
        .difference(DateTime(now.year, now.month, now.day))
        .inDays;
  }
}

ReadinessTarget _readinessTarget(dynamic v) {
  switch (v) {
    case 'gstr3b':
      return ReadinessTarget.gstr3b;
    case 'next_gstr1':
      return ReadinessTarget.nextGstr1;
    default:
      return ReadinessTarget.gstr1;
  }
}

extension on Iterable<GstSignal> {
  GstSignal? get firstOrNull => isEmpty ? null : first;
}

class GstReturn {
  final String id;
  final String gstin;
  final String returnType; // 'gstr1' | 'gstr3b'
  final String period;     // MMYYYY
  final String status;     // draft | validated | uploaded | filed | error
  final String? arn;
  final DateTime? filedAt;
  final List<GstReturnError> errors;
  final DateTime createdAt;
  final DateTime updatedAt;

  GstReturn({
    required this.id,
    required this.gstin,
    required this.returnType,
    required this.period,
    required this.status,
    required this.arn,
    required this.filedAt,
    required this.errors,
    required this.createdAt,
    required this.updatedAt,
  });

  factory GstReturn.fromJson(Map<String, dynamic> j) {
    final errs = (j['errorDetails'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(GstReturnError.fromJson)
        .toList();
    return GstReturn(
      id: _strOr(j['id'], ''),
      gstin: _strOr(j['gstin'], ''),
      returnType: _strOr(j['returnType'], 'gstr1'),
      period: _strOr(j['period'], ''),
      status: _strOr(j['status'], 'draft'),
      arn: _str(j['arn']),
      filedAt: _dt(j['filedAt']),
      errors: errs,
      createdAt: _dt(j['createdAt']) ?? DateTime.now(),
      updatedAt: _dt(j['updatedAt']) ?? DateTime.now(),
    );
  }

  String get periodLabel {
    if (period.length != 6) return period;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final m = int.tryParse(period.substring(0, 2));
    final y = period.substring(2);
    if (m == null || m < 1 || m > 12) return period;
    return '${months[m - 1]} $y';
  }

  Map<String, dynamic>? get rawData => null; // populated from detail endpoint via fromJsonWithData
}

class GstReturnError {
  final String code;
  final String message;
  final String? section;
  GstReturnError({required this.code, required this.message, this.section});

  factory GstReturnError.fromJson(Map<String, dynamic> j) => GstReturnError(
        code: _strOr(j['code'], ''),
        message: _strOr(j['message'], ''),
        section: _str(j['section']),
      );
}

class GstReturnDetail {
  final GstReturn ret;
  final Map<String, dynamic> data; // raw section payload (b2b, b2cs, hsn, etc.)
  GstReturnDetail({required this.ret, required this.data});

  factory GstReturnDetail.fromJson(Map<String, dynamic> j) => GstReturnDetail(
        ret: GstReturn.fromJson(j),
        data: (j['data'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
}

class GspOtpRequest {
  final String txn;
  final String? message;
  GspOtpRequest({required this.txn, this.message});

  factory GspOtpRequest.fromJson(Map<String, dynamic> j) => GspOtpRequest(
        txn: _strOr(j['txn'], ''),
        message: _str(j['message']),
      );
}

class Gstr2bMatch {
  final String id;
  final String period;
  final String supplierGstin;
  final String? supplierName;
  final String invoiceNumber2b;
  final double taxableValue2b;
  final double igst2b;
  final double cgst2b;
  final double sgst2b;
  final String? purchaseInvoiceId;
  final String? invoiceNumberBooks;
  final double? taxableValueBooks;
  final String matchStatus; // matched | mismatched | not_in_books | not_in_2b
  final double? valueDiff;

  Gstr2bMatch({
    required this.id,
    required this.period,
    required this.supplierGstin,
    required this.supplierName,
    required this.invoiceNumber2b,
    required this.taxableValue2b,
    required this.igst2b,
    required this.cgst2b,
    required this.sgst2b,
    required this.purchaseInvoiceId,
    required this.invoiceNumberBooks,
    required this.taxableValueBooks,
    required this.matchStatus,
    required this.valueDiff,
  });

  factory Gstr2bMatch.fromJson(Map<String, dynamic> j) => Gstr2bMatch(
        id: _strOr(j['id'], ''),
        period: _strOr(j['period'], ''),
        supplierGstin: _strOr(j['supplierGstin'], ''),
        supplierName: _str(j['supplierName']),
        invoiceNumber2b: _strOr(j['invoiceNumber2b'], ''),
        taxableValue2b: _num(j['taxableValue2b']),
        igst2b: _num(j['igst2b']),
        cgst2b: _num(j['cgst2b']),
        sgst2b: _num(j['sgst2b']),
        purchaseInvoiceId: _str(j['purchaseInvoiceId']),
        invoiceNumberBooks: _str(j['invoiceNumberBooks']),
        taxableValueBooks: _numOrNull(j['taxableValueBooks']),
        matchStatus: _strOr(j['matchStatus'], 'mismatched'),
        valueDiff: _numOrNull(j['valueDiff']),
      );
}

class Gstr2bSummary {
  final int matchedCount;
  final double matchedTaxable;
  final int mismatchedCount;
  final double mismatchedTaxable;
  final int notInBooksCount;
  final double notInBooksTaxable;
  final int notIn2bCount;
  final double notIn2bTaxable;
  final double totalItcAvailable;
  final double totalItcClaimable;

  Gstr2bSummary({
    required this.matchedCount,
    required this.matchedTaxable,
    required this.mismatchedCount,
    required this.mismatchedTaxable,
    required this.notInBooksCount,
    required this.notInBooksTaxable,
    required this.notIn2bCount,
    required this.notIn2bTaxable,
    required this.totalItcAvailable,
    required this.totalItcClaimable,
  });

  factory Gstr2bSummary.fromJson(Map<String, dynamic> j) {
    final m = (j['matched'] as Map?)?.cast<String, dynamic>() ?? const {};
    final mm = (j['mismatched'] as Map?)?.cast<String, dynamic>() ?? const {};
    final nib = (j['notInBooks'] as Map?)?.cast<String, dynamic>() ?? const {};
    final ni2b = (j['notIn2b'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Gstr2bSummary(
      matchedCount: _int(m['count']),
      matchedTaxable: _num(m['taxableValue']),
      mismatchedCount: _int(mm['count']),
      mismatchedTaxable: _num(mm['taxableValue']),
      notInBooksCount: _int(nib['count']),
      notInBooksTaxable: _num(nib['taxableValue']),
      notIn2bCount: _int(ni2b['count']),
      notIn2bTaxable: _num(ni2b['taxableValue']),
      totalItcAvailable: _num(j['totalItcAvailable']),
      totalItcClaimable: _num(j['totalItcClaimable']),
    );
  }

  int get totalCount =>
      matchedCount + mismatchedCount + notInBooksCount + notIn2bCount;
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
  final String? customerEmail;
  final String? customerPhone;
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
    this.customerEmail,
    this.customerPhone,
  });

  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: _strOr(j['id'], ''),
        invoiceNumber: _strOr(j['invoiceNumber'], ''),
        customerId: _strOr(j['customerId'], ''),
        status: _strOr(j['status'], 'draft'),
        customerName: _strOr(j['customerName'] ?? j['customerNickname'], '—'),
        customerEmail: _str(j['customerEmail']),
        customerPhone: _str(j['customerPhone']),
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

/// Match web's `formatLineUom`: prefer the master `itemUnit` (human pack
/// size like "500ml"), then the line's saved `uom`, then a synthesized
/// pack-size from `itemPackSizeValue` + `itemPackSizeUqc`.
String? _pickUom(Map<String, dynamic> j) {
  final unit = j['itemUnit'];
  if (unit is String && unit.trim().isNotEmpty) return unit.trim();
  final lineUom = j['uom'];
  if (lineUom is String && lineUom.trim().isNotEmpty) return lineUom.trim();
  final pv = j['itemPackSizeValue'];
  final pq = j['itemPackSizeUqc'];
  final pqStr = pq is String && pq.trim().isNotEmpty ? pq.trim() : null;
  if (pqStr != null) {
    final num? pvn = pv is num ? pv : (pv is String ? num.tryParse(pv) : null);
    if (pvn != null && pvn != 1) return '$pvn$pqStr';
    return pqStr;
  }
  return null;
}

class InvoiceItem {
  final String description, itemName;
  final String? uom;
  final double quantity, unitPrice, amount;
  /// GST rate applied to this line (percent, e.g. 5.0). Null when this line
  /// is GST-exempt or the master had no rate set when invoiced.
  final double? taxRate;
  /// Total tax for this line: cgst + sgst + igst + cess.
  final double taxAmount;
  InvoiceItem({
    required this.description,
    required this.itemName,
    required this.uom,
    required this.quantity,
    required this.unitPrice,
    required this.amount,
    required this.taxRate,
    required this.taxAmount,
  });

  factory InvoiceItem.fromJson(Map<String, dynamic> j) => InvoiceItem(
        description: _strOr(j['description'], ''),
        itemName: _strOr(j['itemName'] ?? j['description'], ''),
        uom: _pickUom(j),
        quantity: _num(j['quantity']),
        unitPrice: _num(j['unitPrice']),
        amount: _num(j['amount']),
        taxRate: _numOrNull(j['taxRate']),
        taxAmount: _num(j['cgstAmount']) +
            _num(j['sgstAmount']) +
            _num(j['igstAmount']) +
            _num(j['cessAmount']),
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
    super.customerEmail,
    super.customerPhone,
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
      customerEmail: base.customerEmail,
      customerPhone: base.customerPhone,
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

class UpiLinkData {
  /// `upi://pay?...` deep link — open in any UPI app, or copy/paste/share.
  final String deepLink;
  /// String to encode into a QR for offline scanning (same payload).
  final String qrData;
  UpiLinkData({required this.deepLink, required this.qrData});

  factory UpiLinkData.fromJson(Map<String, dynamic> j) => UpiLinkData(
        deepLink: _strOr(j['deepLink'], ''),
        qrData: _strOr(j['qrData'], ''),
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
  final String? hsnSacCode;
  final double quantity, unitPrice, amount;
  final double? taxRate;
  BillItem({
    required this.description,
    required this.itemName,
    this.hsnSacCode,
    required this.quantity,
    required this.unitPrice,
    required this.amount,
    this.taxRate,
  });

  factory BillItem.fromJson(Map<String, dynamic> j) => BillItem(
        description: _strOr(j['itemName'] ?? j['description'], ''),
        itemName: _strOr(j['itemName'] ?? j['description'], ''),
        hsnSacCode: _str(j['hsnSacCode']),
        quantity: _num(j['quantity']),
        unitPrice: _num(j['unitPrice']),
        amount: _num(j['amount']),
        taxRate: j['taxRate'] == null ? null : _num(j['taxRate']),
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
  final String? vendorGstin, vendorPan, vendorPhone, vendorEmail;
  final String? vendorAddress, vendorCity, vendorState, vendorPincode;
  final String? vendorBankAccount, vendorBankIfsc, vendorBankName;
  final String? invoiceNumber, tdsSection;
  final DateTime? invoiceDate, dueDate;
  final double subtotal, taxAmount, totalAmount;
  final double confidence;
  final List<ExtractedBillItem> items;
  final ExtractedVendorMatch? vendorMatch;
  /// Set when the server staged the uploaded file in S3. Pass back on
  /// commit so the file is bound to the new bill as an attachment.
  final String? extractionId;

  ExtractedBill({
    required this.vendorName,
    this.vendorGstin,
    this.vendorPan,
    this.vendorPhone,
    this.vendorEmail,
    this.vendorAddress,
    this.vendorCity,
    this.vendorState,
    this.vendorPincode,
    this.vendorBankAccount,
    this.vendorBankIfsc,
    this.vendorBankName,
    this.invoiceNumber,
    this.invoiceDate,
    this.dueDate,
    this.tdsSection,
    required this.subtotal,
    required this.taxAmount,
    required this.totalAmount,
    required this.confidence,
    required this.items,
    this.vendorMatch,
    this.extractionId,
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
      vendorPan: _str(extracted['vendorPan']),
      vendorPhone: _str(extracted['vendorPhone']),
      vendorEmail: _str(extracted['vendorEmail']),
      vendorAddress: _str(extracted['vendorAddress']),
      vendorCity: _str(extracted['vendorCity']),
      vendorState: _str(extracted['vendorState']),
      vendorPincode: _str(extracted['vendorPincode']),
      vendorBankAccount: _str(extracted['vendorBankAccount']),
      vendorBankIfsc: _str(extracted['vendorBankIfsc']),
      vendorBankName: _str(extracted['vendorBankName']),
      invoiceNumber: _str(extracted['invoiceNumber']),
      tdsSection: _str(extracted['tdsSection']),
      invoiceDate: _dt(extracted['invoiceDate']),
      dueDate: _dt(extracted['dueDate']),
      subtotal: _num(extracted['subtotal']),
      taxAmount: _num(extracted['taxAmount']),
      totalAmount: _num(extracted['totalAmount']),
      confidence: _num(j['confidence'] ?? extracted['confidence']),
      items: items,
      vendorMatch: vmRaw is Map ? ExtractedVendorMatch.fromJson(vmRaw.cast<String, dynamic>()) : null,
      extractionId: _str(j['extractionId']),
    );
  }
}

class ExtractedBillItem {
  final String itemName;
  final String? hsnSacCode, taxCategory;
  final double quantity, unitPrice, amount;
  final double? taxRate;
  ExtractedBillItem({
    required this.itemName,
    this.hsnSacCode,
    required this.quantity,
    required this.unitPrice,
    required this.amount,
    this.taxRate,
    this.taxCategory,
  });

  factory ExtractedBillItem.fromJson(Map<String, dynamic> j) => ExtractedBillItem(
        itemName: _strOr(j['itemName'], ''),
        hsnSacCode: _str(j['hsnSacCode']),
        quantity: _num(j['quantity']),
        unitPrice: _num(j['unitPrice']),
        amount: _num(j['amount']),
        taxRate: j['taxRate'] == null ? null : _num(j['taxRate']),
        taxCategory: _str(j['taxCategory']),
      );
}

class DuplicateMatch {
  final String id, invoiceNumber, invoiceDate, status, matchType;
  final double totalAmount;
  final double confidence;

  DuplicateMatch({
    required this.id,
    required this.invoiceNumber,
    required this.invoiceDate,
    required this.totalAmount,
    required this.status,
    required this.matchType,
    required this.confidence,
  });

  factory DuplicateMatch.fromJson(Map<String, dynamic> j) => DuplicateMatch(
        id: _strOr(j['id'], ''),
        invoiceNumber: _strOr(j['invoiceNumber'], ''),
        invoiceDate: _strOr(j['invoiceDate'], ''),
        totalAmount: _num(j['totalAmount']),
        status: _strOr(j['status'], ''),
        matchType: _strOr(j['matchType'], ''),
        confidence: _num(j['confidence']),
      );

  String get reasonLabel {
    switch (matchType) {
      case 'exact_invoice_number':
        return 'Same invoice number';
      case 'similar_amount_and_date':
        return 'Similar amount within ±3 days';
      case 'same_amount_recent':
        return 'Same amount within 30 days';
      default:
        return matchType;
    }
  }
}

class BillAttachment {
  final String id, fileName, mimeType;
  final int fileSize;
  final DateTime createdAt;

  BillAttachment({
    required this.id,
    required this.fileName,
    required this.mimeType,
    required this.fileSize,
    required this.createdAt,
  });

  factory BillAttachment.fromJson(Map<String, dynamic> j) => BillAttachment(
        id: _strOr(j['id'], ''),
        fileName: _strOr(j['fileName'], 'attachment'),
        mimeType: _strOr(j['mimeType'], 'application/octet-stream'),
        fileSize: (j['fileSize'] is int) ? j['fileSize'] as int : int.tryParse(j['fileSize']?.toString() ?? '') ?? 0,
        createdAt: DateTime.tryParse(j['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );

  String get prettySize {
    if (fileSize < 1024) return '$fileSize B';
    if (fileSize < 1024 * 1024) return '${(fileSize / 1024).toStringAsFixed(1)} KB';
    return '${(fileSize / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
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

// ─── PO Intake ────────────────────────────────────────────────────────────

class PoUpload {
  final String id;
  final String source;
  final String status;
  final String? fileName;
  final String? errorMessage;
  PoUpload({
    required this.id,
    required this.source,
    required this.status,
    this.fileName,
    this.errorMessage,
  });

  factory PoUpload.fromJson(Map<String, dynamic> j) => PoUpload(
        id: _strOr(j['id'], ''),
        source: _strOr(j['source'], 'share_sheet'),
        status: _strOr(j['status'] ?? j['uploadStatus'], 'pending'),
        fileName: _str(j['fileName']),
        errorMessage: _str(j['errorMessage']),
      );

  bool get isTerminal => status == 'parsed' || status == 'parse_error';
}

class PoDraftLine {
  final String id;
  final int lineIndex;
  final String rawDescription;
  final String? customerSku;
  final double rawQty;
  final String? rawUom;
  final String? resolvedUom;
  final double rawRate;
  final double resolvedRate;
  final double amount;
  final String? matchedItemId;
  final String? matchedItemName;
  final String? matchedItemUnit;
  /// GST rate from the matched item master (percent, e.g. 5.0). Null when the
  /// line isn't matched, or when the master has no rate set. 0 = exempt.
  final double? matchedItemGstRate;
  /// GST % captured by the parser for this line (PO column or back-computed
  /// from taxable/tax pair). Used to render subtotal + GST = total even when
  /// the line isn't matched to an item yet.
  final double? taxRatePct;
  /// Whether the PO's printed rate/amount on this line already includes GST.
  /// `true` for Type A POs, `false` for Type B, null when undetermined.
  final bool? priceIncludesTax;
  final String? reviewFlag;

  PoDraftLine({
    required this.id,
    required this.lineIndex,
    required this.rawDescription,
    required this.customerSku,
    required this.rawQty,
    required this.rawUom,
    required this.resolvedUom,
    required this.rawRate,
    required this.resolvedRate,
    required this.amount,
    required this.matchedItemId,
    required this.matchedItemName,
    required this.matchedItemUnit,
    required this.matchedItemGstRate,
    required this.taxRatePct,
    required this.priceIncludesTax,
    required this.reviewFlag,
  });

  /// Canonical product name to display: prefer the matched item master name
  /// (which strips any SKU codes the parser left embedded in the raw text)
  /// and fall back to the raw extracted description for unmatched lines.
  String get displayName =>
      (matchedItemName != null && matchedItemName!.isNotEmpty)
          ? matchedItemName!
          : rawDescription;

  /// UoM to display: prefer master unit (set when an item is matched), then
  /// the resolved unit persisted on the line, then whatever the parser saw.
  String? get displayUom => matchedItemUnit ?? resolvedUom ?? rawUom;

  /// Effective GST rate to use for this line: prefer the parser-captured
  /// `taxRatePct` (the rate printed on the PO itself), fall back to the
  /// matched item master's rate. Null when neither is known.
  double? get effectiveGstRate => taxRatePct ?? matchedItemGstRate;

  /// Per-unit landing price (inclusive of GST). Used for the line list so
  /// the user sees what the PO says the customer will pay per unit.
  double get landingRate {
    final r = effectiveGstRate ?? 0;
    return effectiveRate * (1 + r / 100);
  }

  /// Effective unit price. Picked in this order:
  ///   1. resolvedRate — price-list / master rate, the canonical source.
  ///   2. amount / rawQty — the PO's printed line total divided by the
  ///      quantity. This is the customer's expected landing cost. Beats
  ///      rawRate because PO templates often put MRP in the "rate" column
  ///      while the real net unit price has to be derived from the line
  ///      total (e.g. BB Daily: rate=48 MRP, amount=268.80, qty=7 ⇒ 38.40).
  ///   3. rawRate — the literal value from the PO's rate/MRP column. Last
  ///      resort because it's frequently MRP not landing.
  double get effectiveRate {
    if (resolvedRate > 0) return resolvedRate;
    if (amount > 0 && rawQty > 0) return amount / rawQty;
    return rawRate;
  }

  /// True when the line has enough info to be invoiced: an item match (or
  /// manual rate) and a positive rate × quantity.
  bool get isInvoiceable => matchedItemId != null && resolvedRate > 0 && rawQty > 0;

  factory PoDraftLine.fromJson(Map<String, dynamic> j) => PoDraftLine(
        id: _strOr(j['id'], ''),
        lineIndex: _int(j['lineIndex']),
        rawDescription: _strOr(j['rawDescription'], ''),
        customerSku: _str(j['customerSkuRaw']),
        rawQty: _num(j['rawQty']),
        rawUom: _str(j['rawUom']),
        resolvedUom: _str(j['resolvedUom']),
        rawRate: _num(j['rawRate']),
        resolvedRate: _num(j['resolvedRate'] ?? j['rawRate']),
        amount: _num(j['amount']),
        matchedItemId: _str(j['matchedItemId']),
        matchedItemName: _str(j['matchedItemName']),
        matchedItemUnit: _str(j['matchedItemUnit']),
        matchedItemGstRate: _numOrNull(j['matchedItemGstRate']),
        taxRatePct: _numOrNull(j['taxRatePct']),
        priceIncludesTax: j['priceIncludesTax'] == null
            ? null
            : (j['priceIncludesTax'] is bool
                ? j['priceIncludesTax'] as bool
                : _int(j['priceIncludesTax']) == 1),
        reviewFlag: _str(j['reviewFlag']),
      );
}

class QuickTemplateItem {
  final String itemId;
  final String description;
  final String? hsnSacCode;
  final double unitPrice;
  final double? taxRate;
  final String? taxCategory;
  final double defaultQuantity;
  QuickTemplateItem({
    required this.itemId,
    required this.description,
    required this.unitPrice,
    required this.defaultQuantity,
    this.hsnSacCode,
    this.taxRate,
    this.taxCategory,
  });

  factory QuickTemplateItem.fromJson(Map<String, dynamic> j) => QuickTemplateItem(
        itemId: _strOr(j['itemId'], ''),
        description: _strOr(j['description'], ''),
        hsnSacCode: _str(j['hsnSacCode']),
        unitPrice: _num(j['unitPrice']),
        taxRate: _numOrNull(j['taxRate']),
        taxCategory: _str(j['taxCategory']),
        defaultQuantity: _num(j['defaultQuantity']),
      );
}

class QuickInvoiceTemplate {
  final String id;
  final String customerId;
  final String? customerName;
  final String name;
  final int paymentTermsDays;
  final String? notes;
  final List<QuickTemplateItem> items;
  final bool isActive;
  QuickInvoiceTemplate({
    required this.id,
    required this.customerId,
    required this.name,
    required this.paymentTermsDays,
    required this.items,
    this.customerName,
    this.notes,
    this.isActive = true,
  });

  factory QuickInvoiceTemplate.fromJson(Map<String, dynamic> j) => QuickInvoiceTemplate(
        id: _strOr(j['id'], ''),
        customerId: _strOr(j['customerId'], ''),
        customerName: _str(j['customerName']),
        name: _strOr(j['name'], ''),
        paymentTermsDays: (j['paymentTermsDays'] is num)
            ? (j['paymentTermsDays'] as num).toInt()
            : 30,
        notes: _str(j['notes']),
        isActive: j['isActive'] is bool ? j['isActive'] as bool : true,
        items: (j['items'] is List)
            ? (j['items'] as List)
                .whereType<Map>()
                .map((m) => QuickTemplateItem.fromJson(m.cast<String, dynamic>()))
                .toList()
            : const [],
      );
}

class QuickInvoiceResult {
  final String invoiceId;
  final String invoiceNumber;
  final String? shareUrl;
  QuickInvoiceResult({required this.invoiceId, required this.invoiceNumber, this.shareUrl});

  factory QuickInvoiceResult.fromJson(Map<String, dynamic> j) => QuickInvoiceResult(
        invoiceId: _strOr(j['invoiceId'], ''),
        invoiceNumber: _strOr(j['invoiceNumber'], ''),
        shareUrl: _str(j['shareUrl']),
      );
}

/// Single line item on an expense claim.
class ExpenseItem {
  final String id;
  final DateTime expenseDate;
  final String category;
  final String description;
  final double amount;

  ExpenseItem({
    required this.id,
    required this.expenseDate,
    required this.category,
    required this.description,
    required this.amount,
  });

  factory ExpenseItem.fromJson(Map<String, dynamic> j) => ExpenseItem(
        id: _strOr(j['id'], ''),
        expenseDate: _dt(j['expenseDate']) ?? DateTime.now(),
        category: _strOr(j['category'], 'Other'),
        description: _strOr(j['description'], ''),
        amount: _num(j['amount']),
      );
}

/// One expense claim (a batch of out-of-pocket business expenses the user
/// will reimburse from the company account).
class ExpenseClaim {
  final String id;
  final String claimNumber;
  final String? claimantName;
  final DateTime claimDate;
  final String? description;
  final double totalAmount;
  /// Lifecycle: draft → submitted → approved | rejected → reimbursed.
  final String status;
  final DateTime? approvedAt;
  final DateTime? reimbursedAt;
  final String? rejectionReason;
  final List<ExpenseItem> items;

  ExpenseClaim({
    required this.id,
    required this.claimNumber,
    required this.claimDate,
    required this.totalAmount,
    required this.status,
    required this.items,
    this.claimantName,
    this.description,
    this.approvedAt,
    this.reimbursedAt,
    this.rejectionReason,
  });

  factory ExpenseClaim.fromJson(Map<String, dynamic> j) => ExpenseClaim(
        id: _strOr(j['id'], ''),
        claimNumber: _strOr(j['claimNumber'], ''),
        claimantName: _str(j['claimantName']),
        claimDate: _dt(j['claimDate']) ?? DateTime.now(),
        description: _str(j['description']),
        totalAmount: _num(j['totalAmount']),
        status: _strOr(j['status'], 'draft'),
        approvedAt: _dt(j['approvedAt']),
        reimbursedAt: _dt(j['reimbursedAt']),
        rejectionReason: _str(j['rejectionReason']),
        items: (j['items'] is List)
            ? (j['items'] as List)
                .whereType<Map>()
                .map((m) => ExpenseItem.fromJson(m.cast<String, dynamic>()))
                .toList()
            : const [],
      );
}

class CustomerSummary {
  final String id;
  final String name;
  final String? gstin;
  final int paymentTermsDays;
  final bool isActive;
  CustomerSummary({
    required this.id,
    required this.name,
    this.gstin,
    this.paymentTermsDays = 30,
    this.isActive = true,
  });

  factory CustomerSummary.fromJson(Map<String, dynamic> j) => CustomerSummary(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        gstin: _str(j['gstin']),
        paymentTermsDays: (j['paymentTermsDays'] is num)
            ? (j['paymentTermsDays'] as num).toInt()
            : 30,
        isActive: j['isActive'] is bool ? j['isActive'] as bool : true,
      );
}

/// Lightweight vendor row for the bills-screen vendor filter picker.
/// Mirrors [CustomerSummary] — only the fields the picker actually needs.
class VendorSummary {
  final String id;
  final String name;
  final String? gstin;
  final bool isActive;
  VendorSummary({
    required this.id,
    required this.name,
    this.gstin,
    this.isActive = true,
  });

  factory VendorSummary.fromJson(Map<String, dynamic> j) => VendorSummary(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        gstin: _str(j['gstin']),
        isActive: j['isActive'] is bool ? j['isActive'] as bool : true,
      );
}

class ItemSummary {
  final String id;
  final String name;
  final String sku;
  final String? unit;
  /// Master selling price (the "landing price"). Used to prefill the rate
  /// field in PO line mapping so the user immediately sees what'll be billed.
  final double? defaultSellingPrice;
  /// GST rate from the items master, percent (e.g. 5.0 for 5% GST). Null /
  /// 0 means GST-exempt — important for staples like milk.
  final double? gstRate;
  ItemSummary({
    required this.id,
    required this.name,
    required this.sku,
    this.unit,
    this.defaultSellingPrice,
    this.gstRate,
  });

  factory ItemSummary.fromJson(Map<String, dynamic> j) => ItemSummary(
        id: _strOr(j['id'], ''),
        name: _strOr(j['name'], ''),
        sku: _strOr(j['sku'], ''),
        unit: _str(j['unit']),
        defaultSellingPrice: _numOrNull(j['defaultSellingPrice']),
        gstRate: _numOrNull(j['gstRate']),
      );
}

/// One row in the PO Inbox list. Mirrors the API's `InboxRow` shape so the
/// mobile screen can render upload state, parsed header, and the linked
/// invoice (when approved) without an extra fetch per row.
class PoInboxRow {
  final String id;
  final String? draftId;
  final String source;
  final String uploadStatus;
  final String? reviewStatus;
  final String? fileName;
  final String? errorMessage;
  final String? customerId;
  final String? customerName;
  final String? buyerNameRaw;
  final String? poNumberExtracted;
  final DateTime? poDate;
  final double? grandTotal;
  final String? approvedInvoiceId;
  final String? approvedInvoiceNumber;
  final DateTime uploadedAt;
  final DateTime updatedAt;

  PoInboxRow({
    required this.id,
    required this.source,
    required this.uploadStatus,
    required this.uploadedAt,
    required this.updatedAt,
    this.draftId,
    this.reviewStatus,
    this.fileName,
    this.errorMessage,
    this.customerId,
    this.customerName,
    this.buyerNameRaw,
    this.poNumberExtracted,
    this.poDate,
    this.grandTotal,
    this.approvedInvoiceId,
    this.approvedInvoiceNumber,
  });

  /// Display title — prefer the matched customer name, fall back to the raw
  /// buyer name from the PO, then the file name, then a generic placeholder.
  String get displayTitle =>
      customerName ?? buyerNameRaw ?? fileName ?? 'PO upload';

  /// Coarse status used to drive the pill color + label.
  String get displayStatus {
    if (reviewStatus == 'approved') return 'invoiced';
    if (reviewStatus == 'rejected') return 'rejected';
    if (uploadStatus == 'parse_error' || reviewStatus == 'error') return 'error';
    if (uploadStatus == 'pending' || uploadStatus == 'parsing') return 'parsing';
    if (reviewStatus == 'ready') return 'ready';
    if (reviewStatus == 'needs_review') return 'needs review';
    return reviewStatus ?? uploadStatus;
  }

  factory PoInboxRow.fromJson(Map<String, dynamic> j) => PoInboxRow(
        id: _strOr(j['id'], ''),
        draftId: _str(j['draftId']),
        source: _strOr(j['source'], ''),
        uploadStatus: _strOr(j['uploadStatus'], 'pending'),
        reviewStatus: _str(j['reviewStatus']),
        fileName: _str(j['fileName']),
        errorMessage: _str(j['errorMessage']),
        customerId: _str(j['customerId']),
        customerName: _str(j['customerName']),
        buyerNameRaw: _str(j['buyerNameRaw']),
        poNumberExtracted: _str(j['poNumberExtracted']),
        poDate: _dt(j['poDate']),
        grandTotal: _numOrNull(j['grandTotal']),
        approvedInvoiceId: _str(j['approvedInvoiceId']),
        approvedInvoiceNumber: _str(j['approvedInvoiceNumber']),
        uploadedAt: _dt(j['uploadedAt']) ?? DateTime.now(),
        updatedAt: _dt(j['updatedAt']) ?? DateTime.now(),
      );
}

class PoDraftDetail {
  final String id;
  final String? draftId;
  final String uploadStatus;
  final String? reviewStatus;
  final String? errorMessage;
  final String? fileName;
  final String? customerId;
  final String? customerName;
  final String? buyerNameRaw;
  final String? buyerGstinRaw;
  final String? poNumberExtracted;
  final DateTime? poDate;
  final DateTime? deliveryDate;
  final double subtotal;
  final double taxTotal;
  final double grandTotal;
  final List<PoDraftLine> lines;
  final List<String> reviewFlags;
  final String? approvedInvoiceId;
  final String? approvedInvoiceNumber;
  final DateTime? approvedAt;

  PoDraftDetail({
    required this.id,
    required this.draftId,
    required this.uploadStatus,
    required this.reviewStatus,
    required this.errorMessage,
    required this.fileName,
    required this.customerId,
    required this.customerName,
    required this.buyerNameRaw,
    required this.buyerGstinRaw,
    required this.poNumberExtracted,
    required this.poDate,
    required this.deliveryDate,
    required this.subtotal,
    required this.taxTotal,
    required this.grandTotal,
    required this.lines,
    required this.reviewFlags,
    this.approvedInvoiceId,
    this.approvedInvoiceNumber,
    this.approvedAt,
  });

  bool get isApproved => reviewStatus == 'approved';

  bool get isParsing => uploadStatus == 'pending' || uploadStatus == 'parsing';
  bool get hasError => uploadStatus == 'parse_error' || reviewStatus == 'error';
  bool get isReady => reviewStatus == 'ready' || reviewStatus == 'needs_review';

  factory PoDraftDetail.fromJson(Map<String, dynamic> j) {
    final flagsRaw = j['reviewFlags'];
    final flags = <String>[];
    if (flagsRaw is List) {
      for (final f in flagsRaw) {
        if (f is Map && f['type'] is String) flags.add(f['type'] as String);
      }
    }
    final linesRaw = (j['lines'] as List?) ?? const [];
    return PoDraftDetail(
      id: _strOr(j['id'], ''),
      draftId: _str(j['draftId']),
      uploadStatus: _strOr(j['uploadStatus'], 'pending'),
      reviewStatus: _str(j['reviewStatus']),
      errorMessage: _str(j['errorMessage']),
      fileName: _str(j['fileName']),
      customerId: _str(j['customerId']),
      customerName: _str(j['customerName']),
      buyerNameRaw: _str(j['buyerNameRaw']),
      buyerGstinRaw: _str(j['buyerGstinRaw']),
      poNumberExtracted: _str(j['poNumberExtracted']),
      poDate: _dt(j['poDate']),
      deliveryDate: _dt(j['deliveryDate']),
      subtotal: _num(j['subtotal']),
      taxTotal: _num(j['taxTotal']),
      grandTotal: _num(j['grandTotal']),
      lines: linesRaw
          .whereType<Map<String, dynamic>>()
          .map(PoDraftLine.fromJson)
          .toList(),
      reviewFlags: flags,
      approvedInvoiceId: _str(j['approvedInvoiceId']),
      approvedInvoiceNumber: _str(j['approvedInvoiceNumber']),
      approvedAt: _dt(j['approvedAt']),
    );
  }
}

class PoApproveResult {
  final String invoiceId;
  final String invoiceNumber;
  PoApproveResult({required this.invoiceId, required this.invoiceNumber});

  factory PoApproveResult.fromJson(Map<String, dynamic> j) => PoApproveResult(
        invoiceId: _strOr(j['invoiceId'], ''),
        invoiceNumber: _strOr(j['invoiceNumber'], ''),
      );
}

/// One row inside an inbox group. Mirrors the web `InboxItem` shape so the
/// mobile screen can render exactly what the admin's `/inbox` shows.
class InboxItem {
  final String id;
  /// Server-supplied path (e.g. `/ar/invoices/<id>`). Mapped onto the
  /// mobile router via [mobileRoute].
  final String href;
  final String title;
  final String subtitle;
  final double? amount;
  final DateTime date;
  /// One of: draft | ready | needs_review | approved.
  final String status;

  InboxItem({
    required this.id,
    required this.href,
    required this.title,
    required this.subtitle,
    required this.date,
    required this.status,
    this.amount,
  });

  factory InboxItem.fromJson(Map<String, dynamic> j) => InboxItem(
        id: _strOr(j['id'], ''),
        href: _strOr(j['href'], ''),
        title: _strOr(j['title'], ''),
        subtitle: _strOr(j['subtitle'], ''),
        amount: _numOrNull(j['amount']),
        date: _dt(j['date']) ?? DateTime.now(),
        status: _strOr(j['status'], 'draft'),
      );
}

class InboxGroup {
  final String key;
  final String title;
  final String caption;
  final int count;
  final List<InboxItem> items;

  InboxGroup({
    required this.key,
    required this.title,
    required this.caption,
    required this.count,
    required this.items,
  });

  factory InboxGroup.fromJson(Map<String, dynamic> j) => InboxGroup(
        key: _strOr(j['key'], ''),
        title: _strOr(j['title'], ''),
        caption: _strOr(j['caption'], ''),
        count: (j['count'] is num) ? (j['count'] as num).toInt() : 0,
        items: (j['items'] is List)
            ? (j['items'] as List)
                .whereType<Map>()
                .map((m) => InboxItem.fromJson(m.cast<String, dynamic>()))
                .toList()
            : const [],
      );
}

class InboxPayload {
  final int totalCount;
  final List<InboxGroup> groups;
  InboxPayload({required this.totalCount, required this.groups});

  factory InboxPayload.fromJson(Map<String, dynamic> j) => InboxPayload(
        totalCount: (j['totalCount'] is num) ? (j['totalCount'] as num).toInt() : 0,
        groups: (j['groups'] is List)
            ? (j['groups'] as List)
                .whereType<Map>()
                .map((m) => InboxGroup.fromJson(m.cast<String, dynamic>()))
                .toList()
            : const [],
      );
}
