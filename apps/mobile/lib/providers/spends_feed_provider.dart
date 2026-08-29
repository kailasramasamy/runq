// Paged feed behind the Spends screen.
//
// Filtering and totalling both happen server-side: a range that covers a
// year runs to thousands of rows, and a header that summed only the pages
// loaded so far would climb as you scrolled.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/repos.dart';
import '../api/spends_models.dart';
import 'auth_provider.dart';

const _pageSize = 30;

/// Default window. Most of the question this screen answers is "what did we
/// spend lately", and an all-time default would open on an unreadable list.
const spendsDefaultDays = 30;

String _iso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Filter state and the family key — value equality is what makes a changed
/// filter start a fresh feed instead of appending onto the old list.
class SpendsQuery {
  final DateTime? from, to;
  final String search;

  const SpendsQuery({this.from, this.to, this.search = ''});

  SpendsQuery copyWith({
    DateTime? from,
    DateTime? to,
    String? search,
    bool clearDates = false,
  }) =>
      SpendsQuery(
        from: clearDates ? null : (from ?? this.from),
        to: clearDates ? null : (to ?? this.to),
        search: search ?? this.search,
      );

  @override
  bool operator ==(Object other) =>
      other is SpendsQuery &&
      other.from == from &&
      other.to == to &&
      other.search.trim() == search.trim();

  @override
  int get hashCode => Object.hash(from, to, search.trim());
}

class SpendsFeedState {
  final List<Spend> items;

  /// Server-side count and totals for the current filters — the loaded list
  /// is only as long as the pages fetched so far.
  final int total;
  final double settled, awaiting;
  final bool loading, loadingMore, hasMore;
  final String? error;

  const SpendsFeedState({
    this.items = const [],
    this.total = 0,
    this.settled = 0,
    this.awaiting = 0,
    this.loading = true,
    this.loadingMore = false,
    this.hasMore = false,
    this.error,
  });

  double get grandTotal => settled + awaiting;

  SpendsFeedState copyWith({
    bool? loading,
    bool? loadingMore,
    String? error,
  }) =>
      SpendsFeedState(
        items: items,
        total: total,
        settled: settled,
        awaiting: awaiting,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        hasMore: hasMore,
        error: error,
      );
}

class SpendsFeed extends StateNotifier<SpendsFeedState> {
  final SpendsQuery query;
  int _page = 0;
  bool _inFlight = false;

  SpendsFeed(this.query) : super(const SpendsFeedState()) {
    refresh();
  }

  Future<void> refresh() async {
    _page = 0;
    state = const SpendsFeedState();
    await _fetch(reset: true);
  }

  /// No-op while a fetch is running or the last page is in, so the scroll
  /// listener can fire it freely.
  Future<void> loadMore() async {
    if (_inFlight || !state.hasMore) return;
    state = state.copyWith(loadingMore: true);
    await _fetch(reset: false);
  }

  Future<void> _fetch({required bool reset}) async {
    if (_inFlight) return;
    _inFlight = true;
    final next = _page + 1;
    try {
      final res = await bankingRepo.spends(
        page: next,
        limit: _pageSize,
        dateFrom: query.from == null ? null : _iso(query.from!),
        dateTo: query.to == null ? null : _iso(query.to!),
        search: query.search,
      );
      if (!mounted) return;
      _page = next;
      final items = reset ? res.items : [...state.items, ...res.items];
      state = SpendsFeedState(
        items: items,
        total: res.total,
        settled: res.settled,
        awaiting: res.awaiting,
        loading: false,
        loadingMore: false,
        hasMore: items.length < res.total && res.items.isNotEmpty,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      state = state.copyWith(loading: false, loadingMore: false, error: e.message);
    } finally {
      _inFlight = false;
    }
  }
}

final spendsFeedProvider = StateNotifierProvider.autoDispose
    .family<SpendsFeed, SpendsFeedState, SpendsQuery>((ref, q) {
  ref.watch(authProvider.select((s) => s.token));
  return SpendsFeed(q);
});

/// Just the headline figure for the Money hub tile — one row fetched for its
/// totals, over the same default window the screen opens on.
final spendsLast30Provider = FutureProvider<SpendsPage>((ref) async {
  ref.watch(authProvider.select((s) => s.token));
  final now = DateTime.now();
  return bankingRepo.spends(
    limit: 1,
    dateFrom: _iso(now.subtract(const Duration(days: spendsDefaultDays))),
  );
});
