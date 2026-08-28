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

  /// Lines whose remainder is parked on a shortfall draft. With auto-dispatch
  /// on, this is why most queued invoices are queued — the shelf ran out, not
  /// a person forgetting to press a button.
  final int shortLineCount;

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
    this.shortLineCount = 0,
    this.openDraftDnId,
  });

  int get unmappedCount => lineCount - stockableCount;

  /// True when nothing here is waiting on a person — only on stock.
  bool get blockedOnStock => shortLineCount > 0;

  factory InvPendingDispatch.fromJson(Map<String, dynamic> j) => InvPendingDispatch(
        id: j['id'] as String,
        invoiceNumber: (j['invoiceNumber'] as String?) ?? '',
        invoiceDate: (j['invoiceDate'] as String?) ?? '',
        customerName: (j['customerName'] as String?) ?? '',
        totalAmount: double.tryParse(j['totalAmount']?.toString() ?? '0') ?? 0,
        lineCount: (j['lineCount'] as num?)?.toInt() ?? 0,
        stockableCount: (j['stockableCount'] as num?)?.toInt() ?? 0,
        dispatchedCount: (j['dispatchedCount'] as num?)?.toInt() ?? 0,
        shortLineCount: (j['shortLineCount'] as num?)?.toInt() ?? 0,
        openDraftDnId: j['openDraftDnId'] as String?,
      );
}

/// What a bulk run did to one invoice. `skipped` is not a failure — an
/// invoice with no stocked lines, or one that already has a delivery note,
/// has nothing to ship and says so.
class InvDispatchOutcome {
  final String invoiceId;
  final String status; // dispatched | skipped | failed | off
  final String? reason;
  final String? dnNo;

  const InvDispatchOutcome({
    required this.invoiceId,
    required this.status,
    this.reason,
    this.dnNo,
  });

  bool get shipped => status == 'dispatched';
  bool get failed => status == 'failed';

  factory InvDispatchOutcome.fromJson(Map<String, dynamic> j) {
    final o = (j['outcome'] as Map?)?.cast<String, dynamic>() ?? const {};
    return InvDispatchOutcome(
      invoiceId: (j['invoiceId'] as String?) ?? '',
      status: (o['status'] as String?) ?? 'failed',
      reason: o['reason'] as String?,
      dnNo: o['dnNo'] as String?,
    );
  }
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

  /// Set when the SKU is branded only at dispatch: it holds no stock of its
  /// own, so `availableQty` is 0 by design and the pool behind it is what can
  /// actually ship. Null for ordinary items.
  final InvRepackSource? repackFrom;

  /// Declared stand-ins with stock on the shelf, each already scored by the
  /// server against what this line billed.
  final List<InvSubstituteOption> substitutes;

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
    this.repackFrom,
    this.substitutes = const [],
  });

  /// Only these lines can move stock, and only if something is still owed.
  bool get shippable =>
      (resolution == InvLineResolution.item || resolution == InvLineResolution.alias) &&
      remainingQty > 0;

  /// What this line can draw on, counting stock the dispatch would make.
  double get coverQty => availableQty + (repackFrom?.capacityQty ?? 0);

  /// A made-on-demand SKU sitting at zero isn't short — that is its normal
  /// state. What can actually run out is the pool behind it.
  bool get short => shippable && remainingQty > coverQty;

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
        repackFrom: j['repackFrom'] == null
            ? null
            : InvRepackSource.fromJson((j['repackFrom'] as Map).cast<String, dynamic>()),
        substitutes: ((j['substitutes'] as List<dynamic>?) ?? const [])
            .map((e) => InvSubstituteOption.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
      );
}

/// Whether a stand-in can go out against a line, and what saying yes costs.
///
/// Decided server-side because it turns on the invoice's tax treatment, not
/// on anything visible from the warehouse floor: a different HSN or GST rate
/// would make the bill misdescribe the goods and is refused outright, while a
/// different list price only moves margin and needs a reason on the record.
enum InvSubstituteVerdict { clear, needsNote, blocked }

class InvSubstituteOption {
  final String itemId;
  final String itemName;
  final String? itemSku;

  /// Pack size — one product name covers several SKUs, so the name alone
  /// doesn't say what is being offered.
  final String? uom;

  /// The stand-in's own list price — what relabelling the invoice to this
  /// item would charge instead of the billed rate.
  final double? sellingPrice;
  final double availableQty;
  final InvSubstituteVerdict verdict;

  /// Why it's refused, or what needs acknowledging. Null when clear.
  final String? message;

  const InvSubstituteOption({
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.uom,
    this.sellingPrice,
    required this.availableQty,
    required this.verdict,
    this.message,
  });

  bool get blocked => verdict == InvSubstituteVerdict.blocked;
  bool get needsNote => verdict == InvSubstituteVerdict.needsNote;

  factory InvSubstituteOption.fromJson(Map<String, dynamic> j) => InvSubstituteOption(
        itemId: j['itemId'] as String,
        itemName: (j['itemName'] as String?) ?? '',
        itemSku: j['itemSku'] as String?,
        uom: j['uom'] as String?,
        sellingPrice: double.tryParse(j['sellingPrice']?.toString() ?? ''),
        availableQty: double.tryParse(j['availableQty']?.toString() ?? '0') ?? 0,
        verdict: switch (j['verdict'] as String?) {
          'blocked' => InvSubstituteVerdict.blocked,
          'needs_note' => InvSubstituteVerdict.needsNote,
          _ => InvSubstituteVerdict.clear,
        },
        message: j['message'] as String?,
      );
}

/// The pool a made-on-demand SKU is drawn from, and how many packs the
/// limiting component could still produce.
class InvRepackSource {
  final String poolItemName;
  final double capacityQty;

  const InvRepackSource({required this.poolItemName, required this.capacityQty});

  factory InvRepackSource.fromJson(Map<String, dynamic> j) => InvRepackSource(
        poolItemName: (j['poolItemName'] as String?) ?? '',
        capacityQty: double.tryParse(j['capacityQty']?.toString() ?? '0') ?? 0,
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
  /// What physically leaves the warehouse — the stand-in when one was chosen,
  /// so the ledger draws and costs the goods that actually moved.
  final String itemId;
  final String invoiceLineId;
  final double qty;
  final String? batchNo;
  final String? uom;

  /// The item this line billed, set only when [itemId] is standing in for it.
  /// This is what clears the invoice line and keeps the swap on the document.
  final String? substitutedForItemId;
  final String? substitutionNote;

  const InvDispatchLineInput({
    required this.itemId,
    required this.invoiceLineId,
    required this.qty,
    this.batchNo,
    this.uom,
    this.substitutedForItemId,
    this.substitutionNote,
  });

  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        'invoiceLineId': invoiceLineId,
        'qty': qty,
        if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
        if (uom != null && uom!.isNotEmpty) 'uom': uom,
        if (substitutedForItemId != null) 'substitutedForItemId': substitutedForItemId,
        if (substitutionNote != null && substitutionNote!.isNotEmpty)
          'substitutionNote': substitutionNote,
      };
}

/// What auto-dispatch did when an invoice was issued.
///
/// Read straight off the send response, so the operator learns about a
/// shortage while still standing on the invoice screen — not later, from a
/// notification they may not be looking at.
class InvAutoDispatchResult {
  final String status; // dispatched | shortfall | skipped | failed | off
  final String? dnId;
  final String? dnNo;
  final String? reason;

  /// Lines the warehouse couldn't cover. Empty when it shipped in full.
  ///
  /// Carries the uom: one product name covers several pack sizes, so
  /// "Farm Fresh Cow Milk ×20" alone doesn't say which SKU ran out.
  final List<({String itemName, double qty, String? uom})> shortItems;

  const InvAutoDispatchResult({
    required this.status,
    this.dnId,
    this.dnNo,
    this.reason,
    this.shortItems = const [],
  });

  /// True when something was billed and not sent — the cue to offer a swap.
  bool get isShort => shortItems.isNotEmpty && dnId != null;

  static InvAutoDispatchResult? fromInvoiceJson(Map<String, dynamic> j) {
    final o = (j['autoDispatch'] as Map?)?.cast<String, dynamic>();
    if (o == null) return null;
    final sf = (o['shortfall'] as Map?)?.cast<String, dynamic>();
    final items = ((sf?['items'] as List?) ?? const [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .map((e) => (
              itemName: (e['itemName'] as String?) ?? '',
              qty: double.tryParse(e['qty']?.toString() ?? '0') ?? 0,
              uom: e['uom'] as String?,
            ))
        .toList();
    return InvAutoDispatchResult(
      status: (o['status'] as String?) ?? 'off',
      // A total shortfall reports its draft at the top level; a partial one
      // reports the shipped DN there and the parked draft under `shortfall`.
      dnId: (sf?['dnId'] as String?) ?? o['dnId'] as String?,
      dnNo: (sf?['dnNo'] as String?) ?? o['dnNo'] as String?,
      reason: (sf?['reason'] as String?) ?? o['reason'] as String?,
      shortItems: items,
    );
  }
}

/// One line an invoice billed that the warehouse never covered.
class InvShortageLine {
  final String dnId;
  final String dnNo;
  final int ageDays;
  final String? invoiceNumber;
  final String? customerName;
  final String warehouseName;
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? uom;
  final double shortQty;
  final double availableQty;

  /// Stock has since caught up — the parked draft can simply be posted.
  final bool coverable;
  final int substituteCount;

  const InvShortageLine({
    required this.dnId,
    required this.dnNo,
    required this.ageDays,
    this.invoiceNumber,
    this.customerName,
    required this.warehouseName,
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.uom,
    required this.shortQty,
    required this.availableQty,
    required this.coverable,
    required this.substituteCount,
  });

  factory InvShortageLine.fromJson(Map<String, dynamic> j) => InvShortageLine(
        dnId: j['dnId'] as String,
        dnNo: (j['dnNo'] as String?) ?? '',
        ageDays: (j['ageDays'] as num?)?.toInt() ?? 0,
        invoiceNumber: j['invoiceNumber'] as String?,
        customerName: j['customerName'] as String?,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        itemId: j['itemId'] as String,
        itemName: (j['itemName'] as String?) ?? '',
        itemSku: j['itemSku'] as String?,
        uom: j['uom'] as String?,
        shortQty: double.tryParse(j['shortQty']?.toString() ?? '0') ?? 0,
        availableQty: double.tryParse(j['availableQty']?.toString() ?? '0') ?? 0,
        coverable: j['coverable'] as bool? ?? false,
        substituteCount: (j['substituteCount'] as num?)?.toInt() ?? 0,
      );
}
