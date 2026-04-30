import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
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
  _Tab('overdue', 'Overdue', 'overdue'),
  _Tab('unpaid', 'Unpaid', 'sent'),
  _Tab('paid', 'Paid', 'paid'),
];

class InvoicesScreen extends ConsumerStatefulWidget {
  const InvoicesScreen({super.key});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  String tabKey = 'all';
  String search = '';
  bool searchOpen = false;
  DateTime? dateFrom;
  DateTime? dateTo;

  bool get _hasDateFilter => dateFrom != null || dateTo != null;

  InvoiceFilter get _filter {
    final t = _tabs.firstWhere((t) => t.key == tabKey, orElse: () => _tabs.first);
    return InvoiceFilter(
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
    final summary = ref.watch(invoiceSummaryProvider);
    final list = ref.watch(invoicesProvider(_filter));

    // Active tab's list — also drives the header subtitle ("8 · ₹14,23,900").
    final (countLabel, totalLabel) = list.maybeWhen(
      data: (page) {
        final count = page.total;
        final sum = summary.maybeWhen(data: (s) => s.totalOutstanding, orElse: () => null);
        final amount = sum != null ? '${formatINR(sum)} outstanding' : '—';
        return ('$count', amount);
      },
      orElse: () => ('—', '—'),
    );

    // One badge per tab — pagination meta gives accurate `total` regardless
    // of page size, so each filter combo costs one cached request.
    int? cnt(String? status) => ref
        .watch(invoicesProvider(InvoiceFilter(status: status)))
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
                ref.invalidate(invoicesProvider(_filter));
                ref.invalidate(invoiceSummaryProvider);
                await ref.read(invoicesProvider(_filter).future).catchError((_) => throw 0);
              },
              child: AsyncSlot<PaginatedResponse<Invoice>>(
                value: list,
                onRetry: () => ref.invalidate(invoicesProvider(_filter)),
                data: (page) {
                  if (page.data.isEmpty) {
                    return const Center(
                      child: EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: 'No invoices',
                        subtitle: 'Try a different tab or clear the search.',
                      ),
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                    itemCount: page.data.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _InvoiceRow(invoice: page.data[i]),
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
                    Text('Invoices', style: RunqText.h1.copyWith(color: t.ink, fontSize: 28)),
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
/// filter affordances. Matches the design — softer than a full circle, more
/// "tap-target" than a flat IconButton.
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
                hintText: 'Search invoices, customers',
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
    // Subtle count chip — light bg + muted text in both states. Matches the
    // design: it carries info, not urgency, so red is too loud.
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

class _InvoiceRow extends StatelessWidget {
  final Invoice invoice;
  const _InvoiceRow({required this.invoice});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final isPartial = invoice.status == 'partially_paid';
    return RunqCard(
      onTap: () {
        if (invoice.id.isEmpty) return;
        context.push('/invoices/${invoice.id}');
      },
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RqAvatar(name: invoice.customerName, size: 44, square: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.customerName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text('${invoice.invoiceNumber} · ${_date(invoice.invoiceDate)}', style: RunqText.caption),
                    const SizedBox(height: 6),
                    if (!isPartial)
                      StatusPill(invoice.status, warning: invoice.status == 'overdue'),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(formatINR(invoice.totalAmount), style: RunqText.tabular(size: 15, w: FontWeight.w700)),
            ],
          ),
          if (isPartial) ...[
            const SizedBox(height: 10),
            _PartialPayBar(paid: invoice.amountReceived, total: invoice.totalAmount),
          ],
        ],
      ),
    );
  }
}

class _PartialPayBar extends StatelessWidget {
  final double paid, total;
  const _PartialPayBar({required this.paid, required this.total});

  @override
  Widget build(BuildContext context) {
    final pct = total <= 0 ? 0.0 : (paid / total).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: Container(
            height: 4,
            color: const Color(0xFFE5E7EB),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: pct,
                child: Container(color: RunqColors.indigo),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('${formatINR(paid)} of ${formatINR(total)} paid',
            style: RunqText.caption.copyWith(fontSize: 11)),
      ],
    );
  }
}

