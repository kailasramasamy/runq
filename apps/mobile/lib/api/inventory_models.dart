// Mobile-side data classes for the Inventory module. Kept hand-rolled (no
// codegen) to stay consistent with hr_models.dart.

library;

class InvKpis {
  final double totalValue;
  final int activeRows;
  final int lowStockCount;
  final int outOfStockCount;
  /// Distinct documents that moved stock in / out today, IST. Counted off the
  /// stock ledger, so milk receipts and production output count alongside
  /// GRNs — a plant that never raises a GRN used to read a permanent zero.
  final int todayInCount, todayOutCount;

  /// Value moved in / out today, from the same ledger rows as the counts.
  final double todayInValue, todayOutValue;

  /// Transfers currently in_transit (between dispatch and receive).
  final int inTransitTransfers;

  /// Stock adjustments waiting on approval. Drives the Moves hub badge.
  final int pendingAdjustments;

  /// Distinct items holding stock, and how many warehouses are live.
  final int activeItems, warehouseCount;

  /// Batches expiring inside 30 days, and batches unmoved for 90+ days. Both
  /// drive the Needs-attention list on Home, which leads with the rupee value
  /// rather than the count — an owner triages write-off risk and locked-up
  /// cash by amount, not by how many batch rows are involved.
  final int expiringSoon, deadStock;
  final double expiringSoonValue, deadStockValue;

  /// Value received / issued so far this month — the movement trend behind the
  /// stock-value figure.
  final double monthInValue, monthOutValue;

  /// Value issued over the trailing 30 days. Trailing rather than
  /// month-to-date because [daysOfCover] divides by it.
  final double out30Value;

  /// Stock lost this month — spoilage, damage, expiry, pilferage, free issue.
  /// The only money on the dashboard that is gone rather than merely idle.
  /// Bound server-side to the write-off register's own reason enum, so this
  /// and /reports/write-offs can never disagree.
  final double writeOffMonthValue;

  /// Ordered-but-unreceived PO value (ex-tax), and how many of those POs are
  /// due inside 7 days. Days of cover says how long stock lasts; this says
  /// whether more is on the way.
  final double incomingValue;
  final int incomingDueSoon;
  const InvKpis({
    required this.totalValue,
    required this.activeRows,
    required this.lowStockCount,
    this.outOfStockCount = 0,
    this.todayInCount = 0,
    this.todayOutCount = 0,
    this.todayInValue = 0,
    this.todayOutValue = 0,
    this.inTransitTransfers = 0,
    this.pendingAdjustments = 0,
    this.activeItems = 0,
    this.warehouseCount = 0,
    this.expiringSoon = 0,
    this.deadStock = 0,
    this.monthInValue = 0,
    this.monthOutValue = 0,
    this.out30Value = 0,
    this.writeOffMonthValue = 0,
    this.incomingValue = 0,
    this.incomingDueSoon = 0,
    this.expiringSoonValue = 0,
    this.deadStockValue = 0,
  });
  factory InvKpis.fromJson(Map<String, dynamic> j) => InvKpis(
    totalValue: (j['totalValue'] as num?)?.toDouble() ?? 0,
    activeRows: (j['activeRows'] as num?)?.toInt() ?? 0,
    lowStockCount: (j['lowStockCount'] as num?)?.toInt() ?? 0,
    outOfStockCount: (j['outOfStockCount'] as num?)?.toInt() ?? 0,
    todayInCount: (j['todayInCount'] as num?)?.toInt() ?? 0,
    todayOutCount: (j['todayOutCount'] as num?)?.toInt() ?? 0,
    todayInValue: (j['todayInValue'] as num?)?.toDouble() ?? 0,
    todayOutValue: (j['todayOutValue'] as num?)?.toDouble() ?? 0,
    inTransitTransfers: (j['inTransitTransfers'] as num?)?.toInt() ?? 0,
    pendingAdjustments: (j['pendingAdjustments'] as num?)?.toInt() ?? 0,
    activeItems: (j['activeItems'] as num?)?.toInt() ?? 0,
    warehouseCount: (j['warehouseCount'] as num?)?.toInt() ?? 0,
    expiringSoon: (j['expiringSoonCount'] as num?)?.toInt() ?? 0,
    deadStock: (j['deadStockCount'] as num?)?.toInt() ?? 0,
    monthInValue: (j['monthInValue'] as num?)?.toDouble() ?? 0,
    monthOutValue: (j['monthOutValue'] as num?)?.toDouble() ?? 0,
    out30Value: (j['out30Value'] as num?)?.toDouble() ?? 0,
    writeOffMonthValue: (j['writeOffMonthValue'] as num?)?.toDouble() ?? 0,
    incomingValue: (j['incomingValue'] as num?)?.toDouble() ?? 0,
    incomingDueSoon: (j['incomingDueSoon'] as num?)?.toInt() ?? 0,
    expiringSoonValue: (j['expiringSoonValue'] as num?)?.toDouble() ?? 0,
    deadStockValue: (j['deadStockValue'] as num?)?.toDouble() ?? 0,
  );

  /// Net change in stock value so far this month. Positive means working
  /// capital is building up in the godown.
  double get monthNetValue => monthInValue - monthOutValue;

  /// Average value issued per day over the trailing 30 days — the baseline
  /// that turns "Today out ₹85K" from a reading into a signal.
  double get avgDailyOut => out30Value / 30;

  /// Share of this month's outward value that was written off rather than
  /// sold or consumed. Null when nothing has left — a percentage of zero is
  /// not 0%, it is undefined.
  double? get writeOffPctOfOut {
    if (monthOutValue <= 0) return null;
    return writeOffMonthValue / monthOutValue * 100;
  }

  /// How many days the current stock lasts at the trailing-30-day burn rate.
  /// Null when nothing has moved out — a runway is undefined, not infinite,
  /// and rendering "∞ days" on a dormant godown reads as a healthy number.
  double? get daysOfCover {
    if (out30Value <= 0 || totalValue <= 0) return null;
    return totalValue / (out30Value / 30);
  }
}

/// Stock value held at one warehouse. Backs the Home breakdown so the value in
/// the hero can be seen split across sites rather than as one opaque number.
class InvWarehouseValue {
  final String id, name, code;
  final double totalValue;
  final int itemCount;
  const InvWarehouseValue({
    required this.id,
    required this.name,
    required this.code,
    required this.totalValue,
    required this.itemCount,
  });
  factory InvWarehouseValue.fromJson(Map<String, dynamic> j) =>
      InvWarehouseValue(
        id: (j['id'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        code: (j['code'] ?? '') as String,
        totalValue: (j['totalValue'] as num?)?.toDouble() ?? 0,
        itemCount: (j['itemCount'] as num?)?.toInt() ?? 0,
      );
}

class InvWarehouse {
  final String id;
  final String code;
  final String name;
  final String type;
  final bool isDefault;
  final bool isActive;
  const InvWarehouse({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    required this.isDefault,
    required this.isActive,
  });
  factory InvWarehouse.fromJson(Map<String, dynamic> j) => InvWarehouse(
    id: j['id'] as String,
    code: j['code'] as String,
    name: j['name'] as String,
    type: (j['type'] as String?) ?? 'godown',
    isDefault: j['isDefault'] as bool? ?? false,
    isActive: j['isActive'] as bool? ?? true,
  );
}

class InvOnHandRow {
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;

  /// Axis-1 item_class (raw_material / packaging / finished_good /
  /// semi_finished / trading_good / consumable / spare_part). Null for
  /// service items, which never appear here. Drives the bucket-tabs UI.
  final String? itemClass;

  /// Axis-2 category tree. `categoryName` is the leaf the item is filed under,
  /// `categoryGroup` its parent — so a list can head sections with the group
  /// and sub-head with the leaf. Both null for uncategorised items, and equal
  /// when the item sits directly on a top-level category.
  final String? categoryName;
  final String? categoryGroup;
  final String warehouseId;
  final String warehouseName;
  final String batchNo;
  final double qty;
  final double avgCost;
  final double value;
  final double? reorderLevel;

  /// ISO timestamp of the latest stock ledger movement that touched this
  /// (item, warehouse, batch). Used by the redesigned stock-on-hand list to
  /// show a "Last moved 22 May" hint and to flag dead stock.
  final String? lastMovementAt;

  /// Earliest GRN expiry date for this (item, batch). Null when the batch
  /// isn't expiry-tracked or no GRN line carries a date.
  final String? expiryDate;

  /// When the batch first came into stock. `lastMovementAt` carries the business
  /// date (midnight for MP receipts), so this is the only field that tells batches
  /// received on the same day apart — and the only freshness signal raw milk has
  /// until expiry dates are wired.
  final String? receivedAt;
  const InvOnHandRow({
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    this.itemClass,
    this.categoryName,
    this.categoryGroup,
    required this.warehouseId,
    required this.warehouseName,
    required this.batchNo,
    required this.qty,
    required this.avgCost,
    required this.value,
    this.reorderLevel,
    this.lastMovementAt,
    this.expiryDate,
    this.receivedAt,
  });
  bool get isLow => reorderLevel != null && qty <= (reorderLevel ?? 0);
  factory InvOnHandRow.fromJson(Map<String, dynamic> j) => InvOnHandRow(
    itemId: j['itemId'] as String,
    itemName: j['itemName'] as String,
    itemSku: j['itemSku'] as String?,
    itemUnit: j['itemUnit'] as String?,
    itemClass: j['itemClass'] as String?,
    categoryName: j['categoryName'] as String?,
    categoryGroup: j['categoryGroup'] as String?,
    warehouseId: j['warehouseId'] as String,
    warehouseName: j['warehouseName'] as String,
    batchNo: (j['batchNo'] as String?) ?? '',
    qty: (j['qty'] as num?)?.toDouble() ?? 0,
    avgCost: (j['avgCost'] as num?)?.toDouble() ?? 0,
    value: (j['value'] as num?)?.toDouble() ?? 0,
    reorderLevel: (j['reorderLevel'] as num?)?.toDouble(),
    lastMovementAt: j['lastMovementAt'] as String?,
    expiryDate: j['expiryDate'] as String?,
    receivedAt: j['receivedAt'] as String?,
  );
}

class InvItem {
  final String id;
  final String name;
  final String? sku;
  final String? unit;
  final String? barcode;

  /// item_class enum value (raw_material / packaging / finished_good / …)
  /// — null for service items. Drives the picker tab-strip bucketing.
  final String? itemClass;
  final bool trackBatches;
  final bool trackExpiry;
  final bool trackSerials;

  /// Default purchase rate from the item master. Used to apply the rate on a
  /// direct receipt so floor workers don't enter it daily. Null if unset.
  final double? defaultPurchasePrice;

  /// Category tree leaf, flattened by the API into two display strings.
  /// Null on uncategorised items — pickers group those last.
  final String? category;
  final String? subcategory;
  const InvItem({
    required this.id,
    required this.name,
    this.sku,
    this.unit,
    this.barcode,
    this.itemClass,
    required this.trackBatches,
    required this.trackExpiry,
    required this.trackSerials,
    this.defaultPurchasePrice,
    this.category,
    this.subcategory,
  });
  factory InvItem.fromJson(Map<String, dynamic> j) => InvItem(
    id: j['id'] as String,
    name: j['name'] as String,
    sku: j['sku'] as String?,
    unit: j['unit'] as String?,
    barcode: j['barcode'] as String?,
    itemClass: j['itemClass'] as String?,
    trackBatches: j['trackBatches'] as bool? ?? false,
    trackExpiry: j['trackExpiry'] as bool? ?? false,
    trackSerials: j['trackSerials'] as bool? ?? false,
    defaultPurchasePrice: (j['defaultPurchasePrice'] as num?)?.toDouble(),
    category: j['category'] as String?,
    subcategory: j['subcategory'] as String?,
  );
}

class InvGrnLineInput {
  final String itemId;
  final String? batchNo;
  final String? expiryDate;
  final double qty;
  final double unitRate;

  /// For trackSerials items: serial numbers (length must equal qty). When
  /// non-empty, the API inserts each into inventory_serials on GRN post.
  final List<String>? serialNos;
  const InvGrnLineInput({
    required this.itemId,
    this.batchNo,
    this.expiryDate,
    required this.qty,
    required this.unitRate,
    this.serialNos,
  });
  Map<String, dynamic> toJson() => {
    'itemId': itemId,
    if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
    if (expiryDate != null && expiryDate!.isNotEmpty) 'expiryDate': expiryDate,
    'qty': qty,
    'unitRate': unitRate,
    if (serialNos != null && serialNos!.isNotEmpty) 'serialNos': serialNos,
  };
}

/// Single line returned by `POST /inventory/grn/extract`. `itemId` is null
/// when the AI's read of `rawName` didn't match any catalog row — the UI
/// then renders a "Map item" affordance and the user picks manually.
class InvGrnExtractedLine {
  final String? itemId;
  final String itemName;
  final String rawName;
  final String? itemSku;
  final String? itemUnit;
  final double qty;
  final double unitRate;

  /// 'sku' | 'name' | 'fuzzy' | null. Used by the UI to badge how
  /// confident the catalog match is (fuzzy gets a "verify" hint).
  final String? matchType;
  const InvGrnExtractedLine({
    required this.itemId,
    required this.itemName,
    required this.rawName,
    required this.itemSku,
    required this.itemUnit,
    required this.qty,
    required this.unitRate,
    required this.matchType,
  });
  factory InvGrnExtractedLine.fromJson(Map<String, dynamic> j) =>
      InvGrnExtractedLine(
        itemId: j['itemId'] as String?,
        itemName: j['itemName'] as String? ?? '',
        rawName: j['rawName'] as String? ?? '',
        itemSku: j['itemSku'] as String?,
        itemUnit: j['itemUnit'] as String?,
        qty: (j['qty'] as num?)?.toDouble() ?? 0,
        unitRate: (j['unitRate'] as num?)?.toDouble() ?? 0,
        matchType: j['matchType'] as String?,
      );
}

class InvGrnExtractResult {
  final String? vendorName;
  final String? invoiceNumber;
  final String? invoiceDate;
  final double totalAmount;
  final double confidence;
  final List<InvGrnExtractedLine> lines;
  const InvGrnExtractResult({
    required this.vendorName,
    required this.invoiceNumber,
    required this.invoiceDate,
    required this.totalAmount,
    required this.confidence,
    required this.lines,
  });
  factory InvGrnExtractResult.fromJson(Map<String, dynamic> j) =>
      InvGrnExtractResult(
        vendorName: j['vendorName'] as String?,
        invoiceNumber: j['invoiceNumber'] as String?,
        invoiceDate: j['invoiceDate'] as String?,
        totalAmount: (j['totalAmount'] as num?)?.toDouble() ?? 0,
        confidence: (j['confidence'] as num?)?.toDouble() ?? 0,
        lines: ((j['lines'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(InvGrnExtractedLine.fromJson)
            .toList(),
      );
}

class InvDnLineInput {
  final String itemId;
  final String? batchNo;
  final double qty;
  const InvDnLineInput({required this.itemId, this.batchNo, required this.qty});
  Map<String, dynamic> toJson() => {
    'itemId': itemId,
    if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
    'qty': qty,
  };
}

class InvGrn {
  final String id;
  final String grnNo;
  final String warehouseName;
  final String? vendorName;
  final String receivedDate;
  final String status;
  final double totalValue;

  /// Number of lines on this GRN. Drives the "Lines" cell on the redesigned
  /// mobile tile. Defaults to 0 for legacy responses that don't carry it.
  final int lineCount;

  /// Linked purchase-order number (when the GRN was created against a PO).
  /// Null when the GRN was created stand-alone.
  final String? poNumber;
  const InvGrn({
    required this.id,
    required this.grnNo,
    required this.warehouseName,
    this.vendorName,
    required this.receivedDate,
    required this.status,
    required this.totalValue,
    this.lineCount = 0,
    this.poNumber,
  });
  factory InvGrn.fromJson(Map<String, dynamic> j) => InvGrn(
    id: j['id'] as String,
    grnNo: j['grnNo'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    vendorName: j['vendorName'] as String?,
    receivedDate: j['receivedDate'] as String,
    status: (j['status'] as String?) ?? 'draft',
    totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
    lineCount: (j['lineCount'] as num?)?.toInt() ?? 0,
    poNumber: j['poNumber'] as String?,
  );
}

class InvTransfer {
  final String id;
  final String transferNo;
  final String fromWarehouseName;
  final String toWarehouseName;
  final String status;
  final double totalValue;
  final int lineCount;
  final String? transferDate;
  const InvTransfer({
    required this.id,
    required this.transferNo,
    required this.fromWarehouseName,
    required this.toWarehouseName,
    required this.status,
    required this.totalValue,
    this.lineCount = 0,
    this.transferDate,
  });
  factory InvTransfer.fromJson(Map<String, dynamic> j) => InvTransfer(
    id: j['id'] as String,
    transferNo: j['transferNo'] as String,
    fromWarehouseName: (j['fromWarehouseName'] as String?) ?? '',
    toWarehouseName: (j['toWarehouseName'] as String?) ?? '',
    status: (j['status'] as String?) ?? 'draft',
    totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
    lineCount: (j['lineCount'] as num?)?.toInt() ?? 0,
    // Transfer rows expose createdAt (no dedicated transferDate column).
    // Use it as the display date so the redesigned tile has a "23 May"
    // hint without a backend change.
    transferDate: (j['createdAt'] ?? j['transferDate']) as String?,
  );
}

class InvAdjustment {
  final String id;
  final String adjNo;
  final String warehouseName;
  final String reason;
  final String adjustmentDate;
  final String status;
  final double totalValueDelta;

  /// How many lines the adjustment carries, and the first few item names —
  /// summarised server-side so the list can preview what was adjusted without
  /// a fetch per row. `itemNames` is capped at three by the API.
  final int lineCount;
  final List<String> itemNames;
  const InvAdjustment({
    required this.id,
    required this.adjNo,
    required this.warehouseName,
    required this.reason,
    required this.adjustmentDate,
    required this.status,
    required this.totalValueDelta,
    this.lineCount = 0,
    this.itemNames = const [],
  });
  factory InvAdjustment.fromJson(Map<String, dynamic> j) => InvAdjustment(
    id: j['id'] as String,
    adjNo: j['adjNo'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    reason: (j['reason'] as String?) ?? 'damage',
    adjustmentDate: j['adjustmentDate'] as String,
    status: (j['status'] as String?) ?? 'draft',
    totalValueDelta:
        double.tryParse(j['totalValueDelta']?.toString() ?? '0') ?? 0,
    lineCount: (j['lineCount'] as num?)?.toInt() ?? 0,
    itemNames:
        (j['itemNames'] as List?)?.map((e) => e.toString()).toList() ??
        const [],
  );
}

/// One line returned by `GET /inventory/adjustments/:id`. Joins item
/// name/sku from masters so the detail sheet renders without an extra
/// fetch. `qtyDelta` is signed — negative for outbound reasons.
class InvAdjustmentDetailLine {
  final String id;
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? batchNo;
  final double qtyDelta;
  final bool trackBatches;
  final String? itemUnit;
  final String? itemClass;
  const InvAdjustmentDetailLine({
    required this.id,
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.batchNo,
    required this.qtyDelta,
    this.trackBatches = false,
    this.itemUnit,
    this.itemClass,
  });
  factory InvAdjustmentDetailLine.fromJson(Map<String, dynamic> j) =>
      InvAdjustmentDetailLine(
        id: j['id'] as String,
        itemId: j['itemId'] as String,
        itemName: (j['itemName'] as String?) ?? '',
        itemSku: j['itemSku'] as String?,
        batchNo: j['batchNo'] as String?,
        qtyDelta: double.tryParse(j['qtyDelta']?.toString() ?? '0') ?? 0,
        trackBatches: j['trackBatches'] as bool? ?? false,
        itemUnit: j['itemUnit'] as String?,
        itemClass: j['itemClass'] as String?,
      );
}

class InvAdjustmentDetail {
  final String id;
  final String adjNo;
  final String warehouseName;
  final String reason;
  final String adjustmentDate;
  final String status;
  final double totalValueDelta;
  final String? notes;
  final String? createdAt;
  final List<InvAdjustmentDetailLine> lines;
  const InvAdjustmentDetail({
    required this.id,
    required this.adjNo,
    required this.warehouseName,
    required this.reason,
    required this.adjustmentDate,
    required this.status,
    required this.totalValueDelta,
    this.notes,
    this.createdAt,
    required this.lines,
  });
  factory InvAdjustmentDetail.fromJson(Map<String, dynamic> j) =>
      InvAdjustmentDetail(
        id: j['id'] as String,
        adjNo: j['adjNo'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        reason: (j['reason'] as String?) ?? 'damage',
        adjustmentDate: (j['adjustmentDate'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'draft',
        totalValueDelta:
            double.tryParse(j['totalValueDelta']?.toString() ?? '0') ?? 0,
        notes: j['notes'] as String?,
        createdAt: j['createdAt'] as String?,
        lines: ((j['lines'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(InvAdjustmentDetailLine.fromJson)
            .toList(),
      );
}

class InvStockTake {
  final String id;
  final String stNo;
  final String warehouseName;
  final String scope;
  final String status;
  final String startedAt;

  /// Total lines snapshotted at session start. Drives the progress bar on
  /// the redesigned session tile (denominator). 0 when the backend hasn't
  /// finished snapshotting yet or the field isn't returned.
  final int totalLines;

  /// Lines with a recorded count so far. Numerator for the progress bar.
  final int countedLines;
  const InvStockTake({
    required this.id,
    required this.stNo,
    required this.warehouseName,
    required this.scope,
    required this.status,
    required this.startedAt,
    this.totalLines = 0,
    this.countedLines = 0,
  });
  factory InvStockTake.fromJson(Map<String, dynamic> j) => InvStockTake(
    id: j['id'] as String,
    stNo: j['stNo'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    scope: (j['scope'] as String?) ?? 'full',
    status: (j['status'] as String?) ?? 'in_progress',
    startedAt: (j['startedAt'] as String?) ?? '',
    totalLines: (j['totalLines'] as num?)?.toInt() ?? 0,
    countedLines: (j['countedLines'] as num?)?.toInt() ?? 0,
  );
}

/// One line returned by `GET /inventory/transfers/:id`. Joins item
/// name/sku from the masters table so the detail sheet can render each
/// row without an extra fetch.
class InvTransferDetailLine {
  final String id;
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? batchNo;
  final double qty;
  final bool trackBatches;
  final String? itemUnit;
  final String? itemClass;
  const InvTransferDetailLine({
    required this.id,
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.batchNo,
    required this.qty,
    this.trackBatches = false,
    this.itemUnit,
    this.itemClass,
  });
  factory InvTransferDetailLine.fromJson(Map<String, dynamic> j) =>
      InvTransferDetailLine(
        id: j['id'] as String,
        itemId: j['itemId'] as String,
        itemName: (j['itemName'] as String?) ?? '',
        itemSku: j['itemSku'] as String?,
        batchNo: j['batchNo'] as String?,
        qty: double.tryParse(j['qty']?.toString() ?? '0') ?? 0,
        trackBatches: j['trackBatches'] as bool? ?? false,
        itemUnit: j['itemUnit'] as String?,
        itemClass: j['itemClass'] as String?,
      );
}

class InvTransferDetail {
  final String id;
  final String transferNo;
  final String fromWarehouseName;
  final String toWarehouseName;
  final String status;
  final String? vehicleNo;
  final String? notes;
  final String? createdAt;
  final List<InvTransferDetailLine> lines;
  const InvTransferDetail({
    required this.id,
    required this.transferNo,
    required this.fromWarehouseName,
    required this.toWarehouseName,
    required this.status,
    this.vehicleNo,
    this.notes,
    this.createdAt,
    required this.lines,
  });
  factory InvTransferDetail.fromJson(Map<String, dynamic> j) =>
      InvTransferDetail(
        id: j['id'] as String,
        transferNo: j['transferNo'] as String,
        fromWarehouseName: (j['fromWarehouseName'] as String?) ?? '',
        toWarehouseName: (j['toWarehouseName'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'draft',
        vehicleNo: j['vehicleNo'] as String?,
        notes: j['notes'] as String?,
        createdAt: j['createdAt'] as String?,
        lines: ((j['lines'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(InvTransferDetailLine.fromJson)
            .toList(),
      );
}

class InvTransferLineInput {
  final String itemId;
  final String? batchNo;
  final double qty;
  const InvTransferLineInput({
    required this.itemId,
    this.batchNo,
    required this.qty,
  });
  Map<String, dynamic> toJson() => {
    'itemId': itemId,
    if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
    'qty': qty,
  };
}

class InvAdjustmentLineInput {
  final String itemId;
  final String? batchNo;

  /// Signed: positive = found, negative = damage/expiry/theft/write-off.
  final double qtyDelta;
  const InvAdjustmentLineInput({
    required this.itemId,
    this.batchNo,
    required this.qtyDelta,
  });
  Map<String, dynamic> toJson() => {
    'itemId': itemId,
    if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
    'qtyDelta': qtyDelta,
  };
}

class InvCountLineInput {
  final String itemId;
  final String? batchNo;
  final double countedQty;
  const InvCountLineInput({
    required this.itemId,
    this.batchNo,
    required this.countedQty,
  });
  Map<String, dynamic> toJson() => {
    'itemId': itemId,
    if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
    'countedQty': countedQty,
  };
}

class InvStockTakeLine {
  final String id;
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String? batchNo;
  final double systemQty;
  final double? countedQty;
  final double unitCost;
  final double? variance;
  const InvStockTakeLine({
    required this.id,
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    this.batchNo,
    required this.systemQty,
    this.countedQty,
    required this.unitCost,
    this.variance,
  });
  factory InvStockTakeLine.fromJson(Map<String, dynamic> j) => InvStockTakeLine(
    id: j['id'] as String,
    itemId: j['itemId'] as String,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    itemUnit: j['itemUnit'] as String?,
    batchNo: j['batchNo'] as String?,
    systemQty: double.tryParse(j['systemQty']?.toString() ?? '0') ?? 0,
    countedQty: j['countedQty'] == null
        ? null
        : double.tryParse(j['countedQty'].toString()),
    unitCost: double.tryParse(j['unitCost']?.toString() ?? '0') ?? 0,
    variance: j['variance'] == null ? null : (j['variance'] as num).toDouble(),
  );
}

class InvStockTakeDetail {
  final String id;
  final String stNo;
  final String warehouseId;
  final String warehouseName;
  final String status;
  final List<InvStockTakeLine> lines;
  const InvStockTakeDetail({
    required this.id,
    required this.stNo,
    required this.warehouseId,
    required this.warehouseName,
    required this.status,
    required this.lines,
  });
  factory InvStockTakeDetail.fromJson(Map<String, dynamic> j) =>
      InvStockTakeDetail(
        id: j['id'] as String,
        stNo: j['stNo'] as String,
        warehouseId: j['warehouseId'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'in_progress',
        lines: ((j['lines'] as List?) ?? const [])
            .map(
              (e) =>
                  InvStockTakeLine.fromJson((e as Map).cast<String, dynamic>()),
            )
            .toList(),
      );
}

class InvReorderAlert {
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String warehouseId;
  final String warehouseName;
  final double onHand;
  final double reorderLevel;
  final double reorderQty;
  final double shortBy;

  /// 'critical' | 'warning' | 'watch'. Server returns critical/warning;
  /// watch is reserved for UI-only states (items above reorder).
  final String urgency;

  /// Preferred supplier — derived server-side from the most recent posted
  /// GRN that brought this item into this warehouse. Null when the item
  /// has never been received here (e.g. via opening balance only).
  final String? supplierName;

  /// Lead time in days from the per-warehouse reorder rule. Null when no
  /// rule exists (we still surface the alert via item-level reorder_level
  /// but without a lead-time hint).
  final int? leadTimeDays;
  const InvReorderAlert({
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    required this.warehouseId,
    required this.warehouseName,
    required this.onHand,
    required this.reorderLevel,
    required this.reorderQty,
    required this.shortBy,
    this.urgency = 'warning',
    this.supplierName,
    this.leadTimeDays,
  });
  factory InvReorderAlert.fromJson(Map<String, dynamic> j) => InvReorderAlert(
    itemId: j['itemId'] as String,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    itemUnit: j['itemUnit'] as String?,
    warehouseId: j['warehouseId'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    onHand: (j['onHand'] as num?)?.toDouble() ?? 0,
    reorderLevel: (j['reorderLevel'] as num?)?.toDouble() ?? 0,
    reorderQty: (j['reorderQty'] as num?)?.toDouble() ?? 0,
    shortBy: (j['shortBy'] as num?)?.toDouble() ?? 0,
    urgency: (j['urgency'] as String?) ?? 'warning',
    supplierName: j['supplierName'] as String?,
    leadTimeDays: (j['leadTimeDays'] as num?)?.toInt(),
  );
}

/// One low / out-of-stock row from `/inventory/stock/alerts`.
///
/// Supersedes [InvReorderAlert]: an item with no reorder level configured
/// still appears here once it hits zero, which the reorder-only list could
/// never show. `reorderLevel` is therefore nullable.
class InvStockAlert {
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String warehouseId;
  final String warehouseName;

  /// 'low' | 'out'.
  final String status;

  /// 'out' | 'critical' | 'warning'. `critical` means at or below half the
  /// reorder level; `out` mirrors [status] so one field can drive colour.
  final String urgency;

  final double onHand;

  /// Effective reorder level (per-warehouse rule, else item master).
  /// Null when nobody has configured one — the row is an out-of-stock.
  final double? reorderLevel;
  final double? reorderQty;
  final int? leadTimeDays;

  /// How far below the reorder level. 0 when no level is configured.
  final double shortBy;

  /// Preferred supplier — the vendor on the most recent posted GRN that
  /// brought this item into this warehouse.
  final String? supplierName;

  /// Days since the last ledger movement for this item+warehouse. Null
  /// when it has never moved here.
  final int? daysSinceLastMovement;

  const InvStockAlert({
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    required this.warehouseId,
    required this.warehouseName,
    required this.status,
    required this.urgency,
    required this.onHand,
    this.reorderLevel,
    this.reorderQty,
    this.leadTimeDays,
    this.shortBy = 0,
    this.supplierName,
    this.daysSinceLastMovement,
  });

  bool get isOut => status == 'out';

  factory InvStockAlert.fromJson(Map<String, dynamic> j) => InvStockAlert(
    itemId: j['itemId'] as String,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    itemUnit: j['itemUnit'] as String?,
    warehouseId: j['warehouseId'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    status: (j['status'] as String?) ?? 'low',
    urgency: (j['urgency'] as String?) ?? 'warning',
    onHand: (j['onHand'] as num?)?.toDouble() ?? 0,
    reorderLevel: (j['reorderLevel'] as num?)?.toDouble(),
    reorderQty: (j['reorderQty'] as num?)?.toDouble(),
    leadTimeDays: (j['leadTimeDays'] as num?)?.toInt(),
    shortBy: (j['shortBy'] as num?)?.toDouble() ?? 0,
    supplierName: j['supplierName'] as String?,
    daysSinceLastMovement: (j['daysSinceLastMovement'] as num?)?.toInt(),
  );
}

/// Headline alert counts — drives the Home hero tiles and the Alerts badge.
class InvStockAlertCounts {
  final int out;
  final int low;
  final int total;
  const InvStockAlertCounts({this.out = 0, this.low = 0, this.total = 0});
  factory InvStockAlertCounts.fromJson(Map<String, dynamic> j) =>
      InvStockAlertCounts(
        out: (j['out'] as num?)?.toInt() ?? 0,
        low: (j['low'] as num?)?.toInt() ?? 0,
        total: (j['total'] as num?)?.toInt() ?? 0,
      );
}

/// One on-hand batch with an expiry date inside the requested window.
/// Mirrors the `/inventory/stock/expiring` shape — see web `ExpiryRow`.
class InvExpiringBatch {
  final String itemId;
  final String warehouseId;
  final String batchNo;
  final double qty;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String warehouseName;
  final String expiryDate;

  /// Negative = already expired. 0 = today. Driven off CURRENT_DATE on the server.
  final int daysToExpiry;
  const InvExpiringBatch({
    required this.itemId,
    required this.warehouseId,
    required this.batchNo,
    required this.qty,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    required this.warehouseName,
    required this.expiryDate,
    required this.daysToExpiry,
  });
  factory InvExpiringBatch.fromJson(Map<String, dynamic> j) => InvExpiringBatch(
    itemId: j['itemId'] as String,
    warehouseId: j['warehouseId'] as String,
    batchNo: (j['batchNo'] as String?) ?? '',
    qty: (j['qty'] as num?)?.toDouble() ?? 0,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    itemUnit: j['itemUnit'] as String?,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    expiryDate: (j['expiryDate'] as String?) ?? '',
    daysToExpiry: (j['daysToExpiry'] as num?)?.toInt() ?? 0,
  );
}

/// One write-off line in the daily register — a single item lost off a single
/// batch. `woNumber` is set when the loss was raised at Record Production.
class InvWriteOffLine {
  final String adjNo;
  final String reason;

  /// The adjustment's note. For reason `other` this *is* the reason — the
  /// label alone says nothing — so the row prints it in place of "Other".
  final String? notes;
  final String itemName;
  final String? itemSku;
  final String? uom;
  final String? batchNo;
  final String warehouseName;
  final String? woNumber;
  final double qty;
  final double value;

  const InvWriteOffLine({
    required this.adjNo,
    required this.reason,
    this.notes,
    required this.itemName,
    this.itemSku,
    this.uom,
    this.batchNo,
    required this.warehouseName,
    this.woNumber,
    required this.qty,
    required this.value,
  });

  factory InvWriteOffLine.fromJson(Map<String, dynamic> j) => InvWriteOffLine(
    adjNo: (j['adjNo'] as String?) ?? '',
    reason: (j['reason'] as String?) ?? '',
    notes: j['notes'] as String?,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    uom: j['uom'] as String?,
    batchNo: j['batchNo'] as String?,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    woNumber: j['woNumber'] as String?,
    qty: (j['qty'] as num?)?.toDouble() ?? 0,
    value: (j['value'] as num?)?.toDouble() ?? 0,
  );
}

/// One day's losses, with the day's own subtotals.
class InvWriteOffDay {
  final String date;
  final double qty;
  final double value;
  final List<InvWriteOffLine> lines;

  const InvWriteOffDay({
    required this.date,
    required this.qty,
    required this.value,
    required this.lines,
  });

  factory InvWriteOffDay.fromJson(Map<String, dynamic> j) => InvWriteOffDay(
    date: (j['date'] as String?) ?? '',
    qty: (j['qty'] as num?)?.toDouble() ?? 0,
    value: (j['value'] as num?)?.toDouble() ?? 0,
    lines: ((j['lines'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvWriteOffLine.fromJson)
        .toList(),
  );
}

class InvWriteOffReport {
  final String from;
  final String to;
  final List<InvWriteOffDay> days;
  final double totalQty;
  final double totalValue;

  const InvWriteOffReport({
    required this.from,
    required this.to,
    required this.days,
    required this.totalQty,
    required this.totalValue,
  });

  factory InvWriteOffReport.fromJson(Map<String, dynamic> j) => InvWriteOffReport(
    from: (j['from'] as String?) ?? '',
    to: (j['to'] as String?) ?? '',
    days: ((j['days'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvWriteOffDay.fromJson)
        .toList(),
    totalQty: (j['totalQty'] as num?)?.toDouble() ?? 0,
    totalValue: (j['totalValue'] as num?)?.toDouble() ?? 0,
  );
}

class InvDn {
  final String id;
  final String dnNo;
  final String warehouseName;
  final String? customerName;
  final String dispatchDate;
  final String status;
  final double totalValue;
  final int lineCount;
  const InvDn({
    required this.id,
    required this.dnNo,
    required this.warehouseName,
    this.customerName,
    required this.dispatchDate,
    required this.status,
    required this.totalValue,
    this.lineCount = 0,
  });
  factory InvDn.fromJson(Map<String, dynamic> j) => InvDn(
    id: j['id'] as String,
    dnNo: j['dnNo'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    customerName: j['customerName'] as String?,
    dispatchDate: j['dispatchDate'] as String,
    status: (j['status'] as String?) ?? 'draft',
    totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
    lineCount: (j['lineCount'] as num?)?.toInt() ?? 0,
  );
}

// ── DN detail (svc.get → header + lines) ─────────────────────────────────

class InvDnLine {
  final String id;
  final String itemId;
  final String itemName;
  final String? itemSku;
  final bool trackBatches;
  final String? batchNo;
  final double qty;
  final String? uom;
  final double unitCost;
  final double lineTotal;

  /// The invoice line this fulfils — present on invoice-raised DNs only.
  final String? invoiceLineId;

  /// Set when this line ships a stand-in for what its invoice line billed.
  final String? substitutedForItemId;
  final String? substitutionNote;

  const InvDnLine({
    required this.id,
    required this.itemId,
    required this.itemName,
    this.itemSku,
    required this.trackBatches,
    this.batchNo,
    required this.qty,
    this.uom,
    required this.unitCost,
    required this.lineTotal,
    this.invoiceLineId,
    this.substitutedForItemId,
    this.substitutionNote,
  });

  bool get isSubstituted => substitutedForItemId != null;

  factory InvDnLine.fromJson(Map<String, dynamic> j) => InvDnLine(
    id: j['id'] as String,
    itemId: j['itemId'] as String,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    trackBatches: j['trackBatches'] as bool? ?? false,
    batchNo: j['batchNo'] as String?,
    qty: double.tryParse(j['qty']?.toString() ?? '0') ?? 0,
    uom: j['uom'] as String?,
    unitCost: double.tryParse(j['unitCost']?.toString() ?? '0') ?? 0,
    lineTotal: double.tryParse(j['lineTotal']?.toString() ?? '0') ?? 0,
    invoiceLineId: j['invoiceLineId'] as String?,
    substitutedForItemId: j['substitutedForItemId'] as String?,
    substitutionNote: j['substitutionNote'] as String?,
  );
}

class InvDnDetail {
  final String id;
  final String dnNo;
  final String warehouseId;
  final String warehouseName;
  final String? customerId;
  final String? customerName;
  final String dispatchDate;
  final String? vehicleNo;
  final String? lrNo;
  final String? eWayBillNo;
  final String? notes;
  final String status;
  final double totalValue;
  final List<InvDnLine> lines;

  /// Set when this DN was raised against an AR invoice — a substitution is
  /// only meaningful against a line that was billed.
  final String? invoiceId;

  /// The invoice's human number, so the dispatch can name what it was raised
  /// against instead of only knowing a UUID.
  final String? invoiceNumber;

  const InvDnDetail({
    required this.id,
    required this.dnNo,
    required this.warehouseId,
    required this.warehouseName,
    this.customerId,
    this.customerName,
    required this.dispatchDate,
    this.vehicleNo,
    this.lrNo,
    this.eWayBillNo,
    this.notes,
    required this.status,
    required this.totalValue,
    required this.lines,
    this.invoiceId,
    this.invoiceNumber,
  });

  factory InvDnDetail.fromJson(Map<String, dynamic> j) => InvDnDetail(
    id: j['id'] as String,
    dnNo: j['dnNo'] as String,
    warehouseId: j['warehouseId'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    customerId: j['customerId'] as String?,
    customerName: j['customerName'] as String?,
    dispatchDate: j['dispatchDate'] as String,
    vehicleNo: j['vehicleNo'] as String?,
    lrNo: j['lrNo'] as String?,
    eWayBillNo: j['eWayBillNo'] as String?,
    notes: j['notes'] as String?,
    status: (j['status'] as String?) ?? 'draft',
    totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
    invoiceId: j['invoiceId'] as String?,
    invoiceNumber: j['invoiceNumber'] as String?,
    lines: ((j['lines'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvDnLine.fromJson)
        .toList(),
  );
}

// ── Item detail (masters /items/:id) ──────────────────────────────────────
//
// Richer view of an item than InvItem — adds pricing, HSN, GST, category,
// description and EAN so the mobile item-detail screen can render a full
// product card.
/// One line of an item's cost build-up (`items.cogm_breakdown`) — e.g.
/// "Milk solids ₹28.40", "Packaging ₹3.10". Sums to the cost price.
class InvCogmComponent {
  final String label;
  final double amount;
  final String? note;
  const InvCogmComponent({
    required this.label,
    required this.amount,
    this.note,
  });
  factory InvCogmComponent.fromJson(Map<String, dynamic> j) => InvCogmComponent(
    label: j['label'] as String? ?? '',
    amount: (j['amount'] as num?)?.toDouble() ?? 0,
    note: j['note'] as String?,
  );
}

class InvItemDetail {
  final String id;
  final String name;
  final String? sku;
  final String? unit;
  final String? type; // 'product' | 'service'
  final String? itemClass;
  final String? hsnSacCode;
  final String? category;
  final String? subcategory;
  final String? description;
  final String? ean;
  final double? packSizeValue;
  final String? packSizeUqc;
  final double? mrp;
  final double? defaultSellingPrice;
  final double? defaultPurchasePrice;
  final double? costPrice;
  final double? basicPrice;
  final double? gstValue;
  final double? margin;
  final double? gstRate;
  final bool trackInventory;
  final bool trackBatches;
  final bool trackExpiry;
  final bool trackSerials;
  final String? batchCodeTemplate;
  final double? reorderLevel;
  final double? reorderQty;

  /// Tenant-defined catalogue attributes (brand, packing type, size…).
  /// Shape varies per tenant schema, so it stays an untyped map.
  final Map<String, dynamic> attributes;

  /// Cost build-up behind [costPrice]. Empty when the tenant never split it.
  final List<InvCogmComponent> cogmBreakdown;
  final bool isActive;
  const InvItemDetail({
    required this.id,
    required this.name,
    this.sku,
    this.unit,
    this.type,
    this.itemClass,
    this.hsnSacCode,
    this.category,
    this.subcategory,
    this.description,
    this.ean,
    this.packSizeValue,
    this.packSizeUqc,
    this.mrp,
    this.defaultSellingPrice,
    this.defaultPurchasePrice,
    this.costPrice,
    this.basicPrice,
    this.gstValue,
    this.margin,
    this.gstRate,
    this.trackInventory = true,
    this.trackBatches = false,
    this.trackExpiry = false,
    this.trackSerials = false,
    this.batchCodeTemplate,
    this.reorderLevel,
    this.reorderQty,
    this.attributes = const {},
    this.cogmBreakdown = const [],
    required this.isActive,
  });
  factory InvItemDetail.fromJson(Map<String, dynamic> j) => InvItemDetail(
    id: j['id'] as String,
    name: j['name'] as String,
    sku: j['sku'] as String?,
    unit: j['unit'] as String?,
    type: j['type'] as String?,
    itemClass: j['itemClass'] as String?,
    hsnSacCode: j['hsnSacCode'] as String?,
    category: j['category'] as String?,
    subcategory: j['subcategory'] as String?,
    description: j['description'] as String?,
    ean: j['ean'] as String?,
    packSizeValue: (j['packSizeValue'] as num?)?.toDouble(),
    packSizeUqc: j['packSizeUqc'] as String?,
    mrp: (j['mrp'] as num?)?.toDouble(),
    defaultSellingPrice: (j['defaultSellingPrice'] as num?)?.toDouble(),
    defaultPurchasePrice: (j['defaultPurchasePrice'] as num?)?.toDouble(),
    costPrice: (j['costPrice'] as num?)?.toDouble(),
    basicPrice: (j['basicPrice'] as num?)?.toDouble(),
    gstValue: (j['gstValue'] as num?)?.toDouble(),
    margin: (j['margin'] as num?)?.toDouble(),
    gstRate: (j['gstRate'] as num?)?.toDouble(),
    trackInventory: j['trackInventory'] as bool? ?? true,
    trackBatches: j['trackBatches'] as bool? ?? false,
    trackExpiry: j['trackExpiry'] as bool? ?? false,
    trackSerials: j['trackSerials'] as bool? ?? false,
    batchCodeTemplate: j['batchCodeTemplate'] as String?,
    reorderLevel: (j['reorderLevel'] as num?)?.toDouble(),
    reorderQty: (j['reorderQty'] as num?)?.toDouble(),
    attributes: (j['attributes'] as Map?)?.cast<String, dynamic>() ?? const {},
    cogmBreakdown: ((j['cogmBreakdown'] as List?) ?? const [])
        .map(
          (e) => InvCogmComponent.fromJson((e as Map).cast<String, dynamic>()),
        )
        .toList(),
    isActive: j['isActive'] as bool? ?? true,
  );
}

/// One price-list line covering an item (GET /masters/items/:id/price-lists),
/// flattened with the list it belongs to and the party it applies to.
class InvItemPriceLine {
  final String priceListId;
  final String priceListName;
  final String type; // 'selling' | 'buying'
  final String
  applyTo; // all | customer_group | vendor_group | customer | vendor
  final String? applyToValue;
  final String? partyName;
  final String? validFrom;
  final String? validTo;
  final bool isActive;
  final bool isExpired;
  final double minQuantity;
  final double? rate;
  final double? marginPercent;
  final double? mrp;
  final double? discountPercent;
  final double derivedRate;
  final double effectiveRate;
  final double gstRatePct;
  final double gstAmount;
  final double landingRate;
  final double? effectiveMarginPct;
  final double? netProfitPerUnit;
  final double? netMarginPct;
  const InvItemPriceLine({
    required this.priceListId,
    required this.priceListName,
    required this.type,
    required this.applyTo,
    this.applyToValue,
    this.partyName,
    this.validFrom,
    this.validTo,
    required this.isActive,
    required this.isExpired,
    required this.minQuantity,
    this.rate,
    this.marginPercent,
    this.mrp,
    this.discountPercent,
    required this.derivedRate,
    required this.effectiveRate,
    this.gstRatePct = 0,
    this.gstAmount = 0,
    this.landingRate = 0,
    this.effectiveMarginPct,
    this.netProfitPerUnit,
    this.netMarginPct,
  });
  factory InvItemPriceLine.fromJson(Map<String, dynamic> j) => InvItemPriceLine(
    priceListId: j['priceListId'] as String,
    priceListName: j['priceListName'] as String? ?? '',
    type: j['type'] as String? ?? 'selling',
    applyTo: j['applyTo'] as String? ?? 'all',
    applyToValue: j['applyToValue'] as String?,
    partyName: j['partyName'] as String?,
    validFrom: j['validFrom'] as String?,
    validTo: j['validTo'] as String?,
    isActive: j['isActive'] as bool? ?? true,
    isExpired: j['isExpired'] as bool? ?? false,
    minQuantity: (j['minQuantity'] as num?)?.toDouble() ?? 0,
    rate: (j['rate'] as num?)?.toDouble(),
    marginPercent: (j['marginPercent'] as num?)?.toDouble(),
    mrp: (j['mrp'] as num?)?.toDouble(),
    discountPercent: (j['discountPercent'] as num?)?.toDouble(),
    derivedRate: (j['derivedRate'] as num?)?.toDouble() ?? 0,
    effectiveRate: (j['effectiveRate'] as num?)?.toDouble() ?? 0,
    gstRatePct: (j['gstRatePct'] as num?)?.toDouble() ?? 0,
    gstAmount: (j['gstAmount'] as num?)?.toDouble() ?? 0,
    landingRate: (j['landingRate'] as num?)?.toDouble() ?? 0,
    effectiveMarginPct: (j['effectiveMarginPct'] as num?)?.toDouble(),
    netProfitPerUnit: (j['netProfitPerUnit'] as num?)?.toDouble(),
    netMarginPct: (j['netMarginPct'] as num?)?.toDouble(),
  );

  /// Who this price applies to, as the user thinks of it.
  String get scopeLabel {
    if (partyName != null && partyName!.isNotEmpty) return partyName!;
    if ((applyToValue ?? '').isNotEmpty) return applyToValue!;
    return type == 'buying' ? 'All vendors' : 'All customers';
  }
}

// One row of the item-master list (GET /masters/items). Lighter than
// InvItemDetail — just what the Items list tile renders.
class InvItemListRow {
  final String id;
  final String name;
  final String? sku;
  final String? unit;
  final String? type; // 'product' | 'service'
  final String? itemClass;
  final String? category;
  final String? subcategory;
  final double? defaultSellingPrice;
  final double? gstRate;
  final bool isActive;

  /// Total on-hand qty. Null unless the list was fetched with withStock —
  /// distinct from 0.0, which means "tracked, none left".
  final double? stockQty;

  /// Balance at or below which the item counts as low. Null when the item
  /// carries no reorder level — then any positive balance reads as healthy.
  final double? reorderLevel;

  /// False for items the ledger doesn't track (services, expensed buys) —
  /// their balance is meaningless, so they carry no availability mark.
  final bool trackInventory;
  const InvItemListRow({
    required this.id,
    required this.name,
    this.sku,
    this.unit,
    this.type,
    this.itemClass,
    this.category,
    this.subcategory,
    this.defaultSellingPrice,
    this.gstRate,
    required this.isActive,
    this.stockQty,
    this.reorderLevel,
    this.trackInventory = true,
  });
  factory InvItemListRow.fromJson(Map<String, dynamic> j) => InvItemListRow(
    id: j['id'] as String,
    name: j['name'] as String,
    sku: j['sku'] as String?,
    unit: j['unit'] as String?,
    type: j['type'] as String?,
    itemClass: j['itemClass'] as String?,
    category: j['category'] as String?,
    subcategory: j['subcategory'] as String?,
    defaultSellingPrice: (j['defaultSellingPrice'] as num?)?.toDouble(),
    gstRate: (j['gstRate'] as num?)?.toDouble(),
    isActive: j['isActive'] as bool? ?? true,
    stockQty: (j['stockQty'] as num?)?.toDouble(),
    reorderLevel: (j['reorderLevel'] as num?)?.toDouble(),
    trackInventory: j['trackInventory'] as bool? ?? true,
  );
}

// One row of the Home stock strips (GET /inventory/dashboard/stock-highlights)
// — an item's total balance across batches, newest movement first.
class InvStockHighlight {
  final String itemId;
  final String name;
  final String? sku;
  final String? unit;
  final String? itemClass;
  final double qty;
  final double value;
  final double? reorderLevel;
  final DateTime? lastMovementAt;
  const InvStockHighlight({
    required this.itemId,
    required this.name,
    this.sku,
    this.unit,
    this.itemClass,
    required this.qty,
    required this.value,
    this.reorderLevel,
    this.lastMovementAt,
  });

  /// True when the balance has fallen to or below the item's reorder level.
  bool get isLow => reorderLevel != null && qty <= reorderLevel!;

  factory InvStockHighlight.fromJson(Map<String, dynamic> j) =>
      InvStockHighlight(
        itemId: j['itemId'] as String,
        name: j['name'] as String,
        sku: j['sku'] as String?,
        unit: j['unit'] as String?,
        itemClass: j['itemClass'] as String?,
        qty: (j['qty'] as num?)?.toDouble() ?? 0,
        value: (j['value'] as num?)?.toDouble() ?? 0,
        reorderLevel: (j['reorderLevel'] as num?)?.toDouble(),
        lastMovementAt: j['lastMovementAt'] == null
            ? null
            : DateTime.parse(j['lastMovementAt'] as String).toLocal(),
      );
}

// One page of the item-master list — rows plus pagination meta so the Items
// screen can decide whether to fetch the next page.
class InvItemPage {
  final List<InvItemListRow> rows;
  final int total;
  final int totalPages;
  final int page;
  const InvItemPage({
    required this.rows,
    required this.total,
    required this.totalPages,
    required this.page,
  });
  factory InvItemPage.fromResponse(dynamic res) {
    final list = (res is Map && res['data'] is List)
        ? (res['data'] as List).cast<Map<String, dynamic>>()
        : const <Map<String, dynamic>>[];
    final meta = (res is Map && res['meta'] is Map)
        ? (res['meta'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    return InvItemPage(
      rows: list.map(InvItemListRow.fromJson).toList(),
      total: (meta['total'] as num?)?.toInt() ?? list.length,
      totalPages: (meta['totalPages'] as num?)?.toInt() ?? 1,
      page: (meta['page'] as num?)?.toInt() ?? 1,
    );
  }
}

// A node in the category tree (GET /masters/categories/tree) — a root
// category with its nested subcategories. Drives the item form's category /
// subcategory pickers. Only the fields the picker needs are parsed.
class InvCategory {
  final String id;
  final String name;
  final List<InvCategory> subcategories;

  /// Items in this category *and everything below it*, when the tree was
  /// fetched with counts. Null when it wasn't asked for.
  final int? itemCount;

  const InvCategory({
    required this.id,
    required this.name,
    this.subcategories = const [],
    this.itemCount,
  });

  /// Items filed on this category itself rather than on a child. The API
  /// sends subtree totals, so the difference is what would otherwise be
  /// unreachable: a category filter matches one category exactly, so items
  /// sitting on a parent need their own way in.
  int get directCount {
    final total = itemCount;
    if (total == null) return 0;
    final below = subcategories.fold<int>(0, (n, c) => n + (c.itemCount ?? 0));
    final direct = total - below;
    return direct < 0 ? 0 : direct;
  }

  factory InvCategory.fromJson(Map<String, dynamic> j) => InvCategory(
    id: j['id'] as String,
    name: j['name'] as String,
    itemCount: (j['itemCount'] as num?)?.toInt(),
    subcategories: ((j['subcategories'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvCategory.fromJson)
        .toList(),
  );
}

// One stock-on-hand row from /inventory/items/:id/stock — per warehouse +
// batch. Lighter than InvOnHandRow because the item context is implicit.
class InvItemStockRow {
  final String warehouseId;
  final String warehouseName;
  final String batchNo;
  final double qty;
  final double avgCost;
  final double value;
  final String? lastMovementAt;
  const InvItemStockRow({
    required this.warehouseId,
    required this.warehouseName,
    required this.batchNo,
    required this.qty,
    required this.avgCost,
    required this.value,
    this.lastMovementAt,
  });
  factory InvItemStockRow.fromJson(Map<String, dynamic> j) => InvItemStockRow(
    warehouseId: j['warehouseId'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    batchNo: (j['batchNo'] as String?) ?? '',
    qty: (j['qty'] as num?)?.toDouble() ?? 0,
    avgCost: (j['avgCost'] as num?)?.toDouble() ?? 0,
    value: (j['value'] as num?)?.toDouble() ?? 0,
    lastMovementAt: j['lastMovementAt'] as String?,
  );
}

// ── GRN detail (svc.get → header + lines) ─────────────────────────────────

class InvGrnLine {
  final String id;
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? batchNo;
  final String? expiryDate;
  final double qty;
  final String? uom;
  final double unitRate;
  final double landedCostPerUnit;
  final double lineTotal;
  final String? notes;
  final List<String> serialNos;
  const InvGrnLine({
    required this.id,
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.batchNo,
    this.expiryDate,
    required this.qty,
    this.uom,
    required this.unitRate,
    required this.landedCostPerUnit,
    required this.lineTotal,
    this.notes,
    required this.serialNos,
  });
  factory InvGrnLine.fromJson(Map<String, dynamic> j) => InvGrnLine(
    id: j['id'] as String,
    itemId: j['itemId'] as String,
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    batchNo: j['batchNo'] as String?,
    expiryDate: j['expiryDate'] as String?,
    qty: double.tryParse(j['qty']?.toString() ?? '0') ?? 0,
    uom: j['uom'] as String?,
    unitRate: double.tryParse(j['unitRate']?.toString() ?? '0') ?? 0,
    landedCostPerUnit:
        double.tryParse(j['landedCostPerUnit']?.toString() ?? '0') ?? 0,
    lineTotal: double.tryParse(j['lineTotal']?.toString() ?? '0') ?? 0,
    notes: j['notes'] as String?,
    serialNos: ((j['serialNos'] as List?) ?? const [])
        .map((e) => e.toString())
        .toList(),
  );
}

class InvGrnDetail {
  final String id;
  final String grnNo;
  final String warehouseName;
  final String? vendorName;
  final String receivedDate;
  final String? vehicleNo;
  final String? lrNo;
  final String? notes;
  final String status;
  final double totalValue;
  final List<InvGrnLine> lines;
  const InvGrnDetail({
    required this.id,
    required this.grnNo,
    required this.warehouseName,
    this.vendorName,
    required this.receivedDate,
    this.vehicleNo,
    this.lrNo,
    this.notes,
    required this.status,
    required this.totalValue,
    required this.lines,
  });
  factory InvGrnDetail.fromJson(Map<String, dynamic> j) => InvGrnDetail(
    id: j['id'] as String,
    grnNo: j['grnNo'] as String,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    vendorName: j['vendorName'] as String?,
    receivedDate: j['receivedDate'] as String,
    vehicleNo: j['vehicleNo'] as String?,
    lrNo: j['lrNo'] as String?,
    notes: j['notes'] as String?,
    status: (j['status'] as String?) ?? 'draft',
    totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
    lines: ((j['lines'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InvGrnLine.fromJson)
        .toList(),
  );
}

// ── Recent activity (dashboard feed) ──────────────────────────────────────
//
// One row from /inventory/dashboard/recent-activity — a slice of the stock
// ledger with item + warehouse joins. Drives the Home recent-activity card
// and the dedicated full-feed screen.
class InvActivity {
  final String id;

  /// Ledger movement bucket — `grn` | `dn` | `transfer_in` | `transfer_out`
  /// | `adjustment` | `stock_take`. Mapped to icon + colour by
  /// [InvActivityIcon] in `inv_primitives.dart`.
  final String movementType;
  final String sourceType;
  final String sourceId;
  final double qtyIn;
  final double qtyOut;
  final DateTime movedAt;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String warehouseName;
  final String? batchNo;

  /// Moving-weighted-average cost the movement was posted at.
  final double unitCost;

  /// Signed rupee value of the movement (`(qtyIn - qtyOut) x unitCost`).
  /// Legitimately 0 for zero-valued stock — MP raw milk is capitalised at
  /// cycle lock, not at receipt — so the qty is what proves it moved.
  final double value;
  const InvActivity({
    required this.id,
    required this.movementType,
    required this.sourceType,
    required this.sourceId,
    required this.qtyIn,
    required this.qtyOut,
    required this.movedAt,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    required this.warehouseName,
    this.batchNo,
    this.unitCost = 0,
    this.value = 0,
  });

  /// Collapse direction-split movement types to the icon bucket
  /// `InvActivityIcon` knows about. transfer_in/out both map to `transfer`.
  String get iconKey {
    if (movementType.startsWith('transfer')) return 'transfer';
    return movementType;
  }

  /// Signed qty — positive for inflows, negative for outflows. Used to
  /// render the right-edge "+5 / -3" amount on each row.
  double get signedQty => qtyIn - qtyOut;

  /// True for a receipt, false for an issue. A ledger row is never both.
  bool get isIn => qtyIn > 0;
  factory InvActivity.fromJson(Map<String, dynamic> j) => InvActivity(
    id: j['id'] as String,
    movementType: (j['movementType'] as String?) ?? '',
    sourceType: (j['sourceType'] as String?) ?? '',
    sourceId: (j['sourceId'] as String?) ?? '',
    qtyIn: (j['qtyIn'] as num?)?.toDouble() ?? 0,
    qtyOut: (j['qtyOut'] as num?)?.toDouble() ?? 0,
    movedAt:
        DateTime.tryParse(j['movedAt']?.toString() ?? '')?.toLocal() ??
        DateTime.now(),
    itemName: (j['itemName'] as String?) ?? '',
    itemSku: j['itemSku'] as String?,
    itemUnit: j['itemUnit'] as String?,
    warehouseName: (j['warehouseName'] as String?) ?? '',
    batchNo: j['batchNo'] as String?,
    unitCost: (j['unitCost'] as num?)?.toDouble() ?? 0,
    value: (j['value'] as num?)?.toDouble() ?? 0,
  );
}

// ── Movement feed ────────────────────────────────────────────────────────
// The Stock Movement screen (mobile) — the filtered, valued view of the same
// ledger slice. Mirrors `movementFeed()` in dashboard.service.ts.

/// Filter state for the movement feed. A value type so it can key a
/// Riverpod family without a manual cache-buster.
class InvMovementFilter {
  /// 'in' | 'out' | null (both).
  final String? direction;

  /// Movement group — receipt | dispatch | production | transfer |
  /// adjustment | stock_take | return | other. Null means every group.
  final String? group;

  /// Concrete ledger type inside [group] — 'adjustment_out', 'production_in'
  /// and so on. Null means every type in the group. Setting a group clears
  /// this, so the pair can never describe an empty intersection.
  final String? type;
  final String? warehouseId;

  /// today | 7d | 30d | month | all.
  final String period;
  final String search;
  const InvMovementFilter({
    this.direction,
    this.group,
    this.type,
    this.warehouseId,
    this.period = 'today',
    this.search = '',
  });

  InvMovementFilter copyWith({
    String? Function()? direction,
    String? Function()? group,
    String? Function()? type,
    String? Function()? warehouseId,
    String? period,
    String? search,
  }) =>
      InvMovementFilter(
        direction: direction == null ? this.direction : direction(),
        group: group == null ? this.group : group(),
        type: type == null ? this.type : type(),
        warehouseId: warehouseId == null ? this.warehouseId : warehouseId(),
        period: period ?? this.period,
        search: search ?? this.search,
      );

  /// Everything except the window — used to decide whether to show a
  /// "clear filters" affordance, since a period is always set.
  bool get hasNarrowing =>
      direction != null ||
      group != null ||
      type != null ||
      warehouseId != null ||
      search.isNotEmpty;

  @override
  bool operator ==(Object other) =>
      other is InvMovementFilter &&
      other.direction == direction &&
      other.group == group &&
      other.type == type &&
      other.warehouseId == warehouseId &&
      other.period == period &&
      other.search == search;

  @override
  int get hashCode =>
      Object.hash(direction, group, type, warehouseId, period, search);
}

/// In / out money and document counts across the whole filtered set — not
/// just the page of rows that came back.
class InvMovementSummary {
  final double inValue;
  final double outValue;
  final double netValue;
  final int inDocs;
  final int outDocs;
  final int totalRows;
  const InvMovementSummary({
    required this.inValue,
    required this.outValue,
    required this.netValue,
    required this.inDocs,
    required this.outDocs,
    required this.totalRows,
  });
  factory InvMovementSummary.fromJson(Map<String, dynamic> j) =>
      InvMovementSummary(
        inValue: _d(j['inValue']),
        outValue: _d(j['outValue']),
        netValue: _d(j['netValue']),
        inDocs: _i(j['inDocs']),
        outDocs: _i(j['outDocs']),
        totalRows: _i(j['totalRows']),
      );
}

class InvMovementFeed {
  final List<InvActivity> rows;
  final InvMovementSummary summary;
  const InvMovementFeed({required this.rows, required this.summary});
  factory InvMovementFeed.fromJson(Map<String, dynamic> j) => InvMovementFeed(
        rows: ((j['rows'] as List?) ?? const [])
            .map((e) => InvActivity.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
        summary: InvMovementSummary.fromJson(
          ((j['summary'] as Map?) ?? const {}).cast<String, dynamic>(),
        ),
      );
}

// ── Analytics ────────────────────────────────────────────────────────────
// Mirrors apps/api/src/modules/inventory/analytics*.service.ts. The mobile
// screen shows a condensed slice of what the web page does — scorecard,
// value trend, velocity mix, risk and what runs out next.

double _d(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

class InvHealth {
  final int windowDays;
  final int dataSpanDays;
  final double totalValue;
  final int skuInStock;
  final double consumedValue;
  final double? turnover;
  final double? daysOnHand;
  final double expiringValue;
  final int belowReorder;
  final int outOfStock;
  final double deadValue;
  final int deadSkuCount;
  final double deadValuePct;
  final double averageInventory;
  final double excessValue;
  final int excessSkuCount;
  final int excessCoverDays;

  const InvHealth({
    required this.windowDays,
    required this.dataSpanDays,
    required this.totalValue,
    required this.skuInStock,
    required this.consumedValue,
    required this.turnover,
    required this.daysOnHand,
    required this.expiringValue,
    required this.belowReorder,
    required this.outOfStock,
    required this.deadValue,
    required this.deadSkuCount,
    required this.deadValuePct,
    required this.averageInventory,
    required this.excessValue,
    required this.excessSkuCount,
    required this.excessCoverDays,
  });

  factory InvHealth.fromJson(Map<String, dynamic> j) => InvHealth(
    windowDays: _i(j['windowDays']),
    dataSpanDays: _i(j['dataSpanDays']),
    totalValue: _d(j['totalValue']),
    skuInStock: _i(j['skuInStock']),
    consumedValue: _d(j['consumedValue']),
    turnover: j['turnover'] == null ? null : _d(j['turnover']),
    daysOnHand: j['daysOnHand'] == null ? null : _d(j['daysOnHand']),
    expiringValue: _d(j['expiringValue']),
    belowReorder: _i(j['belowReorder']),
    outOfStock: _i(j['outOfStock']),
    deadValue: _d(j['deadValue']),
    deadSkuCount: _i(j['deadSkuCount']),
    deadValuePct: _d(j['deadValuePct']),
    averageInventory: _d(j['averageInventory']),
    excessValue: _d(j['excessValue']),
    excessSkuCount: _i(j['excessSkuCount']),
    excessCoverDays: _i(j['excessCoverDays']),
  );
}

class InvSkuPerformance {
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final double onHandQty;
  final double onHandValue;
  final double consumedValue;
  final double runRate;
  final double? daysOfCover;
  final String velocity; // fast | medium | slow | dead
  final String abcClass; // A | B | C
  final String? xyzClass; // X | Y | Z, null until 3 full weeks exist
  final double? demandCv;
  final bool isExcess;
  final bool hasEnoughHistory;

  const InvSkuPerformance({
    required this.itemId,
    required this.itemName,
    required this.itemSku,
    required this.itemUnit,
    required this.onHandQty,
    required this.onHandValue,
    required this.consumedValue,
    required this.runRate,
    required this.daysOfCover,
    required this.velocity,
    required this.abcClass,
    required this.xyzClass,
    required this.demandCv,
    required this.isExcess,
    required this.hasEnoughHistory,
  });

  factory InvSkuPerformance.fromJson(Map<String, dynamic> j) =>
      InvSkuPerformance(
        itemId: '${j['itemId']}',
        itemName: '${j['itemName']}',
        itemSku: j['itemSku'] as String?,
        itemUnit: j['itemUnit'] as String?,
        onHandQty: _d(j['onHandQty']),
        onHandValue: _d(j['onHandValue']),
        consumedValue: _d(j['consumedValue']),
        runRate: _d(j['runRate']),
        daysOfCover: j['daysOfCover'] == null ? null : _d(j['daysOfCover']),
        velocity: '${j['velocity']}',
        abcClass: '${j['abcClass']}',
        xyzClass: j['xyzClass'] as String?,
        demandCv: j['demandCv'] == null ? null : _d(j['demandCv']),
        isExcess: j['isExcess'] == true,
        hasEnoughHistory: j['hasEnoughHistory'] == true,
      );
}

class InvRiskRow {
  final String itemId;
  final String itemName;
  final String? itemUnit;
  final double onHand;
  final double? reorderLevel;
  final double shortBy;
  final int daysOut;
  final int timesOutInWindow;
  final String level; // out | critical | warning | ok

  const InvRiskRow({
    required this.itemId,
    required this.itemName,
    required this.itemUnit,
    required this.onHand,
    required this.reorderLevel,
    required this.shortBy,
    required this.daysOut,
    required this.timesOutInWindow,
    required this.level,
  });

  factory InvRiskRow.fromJson(Map<String, dynamic> j) => InvRiskRow(
    itemId: '${j['itemId']}',
    itemName: '${j['itemName']}',
    itemUnit: j['itemUnit'] as String?,
    onHand: _d(j['onHand']),
    reorderLevel: j['reorderLevel'] == null ? null : _d(j['reorderLevel']),
    shortBy: _d(j['shortBy']),
    daysOut: _i(j['daysOut']),
    timesOutInWindow: _i(j['timesOutInWindow']),
    level: '${j['level']}',
  );
}

class InvStockRisk {
  final int windowDays;
  final List<InvRiskRow> outOfStock;
  final List<InvRiskRow> critical;
  final List<InvRiskRow> warning;
  final List<InvRiskRow> repeatOffenders;

  const InvStockRisk({
    required this.windowDays,
    required this.outOfStock,
    required this.critical,
    required this.warning,
    required this.repeatOffenders,
  });

  static List<InvRiskRow> _rows(dynamic v) => (v as List? ?? [])
      .map((e) => InvRiskRow.fromJson((e as Map).cast<String, dynamic>()))
      .toList();

  factory InvStockRisk.fromJson(Map<String, dynamic> j) => InvStockRisk(
    windowDays: _i(j['windowDays']),
    outOfStock: _rows(j['outOfStock']),
    critical: _rows(j['critical']),
    warning: _rows(j['warning']),
    repeatOffenders: _rows(j['repeatOffenders']),
  );
}

class InvForecastRow {
  final String itemId;
  final String itemName;
  final String? itemUnit;
  final double onHand;
  final double runRate;
  final double? daysOfCover;
  final String? stockoutDate;
  final String? reorderByDate;
  final double suggestedQty;
  final bool hasEnoughHistory;
  final bool isLate;
  final bool isUrgent;

  const InvForecastRow({
    required this.itemId,
    required this.itemName,
    required this.itemUnit,
    required this.onHand,
    required this.runRate,
    required this.daysOfCover,
    required this.stockoutDate,
    required this.reorderByDate,
    required this.suggestedQty,
    required this.hasEnoughHistory,
    required this.isLate,
    required this.isUrgent,
  });

  factory InvForecastRow.fromJson(Map<String, dynamic> j) => InvForecastRow(
    itemId: '${j['itemId']}',
    itemName: '${j['itemName']}',
    itemUnit: j['itemUnit'] as String?,
    onHand: _d(j['onHand']),
    runRate: _d(j['runRate']),
    daysOfCover: j['daysOfCover'] == null ? null : _d(j['daysOfCover']),
    stockoutDate: j['stockoutDate'] as String?,
    reorderByDate: j['reorderByDate'] as String?,
    suggestedQty: _d(j['suggestedQty']),
    hasEnoughHistory: j['hasEnoughHistory'] == true,
    isLate: j['isLate'] == true,
    isUrgent: j['isUrgent'] == true,
  );
}

class InvForecast {
  final List<InvForecastRow> items;
  final int lateCount;
  final int urgentCount;
  final double expiryAtRisk;
  final double expiredValue;

  const InvForecast({
    required this.items,
    required this.lateCount,
    required this.urgentCount,
    required this.expiryAtRisk,
    required this.expiredValue,
  });

  factory InvForecast.fromJson(Map<String, dynamic> j) {
    final so = (j['stockout'] as Map?)?.cast<String, dynamic>() ?? {};
    final ex = (j['expiry'] as Map?)?.cast<String, dynamic>() ?? {};
    return InvForecast(
      items: ((so['items'] as List?) ?? [])
          .map(
            (e) => InvForecastRow.fromJson((e as Map).cast<String, dynamic>()),
          )
          .toList(),
      lateCount: _i(so['lateCount']),
      urgentCount: _i(so['urgentCount']),
      expiryAtRisk: _d(ex['totalAtRisk']),
      expiredValue: _d(ex['alreadyExpiredValue']),
    );
  }
}

class InvTrendPoint {
  final String bucket;
  final double closingValue;
  final double inValue;
  final double outValue;

  const InvTrendPoint({
    required this.bucket,
    required this.closingValue,
    required this.inValue,
    required this.outValue,
  });

  factory InvTrendPoint.fromJson(Map<String, dynamic> j) => InvTrendPoint(
    bucket: '${j['bucket']}',
    closingValue: _d(j['closingValue']),
    inValue: _d(j['inValue']),
    outValue: _d(j['outValue']),
  );
}

/// Outcome of a bulk "apply suggested levels" call.
class InvApplyLevelsResult {
  /// Rows actually written. 0 on a dry run.
  final int applied;

  /// Eligible but the computed level was zero, so left alone.
  final int skippedZeroLevel;

  /// Of those written, how many rested on a thin-history fallback.
  final int thinHistoryApplied;

  /// Of those written, how many replaced an existing hand-set level.
  final int overwritten;
  final bool dryRun;

  /// How many rows a dry run would write (equals [applied] after a commit).
  final int pendingCount;

  const InvApplyLevelsResult({
    this.applied = 0,
    this.skippedZeroLevel = 0,
    this.thinHistoryApplied = 0,
    this.overwritten = 0,
    this.dryRun = false,
    this.pendingCount = 0,
  });

  factory InvApplyLevelsResult.fromJson(Map<String, dynamic> j) =>
      InvApplyLevelsResult(
        applied: (j['applied'] as num?)?.toInt() ?? 0,
        skippedZeroLevel: (j['skippedZeroLevel'] as num?)?.toInt() ?? 0,
        thinHistoryApplied: (j['thinHistoryApplied'] as num?)?.toInt() ?? 0,
        overwritten: (j['overwritten'] as num?)?.toInt() ?? 0,
        dryRun: j['dryRun'] as bool? ?? false,
        pendingCount: (j['items'] as List<dynamic>?)?.length ?? 0,
      );
}

/// One row of the computed reorder-level table. Mirrors
/// apps/api/src/modules/inventory/replenishment.service.ts.
class InvReplenishmentRow {
  final String itemId;
  final String itemName;
  final String? itemUnit;
  final double onHand;
  final double avgDailyDemand;
  final double demandSd;
  final int leadTimeDays;
  final bool leadTimeAssumed;
  final double safetyStock;
  final double suggestedReorderLevel;
  final double? currentReorderLevel;
  final double? gap;
  final double suggestedOrderQty;
  final bool breachesSuggested;
  final bool hasReliableSigma;

  const InvReplenishmentRow({
    required this.itemId,
    required this.itemName,
    required this.itemUnit,
    required this.onHand,
    required this.avgDailyDemand,
    required this.demandSd,
    required this.leadTimeDays,
    required this.leadTimeAssumed,
    required this.safetyStock,
    required this.suggestedReorderLevel,
    required this.currentReorderLevel,
    required this.gap,
    required this.suggestedOrderQty,
    required this.breachesSuggested,
    required this.hasReliableSigma,
  });

  factory InvReplenishmentRow.fromJson(Map<String, dynamic> j) =>
      InvReplenishmentRow(
        itemId: '${j['itemId']}',
        itemName: '${j['itemName']}',
        itemUnit: j['itemUnit'] as String?,
        onHand: _d(j['onHand']),
        avgDailyDemand: _d(j['avgDailyDemand']),
        demandSd: _d(j['demandSd']),
        leadTimeDays: _i(j['leadTimeDays']),
        leadTimeAssumed: j['leadTimeAssumed'] == true,
        safetyStock: _d(j['safetyStock']),
        suggestedReorderLevel: _d(j['suggestedReorderLevel']),
        currentReorderLevel: j['currentReorderLevel'] == null
            ? null
            : _d(j['currentReorderLevel']),
        gap: j['gap'] == null ? null : _d(j['gap']),
        suggestedOrderQty: _d(j['suggestedOrderQty']),
        breachesSuggested: j['breachesSuggested'] == true,
        hasReliableSigma: j['hasReliableSigma'] == true,
      );
}

class InvReplenishment {
  final int serviceLevel;
  final int defaultLeadTimeDays;
  final List<InvReplenishmentRow> rows;
  final int actionableCount;
  final int unconfiguredCount;

  const InvReplenishment({
    required this.serviceLevel,
    required this.defaultLeadTimeDays,
    required this.rows,
    required this.actionableCount,
    required this.unconfiguredCount,
  });

  factory InvReplenishment.fromJson(Map<String, dynamic> j) => InvReplenishment(
    serviceLevel: _i(j['serviceLevel']),
    defaultLeadTimeDays: _i(j['defaultLeadTimeDays']),
    rows: ((j['rows'] as List?) ?? [])
        .map(
          (e) =>
              InvReplenishmentRow.fromJson((e as Map).cast<String, dynamic>()),
        )
        .toList(),
    actionableCount: _i(j['actionableCount']),
    unconfiguredCount: _i(j['unconfiguredCount']),
  );
}
