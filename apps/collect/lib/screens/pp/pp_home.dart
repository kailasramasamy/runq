import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/notification_bell.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/section_header.dart';
import '../../widgets/tank_gauge.dart';
import '../../utils/friendly_error.dart';
import '../role_shell.dart';
import '../shared/node_qc_report.dart';
import '../shared/receive_history.dart';
import '../shared/receive_leg.dart';

/// Per-CC inbound-to-this-PP tally derived from today's tankers.
typedef _Flow = ({double transit, double received, int tankers});

/// PP operator home — mirrors the CC home layout: emerald hero, raw-milk tank
/// gauge, in-transit/received stats and the CC network feeding this plant today.
class PpHome extends ConsumerWidget {
  const PpHome({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    await ref.read(nodeInboundConsignmentsProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final allCcs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final names = {for (final n in allCcs) n.id: n.name};
    final cons = consAsync.asData?.value ?? const <MpConsignment>[];
    final tankers = cons.where((c) => c.kind == 'cc_to_pp').toList();
    final flow = _flowByNode(tankers);
    final inTransit = flow.values.fold<double>(0, (a, b) => a + b.transit);
    final received = flow.values.fold<double>(0, (a, b) => a + b.received);
    // The hero and stats above are a day view, built on today's inbound. This
    // is the work queue: everything still on the road whatever its collection
    // date. A tanker dispatched on Tuesday and not yet taken in was invisible
    // on this screen by Wednesday, because a today-scoped list drops it.
    final waiting = (ref.watch(nodePendingInboundProvider(node.id)).valueOrNull
            ?? const <MpConsignment>[])
        .where((c) => c.kind == 'cc_to_pp')
        .toList();
    final bands = ref.watch(qualityBandsProvider(node.id)).valueOrNull ?? QualityBands.empty;
    final milkType = node.effectiveMilkType;

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          _header(),
          const SizedBox(height: DhenuSpacing.lg),
          if (waiting.isNotEmpty) ...[
            _toReceiveBanner(context, t, l, waiting),
            const SizedBox(height: DhenuSpacing.md),
          ],
          _hero(context, l, t, consAsync, bands, milkType),
          const SizedBox(height: DhenuSpacing.md),
          if (node.capacityLitres != null) ...[
            DhenuCard(child: TankGauge(
                current: received, capacity: node.capacityLitres!, label: l.ppHomeRawMilkTank)),
            const SizedBox(height: DhenuSpacing.md),
          ],
          _statsRow(l, t, inTransit, received),
          const SizedBox(height: DhenuSpacing.md),
          _quickLinks(context, t, l),
          const SizedBox(height: DhenuSpacing.md),
          _inventoryNote(l, t),
          const SizedBox(height: DhenuSpacing.lg),
          Text(l.ppHomeCcsToday, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _ccList(l, t, flow, names),
        ],
      ),
    );
  }

  /// Group today's inbound tankers by source CC → (in-transit, received, count).
  Map<String, _Flow> _flowByNode(List<MpConsignment> cons) {
    final m = <String, _Flow>{};
    for (final c in cons) {
      final cur = m[c.fromNodeId] ?? (transit: 0.0, received: 0.0, tankers: 0);
      m[c.fromNodeId] = c.received
          ? (transit: cur.transit, received: cur.received + (c.receiptQty ?? 0), tankers: cur.tankers + 1)
          : (transit: cur.transit + (c.dispatchQty ?? 0), received: cur.received, tankers: cur.tankers + 1);
    }
    return m;
  }

  // No sync chip here: the offline queue only ever holds VMCC farmer pours, so
  // at a plant it could only read "Synced" — and "saved on device" when offline,
  // which is untrue. The bell is the only header affordance that means anything.
  Widget _header() => DhenuSectionHeader(node.name, trailing: const NotificationBell());

  Widget _hero(BuildContext context, AppLocalizations l, DhenuTokens t, AsyncValue<List<MpConsignment>> consAsync, QualityBands bands, MilkType milkType) {
    return consAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (e, _) => HeroNumberCard(
        label: l.ppHomeTodayLabel,
        primaryValue: '—',
        footer: Text(friendlyError(context, e), style: DhenuText.caption.copyWith(color: t.gradeC)),
      ),
      data: (all) {
        final received = all.where((c) => c.kind == 'cc_to_pp' && c.received).toList();
        final totalReceipt = received.fold<double>(0, (s, c) => s + (c.receiptQty ?? 0));
        final totalDispatch = received.fold<double>(0, (s, c) => s + (c.dispatchQty ?? 0));
        final tankerCount = received.length;
        final variance = totalDispatch > 0
            ? ((totalReceipt - totalDispatch) / totalDispatch) * 100
            : 0.0;
        final avgFat = _weightedAvg(received, (c) => c.receiptFat ?? 0, (c) => c.receiptQty ?? 0);
        final avgSnf = _weightedAvg(received, (c) => c.receiptSnf ?? 0, (c) => c.receiptQty ?? 0);
        final avgWater = _weightedAvg(received, (c) => c.receiptWater ?? 0, (c) => c.receiptQty ?? 0);
        final vLabel = l.ppHomeVarianceVsDispatch(variance >= 0
            ? '+${variance.toStringAsFixed(1)}'
            : variance.toStringAsFixed(1));

        final onHeroSoft = Colors.white.withValues(alpha: 0.82);
        return HeroNumberCard(
          label: l.ppHomeTodayReceivedLabel,
          primaryValue: litres(totalReceipt, unit: true),
          delta: variance.abs() < 0.05 ? null : vLabel,
          gradient: const LinearGradient(
            colors: [DhenuColors.brand, DhenuColors.brandDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          footer: Row(children: [
            Text(l.ppHomeTankersCount(tankerCount),
                style: DhenuText.body.copyWith(color: onHeroSoft)),
            const Spacer(),
            if (avgFat > 0)
              _heroQuality(
                bands: bands,
                milkType: milkType,
                fat: avgFat,
                snf: avgSnf,
                water: avgWater,
              ),
          ]),
        );
      },
    );
  }

  /// Quality readout for the brand-gradient hero.
  ///
  /// Band COLOUR cannot be used on this surface: against the gradient every
  /// band step fails contrast — 1.06:1 at worst, and even a 65% black scrim
  /// only lifts the red band to 4.08:1. So the values stay white on a
  /// translucent scrim (~5:1) and a breach is signalled by an icon instead,
  /// which survives any background. The per-tanker rows below still carry the
  /// band colours, on the dark surface they were built for.
  Widget _heroQuality({
    required QualityBands bands,
    required MilkType milkType,
    required double fat,
    required double snf,
    required double water,
  }) {
    final breached = QualityBadge.anyOutOfBand(
        bands, milkType, {'fat': fat, 'snf': snf});
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (breached) ...[
          const Icon(DhenuIcons.warning, size: 12, color: Colors.white),
          const SizedBox(width: 4),
        ],
        Text(
          'FAT ${fat.toStringAsFixed(1)} · SNF ${snf.toStringAsFixed(1)}'
          '${water > 0 ? ' · W ${water.toStringAsFixed(1)}' : ''}',
          style: DhenuText.caption.copyWith(color: Colors.white),
        ),
      ]),
    );
  }

  double _weightedAvg(
    List<MpConsignment> list,
    double Function(MpConsignment) val,
    double Function(MpConsignment) weight,
  ) {
    final totalW = list.fold<double>(0, (s, c) => s + weight(c));
    if (totalW == 0) return 0;
    return list.fold<double>(0, (s, c) => s + val(c) * weight(c)) / totalW;
  }

  Widget _statsRow(AppLocalizations l, DhenuTokens t, double inTransit, double received) => Row(children: [
        Expanded(child: _miniStat(t, l.ccInTransitLabel, litres(inTransit, unit: true),
            DhenuIcons.truck, t.am)),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _miniStat(t, l.ppHomeReceivedLabel, litres(received, unit: true),
            DhenuIcons.package, received > 0.05 ? t.brand : t.inkSoft)),
      ]);

  Widget _miniStat(DhenuTokens t, String label, String value, IconData icon, Color color) =>
      DhenuCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: DhenuSpacing.xs),
            Expanded(child: Text(label.toUpperCase(),
                style: DhenuText.label.copyWith(color: t.inkSoft), overflow: TextOverflow.ellipsis)),
          ]),
          const SizedBox(height: DhenuSpacing.sm),
          Text(value, style: DhenuText.number(size: 20, color: t.ink)),
        ]),
      );

  /// Tankers on the road, whatever day they were collected — the one thing on
  /// this page that is a queue rather than a day view. Tapping opens Receive,
  /// which is where they get cleared.
  Widget _toReceiveBanner(BuildContext context, DhenuTokens t, AppLocalizations l,
          List<MpConsignment> waiting) =>
      Material(
        color: t.am.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InkWell(
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          // 1 = Receive, the same index PpShell maps 'receive' to.
          onTap: () => RoleShell.goToTab(context, 1),
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.md),
            child: Row(children: [
              Icon(DhenuIcons.transit, size: 18, color: t.am),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.ppHomeTankersToReceive(waiting.length),
                      style: DhenuText.body.copyWith(
                          color: t.ink, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    litres(
                        waiting.fold<double>(0, (a, c) => a + (c.dispatchQty ?? 0)),
                        unit: true),
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  ),
                ]),
              ),
              Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
            ]),
          ),
        ),
      );

  /// Everything on this page is today; these two are the way back through it.
  /// A plant has no rate chart and no collection report of its own, so the pair
  /// sits on one row rather than the CC's 2×2 grid.
  Widget _quickLinks(BuildContext context, DhenuTokens t, AppLocalizations l) {
    final leg = ReceiveLeg.ccToPp(l);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
            child: _linkCard(context, t, DhenuIcons.history, l.homeHistory,
                ReceiveHistory(node: node, leg: leg))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
            child: _linkCard(context, t, DhenuIcons.barChart, l.ccHomeQcReportLink,
                NodeQcReport(node: node, leg: leg))),
      ]),
    );
  }

  Widget _linkCard(BuildContext context, DhenuTokens t, IconData icon, String label, Widget page) =>
      DhenuCard(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.lg),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(label, style: DhenuText.h2.copyWith(color: t.ink))),
            body: page,
          ),
        )),
        child: Column(children: [
          Icon(icon, color: t.brand),
          const SizedBox(height: DhenuSpacing.sm),
          Text(label, textAlign: TextAlign.center, style: DhenuText.label.copyWith(color: t.ink)),
        ]),
      );

  Widget _inventoryNote(AppLocalizations l, DhenuTokens t) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
        decoration: BoxDecoration(
          color: t.brandSubtle,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Row(children: [
          Icon(DhenuIcons.package, size: 16, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(
              l.ppHomeInventoryNote,
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ),
        ]),
      );

  Widget _ccList(AppLocalizations l, DhenuTokens t, Map<String, _Flow> flow, Map<String, String> names) {
    if (flow.isEmpty) {
      return DhenuEmptyState(
        icon: DhenuIcons.snowflake,
        title: l.ppHomeNoCcsTitle,
        subtitle: l.ppHomeNoCcsSubtitle,
      );
    }
    final ids = flow.keys.toList()
      ..sort((a, b) =>
          (flow[b]!.transit + flow[b]!.received).compareTo(flow[a]!.transit + flow[a]!.received));
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < ids.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          _ccRow(l, t, names[ids[i]] ?? 'CC', flow[ids[i]]!),
        ],
      ]),
    );
  }

  Widget _ccRow(AppLocalizations l, DhenuTokens t, String name, _Flow f) {
    final total = f.transit + f.received;
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.snowflake, size: 20, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(l.ppHomeTankersCount(f.tankers),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(total, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 4),
          _flowChip(l, t, f),
        ]),
      ]),
    );
  }

  Widget _flowChip(AppLocalizations l, DhenuTokens t, _Flow f) {
    final (label, color) = switch (f) {
      _ when f.transit > 0 => (l.ppHomeFlowTransit(litres(f.transit)), t.gradeB),
      _ when f.received > 0 => (l.ppHomeFlowReceived(litres(f.received)), t.gradeA),
      _ => ('—', t.inkSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(label, style: DhenuText.caption.copyWith(color: color)),
    );
  }
}
