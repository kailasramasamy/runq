// One IST calendar day of plant activity, as served by
// GET /inventory/dashboard/day-summary — what came in, what was made, what
// went out, plus every input item's opening → closing for that day.

library;

double _num(dynamic v) => v == null ? 0 : (v as num).toDouble();

List<InvDayLine> _lines(dynamic v) => ((v as List?) ?? const [])
    .map((e) => InvDayLine.fromJson((e as Map).cast<String, dynamic>()))
    .toList();

class InvDayTotals {
  final double receivedValue;
  final int receivedDocs;
  final double producedValue;
  final int producedDocs;
  final double consumedValue;
  final double dispatchedValue;
  final int dispatchedDocs;
  final double returnedValue;
  final int otherDocs;

  const InvDayTotals({
    required this.receivedValue,
    required this.receivedDocs,
    required this.producedValue,
    required this.producedDocs,
    required this.consumedValue,
    required this.dispatchedValue,
    required this.dispatchedDocs,
    required this.returnedValue,
    required this.otherDocs,
  });

  factory InvDayTotals.fromJson(Map<String, dynamic> j) => InvDayTotals(
    receivedValue: _num(j['receivedValue']),
    receivedDocs: (j['receivedDocs'] as num?)?.toInt() ?? 0,
    producedValue: _num(j['producedValue']),
    producedDocs: (j['producedDocs'] as num?)?.toInt() ?? 0,
    consumedValue: _num(j['consumedValue']),
    dispatchedValue: _num(j['dispatchedValue']),
    dispatchedDocs: (j['dispatchedDocs'] as num?)?.toInt() ?? 0,
    returnedValue: _num(j['returnedValue']),
    otherDocs: (j['otherDocs'] as num?)?.toInt() ?? 0,
  );

  bool get isQuiet =>
      receivedDocs == 0 && producedDocs == 0 && dispatchedDocs == 0 && otherDocs == 0;
}

/// One input item's day: `opening + received − consumed + otherNet = closing`.
/// `otherNet` carries transfers, adjustments and stock takes so the row adds
/// up on screen — an owner checks that arithmetic.
class InvDayMaterial {
  final String itemId;
  final String itemName;
  final String? sku;
  final String? unit;
  final String itemClass;

  /// Did anything move this item on the day? False rows are pure old stock,
  /// listed because "what's still sitting there" is half the question.
  final bool moved;
  final double opening;
  final double received;
  final double receivedValue;
  final double consumed;
  final double consumedValue;
  final double otherNet;
  final double closing;

  const InvDayMaterial({
    required this.itemId,
    required this.itemName,
    required this.sku,
    required this.unit,
    required this.itemClass,
    required this.moved,
    required this.opening,
    required this.received,
    required this.receivedValue,
    required this.consumed,
    required this.consumedValue,
    required this.otherNet,
    required this.closing,
  });

  factory InvDayMaterial.fromJson(Map<String, dynamic> j) => InvDayMaterial(
    itemId: (j['itemId'] as String?) ?? '',
    itemName: (j['itemName'] as String?) ?? '',
    sku: j['sku'] as String?,
    unit: j['unit'] as String?,
    itemClass: (j['itemClass'] as String?) ?? '',
    moved: j['moved'] == true,
    opening: _num(j['opening']),
    received: _num(j['received']),
    receivedValue: _num(j['receivedValue']),
    consumed: _num(j['consumed']),
    consumedValue: _num(j['consumedValue']),
    otherNet: _num(j['otherNet']),
    closing: _num(j['closing']),
  );
}

/// One line inside a production run or an outward document — the material a
/// batch was made from, or a SKU that went out on a delivery note. `batchNo`
/// is the traceability hook: for a dairy it is the milk consignment.
class InvDayLine {
  final String itemName;
  final String? unit;
  final String? batchNo;

  /// IST date the batch first entered stock (YYYY-MM-DD) — how the floor
  /// tells one tanker from the next. Null on dispatch lines.
  final String? receivedOn;
  final double qty;
  final double value;

  const InvDayLine({
    required this.itemName,
    required this.unit,
    required this.batchNo,
    required this.receivedOn,
    required this.qty,
    required this.value,
  });

  factory InvDayLine.fromJson(Map<String, dynamic> j) => InvDayLine(
    itemName: (j['itemName'] as String?) ?? '',
    unit: j['unit'] as String?,
    batchNo: j['batchNo'] as String?,
    receivedOn: j['receivedOn'] as String?,
    qty: _num(j['qty']),
    value: _num(j['value']),
  );
}

class InvDayProduced {
  final String itemId;
  final String itemName;
  final String? sku;
  final String? unit;
  final String? batchNo;
  final double qty;
  final double value;
  final String? woNumber;
  final String? entryMode;
  final String? warehouseName;

  /// What the run consumed, merged across every work order behind this row.
  final List<InvDayLine> inputs;

  const InvDayProduced({
    required this.itemId,
    required this.itemName,
    required this.sku,
    required this.unit,
    required this.batchNo,
    required this.qty,
    required this.value,
    required this.woNumber,
    required this.entryMode,
    required this.warehouseName,
    required this.inputs,
  });

  factory InvDayProduced.fromJson(Map<String, dynamic> j) => InvDayProduced(
    itemId: (j['itemId'] as String?) ?? '',
    itemName: (j['itemName'] as String?) ?? '',
    sku: j['sku'] as String?,
    unit: j['unit'] as String?,
    batchNo: j['batchNo'] as String?,
    qty: _num(j['qty']),
    value: _num(j['value']),
    woNumber: j['woNumber'] as String?,
    entryMode: j['entryMode'] as String?,
    warehouseName: j['warehouseName'] as String?,
    inputs: _lines(j['inputs']),
  );
}

/// One outward document. Delivery notes carry a customer and open in the app;
/// farmer sales and other `delivery` writers carry neither.
class InvDayDispatch {
  final String sourceType;
  final String sourceId;
  final String? docNo;
  final String? customerName;
  final int itemCount;
  final double qty;
  final double value;

  /// The SKUs on the document, so the row can open into what actually went.
  final List<InvDayLine> items;

  const InvDayDispatch({
    required this.sourceType,
    required this.sourceId,
    required this.docNo,
    required this.customerName,
    required this.itemCount,
    required this.qty,
    required this.value,
    required this.items,
  });

  factory InvDayDispatch.fromJson(Map<String, dynamic> j) => InvDayDispatch(
    sourceType: (j['sourceType'] as String?) ?? '',
    sourceId: (j['sourceId'] as String?) ?? '',
    docNo: j['docNo'] as String?,
    customerName: j['customerName'] as String?,
    itemCount: (j['itemCount'] as num?)?.toInt() ?? 0,
    qty: _num(j['qty']),
    value: _num(j['value']),
    items: _lines(j['items']),
  );

  String? get route =>
      sourceType == 'delivery_note' ? '/inventory/delivery/$sourceId' : null;

  String get title => docNo ?? _sourceLabel(sourceType);
}

String _sourceLabel(String sourceType) {
  switch (sourceType) {
    case 'delivery_note':
      return 'Delivery note';
    case 'mp_farmer_sale':
      return 'Sale to farmer';
    default:
      return sourceType.replaceAll('_', ' ');
  }
}

/// Everything the three headline buckets don't cover — transfers, adjustments,
/// stock takes, reclaims, returns — one row per movement type.
class InvDayOther {
  final String movementType;
  final int docs;
  final double inValue;
  final double outValue;

  const InvDayOther({
    required this.movementType,
    required this.docs,
    required this.inValue,
    required this.outValue,
  });

  factory InvDayOther.fromJson(Map<String, dynamic> j) => InvDayOther(
    movementType: (j['movementType'] as String?) ?? '',
    docs: (j['docs'] as num?)?.toInt() ?? 0,
    inValue: _num(j['inValue']),
    outValue: _num(j['outValue']),
  );

  String get label {
    switch (movementType) {
      case 'transfer_out':
        return 'Transferred out';
      case 'adjustment_in':
        return 'Adjustment in';
      case 'adjustment_out':
        return 'Adjustment out';
      case 'stock_take_in':
        return 'Stock take (gain)';
      case 'stock_take_out':
        return 'Stock take (loss)';
      case 'sales_return_in':
        return 'Sales return';
      case 'reclaim_in':
        return 'Reclaimed material';
      case 'reclaim_out':
        return 'Reclaimed from FG';
      case 'reversal':
        return 'Reversal';
      case 'opening':
        return 'Opening balance';
      default:
        return movementType.replaceAll('_', ' ');
    }
  }
}

class InvDaySummary {
  /// The IST day this snapshot is for, as YYYY-MM-DD.
  final String date;
  final bool isToday;
  final String? warehouseId;
  final InvDayTotals totals;
  final List<InvDayMaterial> materials;
  final List<InvDayProduced> produced;
  final List<InvDayDispatch> dispatched;
  final List<InvDayOther> other;

  const InvDaySummary({
    required this.date,
    required this.isToday,
    required this.warehouseId,
    required this.totals,
    required this.materials,
    required this.produced,
    required this.dispatched,
    required this.other,
  });

  factory InvDaySummary.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) f) =>
        ((j[key] as List?) ?? const [])
            .map((e) => f((e as Map).cast<String, dynamic>()))
            .toList();
    return InvDaySummary(
      date: (j['date'] as String?) ?? '',
      isToday: j['isToday'] == true,
      warehouseId: j['warehouseId'] as String?,
      totals: InvDayTotals.fromJson(
        ((j['totals'] as Map?) ?? const {}).cast<String, dynamic>(),
      ),
      materials: list('materials', InvDayMaterial.fromJson),
      produced: list('produced', InvDayProduced.fromJson),
      dispatched: list('dispatched', InvDayDispatch.fromJson),
      other: list('other', InvDayOther.fromJson),
    );
  }
}
