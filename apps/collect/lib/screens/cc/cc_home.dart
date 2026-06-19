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

/// Per-VMCC inbound-to-this-CC tally derived from today's consignments.
typedef _Flow = ({double transit, double received});

/// CC operator home — a live view of the VMCC network feeding this chilling
/// centre: how much each VMCC has collected today (even before dispatch), what's
/// in transit, what's been received, recent receipts, and onward-dispatch room.
class CcHome extends ConsumerWidget {
  const CcHome({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(ccVmccCollectionsProvider(node.id));
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    ref.invalidate(nodeAvailabilityProvider);
    await Future.wait([
      ref.read(ccVmccCollectionsProvider(node.id).future),
      ref.read(nodeInboundConsignmentsProvider(node.id).future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final sync = ref.watch(syncProvider);
    final vmccsAsync = ref.watch(ccVmccCollectionsProvider(node.id));
    final cons = ref.watch(nodeInboundConsignmentsProvider(node.id)).asData?.value ??
        const <MpConsignment>[];
    final ready =
        ref.watch(nodeAvailabilityProvider((nodeId: node.id, shift: null))).asData?.value?.available ??
            0;
    final flow = _flowByNode(cons);
    final inTransit = flow.values.fold<double>(0, (a, b) => a + b.transit);
    final received = flow.values.fold<double>(0, (a, b) => a + b.received);
    final names = {for (final r in vmccsAsync.asData?.value ?? const <VmccCollection>[]) r.vmcc.id: r.vmcc.name};

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          DhenuSectionHeader(node.name, trailing: SyncStatus(
            state: sync.state, pendingCount: sync.pendingCount,
            onTap: () => ref.read(syncProvider.notifier).forceSync(),
          )),
          const SizedBox(height: DhenuSpacing.lg),
          _hero(t, vmccsAsync, inTransit),
          const SizedBox(height: DhenuSpacing.md),
          if (node.capacityLitres != null) ...[
            DhenuCard(child: TankGauge(
                current: received, capacity: node.capacityLitres!, label: 'Chilling tank')),
            const SizedBox(height: DhenuSpacing.md),
          ],
          _statsRow(t, inTransit, ready),
          const SizedBox(height: DhenuSpacing.lg),
          Text('VMCCs · today', style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _vmccList(t, vmccsAsync, flow),
          const SizedBox(height: DhenuSpacing.lg),
          Text('Recent receives', style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _recentReceives(t, cons, names),
        ],
      ),
    );
  }

  /// Group today's inbound consignments by source VMCC → (in-transit, received).
  Map<String, _Flow> _flowByNode(List<MpConsignment> cons) {
    final m = <String, _Flow>{};
    for (final c in cons.where((c) => c.kind == 'vmcc_to_cc')) {
      final cur = m[c.fromNodeId] ?? (transit: 0.0, received: 0.0);
      m[c.fromNodeId] = c.received
          ? (transit: cur.transit, received: cur.received + (c.receiptQty ?? 0))
          : (transit: cur.transit + (c.dispatchQty ?? 0), received: cur.received);
    }
    return m;
  }

  Widget _hero(DhenuTokens t, AsyncValue<List<VmccCollection>> vmccsAsync, double inTransit) {
    return vmccsAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (e, _) => HeroNumberCard(label: 'ACROSS VMCCs', primaryValue: '—',
          footer: Text('$e', style: DhenuText.caption.copyWith(color: t.gradeC))),
      data: (rows) {
        final collected = rows.fold<double>(0, (a, b) => a + b.collected);
        final active = rows.where((r) => r.collected > 0).length;
        return HeroNumberCard(
          label: 'COLLECTED ACROSS VMCCs · TODAY',
          primaryValue: litres(collected, unit: true),
          gradient: const LinearGradient(
            colors: [DhenuColors.brand, DhenuColors.brandDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          footer: Text(
            '$active of ${rows.length} VMCCs collecting · ${litres(inTransit, unit: true)} in transit',
            style: DhenuText.body.copyWith(color: Colors.white.withValues(alpha: 0.82)),
          ),
        );
      },
    );
  }

  Widget _statsRow(DhenuTokens t, double inTransit, double ready) => Row(children: [
        Expanded(child: _miniStat(t, 'In transit', litres(inTransit, unit: true),
            DhenuIcons.truck, t.am)),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _miniStat(t, 'Ready for plant', litres(ready, unit: true),
            DhenuIcons.outbound, ready > 0.05 ? t.brand : t.inkSoft)),
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

  Widget _vmccList(DhenuTokens t, AsyncValue<List<VmccCollection>> vmccsAsync,
      Map<String, _Flow> flow) {
    return vmccsAsync.when(
      loading: () => const DhenuLoadingList(),
      error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff, title: 'Could not load VMCCs', subtitle: '$e'),
      data: (rows) {
        if (rows.isEmpty) {
          return const DhenuEmptyState(
            icon: DhenuIcons.store,
            title: 'No VMCCs linked',
            subtitle: 'Assign VMCCs to this CC in the web admin',
          );
        }
        rows.sort((a, b) => b.collected.compareTo(a.collected));
        return DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              _vmccRow(t, rows[i], flow[rows[i].vmcc.id]),
            ],
          ]),
        );
      },
    );
  }

  Widget _vmccRow(DhenuTokens t, VmccCollection vc, _Flow? f) {
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.store, size: 20, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(vc.vmcc.name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text('☀️ ${litres(vc.amQty)} · 🌙 ${litres(vc.pmQty)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: 1),
          Text('${vc.farmers} farmers', style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(vc.collected, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 4),
          _flowChip(t, vc, f),
        ]),
      ]),
    );
  }

  Widget _flowChip(DhenuTokens t, VmccCollection vc, _Flow? f) {
    final (label, color) = switch (f) {
      _ when f != null && f.transit > 0 => ('⏳ ${litres(f.transit)} transit', t.gradeB),
      _ when f != null && f.received > 0 => ('✓ ${litres(f.received)} received', t.gradeA),
      _ when vc.collected > 0 => ('at VMCC', t.inkSoft),
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

  Widget _recentReceives(DhenuTokens t, List<MpConsignment> cons, Map<String, String> names) {
    final received = cons.where((c) => c.kind == 'vmcc_to_cc' && c.received).toList().reversed.toList();
    if (received.isEmpty) {
      return const DhenuEmptyState(
        icon: DhenuIcons.package,
        title: 'No receipts yet',
        subtitle: 'Milk you receive from VMCCs shows here',
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
        Icon(DhenuIcons.package, size: 18, color: t.brand),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(names[c.fromNodeId] ?? 'VMCC',
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Row(children: [
            Text('${c.shift == Shift.am ? '☀️ AM' : c.shift == Shift.pm ? '🌙 PM' : 'Day'} · ',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
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
