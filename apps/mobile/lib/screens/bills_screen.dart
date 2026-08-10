import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../services/bill_intake.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../widgets/async_slot.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/list_filter_kit.dart';
import '../widgets/vendor_picker_screen.dart';
import 'bill_row.dart';
import 'bills_header.dart';
export 'bill_row.dart' show BillRow;

class BillsScreen extends ConsumerStatefulWidget {
  /// Optional starting tab key (e.g. `'pending'`). The hub tile uses this
  /// so tapping "5 pending" lands on the screen pre-filtered.
  final String? initialTab;
  const BillsScreen({super.key, this.initialTab});

  @override
  ConsumerState<BillsScreen> createState() => _BillsScreenState();
}

class _BillsScreenState extends ConsumerState<BillsScreen> {
  late String tabKey = billTabs.any((t) => t.key == widget.initialTab)
      ? widget.initialTab!
      : 'all';
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  String search = '';
  DateTime? dateFrom;
  DateTime? dateTo;
  String? vendorId;
  String? vendorName;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  BillFilter get _filter {
    final t = billTabs.firstWhere((t) => t.key == tabKey, orElse: () => billTabs.first);
    return BillFilter(
      vendorId: vendorId,
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
    // Invalidate every per-tab list so the badge counts and the active list
    // update together after a swipe action; await the active filter so this
    // future completes only when fresh data has landed.
    ref.invalidate(billsSummaryProvider);
    ref.invalidate(filteredBillsSummaryProvider);
    for (final t in billTabs) {
      ref.invalidate(billsProvider(BillFilter(vendorId: vendorId, status: t.statusFilter)));
    }
    ref.invalidate(billsProvider(_filter));
    await ref.read(billsProvider(_filter).future).catchError((_) => throw 0);
  }

  Future<void> _pickVendor() async {
    final picked = await showVendorPicker(context, currentVendorId: vendorId);
    if (picked == null) return;
    setState(() {
      vendorId = picked.id;
      vendorName = picked.name;
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
    final list = ref.watch(billsProvider(_filter));
    // When a vendor is selected, source the summary from the per-vendor
    // family so the count + outstanding cards reflect that vendor alone.
    final summary = vendorId == null
        ? ref.watch(billsSummaryProvider)
        : ref.watch(filteredBillsSummaryProvider(vendorId));
    final count = list.maybeWhen(data: (page) => page.total, orElse: () => null);
    final (amount, amountLabel) = _headlineAmount(summary, list);

    // Counts on every tab. Pagination meta gives accurate `total` regardless
    // of page size, so each filter combo costs one cached request.
    int? cnt(String? status) => ref
        .watch(billsProvider(BillFilter(vendorId: vendorId, status: status)))
        .maybeWhen(data: (p) => p.total, orElse: () => null);
    final badges = <String, int>{
      for (final tab in billTabs)
        if (cnt(tab.statusFilter) != null) tab.key: cnt(tab.statusFilter)!,
    };

    final header = BillsHeader(
      count: count,
      amount: amount,
      amountLabel: amountLabel,
      vendorName: vendorName,
      onPickVendor: _pickVendor,
      onClearVendor: () => setState(() {
        vendorId = null;
        vendorName = null;
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
                child: AsyncSlot<PaginatedResponse<Bill>>(
                  value: list,
                  onRetry: () => ref.invalidate(billsProvider(_filter)),
                  data: (page) => _body(header, page.data),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(Widget header, List<Bill> bills) {
    // No day grouping here: bills trickle in a few at a time, so per-day
    // headers would outnumber the rows. Each row carries its own date block.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 120),
      children: [
        header,
        if (bills.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 40),
            child: EmptyState(
              icon: Icons.description_outlined,
              title: 'No bills',
              subtitle: 'Tap Add bill to capture one, or widen the filters.',
            ),
          )
        else
          _BillList(bills: bills, onAfterAction: _refresh),
      ],
    );
  }

  /// Tab-aware headline: each tab has a different "money number" worth
  /// showing. The tenant-wide outstanding comes from the summary; the rest
  /// sum the loaded page (fine at a 50-row page — this is a quick read, not
  /// an audit-grade total).
  (double?, String) _headlineAmount(
    AsyncValue<BillsSummary> summary,
    AsyncValue<PaginatedResponse<Bill>> list,
  ) {
    double? pageSum(double Function(Bill) pick) => list.maybeWhen(
        data: (p) => p.data.fold<double>(0, (s, b) => s + pick(b)), orElse: () => null);
    return switch (tabKey) {
      'pending' => (pageSum((b) => b.balanceDue), 'to pay'),
      'approved' => (pageSum((b) => b.balanceDue), 'to pay'),
      'paid' => (pageSum((b) => b.amountPaid), 'paid'),
      _ => (summary.maybeWhen(data: (s) => s.totalOutstanding, orElse: () => null), 'to pay'),
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
          Expanded(child: Text('Bills', style: RunqText.h1.copyWith(color: t.ink))),
          IconButton(
            onPressed: () => context.push('/purchases/analytics'),
            icon: Icon(Icons.insights_rounded, color: t.muted),
            tooltip: 'Purchase analytics',
          ),
          const SizedBox(width: 4),
          // Intake sheet carries scan / photos / files.
          AddBillButton(onTap: () => startBillIntake(context, showRecent: false)),
        ],
      ),
    );
  }
}

class _BillList extends StatelessWidget {
  final List<Bill> bills;
  final Future<void> Function() onAfterAction;
  const _BillList({required this.bills, required this.onAfterAction});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      // One card for the whole list, rows separated by hairlines — `compact`
      // strips each row's own chrome so they stack cleanly inside it.
      child: Material(
        color: t.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: t.hairline),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < bills.length; i++) ...[
              if (i > 0) Divider(height: 1, thickness: 1, color: t.hairlineSoft, indent: 68),
              BillRow(
                bill: bills[i],
                compact: true,
                showDate: true,
                onAfterAction: onAfterAction,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
