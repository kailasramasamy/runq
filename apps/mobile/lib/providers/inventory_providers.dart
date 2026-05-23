// Riverpod providers for the Inventory module.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/inventory_models.dart';
import '../api/inventory_repo.dart';

final invKpisProvider = FutureProvider.autoDispose<InvKpis>((ref) async {
  return inventoryRepo.kpis();
});

final invWarehousesProvider = FutureProvider.autoDispose<List<InvWarehouse>>((ref) async {
  return inventoryRepo.warehouses();
});

final invOnHandProvider = FutureProvider.autoDispose
    .family<List<InvOnHandRow>, ({String? warehouseId, bool lowOnly})>((ref, args) async {
  return inventoryRepo.onHand(warehouseId: args.warehouseId, lowOnly: args.lowOnly);
});

final invGrnListProvider = FutureProvider.autoDispose.family<List<InvGrn>, String?>((ref, status) async {
  return inventoryRepo.grnList(status: status);
});

final invDnListProvider = FutureProvider.autoDispose.family<List<InvDn>, String?>((ref, status) async {
  return inventoryRepo.dnList(status: status);
});

final invTransferListProvider = FutureProvider.autoDispose
    .family<List<InvTransfer>, String?>((ref, status) async {
  return inventoryRepo.transferList(status: status);
});

final invAdjustmentListProvider = FutureProvider.autoDispose
    .family<List<InvAdjustment>, String?>((ref, status) async {
  return inventoryRepo.adjustmentList(status: status);
});

final invStockTakeListProvider = FutureProvider.autoDispose
    .family<List<InvStockTake>, String?>((ref, status) async {
  return inventoryRepo.stockTakeList(status: status);
});

final invStockTakeDetailProvider = FutureProvider.autoDispose
    .family<InvStockTakeDetail, String>((ref, id) async {
  return inventoryRepo.stockTakeGet(id);
});

final invReorderAlertsProvider = FutureProvider.autoDispose<List<InvReorderAlert>>((ref) async {
  return inventoryRepo.reorderAlerts();
});
