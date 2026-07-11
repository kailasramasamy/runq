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

// Default to `all` — the pills carry live counts, so the pending work is
// visible at a glance without hiding the rest of the ledger behind a filter.
final _reconFilterProvider = StateProvider<_ReconFilter>((_) => _ReconFilter.all);

/// Party filter — a vendor or customer the user picks to narrow the txn
/// list to rows tied to (or suggested for) that party. `null` = all parties.
class _PartySel {
  final String id;
  final String name;
  final bool isVendor; // false ⇒ customer
  const _PartySel({required this.id, required this.name, required this.isVendor});
}

final _partyFilterProvider = StateProvider<_PartySel?>((_) => null);

class BankingScreen extends ConsumerWidget {
  const BankingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(bankAccountsProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
        color: RT(context).brand,
        onRefresh: () async {
          ref.invalidate(bankAccountsProvider);
          final selected = ref.read(_selectedAccountProvider);
          if (selected != null) {
            ref.invalidate(bankTxnsProvider(selected));
            ref.invalidate(bankUnreconciledTxnsProvider(selected));
          }
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
    final filter = ref.watch(_reconFilterProvider);
    // Watch both sources: the recent-window ledger and the full unreconciled
    // set (fetched server-side so old stragglers can't hide behind the recent
    // window). Their `.total` counts feed the filter pills, and the active
    // filter picks which one drives the list below.
    final allTxns = ref.watch(bankTxnsProvider(selected.id));
    final unreconTxns = ref.watch(bankUnreconciledTxnsProvider(selected.id));
    final txns = filter == _ReconFilter.unmatched ? unreconTxns : allTxns;
    final allCount = allTxns.asData?.value.total;
    final unmatchedCount = unreconTxns.asData?.value.total;
    final party = ref.watch(_partyFilterProvider);
    final total = accounts.fold<double>(0, (s, a) => s + a.currentBalance);

    final parties = txns.maybeWhen(
      data: (page) => _collectParties(page.data),
      orElse: () => const <_PartySel>[],
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
              ref.invalidate(bankUnreconciledTxnsProvider(selected.id));
              ref.invalidate(bankLastSyncDateProvider(selected.id));
            },
          ),
        ),
        SliverToBoxAdapter(
          child: _AccountCardStrip(
            accounts: accounts,
            selectedId: selected.id,
            onSelect: (id) => ref.read(_selectedAccountProvider.notifier).state = id,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          sliver: SliverToBoxAdapter(child: _SyncedTillChip(accountId: selected.id)),
        ),
        // Auto-categorize acts on unreconciled rows, so only surface the
        // banner when the user is looking at that filter.
        if (filter == _ReconFilter.unmatched)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            sliver: SliverToBoxAdapter(child: _AiReconcileBanner(accountId: selected.id)),
          ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          sliver: SliverToBoxAdapter(
            child: _FilterPills(
              active: filter,
              allCount: allCount,
              unmatchedCount: unmatchedCount,
              onChange: (f) => ref.read(_reconFilterProvider.notifier).state = f,
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          sliver: SliverToBoxAdapter(
            child: _PartyFilterChip(
              selected: party,
              parties: parties,
              onChange: (p) => ref.read(_partyFilterProvider.notifier).state = p,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: AsyncSlot<PaginatedResponse<BankTxn>>(
            value: txns,
            onRetry: () {
              ref.invalidate(bankTxnsProvider(selected.id));
              ref.invalidate(bankUnreconciledTxnsProvider(selected.id));
            },
            data: (page) {
              final items = _filterItems(_filterByParty(page.data, party), filter);
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

  List<BankTxn> _filterByParty(List<BankTxn> items, _PartySel? p) {
    if (p == null) return items;
    return items.where((t) {
      return p.isVendor ? t.vendorId == p.id : t.customerId == p.id;
    }).toList();
  }

  /// Unique vendors + customers seen in the loaded txns, sorted by name.
  /// We dedupe on `(isVendor, id)` so a name reused across vendor/customer
  /// records still shows once per role.
  static List<_PartySel> _collectParties(List<BankTxn> items) {
    final seen = <String, _PartySel>{};
    for (final t in items) {
      if (t.vendorId != null && (t.vendorName ?? '').isNotEmpty) {
        seen.putIfAbsent('v:${t.vendorId}',
            () => _PartySel(id: t.vendorId!, name: t.vendorName!, isVendor: true));
      }
      if (t.customerId != null && (t.customerName ?? '').isNotEmpty) {
        seen.putIfAbsent('c:${t.customerId}',
            () => _PartySel(id: t.customerId!, name: t.customerName!, isVendor: false));
      }
    }
    final list = seen.values.toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
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
    final canPop = Navigator.of(context).canPop();
    final countLabel = accountCount == 0
        ? 'No accounts'
        : '$accountCount ${accountCount == 1 ? 'account' : 'accounts'} · ${formatINR(totalBalance)}';
    return Padding(
      padding: EdgeInsets.fromLTRB(canPop ? 8 : 20, 8, 16, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (canPop) ...[
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: Icon(Icons.arrow_back_rounded, color: t.ink),
            ),
            const SizedBox(width: 4),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Banking', style: RunqText.h1.copyWith(color: t.ink)),
                const SizedBox(height: 4),
                Text(
                  countLabel,
                  style: RunqText.caption.copyWith(color: t.muted),
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
  final ValueChanged<String> onSelect;
  const _AccountCardStrip({
    required this.accounts,
    required this.selectedId,
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
            matchCount: a.unreconciledCount,
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
                        style: RunqText.label.copyWith(
                          color: RunqColors.amberInk,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                bankName,
                style: RunqText.body.copyWith(color: t.muted),
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
                style: RunqText.caption.copyWith(color: t.muted),
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

/// "Synced till <date>" stamp under the account strip. Mirrors the web
/// banking transactions page's chip — pulls the most recent imported
/// transaction date from /banking/accounts/:id/balance.
class _SyncedTillChip extends ConsumerWidget {
  final String accountId;
  const _SyncedTillChip({required this.accountId});

  String _fmt(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final last = ref.watch(bankLastSyncDateProvider(accountId));
    final label = last.maybeWhen(
      data: (d) => d == null ? 'No transactions yet' : 'Synced till ${_fmt(d)}',
      orElse: () => null,
    );
    if (label == null) return const SizedBox.shrink();
    return Row(
      children: [
        Icon(Icons.cloud_done_outlined, size: 14, color: t.muted),
        const SizedBox(width: 6),
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
      ],
    );
  }
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
      // Categorizing clears unreconciled rows — refresh the unmatched list and
      // the per-account badges (which come from bankAccountsProvider).
      ref.invalidate(bankUnreconciledTxnsProvider(widget.accountId));
      ref.invalidate(bankAccountsProvider);
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
                      style: RunqText.bodyStrong.copyWith(color: bannerInk)),
                  const SizedBox(height: 2),
                  Text('Apply rules + AI suggestions to unreconciled rows',
                      style: RunqText.caption.copyWith(color: bannerInk)),
                ],
              ),
            ),
            Text('Run →',
                style: RunqText.caption.copyWith(color: RT(context).brand, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _FilterPills extends StatelessWidget {
  final _ReconFilter active;
  final ValueChanged<_ReconFilter> onChange;
  final int? allCount, unmatchedCount;
  const _FilterPills({
    required this.active,
    required this.onChange,
    this.allCount,
    this.unmatchedCount,
  });

  @override
  Widget build(BuildContext context) {
    final pills = <(_ReconFilter, String, int?)>[
      (_ReconFilter.all, 'All', allCount),
      (_ReconFilter.unmatched, 'Uncategorized', unmatchedCount),
      (_ReconFilter.matched, 'Matched', null),
    ];
    return Row(
      children: [
        for (var i = 0; i < pills.length; i++) ...[
          _FilterPill(
            label: pills[i].$2,
            count: pills[i].$3,
            active: pills[i].$1 == active,
            onTap: () => onChange(pills[i].$1),
          ),
          if (i < pills.length - 1) const SizedBox(width: 6),
        ],
      ],
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final int? count;
  final bool active;
  final VoidCallback onTap;
  const _FilterPill({required this.label, this.count, required this.active, required this.onTap});

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
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: RunqText.caption.copyWith(
                  fontWeight: FontWeight.w600,
                  color: active ? Colors.white : t.muted,
                ),
              ),
              if (count != null) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: active ? Colors.white.withValues(alpha: 0.22) : t.bgWarm,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$count',
                    style: RunqText.micro.copyWith(
                      fontWeight: FontWeight.w700,
                      color: active ? Colors.white : t.muted2,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Tappable chip showing the active party filter (or "All parties"). Opens
/// a search sheet listing the parties found in the loaded txns. Disabled
/// when the loaded page has no party-tagged rows to pick from.
class _PartyFilterChip extends StatelessWidget {
  final _PartySel? selected;
  final List<_PartySel> parties;
  final ValueChanged<_PartySel?> onChange;
  const _PartyFilterChip({
    required this.selected,
    required this.parties,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasOptions = parties.isNotEmpty;
    final active = selected != null;
    final label = selected?.name ?? 'All parties';
    final icon = selected == null
        ? Icons.people_alt_outlined
        : (selected!.isVendor ? Icons.store_outlined : Icons.person_outline_rounded);

    return Row(
      children: [
        Expanded(
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: hasOptions ? () => _open(context) : null,
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: active ? RunqColors.indigo.withValues(alpha: 0.08) : t.surface,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: active ? RunqColors.indigo : t.hairline,
                    width: active ? 1.0 : 0.5,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(icon, size: 14, color: active ? RunqColors.indigo : t.muted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        label,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: RunqText.caption.copyWith(
                          fontWeight: FontWeight.w600,
                          color: active ? RunqColors.indigo : (hasOptions ? t.ink : t.muted2),
                        ),
                      ),
                    ),
                    if (active)
                      InkWell(
                        onTap: () => onChange(null),
                        borderRadius: BorderRadius.circular(999),
                        child: Padding(
                          padding: const EdgeInsets.all(2),
                          child: Icon(Icons.close_rounded, size: 14, color: RunqColors.indigo),
                        ),
                      )
                    else
                      Icon(Icons.expand_more_rounded, size: 16, color: t.muted),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _open(BuildContext context) async {
    final picked = await showModalBottomSheet<_PartySel?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PartyPickerSheet(parties: parties, selected: selected),
    );
    // Sheet returns: a `_PartySel` for a pick, our sentinel (empty id) for
    // Clear, and null on dismiss. Only Clear and Pick mutate state.
    if (picked == null) return;
    if (picked.id.isEmpty) {
      onChange(null);
    } else {
      onChange(picked);
    }
  }
}

class _PartyPickerSheet extends StatefulWidget {
  final List<_PartySel> parties;
  final _PartySel? selected;
  const _PartyPickerSheet({required this.parties, required this.selected});

  @override
  State<_PartyPickerSheet> createState() => _PartyPickerSheetState();
}

class _PartyPickerSheetState extends State<_PartyPickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final q = _q.trim().toLowerCase();
    final filtered = q.isEmpty
        ? widget.parties
        : widget.parties.where((p) => p.name.toLowerCase().contains(q)).toList();

    // Cap at 70% of screen so the sheet has a bounded height; the list
    // region inside flexes to fit whatever's left after header + search.
    final maxH = MediaQuery.of(context).size.height * 0.70;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxH),
          child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text('Filter by party',
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  ),
                  if (widget.selected != null)
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(
                        const _PartySel(id: '', name: '', isVendor: true),
                      ),
                      child: const Text('Clear'),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                autofocus: false,
                textCapitalization: TextCapitalization.none,
                decoration: InputDecoration(
                  hintText: 'Search vendors and customers',
                  prefixIcon: const Icon(Icons.search_rounded, size: 18),
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: t.hairline),
                  ),
                ),
                onChanged: (v) => setState(() => _q = v),
              ),
            ),
            Flexible(
              child: filtered.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('No matches',
                          style: RunqText.body.copyWith(color: t.muted)),
                    )
                  : ListView.separated(
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      shrinkWrap: true,
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) =>
                          Divider(height: 1, color: t.hairlineSoft),
                      itemBuilder: (_, i) {
                        final p = filtered[i];
                        final isSelected = widget.selected?.id == p.id &&
                            widget.selected?.isVendor == p.isVendor;
                        return ListTile(
                          dense: true,
                          leading: Icon(
                            p.isVendor ? Icons.store_outlined : Icons.person_outline_rounded,
                            size: 20,
                            color: t.muted,
                          ),
                          title: Text(p.name,
                              style: RunqText.body.copyWith(color: t.ink)),
                          subtitle: Text(p.isVendor ? 'Vendor' : 'Customer',
                              style: RunqText.caption.copyWith(color: t.muted2)),
                          trailing: isSelected
                              ? Icon(Icons.check_rounded, size: 18, color: RunqColors.indigo)
                              : null,
                          onTap: () => Navigator.of(context).pop(p),
                        );
                      },
                    ),
            ),
            const SizedBox(height: 8),
          ],
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

class _TxnRow extends StatefulWidget {
  final BankTxn txn;
  const _TxnRow({required this.txn});

  @override
  State<_TxnRow> createState() => _TxnRowState();
}

class _TxnRowState extends State<_TxnRow> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final txn = widget.txn;
    final isIn = txn.isCredit;

    final dirBg = isIn
        ? (isDark ? RunqColors.greenInk.withValues(alpha: 0.20) : RunqColors.greenBg)
        : (isDark ? RunqColors.redInk.withValues(alpha: 0.20) : RunqColors.redBg);
    final dirInk = isIn
        ? (isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk)
        : (isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk);

    // Lead with the vendor/customer; the description sits underneath. When
    // there's no matched party yet, the description is promoted to the title
    // and the recon suggestion takes the secondary line.
    final party = txn.vendorName ?? txn.customerName;
    final desc = txn.narration ?? txn.reference;
    final matched = txn.reconStatus == 'matched' || txn.reconStatus == 'manually_matched';
    final title = party ?? desc ?? 'Transaction';

    return RunqCard(
      padding: const EdgeInsets.all(12),
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedSize(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        alignment: Alignment.topCenter,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
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
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              title,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1, overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (matched) ...[
                            const SizedBox(width: 4),
                            Icon(Icons.check_circle_rounded,
                                size: 13,
                                color: isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      if (party != null)
                        Text(
                          desc ?? 'No description',
                          style: RunqText.caption.copyWith(color: t.muted2),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                        )
                      else
                        _ReconChip(txn: txn),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${isIn ? '+' : '−'}${formatINR(txn.amount.abs())}',
                      style: RunqText.tabular(
                        size: 15,
                        w: FontWeight.w700,
                        color: isIn ? dirInk : t.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: Icon(Icons.keyboard_arrow_down_rounded,
                          size: 18, color: t.muted2),
                    ),
                  ],
                ),
              ],
            ),
            if (_expanded) _TxnDetail(txn: txn),
          ],
        ),
      ),
    );
  }
}

class _TxnDetail extends StatelessWidget {
  final BankTxn txn;
  const _TxnDetail({required this.txn});

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _fmtDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  String _statusLabel(String s) {
    switch (s) {
      case 'matched':
        return 'Matched';
      case 'manually_matched':
        return 'Matched (manual)';
      case 'excluded':
        return 'Excluded';
      default:
        return 'Unreconciled';
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final party = txn.vendorName ?? txn.customerName;
    final partyLabel = txn.vendorName != null ? 'Vendor' : (txn.customerName != null ? 'Customer' : null);
    final conf = txn.glConfidence;

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        children: [
          Divider(height: 1, thickness: 0.5, color: t.hairline),
          const SizedBox(height: 8),
          _DetailRow(label: 'Type', value: txn.isCredit ? 'Money in' : 'Money out'),
          _DetailRow(label: 'Date', value: _fmtDate(txn.transactionDate)),
          _DetailRow(
            label: 'Amount',
            value: '${txn.isCredit ? '+' : '−'}${formatINR(txn.amount.abs())}',
          ),
          if (txn.reference != null) _DetailRow(label: 'Reference', value: txn.reference!),
          if (txn.narration != null) _DetailRow(label: 'Description', value: txn.narration!),
          if (party != null && partyLabel != null) _DetailRow(label: partyLabel, value: party),
          if (txn.glAccountName != null)
            _DetailRow(
              label: 'Category',
              value: conf != null
                  ? '${txn.glAccountName} · ${(conf * 100).round()}%'
                  : txn.glAccountName!,
            ),
          _DetailRow(label: 'Status', value: _statusLabel(txn.reconStatus)),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label, value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: RunqText.caption.copyWith(color: t.ink),
              textAlign: TextAlign.right,
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
    return Text('Uncategorised', style: RunqText.caption.copyWith(color: t.muted2));
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
                style: RunqText.micro.copyWith(color: ink)),
          ),
        ],
      ),
    );
  }
}
