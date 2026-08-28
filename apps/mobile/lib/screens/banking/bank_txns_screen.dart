// The full bank-statement ledger for one account: every transaction, filtered
// and searched server-side, loaded a page at a time as you scroll.
//
// The banking hub deliberately shows only the ten most recent rows. This is
// where a statement is actually worked through, so an account with years of
// history must never try to hold itself in memory at once — and narrowing must
// reach the whole ledger, not just the page currently loaded.

library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../api/repos.dart';
import '../../providers/bank_txn_feed_provider.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/list_filter_kit.dart';
import '../../widgets/runq_snack.dart';
import '../../widgets/sparkle.dart';
import 'bank_txn_filters.dart';
import 'txn_row.dart';

/// Typing rebuilds the query, and every distinct query is a fresh request —
/// so hold keystrokes briefly rather than firing one search per character.
const _searchDebounce = Duration(milliseconds: 350);

/// How close to the bottom (in pixels) the scroll gets before the next page
/// is requested, so the spinner rarely becomes visible.
const _loadMoreThreshold = 600.0;

class BankTxnsScreen extends ConsumerStatefulWidget {
  final String accountId;

  /// Pre-applied filters, set when arriving from a report slice ("spend on
  /// Freight, this quarter") rather than from the banking hub. They seed the
  /// filter bar, which stays fully editable from there.
  final String? initialCategoryId;
  final DateTime? initialFrom, initialTo;
  final TxnDirection initialDirection;

  const BankTxnsScreen({
    super.key,
    required this.accountId,
    this.initialCategoryId,
    this.initialFrom,
    this.initialTo,
    this.initialDirection = TxnDirection.all,
  });

  @override
  ConsumerState<BankTxnsScreen> createState() => _BankTxnsScreenState();
}

class _BankTxnsScreenState extends ConsumerState<BankTxnsScreen> {
  final _scroll = ScrollController();
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  late BankTxnQuery _query = BankTxnQuery(
    accountId: widget.accountId,
    direction: widget.initialDirection,
    from: widget.initialFrom,
    to: widget.initialTo,
    glAccountId: widget.initialCategoryId,
  );

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - _loadMoreThreshold) {
      ref.read(bankTxnFeedProvider(_query).notifier).loadMore();
    }
  }

  /// Any filter change jumps back to the top — staying at scroll position
  /// 4,000 in a list you just narrowed lands on blank space that reads as
  /// "no results".
  void _apply(BankTxnQuery q) {
    if (q == _query) return;
    setState(() => _query = q);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(_searchDebounce, () => _apply(_query.copyWith(search: value)));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final state = ref.watch(bankTxnFeedProvider(_query));
    final account = ref.watch(bankAccountsProvider).maybeWhen(
          data: (list) => list.where((a) => a.id == widget.accountId).firstOrNull,
          orElse: () => null,
        );

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(account: account),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Column(
                children: [
                  ListSearchField(
                    controller: _searchCtrl,
                    onChanged: (v) {
                      setState(() {}); // keeps the clear button in step
                      _onSearch(v);
                    },
                    hint: 'Search name, amount, description, reference…',
                  ),
                  const SizedBox(height: 12),
                  BankTxnFilterBar(query: _query, onChanged: _apply),
                ],
              ),
            ),
            _ResultCount(state: state, dirty: _query.isDirty),
            Expanded(
              child: RefreshIndicator(
                color: t.brand,
                onRefresh: () async {
                  ref.invalidate(bankTxnCategoriesProvider(widget.accountId));
                  await ref.read(bankTxnFeedProvider(_query).notifier).refresh();
                },
                child: _TxnList(
                  state: state,
                  scroll: _scroll,
                  dirty: _query.isDirty,
                  onRetry: () => ref.read(bankTxnFeedProvider(_query).notifier).refresh(),
                ),
              ),
            ),
            // Only offered while the list IS the uncategorised backlog, so the
            // button's count and the rows above it always agree.
            if (_query.glAccountId == 'none' && state.items.isNotEmpty)
              _AutoCategorizeBar(
                accountId: widget.accountId,
                count: state.total,
                onDone: () {
                  ref.invalidate(bankTxnCategoriesProvider(widget.accountId));
                  ref.invalidate(bankAccountsProvider);
                  ref.invalidate(bankTxnsProvider(widget.accountId));
                  ref.read(bankTxnFeedProvider(_query).notifier).refresh();
                },
              ),
          ],
        ),
      ),
    );
  }
}

/// Runs auto-categorization over the account's uncategorised rows. It posts
/// journal entries and can create bills and receipts, so it is a deliberate
/// button under the list it will act on rather than a tap on the hub.
class _AutoCategorizeBar extends StatefulWidget {
  final String accountId;
  final int count;
  final VoidCallback onDone;
  const _AutoCategorizeBar({
    required this.accountId,
    required this.count,
    required this.onDone,
  });

  @override
  State<_AutoCategorizeBar> createState() => _AutoCategorizeBarState();
}

class _AutoCategorizeBarState extends State<_AutoCategorizeBar> {
  bool _running = false;

  Future<void> _run() async {
    setState(() => _running = true);
    try {
      final n = await bankingRepo.categorize(widget.accountId);
      if (!mounted) return;
      widget.onDone();
      showRunqSnack(
        context,
        n == 0 ? 'Nothing could be categorized automatically' : 'Categorized $n transactions',
        kind: n == 0 ? SnackKind.info : SnackKind.success,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 48,
          child: FilledButton(
            onPressed: _running ? null : _run,
            child: _running
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Sparkle(size: 16, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(
                        widget.count == 1
                            ? 'Auto-categorize 1 transaction'
                            : 'Auto-categorize ${widget.count} transactions',
                        style: RunqText.bodyStrong.copyWith(color: Colors.white),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final BankAccount? account;
  const _Header({required this.account});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => context.pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('All transactions', style: RunqText.h2.copyWith(color: t.ink)),
                if (account != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    account!.name,
                    style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "N transactions" — the server-side match count, not the number of rows
/// loaded so far, so scrolling never makes the total appear to grow.
class _ResultCount extends StatelessWidget {
  final BankTxnFeedState state;
  final bool dirty;
  const _ResultCount({required this.state, required this.dirty});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (state.loading || state.error != null) return const SizedBox(height: 4);
    final n = state.total;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: Row(
        children: [
          Text(
            n == 1 ? '1 transaction' : '$n transactions',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          if (dirty) ...[
            const SizedBox(width: 6),
            Text('· filtered', style: RunqText.caption.copyWith(color: t.brand)),
          ],
        ],
      ),
    );
  }
}

class _TxnList extends StatelessWidget {
  final BankTxnFeedState state;
  final ScrollController scroll;
  final bool dirty;
  final VoidCallback onRetry;
  const _TxnList({
    required this.state,
    required this.scroll,
    required this.dirty,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    if (state.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null && state.items.isEmpty) {
      return _Scrollable(
        scroll: scroll,
        children: [
          const SizedBox(height: 60),
          _LoadError(message: state.error!, onRetry: onRetry),
        ],
      );
    }
    if (state.items.isEmpty) {
      return _Scrollable(
        scroll: scroll,
        children: [
          const SizedBox(height: 60),
          EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'No transactions',
            subtitle: dirty
                ? 'Nothing matches these filters. Try widening the date range or clearing the search.'
                : 'Import a statement to get started.',
          ),
        ],
      );
    }

    // groupTxnsByDate returns a flat day-header/row list, so the builder still
    // creates only what is on screen.
    final rows = groupTxnsByDate(state.items);
    return ListView.builder(
      controller: scroll,
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 100),
      itemCount: rows.length + 1,
      itemBuilder: (_, i) {
        if (i < rows.length) return rows[i];
        return _Footer(state: state);
      },
    );
  }
}

class _LoadError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _LoadError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        children: [
          Icon(Icons.cloud_off_rounded, size: 34, color: t.muted2),
          const SizedBox(height: 12),
          Text(message,
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 14),
          FilledButton.tonal(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _Scrollable extends StatelessWidget {
  final ScrollController scroll;
  final List<Widget> children;
  const _Scrollable({required this.scroll, required this.children});

  @override
  Widget build(BuildContext context) => ListView(
        controller: scroll,
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: children,
      );
}

class _Footer extends StatelessWidget {
  final BankTxnFeedState state;
  const _Footer({required this.state});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (state.loadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 22),
        child: Center(
          child: SizedBox(
            width: 20, height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    // A page failure keeps whatever already loaded on screen and offers the
    // retry inline, rather than throwing the whole list away.
    if (state.error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 24),
        child: Text(
          state.error!,
          textAlign: TextAlign.center,
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      );
    }
    if (!state.hasMore && state.items.isNotEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Center(
          child: Text('End of statement', style: RunqText.caption.copyWith(color: t.muted2)),
        ),
      );
    }
    return const SizedBox(height: 40);
  }
}
