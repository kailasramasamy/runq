import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../services/bill_intake.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/status_pill.dart';
import '../widgets/swipe_action.dart';
import 'invoices_screen.dart' show StatChip;
import 'package:flutter_slidable/flutter_slidable.dart';
import '../api/repos.dart' show billsRepo;

class _Tab {
  final String key, label;
  final String? statusFilter;
  const _Tab(this.key, this.label, this.statusFilter);
}

const _tabs = <_Tab>[
  _Tab('all', 'All', null),
  _Tab('to_approve', 'Pending', 'pending_match'),
  _Tab('approved', 'Approved', 'approved'),
  _Tab('paid', 'Paid', 'paid'),
];

class BillsScreen extends ConsumerStatefulWidget {
  /// Optional starting tab key (e.g. `'to_approve'`). The hub tile uses this
  /// so tapping "5 pending" lands on the screen pre-filtered.
  final String? initialTab;
  const BillsScreen({super.key, this.initialTab});

  @override
  ConsumerState<BillsScreen> createState() => _BillsScreenState();
}

class _BillsScreenState extends ConsumerState<BillsScreen> {
  late String tabKey = _tabs.any((t) => t.key == widget.initialTab)
      ? widget.initialTab!
      : 'all';
  String search = '';
  bool searchOpen = false;
  DateTime? dateFrom;
  DateTime? dateTo;

  bool get _hasDateFilter => dateFrom != null || dateTo != null;

  BillFilter get _filter {
    final t = _tabs.firstWhere((t) => t.key == tabKey, orElse: () => _tabs.first);
    return BillFilter(
      status: t.statusFilter,
      search: search.trim().isEmpty ? null : search.trim(),
      dateFrom: dateFrom,
      dateTo: dateTo,
    );
  }

  Future<void> _refresh() async {
    // Invalidate every per-tab list so the badge counts and the active list
    // update together after a swipe action; await the active filter so this
    // future completes only when fresh data has landed.
    ref.invalidate(billsSummaryProvider);
    for (final t in _tabs) {
      ref.invalidate(billsProvider(BillFilter(status: t.statusFilter)));
    }
    ref.invalidate(billsProvider(_filter));
    await ref.read(billsProvider(_filter).future).catchError((_) => throw 0);
  }

  Future<void> _openFilterSheet() async {
    final result = await showDateRangeSheet(context, initialFrom: dateFrom, initialTo: dateTo);
    if (result == null) return;
    setState(() {
      dateFrom = result.from;
      dateTo = result.to;
    });
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(billsProvider(_filter));
    final summary = ref.watch(billsSummaryProvider);

    // Header stat chips — both count and amount track the active tab.
    // We use summary fields where the tenant-wide total is meaningful and
    // sum the loaded page (limit 50) elsewhere as a quick read.
    final count = list.maybeWhen(data: (page) => page.total, orElse: () => null);
    final (double? amount, String amountLabel) = switch (tabKey) {
      'to_approve' => (
          list.maybeWhen(
            data: (p) => p.data.fold<double>(0, (s, b) => s + b.totalAmount),
            orElse: () => null,
          ),
          'pending',
        ),
      'approved' => (
          list.maybeWhen(
            data: (p) => p.data.fold<double>(0, (s, b) => s + b.balanceDue),
            orElse: () => null,
          ),
          'to pay',
        ),
      'paid' => (
          list.maybeWhen(
            data: (p) => p.data.fold<double>(0, (s, b) => s + b.amountPaid),
            orElse: () => null,
          ),
          'paid',
        ),
      _ => (
          summary.maybeWhen(data: (s) => s.totalOutstanding, orElse: () => null),
          'to pay',
        ),
    };

    // Counts on every tab. Pagination meta gives accurate `total` regardless
    // of page size, so each filter combo costs one cached request.
    int? cnt(String? status) => ref
        .watch(billsProvider(BillFilter(status: status)))
        .maybeWhen(data: (p) => p.total, orElse: () => null);
    final badges = <String, int>{
      for (final t in _tabs)
        if (cnt(t.statusFilter) != null) t.key: cnt(t.statusFilter)!,
    };

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
        children: [
          _Header(
            count: count,
            amount: amount,
            amountLabel: amountLabel,
            searchOpen: searchOpen,
            searchValue: search,
            onSearchToggle: () => setState(() {
              searchOpen = !searchOpen;
              if (!searchOpen) search = '';
            }),
            onSearchChanged: (v) => setState(() => search = v),
            onFilter: _openFilterSheet,
            filterActive: _hasDateFilter,
          ),
          _TabBar(
            activeKey: tabKey,
            badges: badges,
            onTap: (k) => setState(() => tabKey = k),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: RefreshIndicator(
              color: RT(context).brand,
              onRefresh: _refresh,
              child: AsyncSlot<PaginatedResponse<Bill>>(
                value: list,
                onRetry: () => ref.invalidate(billsProvider(_filter)),
                data: (page) {
                  if (page.data.isEmpty) {
                    return const Center(
                      child: EmptyState(
                        icon: Icons.description_outlined,
                        title: 'No bills',
                        subtitle: 'Scan a bill from the FAB to get started.',
                      ),
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                    itemCount: page.data.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => BillRow(
                      bill: page.data[i],
                      onAfterAction: _refresh,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final bool searchOpen;
  final String searchValue;
  final VoidCallback onSearchToggle;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onFilter;
  final bool filterActive;
  final int? count;
  final double? amount;
  final String amountLabel;
  const _Header({
    required this.count,
    required this.amount,
    required this.amountLabel,
    required this.searchOpen,
    required this.searchValue,
    required this.onSearchToggle,
    required this.onSearchChanged,
    required this.onFilter,
    required this.filterActive,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final canPop = Navigator.of(context).canPop();
    return Padding(
      padding: EdgeInsets.fromLTRB(canPop ? 8 : 20, 8, 16, searchOpen ? 16 : 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
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
                child: Text('Bills',
                    style: RunqText.h1.copyWith(color: t.ink, fontSize: 28)),
              ),
              const SizedBox(width: 12),
              _IconChip(
                icon: searchOpen ? Icons.close_rounded : Icons.search_rounded,
                onTap: onSearchToggle,
              ),
              const SizedBox(width: 8),
              _IconChip(
                icon: Icons.filter_list_rounded,
                onTap: onFilter,
                showDot: filterActive,
              ),
              const SizedBox(width: 8),
              _ScanButton(onTap: () => startBillIntake(context)),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: EdgeInsets.only(left: canPop ? 8 : 0),
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                StatChip(
                  icon: Icons.description_rounded,
                  label: count == null ? '—' : '$count',
                  sub: count == 1 ? 'bill' : 'bills',
                ),
                StatChip(
                  icon: Icons.account_balance_wallet_rounded,
                  label: amount == null ? '—' : formatINR(amount!, compact: true),
                  sub: amountLabel,
                  tinted: true,
                ),
              ],
            ),
          ),
          if (searchOpen) ...[
            const SizedBox(height: 12),
            _InlineSearch(value: searchValue, onChanged: onSearchChanged),
          ],
        ],
      ),
    );
  }
}

/// Square-with-rounded-corners icon button used for the header search and
/// filter affordances. Matches invoices for visual consistency.
class _IconChip extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool showDot;
  const _IconChip({required this.icon, required this.onTap, this.showDot = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: t.hairline, width: 0.5),
              ),
              alignment: Alignment.center,
              child: Icon(icon, size: 18, color: t.ink),
            ),
            if (showDot)
              Positioned(
                right: 8, top: 8,
                child: Container(
                  width: 8, height: 8,
                  decoration: BoxDecoration(
                    color: RT(context).brand,
                    shape: BoxShape.circle,
                    border: Border.all(color: t.surface, width: 1.5),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InlineSearch extends StatefulWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _InlineSearch({required this.value, required this.onChanged});

  @override
  State<_InlineSearch> createState() => _InlineSearchState();
}

class _InlineSearchState extends State<_InlineSearch> {
  late final TextEditingController _ctrl = TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 18, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _ctrl,
              focusNode: _focus,
              onChanged: widget.onChanged,
              style: RunqText.body.copyWith(fontSize: 14, color: t.ink),
              decoration: InputDecoration(
                hintText: 'Search bills, vendors',
                hintStyle: RunqText.body.copyWith(color: t.muted2),
                isDense: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanButton extends StatelessWidget {
  final VoidCallback onTap;
  const _ScanButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: t.ink,
            borderRadius: BorderRadius.circular(999),
            boxShadow: const [
              BoxShadow(color: Color(0x1F000000), blurRadius: 8, offset: Offset(0, 2)),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.photo_camera_rounded, color: t.surface, size: 16),
              const SizedBox(width: 6),
              Text(
                'Scan',
                style: RunqText.bodyStrong.copyWith(color: t.surface, fontSize: 14),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabBar extends StatelessWidget {
  final String activeKey;
  /// Optional count badges keyed by tab key. 0/missing → no badge.
  final Map<String, int> badges;
  final ValueChanged<String> onTap;
  const _TabBar({required this.activeKey, required this.onTap, this.badges = const {}});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final t = _tabs[i];
          return _TabPill(
            label: t.label,
            badge: badges[t.key] ?? 0,
            active: t.key == activeKey,
            onTap: () => onTap(t.key),
          );
        },
      ),
    );
  }
}

class _TabPill extends StatelessWidget {
  final String label;
  final int badge;
  final bool active;
  final VoidCallback onTap;
  const _TabPill({required this.label, required this.badge, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final bg = active ? t.ink : t.surface;
    final fg = active ? t.surface : t.ink;
    final badgeBg = active ? t.surface.withValues(alpha: 0.18) : t.hairlineSoft;
    final badgeFg = active ? t.surface : t.muted;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? Colors.transparent : t.hairline,
              width: 0.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: RunqText.bodyStrong.copyWith(
                  color: fg,
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
              if (badge > 0) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(
                    color: badgeBg,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$badge',
                    style: TextStyle(
                      color: badgeFg,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
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

class BillRow extends ConsumerWidget {
  final Bill bill;
  /// Optional refresh callback wired from the host screen so swipe actions
  /// share the same fetch path as pull-to-refresh.
  final Future<void> Function()? onAfterAction;
  /// Compact = no card chrome — used by the dashboard's Recent bills section
  /// where many rows live inside a shared RunqCard with dividers.
  final bool compact;
  const BillRow({super.key, required this.bill, this.onAfterAction, this.compact = false});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = _buildActions(context, ref);
    final body = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RqAvatar(name: bill.vendorName, size: compact ? 36 : 44, square: true),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(bill.vendorName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text('${bill.invoiceNumber} · ${_date(bill.invoiceDate)}', style: RunqText.caption),
              const SizedBox(height: 6),
              Row(
                children: [
                  StatusPill(bill.status),
                  if (bill.matchStatus == 'matched') ...[
                    const SizedBox(width: 6),
                    _MatchChip(matched: true),
                  ] else if (bill.status == 'pending_match' || bill.matchStatus == 'mismatch') ...[
                    const SizedBox(width: 6),
                    _MatchChip(matched: false),
                  ],
                ],
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(formatINR(bill.totalAmount), style: RunqText.tabular(size: 15, w: FontWeight.w700)),
      ],
    );
    final tap = () => context.push('/bills/${bill.id}');
    final tile = compact
        ? Material(
            color: RT(context).surface,
            child: InkWell(
              onTap: tap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: body,
              ),
            ),
          )
        : RunqCard(
            onTap: tap,
            padding: const EdgeInsets.all(14),
            child: body,
          );
    if (actions.isEmpty) return tile;
    return Slidable(
      groupTag: 'bills',
      key: ValueKey('bill-${bill.id}'),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: actions.length == 1 ? 0.28 : 0.52,
        children: actions,
      ),
      child: tile,
    );
  }

  List<Widget> _buildActions(BuildContext context, WidgetRef ref) {
    final s = bill.status;
    // API approval rules (three-way-match.service.ts:97):
    //   - bill with PO    → must be 'matched'
    //   - bill without PO → 'draft' or 'matched'
    // Anything else (pending_match, pending_approval) is never directly
    // approvable and must not show an Approve swipe — it would always fail.
    final canApprove = s == 'matched' || (s == 'draft' && !bill.hasPO);
    final canDelete = s == 'draft' || s == 'pending_match' || s == 'pending_approval';
    if (canApprove || canDelete) {
      return [
        if (canApprove)
          SwipeAction(
            icon: Icons.check_rounded,
            label: 'Approve',
            color: const Color(0xFF047857),
            onTap: () => _approve(context, ref),
          ),
        if (canDelete)
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: RunqColors.redInk,
            onTap: () => _delete(context, ref),
          ),
      ];
    }
    if (s == 'approved' || s == 'partially_paid') {
      return [
        SwipeAction(
          icon: Icons.check_rounded,
          label: 'Mark paid',
          color: const Color(0xFF047857),
          onTap: () => _markPaid(context, ref),
        ),
      ];
    }
    return const [];
  }

  Future<void> _refreshAll(WidgetRef ref) async {
    ref.invalidate(billsProvider);
    ref.invalidate(billsSummaryProvider);
    ref.invalidate(billDetailProvider(bill.id));
    if (onAfterAction != null) await onAfterAction!();
  }

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    try {
      await billsRepo.approve(bill.id);
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Approved ${bill.invoiceNumber}',
          kind: SnackKind.success);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't approve: $e", kind: SnackKind.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete bill?'),
        content: Text('Remove ${bill.invoiceNumber} from ${bill.vendorName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              backgroundColor: RunqColors.redInk,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;
    try {
      await billsRepo.remove(bill.id);
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Bill removed', kind: SnackKind.success);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't delete: $e", kind: SnackKind.error);
    }
  }

  Future<void> _markPaid(BuildContext context, WidgetRef ref) async {
    // The bill mark-paid flow lives in the detail screen — there's no
    // 1-click mark-paid endpoint, and bills usually need a bank-account
    // selection. So swipe nudges into the detail's payment sheet.
    if (bill.id.isEmpty) return;
    context.push('/bills/${bill.id}');
  }
}

class _MatchChip extends StatelessWidget {
  final bool matched;
  const _MatchChip({required this.matched});

  @override
  Widget build(BuildContext context) {
    final color = matched ? RunqColors.greenInk : RunqColors.amberInk;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(matched ? Icons.check_circle_rounded : Icons.error_outline_rounded, size: 12, color: color),
        const SizedBox(width: 3),
        Text(matched ? '3WM' : 'Match needed',
            style: RunqText.caption.copyWith(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
