import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../api/reports_models.dart';
import '../../providers/data_providers.dart';
import '../../providers/reports_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/section_head.dart';
import 'bank_account_report_widgets.dart';
import 'report_donut.dart';

enum _RPeriod { thisMonth, lastMonth, last6, fy }

enum _RTab { spend, income }

final _periodProvider = StateProvider<_RPeriod>((_) => _RPeriod.last6);

/// A user-picked range. When set it overrides [_periodProvider] — the preset
/// pills stay unlit until one is tapped, which clears this back to null.
final _customRangeProvider = StateProvider<DateRange?>((_) => null);
final _tabProvider = StateProvider<_RTab>((_) => _RTab.spend);

DateRange _resolveRange(_RPeriod p) => switch (p) {
      _RPeriod.thisMonth => currentMonthRange(),
      _RPeriod.lastMonth => lastMonthRange(),
      _RPeriod.last6 => last6MonthsRange(),
      _RPeriod.fy => currentFyRange(),
    };

String _periodLabel(_RPeriod p) => switch (p) {
      _RPeriod.thisMonth => 'This month',
      _RPeriod.lastMonth => 'Last month',
      _RPeriod.last6 => 'Last 6 months',
      _RPeriod.fy => 'This FY',
    };

class BankAccountReportScreen extends ConsumerWidget {
  final String accountId;
  const BankAccountReportScreen({super.key, required this.accountId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(_periodProvider);
    final custom = ref.watch(_customRangeProvider);
    final range = custom ?? _resolveRange(period);
    final report = ref.watch(bankAccountReportProvider((accountId, range)));
    final account = ref.watch(bankAccountsProvider).maybeWhen(
          data: (list) => list.where((a) => a.id == accountId).firstOrNull,
          orElse: () => null,
        );

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: RT(context).brand,
          onRefresh: () async {
            ref.invalidate(bankAccountReportProvider((accountId, range)));
            await ref.read(bankAccountReportProvider((accountId, range)).future).catchError((_) => throw 0);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              SliverToBoxAdapter(child: _Header(account: account)),
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverToBoxAdapter(child: _PeriodSwitcher()),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<BankAccountReport>(
                    value: report,
                    onRetry: () => ref.invalidate(bankAccountReportProvider((accountId, range))),
                    data: (r) => _ReportBody(report: r, accountId: accountId, range: range),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReportBody extends ConsumerWidget {
  final BankAccountReport report;
  final String accountId;
  final DateRange range;
  const _ReportBody({required this.report, required this.accountId, required this.range});

  static String _iso(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Opens the ledger already narrowed to exactly what this slice counted —
  /// same category, same period, same direction — so the list adds up to the
  /// number the user just tapped.
  void _openSlice(BuildContext context, CategoryAmount cat, _RTab tab) {
    final query = {
      // A null accountId on a slice means the report bucketed uncategorized
      // rows there, which the ledger expresses as the 'none' category.
      'category': cat.glAccountId ?? 'none',
      'from': _iso(range.from),
      'to': _iso(range.to),
      'dir': tab == _RTab.spend ? 'debit' : 'credit',
    };
    final qs = Uri(queryParameters: query).query;
    context.push('/money/banking/$accountId/transactions?$qs');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(_tabProvider);
    final cats = tab == _RTab.spend ? report.spendByCategory : report.incomeByCategory;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ReportHero(
          moneyIn: report.moneyIn,
          moneyOut: report.moneyOut,
          net: report.net,
          txnCount: report.txnCount,
        ),
        const SizedBox(height: 20),
        const SectionHead(title: 'Money in vs out'),
        InVsOutBars(months: report.byMonth),
        const SizedBox(height: 20),
        const _TabSwitcher(),
        const SizedBox(height: 12),
        RunqCard(
          padding: const EdgeInsets.all(16),
          child: ReportDonut(items: cats, caption: tab == _RTab.spend ? 'Spent' : 'Received'),
        ),
        const SizedBox(height: 12),
        SectionHead(title: tab == _RTab.spend ? 'Spend by category' : 'Income by source'),
        ReportCategoryList(
          items: cats,
          onTap: (c) => _openSlice(context, c, tab),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final BankAccount? account;
  const _Header({required this.account});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final name = account == null
        ? 'Account report'
        : (account!.bankName.isEmpty ? account!.name : account!.bankName);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Report', style: RunqText.body.copyWith(color: t.muted)),
                Text(name, style: RunqText.h2.copyWith(color: t.ink), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodSwitcher extends ConsumerWidget {
  const _PeriodSwitcher();

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  static String _fmt(DateTime d) => '${d.day} ${_months[d.month - 1]}';

  /// Years only appear when the range straddles two, so the common
  /// within-one-year case stays short enough to read on a pill.
  static String _rangeLabel(DateRange r) => r.from.year == r.to.year
      ? '${_fmt(r.from)} – ${_fmt(r.to)}'
      : "${_fmt(r.from)} '${r.from.year % 100} – ${_fmt(r.to)} '${r.to.year % 100}";

  Future<void> _pickCustom(BuildContext context, WidgetRef ref, DateRange? current) async {
    final today = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(today.year - 10),
      lastDate: today,
      initialDateRange:
          current == null ? null : DateTimeRange(start: current.from, end: current.to),
      saveText: 'Apply',
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: RunqColors.indigo),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    ref.read(_customRangeProvider.notifier).state = DateRange(picked.start, picked.end);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(_periodProvider);
    final custom = ref.watch(_customRangeProvider);
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _RPeriod.values.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          // Custom sits last: the presets cover the common cases, so it reads
          // as the escape hatch rather than the first thing to reach for.
          if (i == _RPeriod.values.length) {
            return _Pill(
              label: custom == null ? 'Custom range' : _rangeLabel(custom),
              active: custom != null,
              icon: Icons.date_range_rounded,
              onTap: () => _pickCustom(context, ref, custom),
            );
          }
          final p = _RPeriod.values[i];
          return _Pill(
            label: _periodLabel(p),
            active: custom == null && period == p,
            onTap: () {
              ref.read(_customRangeProvider.notifier).state = null;
              ref.read(_periodProvider.notifier).state = p;
            },
          );
        },
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final bool active;
  final IconData? icon;
  final VoidCallback onTap;
  const _Pill({required this.label, required this.active, required this.onTap, this.icon});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? RunqColors.indigo : t.surface,
            border: Border.all(color: active ? RunqColors.indigo : t.hairline, width: 0.5),
            borderRadius: BorderRadius.circular(999),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: active ? Colors.white : t.muted),
                const SizedBox(width: 6),
              ],
              Text(label, style: RunqText.body.copyWith(color: active ? Colors.white : t.ink)),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabSwitcher extends ConsumerWidget {
  const _TabSwitcher();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(_tabProvider);
    final t = RT(context);
    return Container(
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          for (final tt in _RTab.values)
            Expanded(
              child: _SegmentItem(
                label: tt == _RTab.spend ? 'Spend' : 'Income',
                active: tab == tt,
                onTap: () => ref.read(_tabProvider.notifier).state = tt,
              ),
            ),
        ],
      ),
    );
  }
}

class _SegmentItem extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _SegmentItem({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            boxShadow: active ? RunqShadows.card : null,
          ),
          child: Text(label, style: RunqText.body.copyWith(color: active ? t.ink : t.muted)),
        ),
      ),
    );
  }
}
