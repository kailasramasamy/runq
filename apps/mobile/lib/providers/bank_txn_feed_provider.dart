// Paged, filterable feed behind the "all transactions" banking screen.
//
// The banking hub shows only the ten most recent rows; this feed backs the
// full ledger, where an account with years of statements can run to thousands
// of transactions. Filtering happens server-side — narrowing a list we only
// hold one page of would silently drop matches sitting on page 40.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import 'auth_provider.dart';

const _pageSize = 30;

/// Direction filter. `all` leaves the `type` query param off entirely.
enum TxnDirection { all, credit, debit }

String _iso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The full filter state, and the family key for [bankTxnFeedProvider].
/// Value equality is what makes a filter change spin up a fresh feed instead
/// of appending new results onto the old list.
class BankTxnQuery {
  final String accountId;
  final TxnDirection direction;
  final DateTime? from, to;

  /// GL account id, or 'none' for uncategorized. Null = every category.
  final String? glAccountId;
  final String search;

  const BankTxnQuery({
    required this.accountId,
    this.direction = TxnDirection.all,
    this.from,
    this.to,
    this.glAccountId,
    this.search = '',
  });

  BankTxnQuery copyWith({
    TxnDirection? direction,
    DateTime? from,
    DateTime? to,
    String? glAccountId,
    String? search,
    bool clearDates = false,
    bool clearCategory = false,
  }) =>
      BankTxnQuery(
        accountId: accountId,
        direction: direction ?? this.direction,
        from: clearDates ? null : (from ?? this.from),
        to: clearDates ? null : (to ?? this.to),
        glAccountId: clearCategory ? null : (glAccountId ?? this.glAccountId),
        search: search ?? this.search,
      );

  bool get hasFilters =>
      direction != TxnDirection.all || from != null || to != null || glAccountId != null;

  bool get isDirty => hasFilters || search.trim().isNotEmpty;

  @override
  bool operator ==(Object other) =>
      other is BankTxnQuery &&
      other.accountId == accountId &&
      other.direction == direction &&
      other.from == from &&
      other.to == to &&
      other.glAccountId == glAccountId &&
      other.search.trim() == search.trim();

  @override
  int get hashCode =>
      Object.hash(accountId, direction, from, to, glAccountId, search.trim());
}

class BankTxnFeedState {
  final List<BankTxn> items;

  /// Server-side match count for the current filters — the list length only
  /// reflects the pages loaded so far.
  final int total;
  final bool loading, loadingMore, hasMore;
  final String? error;

  const BankTxnFeedState({
    this.items = const [],
    this.total = 0,
    this.loading = true,
    this.loadingMore = false,
    this.hasMore = false,
    this.error,
  });

  BankTxnFeedState copyWith({
    List<BankTxn>? items,
    int? total,
    bool? loading,
    bool? loadingMore,
    bool? hasMore,
    String? error,
    bool clearError = false,
  }) =>
      BankTxnFeedState(
        items: items ?? this.items,
        total: total ?? this.total,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        hasMore: hasMore ?? this.hasMore,
        error: clearError ? null : (error ?? this.error),
      );
}

class BankTxnFeed extends StateNotifier<BankTxnFeedState> {
  final BankTxnQuery query;
  int _page = 0;
  bool _inFlight = false;

  BankTxnFeed(this.query) : super(const BankTxnFeedState()) {
    refresh();
  }

  Future<void> refresh() async {
    _page = 0;
    state = const BankTxnFeedState();
    await _fetch(reset: true);
  }

  /// No-op when a fetch is already running or the last page is loaded, so the
  /// scroll listener can fire it freely.
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
      final res = await bankingRepo.transactions(
        query.accountId,
        page: next,
        limit: _pageSize,
        type: query.direction == TxnDirection.all ? null : query.direction.name,
        dateFrom: query.from == null ? null : _iso(query.from!),
        dateTo: query.to == null ? null : _iso(query.to!),
        glAccountId: query.glAccountId,
        search: query.search,
      );
      if (!mounted) return;
      _page = next;
      final items = reset ? res.data : [...state.items, ...res.data];
      state = BankTxnFeedState(
        items: items,
        total: res.total,
        loading: false,
        loadingMore: false,
        hasMore: items.length < res.total && res.data.isNotEmpty,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      state = state.copyWith(loading: false, loadingMore: false, error: e.message);
    } finally {
      _inFlight = false;
    }
  }
}

final bankTxnFeedProvider = StateNotifierProvider.autoDispose
    .family<BankTxnFeed, BankTxnFeedState, BankTxnQuery>((ref, q) {
  ref.watch(authProvider.select((s) => s.token));
  return BankTxnFeed(q);
});

/// Category options for the filter sheet — only the GL accounts this account's
/// transactions actually use.
final bankTxnCategoriesProvider =
    FutureProvider.family<List<BankTxnCategory>, String>((ref, accountId) async {
  ref.watch(authProvider.select((s) => s.token));
  return bankingRepo.txnCategories(accountId);
});

/// Size of the uncategorised backlog — the rows auto-categorization actually
/// acts on (`glAccountId IS NULL`), which is a different set from the
/// account's `unreconciledCount`. Derived from the categories breakdown so it
/// costs no extra endpoint.
final uncategorizedCountProvider =
    FutureProvider.family<int, String>((ref, accountId) async {
  final cats = await ref.watch(bankTxnCategoriesProvider(accountId).future);
  return cats.where((c) => c.id == 'none').firstOrNull?.count ?? 0;
});
