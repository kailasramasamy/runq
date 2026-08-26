// Riverpod providers for the Inventory module.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/inventory_models.dart';
import '../api/inventory_movement_models.dart';
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
/// The queue's date floor. Without one, a tenant that invoiced for years
/// before dispatch tracking existed opens this list on its whole back
/// catalogue — so the count, the list and "Dispatch all" all use this same
/// window, and mean the same thing by "pending".
String invPendingDispatchFrom() => DateTime.now()
    .subtract(const Duration(days: 60))
    .toIso8601String()
    .substring(0, 10);

final invPendingDispatchProvider =
    FutureProvider.autoDispose<PendingPage>((ref) async {
  return salesDispatchRepo.pending(from: invPendingDispatchFrom());
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

/// Active filter on the Stock Alerts screen: 'all' | 'out' | 'low'.
final invAlertStatusProvider = StateProvider.autoDispose<String>((ref) => 'all');

/// Warehouse filter on the Stock Alerts screen. Null = every warehouse.
final invAlertWarehouseProvider = StateProvider.autoDispose<String?>((ref) => null);

/// Free-text filter on the Stock Alerts screen.
final invAlertSearchProvider = StateProvider.autoDispose<String>((ref) => '');

/// The alert list for the current filters. Watching the filter providers
/// means changing a chip refetches without the screen wiring it by hand.
final invStockAlertsProvider =
    FutureProvider.autoDispose<List<InvStockAlert>>((ref) async {
  return inventoryRepo.stockAlerts(
    status: ref.watch(invAlertStatusProvider),
    warehouseId: ref.watch(invAlertWarehouseProvider),
    search: ref.watch(invAlertSearchProvider),
  );
});

/// Counts for the summary strip and the Alerts tab badge. Deliberately
/// independent of the list filters so the strip always shows the full
/// picture even while the list is narrowed to one warehouse.
final invStockAlertCountsProvider =
    FutureProvider.autoDispose<InvStockAlertCounts>((ref) async {
  return inventoryRepo.stockAlertCounts();
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

/// Item audit trail, keyed by the full filter so paging and the in/out
/// toggle each get their own cache entry.
final invItemMovementsProvider = FutureProvider.autoDispose
    .family<InvMovementPage, InvMovementQuery>((ref, q) async {
  return inventoryRepo.itemMovements(q);
});

/// Negotiated prices covering this item. Separate from the masters record
/// so editing item pricing doesn't force a re-fetch of the price lists.
final invItemPriceListsProvider = FutureProvider.autoDispose
    .family<List<InvItemPriceLine>, String>((ref, id) async {
  return inventoryRepo.itemPriceLists(id);
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

final invReplenishmentProvider =
    FutureProvider.autoDispose<InvReplenishment>((ref) async {
  return inventoryRepo.analyticsReplenishment(
    window: ref.watch(invAnalyticsWindowProvider),
  );
});

/// Filters for the daily write-off register. Null dates let the server default
/// to the last 30 days; null reason means every loss reason.
typedef InvWriteOffParams = ({String? from, String? to, String? warehouseId, String? reason});

final invWriteOffsProvider = FutureProvider.autoDispose
    .family<InvWriteOffReport, InvWriteOffParams>((ref, p) async {
  return inventoryRepo.writeOffs(
    from: p.from,
    to: p.to,
    warehouseId: p.warehouseId,
    reason: p.reason,
  );
});
