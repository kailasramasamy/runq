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
import '../widgets/status_pill.dart';

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
  const BillsScreen({super.key});

  @override
  ConsumerState<BillsScreen> createState() => _BillsScreenState();
}

class _BillsScreenState extends ConsumerState<BillsScreen> {
  String tabKey = 'all';
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

    // Header subtitle — count from the active list, total outstanding from
    // the summary so it doesn't shift between tabs.
    final (countLabel, totalLabel) = list.maybeWhen(
      data: (page) {
        final outstanding = summary.maybeWhen(data: (s) => s.totalOutstanding, orElse: () => null);
        return ('${page.total}', outstanding != null ? '${formatINR(outstanding)} outstanding' : '—');
      },
      orElse: () => ('—', '—'),
    );

    // Counts on every tab. Pagination meta gives accurate `total` regardless
    // of page size, so each filter combo costs one cached request.
    int? cnt(String? status) => ref
        .watch(billsProvider(BillFilter(status: status)))
        .maybeWhen(data: (p) => p.total, orElse: () => null);
    final badges = <String, int>{
      for (final t in _tabs)
        if (cnt(t.statusFilter) != null) t.key: cnt(t.statusFilter)!,
    };

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          _Header(
            countLabel: countLabel,
            totalLabel: totalLabel,
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
              color: RunqColors.indigo,
              onRefresh: () async {
                ref.invalidate(billsProvider(_filter));
                ref.invalidate(billsSummaryProvider);
                await ref.read(billsProvider(_filter).future).catchError((_) => throw 0);
              },
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
                    itemBuilder: (_, i) => _BillRow(bill: page.data[i]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String countLabel, totalLabel;
  final bool searchOpen;
  final String searchValue;
  final VoidCallback onSearchToggle;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onFilter;
  final bool filterActive;
  const _Header({
    required this.countLabel,
    required this.totalLabel,
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
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 8, 16, searchOpen ? 16 : 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Bills', style: RunqText.h1.copyWith(color: t.ink, fontSize: 28)),
                    const SizedBox(height: 4),
                    Text(
                      '$countLabel · $totalLabel',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 13),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
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
                    color: RunqColors.indigo,
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

class _BillRow extends StatelessWidget {
  final Bill bill;
  const _BillRow({required this.bill});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      onTap: () => context.push('/bills/${bill.id}'),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RqAvatar(name: bill.vendorName, size: 44, square: true),
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
      ),
    );
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
