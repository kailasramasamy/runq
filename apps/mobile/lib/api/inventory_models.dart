// Mobile-side data classes for the Inventory module. Kept hand-rolled (no
// codegen) to stay consistent with hr_models.dart.

library;

class InvKpis {
  final double totalValue;
  final int activeRows;
  final int lowStockCount;
  final int todayGrns;
  final int todayDeliveries;
  const InvKpis({
    required this.totalValue,
    required this.activeRows,
    required this.lowStockCount,
    required this.todayGrns,
    required this.todayDeliveries,
  });
  factory InvKpis.fromJson(Map<String, dynamic> j) => InvKpis(
        totalValue: (j['totalValue'] as num?)?.toDouble() ?? 0,
        activeRows: (j['activeRows'] as num?)?.toInt() ?? 0,
        lowStockCount: (j['lowStockCount'] as num?)?.toInt() ?? 0,
        todayGrns: (j['todayGrns'] as num?)?.toInt() ?? 0,
        todayDeliveries: (j['todayDeliveries'] as num?)?.toInt() ?? 0,
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
    required this.id, required this.code, required this.name, required this.type,
    required this.isDefault, required this.isActive,
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
  final String warehouseId;
  final String warehouseName;
  final String batchNo;
  final double qty;
  final double avgCost;
  final double value;
  final double? reorderLevel;
  const InvOnHandRow({
    required this.itemId, required this.itemName, this.itemSku, this.itemUnit,
    required this.warehouseId, required this.warehouseName, required this.batchNo,
    required this.qty, required this.avgCost, required this.value, this.reorderLevel,
  });
  bool get isLow => reorderLevel != null && qty <= (reorderLevel ?? 0);
  factory InvOnHandRow.fromJson(Map<String, dynamic> j) => InvOnHandRow(
        itemId: j['itemId'] as String,
        itemName: j['itemName'] as String,
        itemSku: j['itemSku'] as String?,
        itemUnit: j['itemUnit'] as String?,
        warehouseId: j['warehouseId'] as String,
        warehouseName: j['warehouseName'] as String,
        batchNo: (j['batchNo'] as String?) ?? '',
        qty: (j['qty'] as num?)?.toDouble() ?? 0,
        avgCost: (j['avgCost'] as num?)?.toDouble() ?? 0,
        value: (j['value'] as num?)?.toDouble() ?? 0,
        reorderLevel: (j['reorderLevel'] as num?)?.toDouble(),
      );
}

class InvItem {
  final String id;
  final String name;
  final String? sku;
  final String? unit;
  final String? barcode;
  final bool trackBatches;
  final bool trackExpiry;
  final bool trackSerials;
  const InvItem({
    required this.id, required this.name, this.sku, this.unit, this.barcode,
    required this.trackBatches, required this.trackExpiry, required this.trackSerials,
  });
  factory InvItem.fromJson(Map<String, dynamic> j) => InvItem(
        id: j['id'] as String,
        name: j['name'] as String,
        sku: j['sku'] as String?,
        unit: j['unit'] as String?,
        barcode: j['barcode'] as String?,
        trackBatches: j['trackBatches'] as bool? ?? false,
        trackExpiry: j['trackExpiry'] as bool? ?? false,
        trackSerials: j['trackSerials'] as bool? ?? false,
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
    required this.itemId, this.batchNo, this.expiryDate,
    required this.qty, required this.unitRate, this.serialNos,
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
  const InvGrn({
    required this.id, required this.grnNo, required this.warehouseName,
    this.vendorName, required this.receivedDate, required this.status,
    required this.totalValue,
  });
  factory InvGrn.fromJson(Map<String, dynamic> j) => InvGrn(
        id: j['id'] as String,
        grnNo: j['grnNo'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        vendorName: j['vendorName'] as String?,
        receivedDate: j['receivedDate'] as String,
        status: (j['status'] as String?) ?? 'draft',
        totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
      );
}

class InvTransfer {
  final String id;
  final String transferNo;
  final String fromWarehouseName;
  final String toWarehouseName;
  final String status;
  final double totalValue;
  const InvTransfer({
    required this.id, required this.transferNo,
    required this.fromWarehouseName, required this.toWarehouseName,
    required this.status, required this.totalValue,
  });
  factory InvTransfer.fromJson(Map<String, dynamic> j) => InvTransfer(
        id: j['id'] as String,
        transferNo: j['transferNo'] as String,
        fromWarehouseName: (j['fromWarehouseName'] as String?) ?? '',
        toWarehouseName: (j['toWarehouseName'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'draft',
        totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
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
  const InvAdjustment({
    required this.id, required this.adjNo, required this.warehouseName,
    required this.reason, required this.adjustmentDate, required this.status,
    required this.totalValueDelta,
  });
  factory InvAdjustment.fromJson(Map<String, dynamic> j) => InvAdjustment(
        id: j['id'] as String,
        adjNo: j['adjNo'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        reason: (j['reason'] as String?) ?? 'damage',
        adjustmentDate: j['adjustmentDate'] as String,
        status: (j['status'] as String?) ?? 'draft',
        totalValueDelta: double.tryParse(j['totalValueDelta']?.toString() ?? '0') ?? 0,
      );
}

class InvStockTake {
  final String id;
  final String stNo;
  final String warehouseName;
  final String scope;
  final String status;
  final String startedAt;
  const InvStockTake({
    required this.id, required this.stNo, required this.warehouseName,
    required this.scope, required this.status, required this.startedAt,
  });
  factory InvStockTake.fromJson(Map<String, dynamic> j) => InvStockTake(
        id: j['id'] as String,
        stNo: j['stNo'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        scope: (j['scope'] as String?) ?? 'full',
        status: (j['status'] as String?) ?? 'in_progress',
        startedAt: (j['startedAt'] as String?) ?? '',
      );
}

class InvTransferLineInput {
  final String itemId;
  final String? batchNo;
  final double qty;
  const InvTransferLineInput({required this.itemId, this.batchNo, required this.qty});
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
  const InvAdjustmentLineInput({required this.itemId, this.batchNo, required this.qtyDelta});
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
  const InvCountLineInput({required this.itemId, this.batchNo, required this.countedQty});
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
    required this.id, required this.itemId, required this.itemName,
    this.itemSku, this.itemUnit, this.batchNo,
    required this.systemQty, this.countedQty,
    required this.unitCost, this.variance,
  });
  factory InvStockTakeLine.fromJson(Map<String, dynamic> j) => InvStockTakeLine(
        id: j['id'] as String,
        itemId: j['itemId'] as String,
        itemName: (j['itemName'] as String?) ?? '',
        itemSku: j['itemSku'] as String?,
        itemUnit: j['itemUnit'] as String?,
        batchNo: j['batchNo'] as String?,
        systemQty: double.tryParse(j['systemQty']?.toString() ?? '0') ?? 0,
        countedQty: j['countedQty'] == null ? null : double.tryParse(j['countedQty'].toString()),
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
    required this.id, required this.stNo, required this.warehouseId,
    required this.warehouseName, required this.status, required this.lines,
  });
  factory InvStockTakeDetail.fromJson(Map<String, dynamic> j) => InvStockTakeDetail(
        id: j['id'] as String,
        stNo: j['stNo'] as String,
        warehouseId: j['warehouseId'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'in_progress',
        lines: ((j['lines'] as List?) ?? const [])
            .map((e) => InvStockTakeLine.fromJson((e as Map).cast<String, dynamic>()))
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
  const InvReorderAlert({
    required this.itemId, required this.itemName, this.itemSku, this.itemUnit,
    required this.warehouseId, required this.warehouseName,
    required this.onHand, required this.reorderLevel, required this.reorderQty,
    required this.shortBy,
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
  const InvDn({
    required this.id, required this.dnNo, required this.warehouseName,
    this.customerName, required this.dispatchDate, required this.status,
    required this.totalValue,
  });
  factory InvDn.fromJson(Map<String, dynamic> j) => InvDn(
        id: j['id'] as String,
        dnNo: j['dnNo'] as String,
        warehouseName: (j['warehouseName'] as String?) ?? '',
        customerName: j['customerName'] as String?,
        dispatchDate: j['dispatchDate'] as String,
        status: (j['status'] as String?) ?? 'draft',
        totalValue: double.tryParse(j['totalValue']?.toString() ?? '0') ?? 0,
      );
}
