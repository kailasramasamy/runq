import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/purchase_analytics_models.dart';
import '../../providers/purchase_analytics_providers.dart';
import '../../providers/sales_analytics_providers.dart'
    show SalesRange, SalesRangePreset, SalesRangePresetLabel;
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/date_range_sheet.dart';
import '../../widgets/list_filter_kit.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/vendor_picker_screen.dart';

part '_purchase_analytics_cards.dart';
part '_purchase_analytics_charts.dart';

/// Purchase analytics — spend and who/what drove it, over any window. The AP
/// mirror of the sales screen, section for section, so a user moving between
/// the two doesn't have to re-learn the layout.
///
/// Every figure is bill basis: booked vendor bills dated in the window, less
/// debit notes issued in it. Drafts and cancelled bills are excluded; bills
/// still awaiting a three-way match are not, because the goods arrived and
/// the money is owed either way.
class PurchaseAnalyticsScreen extends ConsumerWidget {
  const PurchaseAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final range = ref.watch(purchaseRangeProvider);
    final vendor = ref.watch(purchaseVendorProvider);
    final query = ref.watch(purchaseQueryProvider);
    final data = ref.watch(purchaseAnalyticsProvider(query));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Purchase analytics'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async => ref.invalidate(purchaseAnalyticsProvider(query)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
            children: [
              _PurchaseRangeBar(
                range: range,
                onPreset: (p) => ref.read(purchaseRangeProvider.notifier).state =
                    SalesRange.forPreset(p),
                onCustom: () => _pickCustom(context, ref, range),
              ),
              const SizedBox(height: 8),
              _VendorScopeBar(
                vendor: vendor,
                onPick: () => _pickVendor(context, ref),
                onClear: () => ref.read(purchaseVendorProvider.notifier).state = null,
              ),
              const SizedBox(height: 14),
              ...data.when(
                loading: () => const [_PurchaseLoadingBlock()],
                error: (e, _) => [_PurchaseErrorCard(message: '$e')],
                data: (d) => d.isEmpty
                    ? [_NoPurchasesCard(vendorName: vendor?.name)]
                    : _sections(d, scopedToVendor: vendor != null),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Top vendors is dropped when the view is already one vendor — a single
  /// 100% bar answers nothing.
  List<Widget> _sections(PurchaseAnalytics d, {required bool scopedToVendor}) => [
        _PurchaseHeadlineCards(headline: d.headline),
        const SizedBox(height: 14),
        _SpendTrendCard(points: d.trend, grain: d.grain),
        const SizedBox(height: 14),
        _PaymentsCard(payments: d.payments),
        const SizedBox(height: 14),
        if (!scopedToVendor) ...[
          _TopVendorsCard(rows: d.topVendors),
          const SizedBox(height: 14),
        ],
        _PurchaseStatusCard(slices: d.statusSplit),
        const SizedBox(height: 14),
        _PurchaseTopItemsCard(rows: d.topItems),
        const SizedBox(height: 14),
        const _PurchaseBasisFootnote(),
      ];

  Future<void> _pickVendor(BuildContext context, WidgetRef ref) async {
    final current = ref.read(purchaseVendorProvider);
    final picked = await showVendorPicker(context, currentVendorId: current?.id);
    if (picked == null) return;
    ref.read(purchaseVendorProvider.notifier).state =
        PurchaseVendorScope(id: picked.id, name: picked.name);
  }

  Future<void> _pickCustom(BuildContext context, WidgetRef ref, SalesRange current) async {
    final picked = await showDateRangeSheet(
      context,
      initialFrom: current.from,
      initialTo: current.to,
    );
    if (picked == null || picked.from == null || picked.to == null) return;
    ref.read(purchaseRangeProvider.notifier).state = SalesRange(
      from: picked.from!,
      to: picked.to!,
      preset: SalesRangePreset.custom,
    );
  }
}

/// Vendor scope. Full-width so a long vendor name has room and the control
/// reads as a filter rather than a decoration.
class _VendorScopeBar extends StatelessWidget {
  final PurchaseVendorScope? vendor;
  final VoidCallback onPick, onClear;
  const _VendorScopeBar({
    required this.vendor,
    required this.onPick,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final scoped = vendor != null;
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
              Icon(Icons.storefront_outlined,
                  size: 18, color: scoped ? t.brand : t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      scoped ? 'VENDOR' : 'SHOWING',
                      style: RunqText.micro.copyWith(
                          color: scoped ? t.brand : t.muted2, letterSpacing: 0.5),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      scoped ? vendor!.name : 'All vendors',
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
                  tooltip: 'Show all vendors',
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
class _PurchaseRangeBar extends StatelessWidget {
  final SalesRange range;
  final ValueChanged<SalesRangePreset> onPreset;
  final VoidCallback onCustom;
  const _PurchaseRangeBar({
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
