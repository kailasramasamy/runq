// PP Phase 1 mobile models — mirror server shapes from packages/types/src/purchase/po.ts.

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

int _int(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

class PurchaseOrder {
  final String id;
  final String poNumber;
  final String vendorId;
  final String vendorName;
  final String poDate;
  final String? expectedDate;
  final String? paymentTerms;
  final String? deliveryAddress;
  final String? notes;
  final String status;
  final double subtotal;
  final double taxTotal;
  final double total;
  final int lineCount;
  final String? sentAt;
  final String? closedAt;
  final String? closedReason;

  PurchaseOrder({
    required this.id,
    required this.poNumber,
    required this.vendorId,
    required this.vendorName,
    required this.poDate,
    required this.status,
    required this.subtotal,
    required this.taxTotal,
    required this.total,
    this.expectedDate,
    this.paymentTerms,
    this.deliveryAddress,
    this.notes,
    this.lineCount = 0,
    this.sentAt,
    this.closedAt,
    this.closedReason,
  });

  factory PurchaseOrder.fromJson(Map<String, dynamic> j) => PurchaseOrder(
        id: j['id'] as String,
        poNumber: j['poNumber'] as String,
        vendorId: j['vendorId'] as String,
        vendorName: (j['vendorName'] as String?) ?? '',
        poDate: j['poDate'] as String,
        expectedDate: j['expectedDate'] as String?,
        paymentTerms: j['paymentTerms'] as String?,
        deliveryAddress: j['deliveryAddress'] as String?,
        notes: j['notes'] as String?,
        status: j['status'] as String,
        subtotal: _num(j['subtotal']),
        taxTotal: _num(j['taxTotal']),
        total: _num(j['total']),
        lineCount: _int(j['lineCount']),
        sentAt: j['sentAt'] as String?,
        closedAt: j['closedAt'] as String?,
        closedReason: j['closedReason'] as String?,
      );
}

class PurchaseOrderLine {
  final String id;
  final String poId;
  final int lineNo;
  final String description;
  final String? catalogItemId;
  final String? uom;
  final String? hsnSacCode;
  final double qtyOrdered;
  final double unitRate;
  final double amount;
  final double? taxRate;
  final double? taxAmount;
  final double qtyReceived;
  final double qtyBilled;
  final String? notes;

  PurchaseOrderLine({
    required this.id,
    required this.poId,
    required this.lineNo,
    required this.description,
    required this.qtyOrdered,
    required this.unitRate,
    required this.amount,
    this.catalogItemId,
    this.uom,
    this.hsnSacCode,
    this.taxRate,
    this.taxAmount,
    this.qtyReceived = 0,
    this.qtyBilled = 0,
    this.notes,
  });

  factory PurchaseOrderLine.fromJson(Map<String, dynamic> j) => PurchaseOrderLine(
        id: j['id'] as String,
        poId: j['poId'] as String,
        lineNo: _int(j['lineNo']),
        description: j['description'] as String,
        catalogItemId: j['catalogItemId'] as String?,
        uom: j['uom'] as String?,
        hsnSacCode: j['hsnSacCode'] as String?,
        qtyOrdered: _num(j['qtyOrdered']),
        unitRate: _num(j['unitRate']),
        amount: _num(j['amount']),
        taxRate: j['taxRate'] == null ? null : _num(j['taxRate']),
        taxAmount: j['taxAmount'] == null ? null : _num(j['taxAmount']),
        qtyReceived: _num(j['qtyReceived']),
        qtyBilled: _num(j['qtyBilled']),
        notes: j['notes'] as String?,
      );
}

// ─── PP Phase 3 — 3-way match models ────────────────────────────────

class OpenPoSummary {
  final String id;
  final String poNumber;
  final String poDate;
  final double total;
  final double openValue;
  final String status;

  OpenPoSummary({
    required this.id,
    required this.poNumber,
    required this.poDate,
    required this.total,
    required this.openValue,
    required this.status,
  });

  factory OpenPoSummary.fromJson(Map<String, dynamic> j) => OpenPoSummary(
        id: j['id'] as String,
        poNumber: j['poNumber'] as String,
        poDate: j['poDate'] as String,
        total: _num(j['total']),
        openValue: _num(j['openValue']),
        status: j['status'] as String,
      );
}

class MatchAmountDelta {
  final double billTotal;
  final double poOpen;
  final double absDelta;
  final double pctDelta;

  MatchAmountDelta({
    required this.billTotal,
    required this.poOpen,
    required this.absDelta,
    required this.pctDelta,
  });

  factory MatchAmountDelta.fromJson(Map<String, dynamic> j) => MatchAmountDelta(
        billTotal: _num(j['billTotal']),
        poOpen: _num(j['poOpen']),
        absDelta: _num(j['absDelta']),
        pctDelta: _num(j['pctDelta']),
      );
}

class MatchPreview {
  final String billId;
  final String vendorId;
  final List<OpenPoSummary> openPos;
  final String? matchedPoId;
  final String matchStatus;     // 'unmatched' | 'matched' | 'mismatch'
  final double tolerancePct;
  final MatchAmountDelta? amountDelta;

  MatchPreview({
    required this.billId,
    required this.vendorId,
    required this.openPos,
    required this.matchStatus,
    required this.tolerancePct,
    this.matchedPoId,
    this.amountDelta,
  });

  factory MatchPreview.fromJson(Map<String, dynamic> j) => MatchPreview(
        billId: j['billId'] as String,
        vendorId: j['vendorId'] as String,
        openPos: (j['openPos'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(OpenPoSummary.fromJson)
            .toList(),
        matchedPoId: j['matchedPoId'] as String?,
        matchStatus: (j['matchStatus'] as String?) ?? 'unmatched',
        tolerancePct: _num(j['tolerancePct']),
        amountDelta: j['amountDelta'] == null
            ? null
            : MatchAmountDelta.fromJson((j['amountDelta'] as Map).cast<String, dynamic>()),
      );
}

// ─── Vendor catalog (consumed by PO line catalog picker) ───────────────

class VendorCatalogEntry {
  final String id;
  final String description;
  final String? defaultUom;
  final double? defaultRate;
  final String? hsnSacCode;
  final double? defaultTaxRate;
  final String? defaultTaxCategory;
  final String? inventoryItemId;
  final int useCount;

  VendorCatalogEntry({
    required this.id,
    required this.description,
    required this.useCount,
    this.defaultUom,
    this.defaultRate,
    this.hsnSacCode,
    this.defaultTaxRate,
    this.defaultTaxCategory,
    this.inventoryItemId,
  });

  factory VendorCatalogEntry.fromJson(Map<String, dynamic> j) => VendorCatalogEntry(
        id: j['id'] as String,
        description: j['description'] as String,
        defaultUom: j['defaultUom'] as String?,
        defaultRate: j['defaultRate'] == null ? null : _num(j['defaultRate']),
        hsnSacCode: j['hsnSacCode'] as String?,
        defaultTaxRate: j['defaultTaxRate'] == null ? null : _num(j['defaultTaxRate']),
        defaultTaxCategory: j['defaultTaxCategory'] as String?,
        inventoryItemId: j['inventoryItemId'] as String?,
        useCount: _int(j['useCount']),
      );
}

// ─── PP Phase 4 — Direct Receipt models ─────────────────────────────────

class DirectReceiptRow {
  final String id;
  final String grnNo;
  final String warehouseId;
  final String warehouseName;
  final String inventoryItemId;
  final String itemName;
  final String receivedAt;
  final double qty;
  final double unitRate;
  final double lineTotal;
  final String? sourceLabel;
  final String? batchNo;
  final String? expiryDate;
  final String status;

  DirectReceiptRow({
    required this.id,
    required this.grnNo,
    required this.warehouseId,
    required this.warehouseName,
    required this.inventoryItemId,
    required this.itemName,
    required this.receivedAt,
    required this.qty,
    required this.unitRate,
    required this.lineTotal,
    required this.status,
    this.sourceLabel,
    this.batchNo,
    this.expiryDate,
  });

  factory DirectReceiptRow.fromJson(Map<String, dynamic> j) => DirectReceiptRow(
        id: j['id'] as String,
        grnNo: j['grnNo'] as String,
        warehouseId: j['warehouseId'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        inventoryItemId: j['inventoryItemId'] as String,
        itemName: (j['itemName'] as String?) ?? '',
        receivedAt: j['receivedAt'] as String,
        qty: _num(j['qty']),
        unitRate: _num(j['unitRate']),
        lineTotal: _num(j['lineTotal']),
        sourceLabel: j['sourceLabel'] as String?,
        batchNo: j['batchNo'] as String?,
        expiryDate: j['expiryDate'] as String?,
        status: j['status'] as String,
      );
}

// ─── PP Phase 2 — Receive against PO models ─────────────────────────────

class ReceiveTemplateLine {
  final String poLineId;
  final int lineNo;
  final String description;
  final String? uom;
  final String? hsnSacCode;
  final double qtyOrdered;
  final double qtyReceivedSoFar;
  final double qtyOpen;
  final double unitRate;
  /// Catalog row backing this PO line; required to receive.
  final String? catalogItemId;
  /// Bridge into the items master; NULL → not inventory-tracked.
  final String? inventoryItemId;

  ReceiveTemplateLine({
    required this.poLineId,
    required this.lineNo,
    required this.description,
    required this.qtyOrdered,
    required this.qtyReceivedSoFar,
    required this.qtyOpen,
    required this.unitRate,
    this.uom,
    this.hsnSacCode,
    this.catalogItemId,
    this.inventoryItemId,
  });

  factory ReceiveTemplateLine.fromJson(Map<String, dynamic> j) => ReceiveTemplateLine(
        poLineId: j['poLineId'] as String,
        lineNo: _int(j['lineNo']),
        description: j['description'] as String,
        uom: j['uom'] as String?,
        hsnSacCode: j['hsnSacCode'] as String?,
        qtyOrdered: _num(j['qtyOrdered']),
        qtyReceivedSoFar: _num(j['qtyReceivedSoFar']),
        qtyOpen: _num(j['qtyOpen']),
        unitRate: _num(j['unitRate']),
        catalogItemId: j['catalogItemId'] as String?,
        inventoryItemId: j['inventoryItemId'] as String?,
      );
}

class ReceiveTemplate {
  final String poId;
  final String poNumber;
  final String vendorId;
  final String vendorName;
  final String? warehouseId;
  final List<ReceiveTemplateLine> lines;

  ReceiveTemplate({
    required this.poId,
    required this.poNumber,
    required this.vendorId,
    required this.vendorName,
    required this.lines,
    this.warehouseId,
  });

  factory ReceiveTemplate.fromJson(Map<String, dynamic> j) => ReceiveTemplate(
        poId: j['poId'] as String,
        poNumber: j['poNumber'] as String,
        vendorId: j['vendorId'] as String,
        vendorName: (j['vendorName'] as String?) ?? '',
        warehouseId: j['warehouseId'] as String?,
        lines: (j['lines'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ReceiveTemplateLine.fromJson)
            .toList(),
      );
}

class ReceiveResult {
  final String grnId;
  final String grnNo;
  final double totalValue;
  final int lineCount;
  final String newPoStatus;

  ReceiveResult({
    required this.grnId,
    required this.grnNo,
    required this.totalValue,
    required this.lineCount,
    required this.newPoStatus,
  });

  factory ReceiveResult.fromJson(Map<String, dynamic> j) => ReceiveResult(
        grnId: j['grnId'] as String,
        grnNo: j['grnNo'] as String,
        totalValue: _num(j['totalValue']),
        lineCount: _int(j['lineCount']),
        newPoStatus: j['newPoStatus'] as String,
      );
}

class PurchaseOrderWithLines extends PurchaseOrder {
  final List<PurchaseOrderLine> lines;
  PurchaseOrderWithLines({
    required super.id,
    required super.poNumber,
    required super.vendorId,
    required super.vendorName,
    required super.poDate,
    required super.status,
    required super.subtotal,
    required super.taxTotal,
    required super.total,
    required this.lines,
    super.expectedDate,
    super.paymentTerms,
    super.deliveryAddress,
    super.notes,
    super.sentAt,
    super.closedAt,
    super.closedReason,
  });

  factory PurchaseOrderWithLines.fromJson(Map<String, dynamic> j) {
    final base = PurchaseOrder.fromJson(j);
    final lines = (j['lines'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(PurchaseOrderLine.fromJson)
        .toList();
    return PurchaseOrderWithLines(
      id: base.id,
      poNumber: base.poNumber,
      vendorId: base.vendorId,
      vendorName: base.vendorName,
      poDate: base.poDate,
      status: base.status,
      subtotal: base.subtotal,
      taxTotal: base.taxTotal,
      total: base.total,
      expectedDate: base.expectedDate,
      paymentTerms: base.paymentTerms,
      deliveryAddress: base.deliveryAddress,
      notes: base.notes,
      sentAt: base.sentAt,
      closedAt: base.closedAt,
      closedReason: base.closedReason,
      lines: lines,
    );
  }
}

// ─── PP Phase 5 — Scan vendor invoice on PO receive ──────────────────────

class ScanExtractedItem {
  final String itemName;
  final String? hsnSacCode;
  final double quantity;
  final double unitPrice;
  final double amount;
  final double? taxRate;
  const ScanExtractedItem({
    required this.itemName, required this.quantity,
    required this.unitPrice, required this.amount,
    this.hsnSacCode, this.taxRate,
  });
  factory ScanExtractedItem.fromJson(Map<String, dynamic> j) => ScanExtractedItem(
        itemName: j['itemName'] as String,
        hsnSacCode: j['hsnSacCode'] as String?,
        quantity: (j['quantity'] as num).toDouble(),
        unitPrice: (j['unitPrice'] as num).toDouble(),
        amount: (j['amount'] as num).toDouble(),
        taxRate: (j['taxRate'] as num?)?.toDouble(),
      );
}

class ScanExtracted {
  final String vendorName;
  final String? vendorGstin;
  final String invoiceNumber;
  final String invoiceDate;
  final String? dueDate;
  final double subtotal;
  final double taxAmount;
  final double totalAmount;
  final double confidence;
  final List<ScanExtractedItem> items;
  const ScanExtracted({
    required this.vendorName, required this.invoiceNumber, required this.invoiceDate,
    required this.subtotal, required this.taxAmount, required this.totalAmount,
    required this.confidence, required this.items,
    this.vendorGstin, this.dueDate,
  });
  factory ScanExtracted.fromJson(Map<String, dynamic> j) => ScanExtracted(
        vendorName: j['vendorName'] as String,
        vendorGstin: j['vendorGstin'] as String?,
        invoiceNumber: j['invoiceNumber'] as String,
        invoiceDate: j['invoiceDate'] as String,
        dueDate: j['dueDate'] as String?,
        subtotal: (j['subtotal'] as num).toDouble(),
        taxAmount: (j['taxAmount'] as num).toDouble(),
        totalAmount: (j['totalAmount'] as num).toDouble(),
        confidence: (j['confidence'] as num? ?? 0).toDouble(),
        items: (j['items'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ScanExtractedItem.fromJson)
            .toList(),
      );
}

class ScanSuggestedLine {
  final String? poLineId;
  final String? catalogItemId;
  final String catalogDescription;
  final double vendorQty;
  final double vendorRate;
  final double? vendorTaxRate;
  final String? vendorHsnSacCode;
  final double? poQty;
  final double? poRate;
  final bool isOffPo;
  const ScanSuggestedLine({
    required this.catalogDescription, required this.vendorQty, required this.vendorRate,
    required this.isOffPo,
    this.poLineId, this.catalogItemId, this.vendorTaxRate, this.vendorHsnSacCode,
    this.poQty, this.poRate,
  });
  factory ScanSuggestedLine.fromJson(Map<String, dynamic> j) => ScanSuggestedLine(
        poLineId: j['poLineId'] as String?,
        catalogItemId: j['catalogItemId'] as String?,
        catalogDescription: j['catalogDescription'] as String,
        vendorQty: (j['vendorQty'] as num).toDouble(),
        vendorRate: (j['vendorRate'] as num).toDouble(),
        vendorTaxRate: (j['vendorTaxRate'] as num?)?.toDouble(),
        vendorHsnSacCode: j['vendorHsnSacCode'] as String?,
        poQty: (j['poQty'] as num?)?.toDouble(),
        poRate: (j['poRate'] as num?)?.toDouble(),
        isOffPo: j['isOffPo'] as bool? ?? false,
      );
}

class ScanPreviewResult {
  final String extractionId;
  final ScanExtracted extracted;
  final bool vendorMismatch;
  final List<ScanSuggestedLine> suggestedLines;
  const ScanPreviewResult({
    required this.extractionId, required this.extracted,
    required this.vendorMismatch, required this.suggestedLines,
  });
  factory ScanPreviewResult.fromJson(Map<String, dynamic> j) => ScanPreviewResult(
        extractionId: j['extractionId'] as String,
        extracted: ScanExtracted.fromJson((j['extracted'] as Map).cast<String, dynamic>()),
        vendorMismatch: j['vendorMismatch'] as bool? ?? false,
        suggestedLines: (j['suggestedLines'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ScanSuggestedLine.fromJson)
            .toList(),
      );
}

class ScanCommitResult {
  final String billId;
  final String billNumber;
  final String grnId;
  final String grnNo;
  final String newPoStatus;
  final int offPoLineCount;
  const ScanCommitResult({
    required this.billId, required this.billNumber,
    required this.grnId, required this.grnNo,
    required this.newPoStatus, required this.offPoLineCount,
  });
  factory ScanCommitResult.fromJson(Map<String, dynamic> j) => ScanCommitResult(
        billId: j['billId'] as String,
        billNumber: j['billNumber'] as String,
        grnId: j['grnId'] as String,
        grnNo: j['grnNo'] as String,
        newPoStatus: j['newPoStatus'] as String,
        offPoLineCount: j['offPoLineCount'] as int? ?? 0,
      );
}
