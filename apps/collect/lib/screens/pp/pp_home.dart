import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/sync_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/section_header.dart';
import '../../widgets/sync_status.dart';
import '../../widgets/tank_gauge.dart';

/// Per-CC inbound-to-this-PP tally derived from today's tankers.
typedef _Flow = ({double transit, double received, int tankers});

/// PP operator home — mirrors the CC home layout: emerald hero, raw-milk tank
/// gauge, in-transit/received stats, the CC network feeding this plant today,
/// and recent tanker receipts.
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
    final sync = ref.watch(syncProvider);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final allCcs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final names = {for (final n in allCcs) n.id: n.name};
    final cons = consAsync.asData?.value ?? const <MpConsignment>[];
    final tankers = cons.where((c) => c.kind == 'cc_to_pp').toList();
    final flow = _flowByNode(tankers);
    final inTransit = flow.values.fold<double>(0, (a, b) => a + b.transit);
    final received = flow.values.fold<double>(0, (a, b) => a + b.received);

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          _header(context, ref, t, sync),
          const SizedBox(height: DhenuSpacing.lg),
          _hero(t, consAsync),
          const SizedBox(height: DhenuSpacing.md),
          if (node.capacityLitres != null) ...[
            DhenuCard(child: TankGauge(
                current: received, capacity: node.capacityLitres!, label: 'Raw-milk tank')),
            const SizedBox(height: DhenuSpacing.md),
          ],
          _statsRow(t, inTransit, received),
          const SizedBox(height: DhenuSpacing.md),
          _inventoryNote(t),
          const SizedBox(height: DhenuSpacing.lg),
          Text('CCs · today', style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _ccList(t, flow, names),
          const SizedBox(height: DhenuSpacing.lg),
          Text('Recent receives', style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _recentReceives(t, tankers, names),
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

  Widget _header(BuildContext context, WidgetRef ref, DhenuTokens t, SyncSnapshot sync) {
    return DhenuSectionHeader(
      node.name,
      trailing: SyncStatus(
        state: sync.state,
        pendingCount: sync.pendingCount,
        onTap: () => ref.read(syncProvider.notifier).forceSync(),
      ),
    );
  }

  Widget _hero(DhenuTokens t, AsyncValue<List<MpConsignment>> consAsync) {
    return consAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (e, _) => HeroNumberCard(
        label: 'TODAY',
        primaryValue: '—',
        footer: Text('$e', style: DhenuText.caption.copyWith(color: t.gradeC)),
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
        final vLabel = variance >= 0
            ? '+${variance.toStringAsFixed(1)}% vs disp.'
            : '${variance.toStringAsFixed(1)}% vs disp.';

        const onHero = Colors.white;
        final onHeroSoft = Colors.white.withValues(alpha: 0.82);
        return HeroNumberCard(
          label: 'TODAY RECEIVED',
          primaryValue: litres(totalReceipt, unit: true),
          delta: variance.abs() < 0.05 ? null : vLabel,
          gradient: const LinearGradient(
            colors: [DhenuColors.brand, DhenuColors.brandDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          footer: Row(children: [
            Text('$tankerCount tankers',
                style: DhenuText.body.copyWith(color: onHeroSoft)),
            const Spacer(),
            if (avgFat > 0)
              Text('FAT ${avgFat.toStringAsFixed(1)} · SNF ${avgSnf.toStringAsFixed(1)}',
                  style: DhenuText.caption.copyWith(color: onHero)),
          ]),
        );
      },
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

  Widget _statsRow(DhenuTokens t, double inTransit, double received) => Row(children: [
        Expanded(child: _miniStat(t, 'In transit', litres(inTransit, unit: true),
            DhenuIcons.truck, t.am)),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _miniStat(t, 'Received', litres(received, unit: true),
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

  Widget _inventoryNote(DhenuTokens t) => Container(
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
              '→ Accepted posts to runq Inventory (raw-milk batch)',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ),
        ]),
      );

  Widget _ccList(DhenuTokens t, Map<String, _Flow> flow, Map<String, String> names) {
    if (flow.isEmpty) {
      return const DhenuEmptyState(
        icon: DhenuIcons.snowflake,
        title: 'No CCs dispatching',
        subtitle: 'Chilling centres feeding this plant appear here',
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
          _ccRow(t, names[ids[i]] ?? 'CC', flow[ids[i]]!),
        ],
      ]),
    );
  }

  Widget _ccRow(DhenuTokens t, String name, _Flow f) {
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
          Text('${f.tankers} tanker${f.tankers == 1 ? '' : 's'}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(total, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 4),
          _flowChip(t, f),
        ]),
      ]),
    );
  }

  Widget _flowChip(DhenuTokens t, _Flow f) {
    final (label, color) = switch (f) {
      _ when f.transit > 0 => ('⏳ ${litres(f.transit)} transit', t.gradeB),
      _ when f.received > 0 => ('✓ ${litres(f.received)} received', t.gradeA),
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

  Widget _recentReceives(DhenuTokens t, List<MpConsignment> tankers, Map<String, String> names) {
    final received = tankers.where((c) => c.received).toList().reversed.toList();
    if (received.isEmpty) {
      return const DhenuEmptyState(
        icon: DhenuIcons.package,
        title: 'No receipts yet',
        subtitle: 'Tankers you receive from CCs show here',
      );
    }
    final show = received.take(5).toList();
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < show.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          _receiveRow(t, show[i], names),
        ],
      ]),
    );
  }

  Widget _receiveRow(DhenuTokens t, MpConsignment c, Map<String, String> names) {
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Icon(DhenuIcons.truck, size: 18, color: t.brand),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(names[c.fromNodeId] ?? 'CC',
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Row(children: [
            Flexible(
              child: Text('${c.containerNo ?? c.consignmentNo} · ',
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (c.receiptFat != null)
              QualityBadge(fat: c.receiptFat, snf: c.receiptSnf, grade: Grade.unknown),
          ]),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 2),
          Text('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}% var',
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
      ]),
    );
  }
}
