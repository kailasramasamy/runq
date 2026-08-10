import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/sales_analytics_models.dart';
import '../../providers/sales_analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/customer_picker_screen.dart';
import '../../widgets/date_range_sheet.dart';
import '../../widgets/list_filter_kit.dart';
import '../../widgets/runq_card.dart';

part '_sales_analytics_cards.dart';
part '_sales_analytics_charts.dart';

/// Sales analytics — revenue and who/what drove it, over any window.
///
/// Every figure is invoice basis: issued invoices dated in the window, less
/// credit notes issued in it. That ties the screen to the invoice list rather
/// than to the GL, so it can differ from the P&L — the footnote says so
/// rather than leaving the user to discover the gap.
class SalesAnalyticsScreen extends ConsumerWidget {
  const SalesAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final range = ref.watch(salesRangeProvider);
    final customer = ref.watch(salesCustomerProvider);
    final query = ref.watch(salesQueryProvider);
    final data = ref.watch(salesAnalyticsProvider(query));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Sales analytics'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async => ref.invalidate(salesAnalyticsProvider(query)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
            children: [
              _RangeBar(
                range: range,
                onPreset: (p) => ref.read(salesRangeProvider.notifier).state =
                    SalesRange.forPreset(p),
                onCustom: () => _pickCustom(context, ref, range),
              ),
              const SizedBox(height: 8),
              _CustomerScopeBar(
                customer: customer,
                onPick: () => _pickCustomer(context, ref),
                onClear: () => ref.read(salesCustomerProvider.notifier).state = null,
              ),
              const SizedBox(height: 14),
              ...data.when(
                loading: () => const [_LoadingBlock()],
                error: (e, _) => [_ErrorCard(message: '$e')],
                data: (d) => d.isEmpty
                    ? [_NoSalesCard(customerName: customer?.name)]
                    : _sections(d, scopedToCustomer: customer != null),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Top customers is dropped when the view is already one customer — a
  /// single 100% bar answers nothing.
  List<Widget> _sections(SalesAnalytics d, {required bool scopedToCustomer}) => [
        _HeadlineCards(headline: d.headline),
        const SizedBox(height: 14),
        _RevenueTrendCard(points: d.trend, grain: d.grain),
        const SizedBox(height: 14),
        _CollectionsCard(collections: d.collections, headline: d.headline),
        const SizedBox(height: 14),
        if (!scopedToCustomer) ...[
          _TopCustomersCard(rows: d.topCustomers),
          const SizedBox(height: 14),
        ],
        _StatusSplitCard(slices: d.statusSplit),
        const SizedBox(height: 14),
        _TopItemsCard(rows: d.topItems),
        const SizedBox(height: 14),
        const _BasisFootnote(),
      ];

  Future<void> _pickCustomer(BuildContext context, WidgetRef ref) async {
    final current = ref.read(salesCustomerProvider);
    final picked = await showCustomerPicker(context, currentCustomerId: current?.id);
    if (picked == null) return;
    ref.read(salesCustomerProvider.notifier).state =
        SalesCustomerScope(id: picked.id, name: picked.name);
  }

  Future<void> _pickCustom(BuildContext context, WidgetRef ref, SalesRange current) async {
    final picked = await showDateRangeSheet(
      context,
      initialFrom: current.from,
      initialTo: current.to,
    );
    if (picked == null || picked.from == null || picked.to == null) return;
    ref.read(salesRangeProvider.notifier).state = SalesRange(
      from: picked.from!,
      to: picked.to!,
      preset: SalesRangePreset.custom,
    );
  }
}

/// Customer scope. One pill, because the choice is binary — everyone, or one
/// named customer — and the picker is a full screen behind it.
class _CustomerScopeBar extends StatelessWidget {
  final SalesCustomerScope? customer;
  final VoidCallback onPick, onClear;
  const _CustomerScopeBar({
    required this.customer,
    required this.onPick,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final scoped = customer != null;
    return Material(
      color: scoped ? t.brandSubtle : t.surface,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPick,
        child: Container(
          height: 48,
          padding: EdgeInsets.fromLTRB(12, 0, scoped ? 4 : 12, 0),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: scoped ? t.brand.withValues(alpha: 0.35) : t.hairline,
              width: 0.5,
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.person_outline_rounded,
                  size: 18, color: scoped ? t.brand : t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      scoped ? 'CUSTOMER' : 'SHOWING',
                      style: RunqText.micro.copyWith(
                          color: scoped ? t.brand : t.muted2, letterSpacing: 0.5),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      scoped ? customer!.name : 'All customers',
                      style: RunqText.bodyStrong
                          .copyWith(color: scoped ? t.brand : t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (scoped)
                IconButton(
                  onPressed: onClear,
                  icon: Icon(Icons.close_rounded, size: 18, color: t.brand),
                  tooltip: 'Show all customers',
                  visualDensity: VisualDensity.compact,
                )
              else
                Icon(Icons.expand_more_rounded, size: 20, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Preset chips plus the resolved window underneath, so "This FY" always
/// states the dates it actually asked for.
class _RangeBar extends StatelessWidget {
  final SalesRange range;
  final ValueChanged<SalesRangePreset> onPreset;
  final VoidCallback onCustom;
  const _RangeBar({
    required this.range,
    required this.onPreset,
    required this.onCustom,
  });

  static const _presets = [
    SalesRangePreset.thisMonth,
    SalesRangePreset.lastMonth,
    SalesRangePreset.days90,
    SalesRangePreset.thisFy,
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 34,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _presets.length + 1,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              if (i == _presets.length) {
                return FilterPill(
                  label: SalesRangePreset.custom.label,
                  active: range.preset == SalesRangePreset.custom,
                  leading: Icons.date_range_rounded,
                  onTap: onCustom,
                );
              }
              final p = _presets[i];
              return FilterPill(
                label: p.label,
                active: range.preset == p,
                onTap: () => onPreset(p),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '${listDayMon(range.from)} — ${listDayMon(range.to)}',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      ],
    );
  }
}
