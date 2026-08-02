// Invoice → dispatch lane. An AR invoice is the second way stock leaves the
// warehouse (the first being a hand-keyed DN); both post the same delivery
// note, so these models only describe the queue and the confirm screen.

library;

/// A row in "Awaiting dispatch": an issued invoice whose goods haven't left.
class InvPendingDispatch {
  final String id;
  final String invoiceNumber;
  final String invoiceDate;
  final String customerName;
  final double totalAmount;
  final int lineCount;

  /// Lines resolving to a stock-tracked item. The rest (services, freight,
  /// unmapped ad-hoc lines) never move stock.
  final int stockableCount;
  final int dispatchedCount;

  /// A draft DN someone already started for this invoice.
  final String? openDraftDnId;

  const InvPendingDispatch({
    required this.id,
    required this.invoiceNumber,
    required this.invoiceDate,
    required this.customerName,
    required this.totalAmount,
    required this.lineCount,
    required this.stockableCount,
    required this.dispatchedCount,
    this.openDraftDnId,
  });

  int get unmappedCount => lineCount - stockableCount;

  factory InvPendingDispatch.fromJson(Map<String, dynamic> j) => InvPendingDispatch(
        id: j['id'] as String,
        invoiceNumber: (j['invoiceNumber'] as String?) ?? '',
        invoiceDate: (j['invoiceDate'] as String?) ?? '',
        customerName: (j['customerName'] as String?) ?? '',
        totalAmount: double.tryParse(j['totalAmount']?.toString() ?? '0') ?? 0,
        lineCount: (j['lineCount'] as num?)?.toInt() ?? 0,
        stockableCount: (j['stockableCount'] as num?)?.toInt() ?? 0,
        dispatchedCount: (j['dispatchedCount'] as num?)?.toInt() ?? 0,
        openDraftDnId: j['openDraftDnId'] as String?,
      );
}

/// How an invoice line found its stock item.
enum InvLineResolution { item, alias, unmapped, notStocked }

InvLineResolution _resolution(String? raw) => switch (raw) {
      'item' => InvLineResolution.item,
      'alias' => InvLineResolution.alias,
      'not_stocked' => InvLineResolution.notStocked,
      _ => InvLineResolution.unmapped,
    };

class InvDispatchPreviewLine {
  final String invoiceLineId;
  final String description;
  final double invoicedQty;
  final double dispatchedQty;
  final double remainingQty;
  final String? itemId;
  final String? itemName;
  final String? uom;
  final bool trackBatches;
  final InvLineResolution resolution;
  final String? suggestedBatchNo;
  final double availableQty;

  const InvDispatchPreviewLine({
    required this.invoiceLineId,
    required this.description,
    required this.invoicedQty,
    required this.dispatchedQty,
    required this.remainingQty,
    this.itemId,
    this.itemName,
    this.uom,
    required this.trackBatches,
    required this.resolution,
    this.suggestedBatchNo,
    required this.availableQty,
  });

  /// Only these lines can move stock, and only if something is still owed.
  bool get shippable =>
      (resolution == InvLineResolution.item || resolution == InvLineResolution.alias) &&
      remainingQty > 0;

  bool get short => shippable && remainingQty > availableQty;

  factory InvDispatchPreviewLine.fromJson(Map<String, dynamic> j) => InvDispatchPreviewLine(
        invoiceLineId: j['invoiceLineId'] as String,
        description: (j['description'] as String?) ?? '',
        invoicedQty: double.tryParse(j['invoicedQty']?.toString() ?? '0') ?? 0,
        dispatchedQty: double.tryParse(j['dispatchedQty']?.toString() ?? '0') ?? 0,
        remainingQty: double.tryParse(j['remainingQty']?.toString() ?? '0') ?? 0,
        itemId: j['itemId'] as String?,
        itemName: j['itemName'] as String?,
        uom: j['uom'] as String?,
        trackBatches: j['trackBatches'] as bool? ?? false,
        resolution: _resolution(j['resolution'] as String?),
        suggestedBatchNo: j['suggestedBatchNo'] as String?,
        availableQty: double.tryParse(j['availableQty']?.toString() ?? '0') ?? 0,
      );
}

class InvDispatchPreview {
  final String invoiceId;
  final String invoiceNumber;
  final String customerName;
  final List<InvDispatchPreviewLine> lines;

  const InvDispatchPreview({
    required this.invoiceId,
    required this.invoiceNumber,
    required this.customerName,
    required this.lines,
  });

  List<InvDispatchPreviewLine> get shippable =>
      lines.where((l) => l.shippable).toList();

  factory InvDispatchPreview.fromJson(Map<String, dynamic> j) {
    final inv = (j['invoice'] as Map<String, dynamic>?) ?? const {};
    return InvDispatchPreview(
      invoiceId: (inv['id'] as String?) ?? '',
      invoiceNumber: (inv['invoiceNumber'] as String?) ?? '',
      customerName: (inv['customerName'] as String?) ?? '',
      lines: ((j['lines'] as List<dynamic>?) ?? const [])
          .map((e) => InvDispatchPreviewLine.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// One confirmed line on its way to the server.
class InvDispatchLineInput {
  final String itemId;
  final String invoiceLineId;
  final double qty;
  final String? batchNo;
  final String? uom;

  const InvDispatchLineInput({
    required this.itemId,
    required this.invoiceLineId,
    required this.qty,
    this.batchNo,
    this.uom,
  });

  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        'invoiceLineId': invoiceLineId,
        'qty': qty,
        if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
        if (uom != null && uom!.isNotEmpty) 'uom': uom,
      };
}
