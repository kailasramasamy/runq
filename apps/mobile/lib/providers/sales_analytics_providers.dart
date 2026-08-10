// State + fetch for the sales analytics screen. The selected window lives in
// a provider rather than screen state so the range survives a push to an
// invoice and back.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/sales_analytics_models.dart';
import '../api/sales_analytics_repo.dart';
import 'auth_provider.dart';

/// Named windows offered as chips. `custom` is whatever the user picked in
/// the date-range sheet and is the only one that doesn't recompute from today.
enum SalesRangePreset { thisMonth, lastMonth, days90, thisFy, custom }

extension SalesRangePresetLabel on SalesRangePreset {
  String get label => switch (this) {
        SalesRangePreset.thisMonth => 'This month',
        SalesRangePreset.lastMonth => 'Last month',
        SalesRangePreset.days90 => '90 days',
        SalesRangePreset.thisFy => 'This FY',
        SalesRangePreset.custom => 'Custom',
      };
}

/// A resolved window. Equality matters — it keys the fetch provider, so two
/// identical ranges share one request instead of refetching.
class SalesRange {
  final DateTime from, to;
  final SalesRangePreset preset;
  const SalesRange({required this.from, required this.to, required this.preset});

  /// Indian FY: April 1 of the current FY through today.
  static SalesRange forPreset(SalesRangePreset preset, {DateTime? now}) {
    final today = _dateOnly(now ?? DateTime.now());
    return switch (preset) {
      SalesRangePreset.thisMonth => SalesRange(
          from: DateTime(today.year, today.month, 1), to: today, preset: preset),
      SalesRangePreset.lastMonth => SalesRange(
          from: DateTime(today.year, today.month - 1, 1),
          to: DateTime(today.year, today.month, 0),
          preset: preset),
      SalesRangePreset.days90 => SalesRange(
          from: today.subtract(const Duration(days: 89)), to: today, preset: preset),
      SalesRangePreset.thisFy => SalesRange(
          from: DateTime(today.month >= 4 ? today.year : today.year - 1, 4, 1),
          to: today,
          preset: preset),
      // A custom range has no formula — callers construct it from the sheet.
      SalesRangePreset.custom => SalesRange(
          from: DateTime(today.year, today.month, 1), to: today, preset: preset),
    };
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  @override
  bool operator ==(Object other) =>
      other is SalesRange &&
      other.from == from &&
      other.to == to &&
      other.preset == preset;

  @override
  int get hashCode => Object.hash(from, to, preset);
}

final salesRangeProvider = StateProvider<SalesRange>(
  (ref) => SalesRange.forPreset(SalesRangePreset.thisMonth),
);

/// Selected customer scope, or null for the whole tenant. The name rides
/// along so the pill can label itself without a second lookup.
class SalesCustomerScope {
  final String id, name;
  const SalesCustomerScope({required this.id, required this.name});
}

final salesCustomerProvider = StateProvider<SalesCustomerScope?>((ref) => null);

/// Everything that identifies one analytics fetch. Equality keys the family,
/// so switching to a customer and back reuses the cached tenant-wide result.
class SalesQuery {
  final SalesRange range;
  final String? customerId;
  const SalesQuery({required this.range, this.customerId});

  @override
  bool operator ==(Object other) =>
      other is SalesQuery && other.range == range && other.customerId == customerId;

  @override
  int get hashCode => Object.hash(range, customerId);
}

/// The query the screen is currently showing — range plus customer scope.
final salesQueryProvider = Provider<SalesQuery>((ref) => SalesQuery(
      range: ref.watch(salesRangeProvider),
      customerId: ref.watch(salesCustomerProvider)?.id,
    ));

final salesAnalyticsProvider =
    FutureProvider.family<SalesAnalytics, SalesQuery>((ref, query) async {
  ref.watch(authProvider.select((s) => s.token));
  return salesAnalyticsRepo.summary(
    from: query.range.from,
    to: query.range.to,
    customerId: query.customerId,
  );
});
