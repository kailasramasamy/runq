import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../widgets/async_slot.dart';
import '../widgets/customer_picker_screen.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/list_filter_kit.dart';
import 'invoice_row.dart';
import 'invoices_header.dart';
export 'invoice_row.dart' show InvoiceRow;

class InvoicesScreen extends ConsumerStatefulWidget {
  /// Optional starting tab key (e.g. `'draft'` or `'overdue'`). The hub tiles
  /// use this so tapping "20 draft" lands on the screen pre-filtered.
  final String? initialTab;
  const InvoicesScreen({super.key, this.initialTab});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  late String tabKey = invoiceTabs.any((t) => t.key == widget.initialTab)
      ? widget.initialTab!
      : 'all';
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  String search = '';
  DateTime? dateFrom;
  DateTime? dateTo;
  String? customerId;
  String? customerName;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  InvoiceFilter get _filter {
    final t = invoiceTabs.firstWhere((t) => t.key == tabKey, orElse: () => invoiceTabs.first);
    return InvoiceFilter(
      customerId: customerId,
      status: t.statusFilter,
      search: search.trim().isEmpty ? null : search.trim(),
      dateFrom: dateFrom,
      dateTo: dateTo,
    );
  }

  /// Search hits the server, so hold off until typing pauses — otherwise
  /// every keystroke spawns a fresh provider family and request.
  void _onSearchChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => search = v);
    });
  }

  Future<void> _refresh() async {
    // Invalidate every filter the screen could be showing — current tab list
    // plus the per-tab badges — so swipe-action results land everywhere
    // instantly. We then await the active filter's future so callers can rely
    // on the data being fresh by the time `_refresh()` resolves.
    ref.invalidate(invoiceSummaryProvider);
    ref.invalidate(filteredInvoiceSummaryProvider);
    for (final t in invoiceTabs) {
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

  Future<void> _pickRange() async {
    final result = await showDateRangeSheet(context, initialFrom: dateFrom, initialTo: dateTo);
    if (result == null) return;
    setState(() {
      dateFrom = result.from;
      dateTo = result.to;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // When a customer is selected, source the summary metrics from the
    // per-customer family so the count + due reflect that customer alone.
    final summary = customerId == null
        ? ref.watch(invoiceSummaryProvider)
        : ref.watch(filteredInvoiceSummaryProvider(customerId));
    final list = ref.watch(invoicesProvider(_filter));
    final count = list.maybeWhen(data: (page) => page.total, orElse: () => null);
    final (amount, amountLabel) = _headlineAmount(summary, list);

    // One badge per tab — pagination meta gives accurate `total` regardless
    // of page size, so each filter combo costs one cached request.
    int? cnt(String? status) => ref
        .watch(invoicesProvider(InvoiceFilter(customerId: customerId, status: status)))
        .maybeWhen(data: (p) => p.total, orElse: () => null);
    final badges = <String, int>{
      for (final tab in invoiceTabs)
        if (cnt(tab.statusFilter) != null) tab.key: cnt(tab.statusFilter)!,
    };

    final header = InvoicesHeader(
      count: count,
      amount: amount,
      amountLabel: amountLabel,
      customerName: customerName,
      onPickCustomer: _pickCustomer,
      onClearCustomer: () => setState(() {
        customerId = null;
        customerName = null;
      }),
      rangeLabel: listRangeLabel(dateFrom, dateTo),
      rangeActive: dateFrom != null || dateTo != null,
      onPickRange: _pickRange,
      tabKey: tabKey,
      badges: badges,
      onTab: (k) => setState(() => tabKey = k),
      searchController: _searchCtrl,
      onSearchChanged: _onSearchChanged,
    );

    // Wrap in Scaffold so the screen carries its own scaffoldBackgroundColor
    // when pushed outside the section-hub shell (which previously provided it).
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TitleBar(t: t),
            Expanded(
              child: RefreshIndicator(
                color: t.brand,
                onRefresh: _refresh,
                child: AsyncSlot<PaginatedResponse<Invoice>>(
                  value: list,
                  onRetry: () => ref.invalidate(invoicesProvider(_filter)),
                  data: (page) => _body(header, page.data),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(Widget header, List<Invoice> invoices) {
    final groups = groupByDay(invoices, (i) => i.invoiceDate);
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 120),
      itemCount: groups.length + 1,
      itemBuilder: (_, i) {
        if (i == 0) {
          return Column(
            children: [
              header,
              if (invoices.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 40),
                  child: EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'No invoices',
                    subtitle: 'Try a different tab, widen the dates, or clear the search.',
                  ),
                ),
            ],
          );
        }
        return _DayGroup(group: groups[i - 1], onAfterAction: _refresh);
      },
    );
  }

  /// Tab-aware headline: each tab has a different "money number" worth
  /// showing. Tenant-wide totals come from the summary where one exists;
  /// otherwise we sum the loaded page (fine at a 50-row page — the card is a
  /// quick read, not an audit-grade total).
  (double?, String) _headlineAmount(
    AsyncValue<InvoiceSummary> summary,
    AsyncValue<PaginatedResponse<Invoice>> list,
  ) {
    double? pageSum(double Function(Invoice) pick) => list.maybeWhen(
        data: (p) => p.data.fold<double>(0, (s, i) => s + pick(i)), orElse: () => null);
    return switch (tabKey) {
      'overdue' => (summary.maybeWhen(data: (s) => s.overdueAmount, orElse: () => null), 'overdue'),
      'draft' => (pageSum((i) => i.totalAmount), 'drafted'),
      'paid' => (pageSum((i) => i.amountReceived), 'collected'),
      'unpaid' => (pageSum((i) => i.balanceDue), 'outstanding'),
      _ => (summary.maybeWhen(data: (s) => s.totalOutstanding, orElse: () => null), 'outstanding'),
    };
  }
}

class _TitleBar extends StatelessWidget {
  final RunqTokens t;
  const _TitleBar({required this.t});

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return Padding(
      padding: EdgeInsets.fromLTRB(canPop ? 8 : 20, 8, 16, 8),
      child: Row(
        children: [
          if (canPop) ...[
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: Icon(Icons.arrow_back_rounded, color: t.ink),
            ),
            const SizedBox(width: 4),
          ],
          Expanded(child: Text('Invoices', style: RunqText.h1.copyWith(color: t.ink))),
          IconButton(
            onPressed: () => context.push('/sales/analytics'),
            icon: Icon(Icons.insights_rounded, color: t.muted),
            tooltip: 'Sales analytics',
          ),
        ],
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  final ({DateTime day, List<Invoice> items}) group;
  final Future<void> Function() onAfterAction;
  const _DayGroup({required this.group, required this.onAfterAction});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListDayHeader(day: group.day),
          // One card per day, rows separated by hairlines — `compact` strips
          // each row's own card chrome so they stack cleanly inside it.
          Material(
            color: t.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(color: t.hairline),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < group.items.length; i++) ...[
                  if (i > 0)
                    Divider(height: 1, thickness: 1, color: t.hairlineSoft, indent: 60),
                  InvoiceRow(
                    invoice: group.items[i],
                    compact: true,
                    onAfterAction: onAfterAction,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
