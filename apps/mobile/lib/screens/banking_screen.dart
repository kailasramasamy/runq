import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/bank_logo.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/sparkle.dart';

final _selectedAccountProvider = StateProvider<String?>((_) => null);

enum _ReconFilter { all, unmatched, matched }

final _reconFilterProvider = StateProvider<_ReconFilter>((_) => _ReconFilter.all);

class BankingScreen extends ConsumerWidget {
  const BankingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(bankAccountsProvider);
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: RT(context).brand,
        onRefresh: () async {
          ref.invalidate(bankAccountsProvider);
          final selected = ref.read(_selectedAccountProvider);
          if (selected != null) ref.invalidate(bankTxnsProvider(selected));
          await ref.read(bankAccountsProvider.future).catchError((_) => throw 0);
        },
        child: AsyncSlot<List<BankAccount>>(
          value: accounts,
          onRetry: () => ref.invalidate(bankAccountsProvider),
          data: (list) {
            if (list.isEmpty) {
              return ListView(children: [
                _BankingHeader(
                  accountCount: 0,
                  totalBalance: 0,
                  onRefresh: () => ref.invalidate(bankAccountsProvider),
                ),
                const SizedBox(height: 80),
                const EmptyState(
                  icon: Icons.account_balance_outlined,
                  title: 'No bank accounts yet',
                  subtitle: 'Add one in the web app to start reconciling.',
                ),
              ]);
            }
            final selectedId = ref.watch(_selectedAccountProvider) ?? list.first.id;
            final selected = list.firstWhere((a) => a.id == selectedId, orElse: () => list.first);
            return _Body(accounts: list, selected: selected);
          },
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final List<BankAccount> accounts;
  final BankAccount selected;
  const _Body({required this.accounts, required this.selected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txns = ref.watch(bankTxnsProvider(selected.id));
    final filter = ref.watch(_reconFilterProvider);
    final total = accounts.fold<double>(0, (s, a) => s + a.currentBalance);

    // Match count for the *currently selected* account, derived from its
    // loaded txns. Other accounts don't get a badge — we don't preload all
    // of their txns just to show a count.
    final selectedMatchCount = txns.maybeWhen(
      data: (page) => page.data.where((t) => t.reconStatus == 'unreconciled').length,
      orElse: () => 0,
    );

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        SliverToBoxAdapter(
          child: _BankingHeader(
            accountCount: accounts.length,
            totalBalance: total,
            onRefresh: () {
              ref.invalidate(bankAccountsProvider);
              ref.invalidate(bankTxnsProvider(selected.id));
            },
          ),
        ),
        SliverToBoxAdapter(
          child: _AccountCardStrip(
            accounts: accounts,
            selectedId: selected.id,
            selectedMatchCount: selectedMatchCount,
            onSelect: (id) => ref.read(_selectedAccountProvider.notifier).state = id,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          sliver: SliverToBoxAdapter(child: _AiReconcileBanner(accountId: selected.id)),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          sliver: SliverToBoxAdapter(
            child: _FilterPills(
              active: filter,
              onChange: (f) => ref.read(_reconFilterProvider.notifier).state = f,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: AsyncSlot<PaginatedResponse<BankTxn>>(
            value: txns,
            onRetry: () => ref.invalidate(bankTxnsProvider(selected.id)),
            data: (page) {
              final items = _filterItems(page.data, filter);
              if (items.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'No transactions',
                    subtitle: 'Import a statement or change the filter.',
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: _groupAndRender(items),
              );
            },
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 120)),
      ],
    );
  }

  List<BankTxn> _filterItems(List<BankTxn> items, _ReconFilter f) {
    return switch (f) {
      _ReconFilter.all => items,
      _ReconFilter.unmatched => items.where((t) => t.reconStatus == 'unreconciled').toList(),
      _ReconFilter.matched =>
          items.where((t) => t.reconStatus == 'matched' || t.reconStatus == 'manually_matched').toList(),
    };
  }

  List<Widget> _groupAndRender(List<BankTxn> items) {
    final byDate = <String, List<BankTxn>>{};
    for (final t in items) {
      final key = '${t.transactionDate.year}-${t.transactionDate.month.toString().padLeft(2, '0')}-${t.transactionDate.day.toString().padLeft(2, '0')}';
      byDate.putIfAbsent(key, () => []).add(t);
    }
    final sortedKeys = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
    final widgets = <Widget>[];
    final today = DateTime.now();
    for (final k in sortedKeys) {
      final list = byDate[k]!;
      final d = list.first.transactionDate;
      const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      final isToday = d.year == today.year && d.month == today.month && d.day == today.day;
      final isYesterday = today.difference(d).inDays == 1;
      final label = isToday
          ? 'Today · ${d.day} ${m[d.month - 1]}'
          : isYesterday
              ? 'Yesterday · ${d.day} ${m[d.month - 1]}'
              : '${d.day} ${m[d.month - 1]}';
      widgets.add(_DateHeader(label: label));
      for (var i = 0; i < list.length; i++) {
        widgets.add(Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, i == list.length - 1 ? 0 : 8),
          child: _TxnRow(txn: list[i]),
        ));
      }
      widgets.add(const SizedBox(height: 8));
    }
    return widgets;
  }
}

class _BankingHeader extends StatelessWidget {
  final int accountCount;
  final double totalBalance;
  final VoidCallback onRefresh;
  const _BankingHeader({
    required this.accountCount,
    required this.totalBalance,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final countLabel = accountCount == 0
        ? 'No accounts'
        : '$accountCount ${accountCount == 1 ? 'account' : 'accounts'} · ${formatINR(totalBalance)}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 16, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Banking', style: RunqText.h1.copyWith(color: t.ink, fontSize: 28)),
                const SizedBox(height: 4),
                Text(
                  countLabel,
                  style: RunqText.caption.copyWith(color: t.muted, fontSize: 13),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          _IconChip(icon: Icons.refresh_rounded, onTap: onRefresh),
        ],
      ),
    );
  }
}

class _IconChip extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _IconChip({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 18, color: t.ink),
        ),
      ),
    );
  }
}

/// Horizontally-scrolling strip of account cards. Each card shows the bank
/// logo + name, balance as the dominant element, and `··· last4 · type`
/// caption. The currently selected account renders an indigo border so the
/// transaction list below has an obvious anchor.
class _AccountCardStrip extends StatelessWidget {
  final List<BankAccount> accounts;
  final String selectedId;
  /// Unmatched-txn count for the currently selected account (computed from
  /// loaded txns). Other cards don't get a badge — we don't preload all
  /// accounts' txns just for the count.
  final int selectedMatchCount;
  final ValueChanged<String> onSelect;
  const _AccountCardStrip({
    required this.accounts,
    required this.selectedId,
    required this.selectedMatchCount,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 142,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: accounts.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final a = accounts[i];
          final isSelected = a.id == selectedId;
          return _AccountCard(
            account: a,
            selected: isSelected,
            matchCount: isSelected ? selectedMatchCount : 0,
            onTap: () => onSelect(a.id),
          );
        },
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  final BankAccount account;
  final bool selected;
  final int matchCount;
  final VoidCallback onTap;
  const _AccountCard({
    required this.account,
    required this.selected,
    required this.matchCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final bankName = account.bankName.isEmpty ? account.name : account.bankName;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 196,
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? RunqColors.indigo : t.hairline,
              width: selected ? 1.4 : 0.5,
            ),
            boxShadow: [
              BoxShadow(color: t.hairlineSoft, blurRadius: 3, offset: const Offset(0, 1)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  BankLogo(bankName: bankName, logoUrl: account.logoUrl, size: 32),
                  const Spacer(),
                  if (matchCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: RunqColors.amberBg,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '$matchCount to match',
                        style: RunqText.caption.copyWith(
                          color: RunqColors.amberInk,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                bankName,
                style: RunqText.body.copyWith(color: t.muted, fontSize: 13),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                formatINR(account.currentBalance),
                style: RunqText.tabular(size: 18, w: FontWeight.w700, color: t.ink),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
              const Spacer(),
              Text(
                '${account.masked} · ${_typeLabel(account.accountType)}',
                style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _typeLabel(String t) => switch (t) {
        'current' => 'Current',
        'savings' => 'Savings',
        'overdraft' => 'Overdraft',
        'cash_credit' => 'Cash credit',
        _ => t,
      };
}

class _AiReconcileBanner extends ConsumerStatefulWidget {
  final String accountId;
  const _AiReconcileBanner({required this.accountId});

  @override
  ConsumerState<_AiReconcileBanner> createState() => _AiReconcileBannerState();
}

class _AiReconcileBannerState extends ConsumerState<_AiReconcileBanner> {
  bool _running = false;

  Future<void> _categorize() async {
    setState(() => _running = true);
    try {
      final n = await bankingRepo.categorize(widget.accountId);
      if (!mounted) return;
      ref.invalidate(bankTxnsProvider(widget.accountId));
      showRunqSnack(
        context,
        n == 0 ? 'Nothing to categorize' : 'Categorized $n transactions',
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bannerBg = isDark ? RunqColors.indigo.withValues(alpha: 0.18) : const Color(0xFFEEF2FF);
    final bannerBorder = isDark ? RunqColors.indigo.withValues(alpha: 0.28) : const Color(0xFFC7D2FE);
    final bannerInk = isDark ? RunqColors.indigoLight : RunqColors.indigoDeep;
    return InkWell(
      onTap: _running ? null : _categorize,
      borderRadius: BorderRadius.circular(RunqRadii.input),
      child: Container(
        padding: EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: bannerBg,
          borderRadius: BorderRadius.circular(RunqRadii.input),
          border: Border.all(color: bannerBorder, width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: RT(context).surface, borderRadius: BorderRadius.circular(10)),
              child: _running
                  ? Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand)))
                  : Center(child: Sparkle(size: 18, color: RT(context).brand, animated: true)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_running ? 'Categorising…' : 'Auto-categorize transactions',
                      style: RunqText.bodyStrong.copyWith(color: bannerInk, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text('Apply rules + AI suggestions to unreconciled rows',
                      style: RunqText.caption.copyWith(color: bannerInk, fontSize: 11)),
                ],
              ),
            ),
            Text('Run →',
                style: RunqText.caption.copyWith(color: RT(context).brand, fontWeight: FontWeight.w600, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

class _FilterPills extends StatelessWidget {
  final _ReconFilter active;
  final ValueChanged<_ReconFilter> onChange;
  const _FilterPills({required this.active, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final pills = const [
      (_ReconFilter.all, 'All'),
      (_ReconFilter.unmatched, 'Uncategorized'),
      (_ReconFilter.matched, 'Matched'),
    ];
    return Row(
      children: [
        for (var i = 0; i < pills.length; i++) ...[
          _FilterPill(label: pills[i].$2, active: pills[i].$1 == active, onTap: () => onChange(pills[i].$1)),
          if (i < pills.length - 1) const SizedBox(width: 6),
        ],
      ],
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _FilterPill({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? RunqColors.indigo : t.surface,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? RunqColors.indigo : t.hairline,
              width: active ? 1.0 : 0.5,
            ),
          ),
          child: Text(
            label,
            style: RunqText.bodyStrong.copyWith(
              fontSize: 12,
              color: active ? Colors.white : t.muted,
            ),
          ),
        ),
      ),
    );
  }
}

class _DateHeader extends StatelessWidget {
  final String label;
  const _DateHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      color: t.bgWarm,
      padding: const EdgeInsets.fromLTRB(20, 8, 16, 8),
      child: Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted2)),
    );
  }
}

class _TxnRow extends StatelessWidget {
  final BankTxn txn;
  const _TxnRow({required this.txn});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isIn = txn.isCredit;

    final dirBg = isIn
        ? (isDark ? RunqColors.greenInk.withValues(alpha: 0.20) : RunqColors.greenBg)
        : (isDark ? RunqColors.redInk.withValues(alpha: 0.20) : RunqColors.redBg);
    final dirInk = isIn
        ? (isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk)
        : (isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk);

    return RunqCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: dirBg, shape: BoxShape.circle),
            child: Icon(
              isIn ? Icons.south_rounded : Icons.north_rounded,
              size: 18,
              color: dirInk,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  txn.narration ?? txn.reference ?? 'Transaction',
                  style: RunqText.bodyStrong.copyWith(fontSize: 13, color: t.ink),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                _ReconChip(txn: txn),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${isIn ? '+' : '−'}${formatINR(txn.amount.abs())}',
            style: RunqText.tabular(
              size: 15,
              w: FontWeight.w700,
              color: isIn ? dirInk : t.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReconChip extends StatelessWidget {
  final BankTxn txn;
  const _ReconChip({required this.txn});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (txn.reconStatus == 'matched' || txn.reconStatus == 'manually_matched') {
      final label = txn.vendorName ?? txn.customerName ?? txn.glAccountName ?? 'Matched';
      final bg = isDark ? RunqColors.greenInk.withValues(alpha: 0.18) : RunqColors.greenBg;
      final ink = isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk;
      return _Pill(
        bg: bg, ink: ink, icon: Icons.check_rounded,
        label: label,
      );
    }
    if (txn.glAccountName != null) {
      final bg = isDark ? RunqColors.purpleInk.withValues(alpha: 0.20) : RunqColors.purpleBg;
      final ink = isDark ? const Color(0xFFC4B5FD) : RunqColors.purpleInk;
      return _Pill(
        bg: bg, ink: ink, icon: null, sparkle: true,
        label: 'Suggested: ${txn.glAccountName}',
      );
    }
    return Text('Uncategorised', style: RunqText.caption.copyWith(fontSize: 11, color: t.muted2));
  }
}

class _Pill extends StatelessWidget {
  final Color bg, ink;
  final IconData? icon;
  final bool sparkle;
  final String label;
  const _Pill({required this.bg, required this.ink, this.icon, this.sparkle = false, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(4)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: ink),
            const SizedBox(width: 3),
          ] else if (sparkle) ...[
            Sparkle(size: 9, color: ink),
            const SizedBox(width: 3),
          ],
          Flexible(
            child: Text(label,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: RunqText.caption.copyWith(color: ink, fontSize: 10, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
