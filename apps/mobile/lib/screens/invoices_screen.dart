import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../api/dunning_repo.dart';
import '../providers/data_providers.dart';
import '../providers/dunning_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/customer_picker_screen.dart';
import '../widgets/reminder_channel_sheet.dart';
import '../widgets/runq_snack.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/status_pill.dart';
import '../widgets/swipe_action.dart';

class _Tab {
  final String key, label;
  final String? statusFilter;
  const _Tab(this.key, this.label, this.statusFilter);
}

const _tabs = <_Tab>[
  _Tab('all', 'All', null),
  _Tab('draft', 'Draft', 'draft'),
  _Tab('overdue', 'Overdue', 'overdue'),
  // 'unpaid' is a backend sentinel that resolves to (sent OR partially_paid)
  // with balance_due > 0 — i.e., everything still owed by the customer.
  _Tab('unpaid', 'Unpaid', 'unpaid'),
  _Tab('paid', 'Paid', 'paid'),
];

class InvoicesScreen extends ConsumerStatefulWidget {
  /// Optional starting tab key (e.g. `'draft'` or `'overdue'`). The hub tiles
  /// use this so tapping "20 draft" lands on the screen pre-filtered.
  final String? initialTab;
  const InvoicesScreen({super.key, this.initialTab});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  late String tabKey = _tabs.any((t) => t.key == widget.initialTab)
      ? widget.initialTab!
      : 'all';
  String search = '';
  bool searchOpen = false;
  DateTime? dateFrom;
  DateTime? dateTo;
  String? customerId;
  String? customerName;

  bool get _hasDateFilter => dateFrom != null || dateTo != null;

  InvoiceFilter get _filter {
    final t = _tabs.firstWhere((t) => t.key == tabKey, orElse: () => _tabs.first);
    return InvoiceFilter(
      customerId: customerId,
      status: t.statusFilter,
      search: search.trim().isEmpty ? null : search.trim(),
      dateFrom: dateFrom,
      dateTo: dateTo,
    );
  }

  Future<void> _refresh() async {
    // Invalidate every filter the screen could be showing — current tab list
    // plus the per-tab badges — so swipe-action results land everywhere
    // instantly. We then await the active filter's future so callers can rely
    // on the data being fresh by the time `_refresh()` resolves.
    ref.invalidate(invoiceSummaryProvider);
    ref.invalidate(filteredInvoiceSummaryProvider);
    for (final t in _tabs) {
      ref.invalidate(invoicesProvider(InvoiceFilter(customerId: customerId, status: t.statusFilter)));
    }
    ref.invalidate(invoicesProvider(_filter));
    await ref.read(invoicesProvider(_filter).future).catchError((_) => throw 0);
  }

  Future<void> _pickCustomer() async {
    final picked = await showCustomerPicker(context, currentCustomerId: customerId);
    if (picked == null) return;
    setState(() {
      customerId = picked.id;
      customerName = picked.name;
    });
  }

  void _clearCustomer() {
    setState(() {
      customerId = null;
      customerName = null;
    });
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
    // When a customer is selected, source the summary metrics from the
    // per-customer family so the count + due reflect that customer alone.
    final summary = customerId == null
        ? ref.watch(invoiceSummaryProvider)
        : ref.watch(filteredInvoiceSummaryProvider(customerId));
    final list = ref.watch(invoicesProvider(_filter));

    // Header stat chips — count + amount, both tab-aware so they stay in
    // sync with what the user is looking at. Amounts come from the summary
    // when there's a tenant-wide total available; otherwise we sum the
    // loaded page (acceptable since lists are paginated at 50 — the chip
    // is a quick read, not an audit-grade total).
    final count = list.maybeWhen(data: (page) => page.total, orElse: () => null);
    final (double? amount, String amountLabel) = switch (tabKey) {
      'overdue' => (
          summary.maybeWhen(data: (s) => s.overdueAmount, orElse: () => null),
          'overdue',
        ),
      'draft' => (
          list.maybeWhen(
            data: (p) => p.data.fold<double>(0, (s, i) => s + i.totalAmount),
            orElse: () => null,
          ),
          'drafted',
        ),
      'paid' => (
          list.maybeWhen(
            data: (p) => p.data.fold<double>(0, (s, i) => s + i.amountReceived),
            orElse: () => null,
          ),
          'collected',
        ),
      'unpaid' => (
          list.maybeWhen(
            data: (p) => p.data.fold<double>(0, (s, i) => s + i.balanceDue),
            orElse: () => null,
          ),
          'outstanding',
        ),
      _ => (
          summary.maybeWhen(data: (s) => s.totalOutstanding, orElse: () => null),
          'outstanding',
        ),
    };

    // One badge per tab — pagination meta gives accurate `total` regardless
    // of page size, so each filter combo costs one cached request.
    int? cnt(String? status) => ref
        .watch(invoicesProvider(InvoiceFilter(customerId: customerId, status: status)))
        .maybeWhen(data: (p) => p.total, orElse: () => null);
    final badges = <String, int>{
      for (final t in _tabs)
        if (cnt(t.statusFilter) != null) t.key: cnt(t.statusFilter)!,
    };

    // Wrap in Scaffold so the screen carries its own scaffoldBackgroundColor
    // when pushed outside the section-hub shell (which previously provided it).
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
        children: [
          _Header(
            count: count,
            amount: amount,
            amountLabel: amountLabel,
            customerName: customerName,
            onPickCustomer: _pickCustomer,
            onClearCustomer: _clearCustomer,
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
                    itemBuilder: (_, i) => InvoiceRow(
                      invoice: page.data[i],
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
  final int? count;
  final double? amount;
  final String amountLabel;
  /// Active customer filter, if any. When set, the chip below the title row
  /// shows the customer name with an ✕ to clear; tapping the chip area
  /// re-opens the picker.
  final String? customerName;
  final VoidCallback onPickCustomer;
  final VoidCallback onClearCustomer;
  final bool searchOpen;
  final String searchValue;
  final VoidCallback onSearchToggle;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onFilter;
  final bool filterActive;
  const _Header({
    required this.count,
    required this.amount,
    required this.amountLabel,
    required this.customerName,
    required this.onPickCustomer,
    required this.onClearCustomer,
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
                child: Text('Invoices',
                    style: RunqText.h1.copyWith(color: t.ink)),
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
          const SizedBox(height: 10),
          // Customer filter chip — sets the scope for the metric cards
          // and list below. When no customer is selected, renders a small
          // "All customers ▾" affordance; selected state shows the name
          // with an ✕ clear.
          Padding(
            padding: EdgeInsets.only(left: canPop ? 8 : 0),
            child: _CustomerFilterChip(
              name: customerName,
              onPick: onPickCustomer,
              onClear: onClearCustomer,
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: EdgeInsets.only(left: canPop ? 8 : 0, right: 4),
            // IntrinsicHeight bounds the Row's vertical extent so the
            // stretched-cross-axis children get a finite height to fill.
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _StatCard(
                      icon: Icons.receipt_long_rounded,
                      label: count == 1 ? 'INVOICE' : 'INVOICES',
                      value: count == null ? '—' : '$count',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _StatCard(
                      icon: Icons.account_balance_wallet_rounded,
                      label: amountLabel.toUpperCase(),
                      value: amount == null ? '—' : formatINR(amount, compact: true),
                      tinted: true,
                    ),
                  ),
                ],
              ),
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

/// Compact stat card used in the 2-column header grid. Replaces the older
/// chip-style pills so the count + headline amount read as proper KPIs.
class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  /// Brand-tinted variant for the headline amount card.
  final bool tinted;
  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    this.tinted = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Use theme-aware brand tokens so the tinted card stays subtle in dark
    // mode — RunqColors.indigo is the saturated light-mode brand and reads
    // far too loud on a near-black surface.
    final tintBg = tinted ? t.brandSubtle : t.surface;
    final accent = tinted ? t.brand : t.muted;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      color: tintBg,
      border: Border.all(
        color: tinted ? t.brand.withValues(alpha: 0.22) : t.hairline,
        width: 0.5,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: accent),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  style: RunqText.micro.copyWith(
                    color: accent,
                    letterSpacing: 0.05 * 10,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: RunqText.tabular(
              size: 22,
              w: FontWeight.w700,
              color: tinted ? t.brand : t.ink,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

/// Square-with-rounded-corners icon button used for the header search and
/// filter affordances. Matches the design — softer than a full circle, more
/// "tap-target" than a flat IconButton.
/// Customer scope chip for the invoices screen header. Two states:
/// - none picked → muted "All customers ▾" affordance, full row taps to pick
/// - picked      → brand-tinted chip with the name and an ✕ clear button;
///                 tapping the name area re-opens the picker
class _CustomerFilterChip extends StatelessWidget {
  final String? name;
  final VoidCallback onPick;
  final VoidCallback onClear;
  const _CustomerFilterChip({required this.name, required this.onPick, required this.onClear});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final selected = name != null && name!.isNotEmpty;
    final bg = selected ? t.brandSubtle : t.surface;
    final border = selected ? t.brand.withValues(alpha: 0.22) : t.hairline;
    final fg = selected ? t.brand : t.muted;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onPick,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: EdgeInsets.fromLTRB(10, 6, selected ? 4 : 12, 6),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: border, width: 0.5),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.person_outline_rounded, size: 14, color: fg),
              const SizedBox(width: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 220),
                child: Text(
                  selected ? name! : 'All customers',
                  style: RunqText.label.copyWith(
                    color: selected ? t.brand : t.ink,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 4),
              if (selected)
                InkWell(
                  onTap: onClear,
                  customBorder: const CircleBorder(),
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Icon(Icons.close_rounded, size: 14, color: fg),
                  ),
                )
              else
                Icon(Icons.expand_more_rounded, size: 16, color: fg),
            ],
          ),
        ),
      ),
    );
  }
}

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
              style: RunqText.body.copyWith(color: t.ink),
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
                    style: RunqText.tabular(size: 11, w: FontWeight.w700, color: badgeFg),
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

class InvoiceRow extends ConsumerWidget {
  final Invoice invoice;
  /// Optional callback invoked after a successful swipe action so the host
  /// screen can do a full refresh (the same one its pull-to-refresh uses).
  /// Pure family invalidation has shown to occasionally not propagate to
  /// currently-mounted watchers, so we let the screen drive the refetch.
  final Future<void> Function()? onAfterAction;
  /// Compact = no card chrome (no border, no shadow, transparent bg) so the
  /// dashboard's Recent invoices section can stack many rows inside one
  /// shared RunqCard with dividers, matching the Activity layout.
  final bool compact;
  const InvoiceRow({super.key, required this.invoice, this.onAfterAction, this.compact = false});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPartial = invoice.status == 'partially_paid';
    final actions = _buildActions(context, ref);
    final body = Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RqAvatar(
              name: invoice.customerName,
              size: compact ? 36 : 44,
              square: true,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(invoice.customerName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text('${invoice.invoiceNumber} · ${_date(invoice.invoiceDate)}', style: RunqText.caption),
                  if (!isPartial) ...[
                    const SizedBox(height: 6),
                    StatusPill(invoice.status, warning: invoice.status == 'overdue'),
                  ],
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
    );
    final tap = invoice.id.isEmpty ? null : () => context.push('/invoices/${invoice.id}');
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
      groupTag: 'invoices',
      key: ValueKey('invoice-${invoice.id}'),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: actions.length == 1 ? 0.28 : 0.52,
        children: actions,
      ),
      child: tile,
    );
  }

  List<Widget> _buildActions(BuildContext context, WidgetRef ref) {
    switch (invoice.status) {
      case 'draft':
        return [
          SwipeAction(
            icon: Icons.send_rounded,
            label: 'Send',
            color: const Color(0xFF4338CA),
            onTap: () => _send(context, ref),
          ),
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: RunqColors.redInk,
            onTap: () => _delete(context, ref),
          ),
        ];
      case 'sent':
      case 'overdue':
      case 'partially_paid':
        return [
          SwipeAction(
            icon: Icons.notifications_active_rounded,
            label: 'Remind',
            color: const Color(0xFFB45309),
            onTap: () => _remind(context, ref),
          ),
          SwipeAction(
            icon: Icons.check_rounded,
            label: 'Mark paid',
            color: const Color(0xFF047857),
            onTap: () => _markPaid(context, ref),
          ),
        ];
      default:
        return const [];
    }
  }

  Future<void> _refreshAll(WidgetRef ref) async {
    ref.invalidate(invoicesProvider);
    ref.invalidate(invoiceSummaryProvider);
    ref.invalidate(invoiceDetailProvider(invoice.id));
    if (onAfterAction != null) await onAfterAction!();
  }

  Future<void> _send(BuildContext context, WidgetRef ref) async {
    try {
      await invoicesRepo.send(invoice.id);
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(
        context,
        'Sent ${invoice.invoiceNumber} to ${invoice.customerName}',
        kind: SnackKind.success,
      );
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't send: $e", kind: SnackKind.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete invoice?'),
        content: Text('Permanently remove draft ${invoice.invoiceNumber}?'),
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
      await apiClient.delete('/ar/invoices/${invoice.id}/hard');
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Invoice deleted', kind: SnackKind.success);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't delete: $e", kind: SnackKind.error);
    }
  }

  Future<void> _remind(BuildContext context, WidgetRef ref) async {
    final choice = await showReminderChannelSheet(
      context,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
    );
    if (choice == null || !context.mounted) return;
    try {
      // Pick the dunning rule whose escalation level matches this invoice's
      // overdue severity — same logic the auto-run uses.
      final rules = await ref.read(dunningRulesProvider.future);
      final daysOverdue = invoice.dueDate.isBefore(DateTime.now())
          ? DateTime.now().difference(invoice.dueDate).inDays
          : 0;
      final level = daysOverdue >= 45 ? 4 : daysOverdue >= 30 ? 3 : daysOverdue >= 15 ? 2 : 1;
      final rule = rules.firstWhere(
        (r) => r.escalationLevel == level && r.isActive,
        orElse: () => rules.firstWhere((r) => r.isActive, orElse: () => rules.first),
      );

      if (choice.hasEmail) {
        await dunningRepo.sendReminders(
          invoiceIds: [invoice.id],
          ruleId: rule.id,
          channel: 'email',
        );
      }
      if (choice.hasWhatsapp) {
        await dunningRepo.sendReminders(
          invoiceIds: [invoice.id],
          ruleId: rule.id,
          channel: 'whatsapp',
        );
      }
      await _refreshAll(ref);
      if (!context.mounted) return;
      reportReminderOutcome(context, choice);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't send reminder: $e", kind: SnackKind.error);
    }
  }

  Future<void> _markPaid(BuildContext context, WidgetRef ref) async {
    final result = await showPaymentMethodSheet(context, invoice.balanceDue);
    if (result == null) return;
    if (!context.mounted) return;
    try {
      await invoicesRepo.markPaid(
        invoice.id,
        paymentMethod: result.method,
        referenceNumber: result.reference,
      );
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(
        context,
        'Marked ${formatINR(invoice.balanceDue, compact: true)} paid',
        kind: SnackKind.success,
      );
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't mark paid: $e", kind: SnackKind.error);
    }
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
                child: Container(color: RT(context).brand),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('${formatINR(paid)} of ${formatINR(total)} paid',
            style: RunqText.caption),
      ],
    );
  }
}

