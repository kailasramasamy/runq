// Riverpod providers for the Inventory module.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/inventory_models.dart';
import '../api/inventory_repo.dart';
import '../api/sales_dispatch_models.dart';
import '../api/sales_dispatch_repo.dart';

final invKpisProvider = FutureProvider.autoDispose<InvKpis>((ref) async {
  return inventoryRepo.kpis();
});

final invRecentActivityProvider =
    FutureProvider.autoDispose<List<InvActivity>>((ref) async {
  return inventoryRepo.recentActivity();
});

final invWarehouseValuesProvider =
    FutureProvider.autoDispose<List<InvWarehouseValue>>((ref) async {
  return inventoryRepo.warehouseValues();
});

/// Home stock strips, keyed by class bucket ('finished' | 'inputs').
final invStockHighlightsProvider = FutureProvider.autoDispose
    .family<List<InvStockHighlight>, String>((ref, group) async {
  return inventoryRepo.stockHighlights(group: group);
});

final invWarehousesProvider = FutureProvider.autoDispose<List<InvWarehouse>>((ref) async {
  return inventoryRepo.warehouses();
});

// Category tree for the item form's category / subcategory pickers. Cached
// (not autoDispose) so reopening the form doesn't refetch every time.
final invCategoryTreeProvider = FutureProvider<List<InvCategory>>((ref) async {
  return inventoryRepo.categoryTree();
});

final invOnHandProvider = FutureProvider.autoDispose
    .family<List<InvOnHandRow>, ({String? warehouseId, bool lowOnly, String? itemClassGroup})>((ref, args) async {
  return inventoryRepo.onHand(
    warehouseId: args.warehouseId,
    lowOnly: args.lowOnly,
    itemClassGroup: args.itemClassGroup,
  );
});

/// Perishables tile: window defaults match the Mfg home view (next 2 days
/// + already-expired). Kept narrow so the Mfg home doesn't pull a 30-day
/// list it would only slice down anyway.
final invExpiringProvider = FutureProvider.autoDispose
    .family<List<InvExpiringBatch>, int>((ref, withinDays) async {
  return inventoryRepo.expiring(withinDays: withinDays, includeExpired: true);
});

final invGrnListProvider = FutureProvider.autoDispose.family<List<InvGrn>, String?>((ref, status) async {
  return inventoryRepo.grnList(status: status);
});

final invGrnDetailProvider = FutureProvider.autoDispose
    .family<InvGrnDetail, String>((ref, id) async {
  return inventoryRepo.grnGet(id);
});

final invDnListProvider = FutureProvider.autoDispose.family<List<InvDn>, String?>((ref, status) async {
  return inventoryRepo.dnList(status: status);
});

final invDnDetailProvider = FutureProvider.autoDispose
    .family<InvDnDetail, String>((ref, id) async {
  return inventoryRepo.dnGet(id);
});

/// Invoices awaiting dispatch. Defaults to the last 60 days — see
/// SalesDispatchRepo.pending for why the floor exists.
final invPendingDispatchProvider =
    FutureProvider.autoDispose<PendingPage>((ref) async {
  final floor = DateTime.now().subtract(const Duration(days: 60));
  return salesDispatchRepo.pending(from: floor.toIso8601String().substring(0, 10));
});

/// (invoiceId, warehouseId) — availability and FEFO batches are per-warehouse.
final invDispatchPreviewProvider = FutureProvider.autoDispose
    .family<InvDispatchPreview, ({String invoiceId, String warehouseId})>((ref, arg) async {
  return salesDispatchRepo.preview(arg.invoiceId, arg.warehouseId);
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

// Item detail screen — masters record + stock-by-warehouse. Two providers
// kept separate so the warehouse breakdown can refresh on its own when a
// movement is posted, without re-pulling the masters record.
final invItemDetailProvider = FutureProvider.autoDispose
    .family<InvItemDetail, String>((ref, id) async {
  return inventoryRepo.itemDetail(id);
});

final invItemStockProvider = FutureProvider.autoDispose
    .family<List<InvItemStockRow>, String>((ref, id) async {
  return inventoryRepo.itemStock(id);
});

/// Invalidate every view derived from stock levels.
///
/// Call after anything that moves stock — adjustment, GRN, dispatch, transfer,
/// stock take, reclaim. Callers used to hand-pick one or two providers, so the
/// Home KPIs would update while the value breakdown, recent activity and
/// expiry tiles kept showing pre-movement numbers until a manual pull.
///
/// Passing a family provider invalidates all of its instances, which is what
/// we want: on-hand is keyed by (warehouse, filters) and any of those views
/// can be stale after a movement.
void invalidateStockViews(WidgetRef ref) {
  ref.invalidate(invKpisProvider);
  ref.invalidate(invRecentActivityProvider);
  ref.invalidate(invWarehouseValuesProvider);
  ref.invalidate(invStockHighlightsProvider);
  ref.invalidate(invOnHandProvider);
  ref.invalidate(invExpiringProvider);
  ref.invalidate(invReorderAlertsProvider);
}

// ── Analytics ────────────────────────────────────────────────────────────
// Every provider is keyed on the same window so the whole screen moves
// together when the period chip changes.

final invAnalyticsWindowProvider = StateProvider<int>((ref) => 90);

final invHealthProvider = FutureProvider.autoDispose<InvHealth>((ref) async {
  return inventoryRepo.analyticsHealth(window: ref.watch(invAnalyticsWindowProvider));
});

final invPerformanceProvider =
    FutureProvider.autoDispose<List<InvSkuPerformance>>((ref) async {
  return inventoryRepo.analyticsPerformance(
    window: ref.watch(invAnalyticsWindowProvider),
    limit: 200,
  );
});

final invStockRiskProvider = FutureProvider.autoDispose<InvStockRisk>((ref) async {
  return inventoryRepo.analyticsRisk(window: ref.watch(invAnalyticsWindowProvider));
});

final invForecastProvider = FutureProvider.autoDispose<InvForecast>((ref) async {
  return inventoryRepo.analyticsForecast(
    window: ref.watch(invAnalyticsWindowProvider),
  );
});

final invTrendProvider =
    FutureProvider.autoDispose<List<InvTrendPoint>>((ref) async {
  return inventoryRepo.analyticsTrend(months: 6);
});
