// State + fetch for the purchase analytics screen. Reuses SalesRange for the
// window — the presets and the FY rule are identical, and duplicating them
// would be two places to fix an off-by-one.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/purchase_analytics_models.dart';
import '../api/purchase_analytics_repo.dart';
import 'auth_provider.dart';
import 'sales_analytics_providers.dart' show SalesRange, SalesRangePreset;

final purchaseRangeProvider = StateProvider<SalesRange>(
  (ref) => SalesRange.forPreset(SalesRangePreset.thisMonth),
);

/// Selected vendor scope, or null for the whole tenant. The name rides along
/// so the selector can label itself without a second lookup.
class PurchaseVendorScope {
  final String id, name;
  const PurchaseVendorScope({required this.id, required this.name});
}

final purchaseVendorProvider = StateProvider<PurchaseVendorScope?>((ref) => null);

/// Everything that identifies one analytics fetch. Equality keys the family,
/// so switching to a vendor and back reuses the cached tenant-wide result.
class PurchaseQuery {
  final SalesRange range;
  final String? vendorId;
  const PurchaseQuery({required this.range, this.vendorId});

  @override
  bool operator ==(Object other) =>
      other is PurchaseQuery && other.range == range && other.vendorId == vendorId;

  @override
  int get hashCode => Object.hash(range, vendorId);
}

/// The query the screen is currently showing — range plus vendor scope.
final purchaseQueryProvider = Provider<PurchaseQuery>((ref) => PurchaseQuery(
      range: ref.watch(purchaseRangeProvider),
      vendorId: ref.watch(purchaseVendorProvider)?.id,
    ));

final purchaseAnalyticsProvider =
    FutureProvider.family<PurchaseAnalytics, PurchaseQuery>((ref, query) async {
  ref.watch(authProvider.select((s) => s.token));
  return purchaseAnalyticsRepo.summary(
    from: query.range.from,
    to: query.range.to,
    vendorId: query.vendorId,
  );
});
