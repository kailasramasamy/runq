import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/bank_txn_feed_provider.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/bank_logo.dart';
import '../widgets/runq_card.dart';
import '../widgets/sparkle.dart';
import 'banking/txn_row.dart';

final _selectedAccountProvider = StateProvider<String?>((_) => null);

/// How many rows the hub shows before handing off to the full ledger. The hub
/// is a glance at the account, not a place to work through a statement —
/// filtering and search live on the "all transactions" screen.
const _recentCount = 10;

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
          final list = await ref.read(bankAccountsProvider.future).catchError((_) => throw 0);
          // The list defaults to the first account without writing back to
          // _selectedAccountProvider, so fall back to it here — otherwise a
          // pull-to-refresh on the default (untapped) account skips the txn
          // providers entirely and never picks up newly-synced rows.
          final selected = ref.read(_selectedAccountProvider) ??
              (list.isNotEmpty ? list.first.id : null);
          if (selected != null) {
            ref.invalidate(bankTxnsProvider(selected));
            ref.invalidate(bankLastSyncDateProvider(selected));
          }
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
    final txns = ref.watch(bankTxnsProvider(selected.id));
    final total = accounts.fold<double>(0, (s, a) => s + a.currentBalance);

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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          sliver: SliverToBoxAdapter(child: _ReportStrip(account: selected)),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          sliver: SliverToBoxAdapter(child: _SyncedTillChip(accountId: selected.id)),
        ),
        // The banner hides itself when the backlog is empty. Its own count is
        // the one auto-categorize acts on (no GL account yet), which is not
        // the account's `unreconciledCount` — a categorised row can still be
        // unreconciled, and keying off that showed a banner with no work.
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          sliver: SliverToBoxAdapter(child: _AiReconcileBanner(accountId: selected.id)),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 18, 16, 4),
          sliver: SliverToBoxAdapter(
            child: _RecentHead(
              total: txns.asData?.value.total,
              onSeeAll: () => context.push('/money/banking/${selected.id}/transactions'),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: AsyncSlot<PaginatedResponse<BankTxn>>(
            value: txns,
            onRetry: () => ref.invalidate(bankTxnsProvider(selected.id)),
            data: (page) {
              // The endpoint is asked for exactly `_recentCount` rows, but a
              // cached wider page can still land here — trim so the hub never
              // grows past its stated window.
              final items = page.data.take(_recentCount).toList();
              if (items.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'No transactions',
                    subtitle: 'Import a statement to get started.',
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ...groupTxnsByDate(items),
                  if ((page.total) > items.length)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: _SeeAllButton(
                        label: 'View all ${page.total} transactions',
                        onTap: () =>
                            context.push('/money/banking/${selected.id}/transactions'),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 120)),
      ],
    );
  }
}

/// "Recent activity" heading with the see-all affordance on the right.
class _RecentHead extends StatelessWidget {
  final int? total;
  final VoidCallback onSeeAll;
  const _RecentHead({required this.total, required this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Recent activity', style: RunqText.h4.copyWith(color: t.ink)),
              if (total != null) ...[
                const SizedBox(height: 2),
                Text(
                  total! <= _recentCount
                      ? '$total transactions'
                      : 'Last $_recentCount of $total',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ],
          ),
        ),
        TextButton(
          onPressed: onSeeAll,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            minimumSize: const Size(0, 36),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Show all',
                  style: RunqText.caption
                      .copyWith(color: t.brand, fontWeight: FontWeight.w600)),
              const SizedBox(width: 2),
              Icon(Icons.chevron_right_rounded, size: 16, color: t.brand),
            ],
          ),
        ),
      ],
    );
  }
}

class _SeeAllButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _SeeAllButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.input),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.input),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.input),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(label,
                  style: RunqText.caption
                      .copyWith(color: t.brand, fontWeight: FontWeight.w600)),
              const SizedBox(width: 4),
              Icon(Icons.arrow_forward_rounded, size: 14, color: t.brand),
            ],
          ),
        ),
      ),
    );
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

/// Prominent full-width strip under the account cards that opens the spending
/// report for the currently-selected account. Replaces the easy-to-miss icon
/// that used to sit on the card.
class _ReportStrip extends StatelessWidget {
  final BankAccount account;
  const _ReportStrip({required this.account});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final name = account.bankName.isEmpty ? account.name : account.bankName;
    return RunqCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      onTap: () => context.push('/money/banking/${account.id}/report'),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: isDark ? RunqColors.purpleInk.withValues(alpha: 0.20) : RunqColors.purpleBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.insights_rounded,
                size: 20, color: isDark ? const Color(0xFFC4B5FD) : RunqColors.purpleInk),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Spending report',
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text('See where money goes for $name',
                    style: RunqText.caption.copyWith(color: t.muted2),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Icon(Icons.chevron_right_rounded, size: 22, color: t.muted2),
        ],
      ),
    );
  }
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

/// Entry point into the uncategorised backlog. It only appears when there is
/// a backlog, and it navigates rather than acting: auto-categorization posts
/// journal entries and can create bills and receipts, so it belongs behind a
/// screen that shows what will be touched, not behind a single tap on the hub.
class _AiReconcileBanner extends ConsumerWidget {
  final String accountId;
  const _AiReconcileBanner({required this.accountId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final n = ref.watch(uncategorizedCountProvider(accountId)).asData?.value ?? 0;
    if (n == 0) return const SizedBox.shrink();

    final bannerBg = isDark ? RunqColors.indigo.withValues(alpha: 0.18) : const Color(0xFFEEF2FF);
    final bannerBorder = isDark ? RunqColors.indigo.withValues(alpha: 0.28) : const Color(0xFFC7D2FE);
    final bannerInk = isDark ? RunqColors.indigoLight : RunqColors.indigoDeep;
    return InkWell(
      onTap: () => context.push(
        '/money/banking/$accountId/transactions?category=none',
      ),
      borderRadius: BorderRadius.circular(RunqRadii.input),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: bannerBg,
          borderRadius: BorderRadius.circular(RunqRadii.input),
          border: Border.all(color: bannerBorder, width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(10)),
              child: Center(child: Sparkle(size: 18, color: t.brand, animated: true)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    n == 1 ? '1 uncategorised transaction' : '$n uncategorised transactions',
                    style: RunqText.bodyStrong.copyWith(color: bannerInk),
                  ),
                  const SizedBox(height: 2),
                  Text('Review them and apply rules + AI suggestions',
                      style: RunqText.caption.copyWith(color: bannerInk)),
                ],
              ),
            ),
            Text('Review →',
                style: RunqText.caption.copyWith(color: t.brand, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
