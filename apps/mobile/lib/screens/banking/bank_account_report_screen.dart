import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    final range = _resolveRange(period);
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
                    data: (r) => _ReportBody(report: r),
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
  const _ReportBody({required this.report});

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
        ReportCategoryList(items: cats),
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(_periodProvider);
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _RPeriod.values.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final p = _RPeriod.values[i];
          return _Pill(
            label: _periodLabel(p),
            active: period == p,
            onTap: () => ref.read(_periodProvider.notifier).state = p,
          );
        },
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Pill({required this.label, required this.active, required this.onTap});

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
          child: Text(label, style: RunqText.body.copyWith(color: active ? Colors.white : t.ink)),
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
