// Every rupee that left, in one list: bank debits across all accounts plus
// payments captured here that the statement hasn't caught up with yet.
//
// AP vendor payments are deliberately not a third source — reconciliation
// creates them *from* bank debits, so counting both would double the spend.

library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/spends_models.dart';
import '../providers/spends_feed_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/async_slot.dart';
import '../widgets/list_filter_kit.dart';

/// Typing rebuilds the query and every distinct query is a request, so hold
/// keystrokes briefly rather than firing one search per character.
const _searchDebounce = Duration(milliseconds: 350);

/// Distance from the bottom at which the next page is requested, so the
/// spinner rarely becomes visible.
const _loadMoreThreshold = 600.0;

class SpendsScreen extends ConsumerStatefulWidget {
  const SpendsScreen({super.key});

  @override
  ConsumerState<SpendsScreen> createState() => _SpendsScreenState();
}

class _SpendsScreenState extends ConsumerState<SpendsScreen> {
  final _scroll = ScrollController();
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  late SpendsQuery _query = SpendsQuery(
    from: DateTime.now().subtract(const Duration(days: spendsDefaultDays)),
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
    if (_scroll.position.pixels >=
        _scroll.position.maxScrollExtent - _loadMoreThreshold) {
      ref.read(spendsFeedProvider(_query).notifier).loadMore();
    }
  }

  /// Any filter change jumps back to the top — staying deep in a list you
  /// just narrowed lands on blank space that reads as "no results".
  void _apply(SpendsQuery q) {
    if (q == _query) return;
    setState(() => _query = q);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(_searchDebounce, () => _apply(_query.copyWith(search: value)));
  }

  Future<void> _pickRange() async {
    final result = await showDateRangeSheet(context,
        initialFrom: _query.from, initialTo: _query.to);
    if (result == null) return;
    _apply(SpendsQuery(
      from: result.from,
      to: result.to,
      search: _query.search,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final state = ref.watch(spendsFeedProvider(_query));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(t: t),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: FilterPill(
                      label: listRangeLabel(_query.from, _query.to),
                      active: _query.from != null || _query.to != null,
                      trailing: Icons.keyboard_arrow_down_rounded,
                      onTap: _pickRange,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _Totals(state: state),
                  const SizedBox(height: 12),
                  ListSearchField(
                    controller: _searchCtrl,
                    onChanged: (v) {
                      setState(() {}); // keeps the clear button in step
                      _onSearch(v);
                    },
                    hint: 'Search payee, category, reference…',
                  ),
                ],
              ),
            ),
            Expanded(child: _list(state)),
          ],
        ),
      ),
    );
  }

  Widget _list(SpendsFeedState state) {
    if (state.loading) {
      return Center(child: CircularProgressIndicator(color: RT(context).brand));
    }
    if (state.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(state.error!,
              textAlign: TextAlign.center,
              style: RunqText.body.copyWith(color: RT(context).muted)),
        ),
      );
    }
    if (state.items.isEmpty) {
      return const EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'No spends',
        subtitle: 'Nothing left the bank in this window. Widen the dates.',
      );
    }

    final days = groupByDay<Spend>(state.items, (s) => s.date);
    return RefreshIndicator(
      color: RT(context).brand,
      onRefresh: () => ref.read(spendsFeedProvider(_query).notifier).refresh(),
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
        itemCount: days.length + (state.loadingMore ? 1 : 0),
        itemBuilder: (_, i) {
          if (i >= days.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final day = days[i];
          return _DaySection(day: day.day, spends: day.items);
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final RunqTokens t;
  const _Header({required this.t});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(child: Text('Spends', style: RunqText.h1.copyWith(color: t.ink))),
        ],
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  final SpendsFeedState state;
  const _Totals({required this.state});

  @override
  Widget build(BuildContext context) {
    // Awaiting is called out separately rather than folded in silently: it is
    // money gone but not yet on a statement, and the difference is exactly
    // what someone reconciling needs to see.
    final awaiting = state.awaiting;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: ListStatCard(
              icon: Icons.receipt_long_rounded,
              label: state.total == 1 ? 'PAYMENT' : 'PAYMENTS',
              value: '${state.total}',
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ListStatCard(
              icon: Icons.trending_down_rounded,
              label: awaiting > 0 ? 'PAID · INCL. AWAITING' : 'PAID',
              value: formatINR(state.grandTotal, compact: true),
              tinted: true,
            ),
          ),
        ],
      ),
    );
  }
}

/// One day's spends as a single card. The day is stated once in the header
/// above the card, so the rows carry no date of their own — repeating it on
/// every line just crowded the payee out.
class _DaySection extends StatelessWidget {
  final DateTime day;
  final List<Spend> spends;
  const _DaySection({required this.day, required this.spends});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final dayTotal = spends.fold<double>(0, (s, e) => s + e.amount);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Expanded(child: ListDayHeader(day: day)),
            Text(formatINR(dayTotal, compact: true),
                style: RunqText.tabular(size: 13, w: FontWeight.w600, color: t.muted)),
          ],
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (var i = 0; i < spends.length; i++) ...[
                if (i > 0) Divider(height: 0.5, thickness: 0.5, color: t.hairlineSoft),
                _SpendRow(spend: spends[i]),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }
}

class _SpendRow extends StatelessWidget {
  final Spend spend;
  const _SpendRow({required this.spend});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(spend.title,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Row(
                  children: [
                    if (spend.isAwaiting) ...[
                      const _AwaitingChip(),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        spend.category ?? spend.accountName,
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(formatINR(spend.amount),
              style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
        ],
      ),
    );
  }
}

class _AwaitingChip extends StatelessWidget {
  const _AwaitingChip();

  @override
  Widget build(BuildContext context) {
    const amber = Color(0xFFB45309);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: amber.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text('AWAITING BANK',
          style: RunqText.micro.copyWith(color: amber, fontWeight: FontWeight.w700)),
    );
  }
}
