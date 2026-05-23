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
  const InvItem({
    required this.id, required this.name, this.sku, this.unit, this.barcode,
    required this.trackBatches, required this.trackExpiry,
  });
  factory InvItem.fromJson(Map<String, dynamic> j) => InvItem(
        id: j['id'] as String,
        name: j['name'] as String,
        sku: j['sku'] as String?,
        unit: j['unit'] as String?,
        barcode: j['barcode'] as String?,
        trackBatches: j['trackBatches'] as bool? ?? false,
        trackExpiry: j['trackExpiry'] as bool? ?? false,
      );
}

class InvGrnLineInput {
  final String itemId;
  final String? batchNo;
  final String? expiryDate;
  final double qty;
  final double unitRate;
  const InvGrnLineInput({
    required this.itemId, this.batchNo, this.expiryDate,
    required this.qty, required this.unitRate,
  });
  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        if (batchNo != null && batchNo!.isNotEmpty) 'batchNo': batchNo,
        if (expiryDate != null && expiryDate!.isNotEmpty) 'expiryDate': expiryDate,
        'qty': qty,
        'unitRate': unitRate,
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
