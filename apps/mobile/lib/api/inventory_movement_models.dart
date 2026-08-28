// Item stock audit trail — one ledger row plus the document that caused it.
// The API resolves (sourceType, sourceId) into a real document (GRN + vendor,
// DN + customer + sales invoice, WO + BOM), so the screen never has to know
// which table a movement came from.

library;

class InvMovementDocRef {
  final String kind;
  final String id;
  final String no;
  final String? label;
  const InvMovementDocRef({
    required this.kind,
    required this.id,
    required this.no,
    this.label,
  });

  factory InvMovementDocRef.fromJson(Map<String, dynamic> j) => InvMovementDocRef(
    kind: (j['kind'] as String?) ?? '',
    id: (j['id'] as String?) ?? '',
    no: (j['no'] as String?) ?? '',
    label: j['label'] as String?,
  );

  /// In-app route for this document, or null when there's no mobile screen
  /// for it (BOM, purchase order, milk consignment).
  String? get route {
    switch (kind) {
      case 'grn':
        return '/inventory/grn/$id';
      case 'delivery_note':
        return '/inventory/delivery/$id';
      case 'work_order':
        return '/manufacturing/wos/$id';
      default:
        return null;
    }
  }
}

class InvMovementDoc extends InvMovementDocRef {
  final String? date;
  final String? status;
  final String? party;
  final String? note;

  /// The item this movement went out *in place of*, when it was a
  /// substitution. Without it a stand-in reads as an ordinary sale of itself,
  /// and the trail can't be told apart from real demand for this SKU.
  final String? substitutedFor;
  final InvMovementDocRef? ref;

  const InvMovementDoc({
    required super.kind,
    required super.id,
    required super.no,
    super.label,
    this.date,
    this.status,
    this.party,
    this.note,
    this.substitutedFor,
    this.ref,
  });

  factory InvMovementDoc.fromJson(Map<String, dynamic> j) => InvMovementDoc(
    kind: (j['kind'] as String?) ?? '',
    id: (j['id'] as String?) ?? '',
    no: (j['no'] as String?) ?? '',
    label: j['label'] as String?,
    date: j['date'] as String?,
    status: j['status'] as String?,
    party: j['party'] as String?,
    note: j['note'] as String?,
    substitutedFor: j['substitutedFor'] as String?,
    ref: j['ref'] == null
        ? null
        : InvMovementDocRef.fromJson(j['ref'] as Map<String, dynamic>),
  );
}

class InvMovementRow {
  final String id;
  final DateTime movedAt;

  /// When the row was actually written. [movedAt] is the document's date for
  /// anything document-driven (a dispatch stamps midnight), so this is the
  /// only column that can put a clock time on a movement.
  final DateTime postedAt;
  final String movementType;
  final String direction;
  final String? batchNo;
  final String warehouseName;
  final double qtyIn;
  final double qtyOut;
  final double unitCost;
  final double value;
  final double runningQty;
  final String? postedByName;
  final InvMovementDoc? doc;

  const InvMovementRow({
    required this.id,
    required this.movedAt,
    required this.postedAt,
    required this.movementType,
    required this.direction,
    required this.batchNo,
    required this.warehouseName,
    required this.qtyIn,
    required this.qtyOut,
    required this.unitCost,
    required this.value,
    required this.runningQty,
    this.postedByName,
    this.doc,
  });

  bool get isIn => direction == 'in';
  double get qty => isIn ? qtyIn : qtyOut;

  factory InvMovementRow.fromJson(Map<String, dynamic> j) => InvMovementRow(
    id: (j['id'] as String?) ?? '',
    movedAt: DateTime.tryParse((j['movedAt'] as String?) ?? '')?.toLocal() ??
        DateTime.fromMillisecondsSinceEpoch(0),
    postedAt: DateTime.tryParse((j['postedAt'] as String?) ?? '')?.toLocal() ??
        DateTime.tryParse((j['movedAt'] as String?) ?? '')?.toLocal() ??
        DateTime.fromMillisecondsSinceEpoch(0),
    movementType: (j['movementType'] as String?) ?? '',
    direction: (j['direction'] as String?) ?? 'out',
    batchNo: j['batchNo'] as String?,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    qtyIn: (j['qtyIn'] as num?)?.toDouble() ?? 0,
    qtyOut: (j['qtyOut'] as num?)?.toDouble() ?? 0,
    unitCost: (j['unitCost'] as num?)?.toDouble() ?? 0,
    value: (j['value'] as num?)?.toDouble() ?? 0,
    runningQty: (j['runningQty'] as num?)?.toDouble() ?? 0,
    postedByName: j['postedByName'] as String?,
    doc: j['doc'] == null
        ? null
        : InvMovementDoc.fromJson(j['doc'] as Map<String, dynamic>),
  );
}

class InvMovementPage {
  final List<InvMovementRow> rows;
  final bool hasMore;
  const InvMovementPage({required this.rows, required this.hasMore});

  factory InvMovementPage.fromJson(Map<String, dynamic> j) => InvMovementPage(
    rows: ((j['rows'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvMovementRow.fromJson)
        .toList(),
    hasMore: (j['hasMore'] as bool?) ?? false,
  );
}

/// Filter carried by the provider family. Value equality keeps Riverpod from
/// refetching on every rebuild.
class InvMovementQuery {
  final String itemId;
  final String? warehouseId;
  final String? direction;

  /// Coarse movement bucket — receipt | dispatch | production | … Null means
  /// every kind of movement.
  final String? group;

  /// Exact ledger type inside [group] ('adjustment_out'). Cleared whenever
  /// the group changes, so the pair can't describe an empty intersection.
  final String? type;
  final String? from;
  final String? to;
  final int page;

  const InvMovementQuery({
    required this.itemId,
    this.warehouseId,
    this.direction,
    this.group,
    this.type,
    this.from,
    this.to,
    this.page = 1,
  });

  InvMovementQuery copyWith({
    Object? warehouseId = _unset,
    Object? direction = _unset,
    Object? group = _unset,
    Object? type = _unset,
    Object? from = _unset,
    Object? to = _unset,
    int? page,
  }) =>
      InvMovementQuery(
        itemId: itemId,
        warehouseId:
            warehouseId == _unset ? this.warehouseId : warehouseId as String?,
        direction: direction == _unset ? this.direction : direction as String?,
        group: group == _unset ? this.group : group as String?,
        type: type == _unset ? this.type : type as String?,
        from: from == _unset ? this.from : from as String?,
        to: to == _unset ? this.to : to as String?,
        page: page ?? this.page,
      );

  static const _unset = Object();

  @override
  bool operator ==(Object other) =>
      other is InvMovementQuery &&
      other.itemId == itemId &&
      other.warehouseId == warehouseId &&
      other.direction == direction &&
      other.group == group &&
      other.type == type &&
      other.from == from &&
      other.to == to &&
      other.page == page;

  /// True when anything beyond the window narrows the trail — drives the
  /// Clear pill.
  bool get hasNarrowing =>
      direction != null || group != null || type != null || warehouseId != null;

  @override
  int get hashCode =>
      Object.hash(itemId, warehouseId, direction, group, type, from, to, page);
}

const invMovementLabels = <String, String>{
  'grn': 'Receipt',
  'delivery': 'Dispatch',
  'transfer_in': 'Transfer in',
  'transfer_out': 'Transfer out',
  'adjustment_in': 'Adjustment +',
  'adjustment_out': 'Adjustment −',
  'opening': 'Opening',
  'reversal': 'Reversal',
  'stock_take_in': 'Count +',
  'stock_take_out': 'Count −',
  'production_in': 'Produced',
  'production_out': 'Consumed',
  'sales_return_in': 'Customer return',
  'reclaim_out': 'Reclaimed',
  'reclaim_in': 'Recovered',
};
