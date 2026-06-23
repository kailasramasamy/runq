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
import '../../widgets/section_header.dart';
import '../../widgets/sync_status.dart';
import '../../widgets/tank_gauge.dart';
import 'cc_qc_report.dart';
import 'cc_receive_history.dart';

/// Per-VMCC inbound-to-this-CC tally derived from today's consignments.
/// [amRecv]/[pmRecv] split the received total by the consignment's shift so the
/// row can show per-shift quantities and AM/PM receipt ticks.
typedef _Flow = ({double transit, double received, double amRecv, double pmRecv});

/// CC operator home — a live view of the VMCC network feeding this chilling
/// centre: how much each VMCC has collected today (even before dispatch), what's
/// in transit, what's been received, and onward-dispatch room.
class CcHome extends ConsumerWidget {
  const CcHome({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(ccVmccCollectionsProvider(node.id));
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    ref.invalidate(nodeAvailabilityProvider);
    if (node.overnightPooling) {
      ref.invalidate(nodeInboundByDateProvider((nodeId: node.id, date: isoDaysAgo(1))));
    }
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
    final overnight = node.overnightPooling;
    final todayCons = ref.watch(nodeInboundConsignmentsProvider(node.id)).asData?.value ??
        const <MpConsignment>[];
    // Overnight CC: the pool is yesterday-PM + today-AM. Today's PM belongs to
    // the next dispatch, so it's shown separately below.
    final yestCons = overnight
        ? (ref.watch(nodeInboundByDateProvider((nodeId: node.id, date: isoDaysAgo(1)))).asData?.value ??
            const <MpConsignment>[])
        : const <MpConsignment>[];
    final cons = overnight
        ? [
            ...yestCons.where((c) => c.shift == Shift.pm),
            ...todayCons.where((c) => c.shift == Shift.am),
          ]
        : todayCons;
    final ready =
        ref.watch(nodeAvailabilityProvider((nodeId: node.id, shift: null))).asData?.value?.available ??
            0;
    final flow = _flowByNode(cons);
    final inTransit = flow.values.fold<double>(0, (a, b) => a + b.transit);
    final received = flow.values.fold<double>(0, (a, b) => a + b.received);
    final nextPm = overnight
        ? todayCons
            .where((c) => c.kind == 'vmcc_to_cc' && c.received && c.shift == Shift.pm)
            .fold<double>(0, (a, c) => a + (c.receiptQty ?? 0))
        : 0.0;

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
          _hero(t, vmccsAsync, flow, inTransit, overnight),
          const SizedBox(height: DhenuSpacing.md),
          if (node.capacityLitres != null) ...[
            DhenuCard(child: TankGauge(
                current: received, capacity: node.capacityLitres!, label: 'Chilling tank')),
            const SizedBox(height: DhenuSpacing.md),
          ],
          _statsRow(t, inTransit, ready),
          if (overnight && nextPm > 0.05) ...[
            const SizedBox(height: DhenuSpacing.md),
            _nextPoolNote(t, nextPm),
          ],
          const SizedBox(height: DhenuSpacing.md),
          _quickLinks(context, t),
          const SizedBox(height: DhenuSpacing.x3),
          Text(overnight ? 'VMCCs · this pool' : 'VMCCs · today',
              style: DhenuText.title.copyWith(color: t.ink)),
          if (overnight) ...[
            const SizedBox(height: 2),
            Text('🌙 ${shortDate(isoDaysAgo(1))} PM  ·  ☀️ ${shortDate(todayIso())} AM',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ],
          const SizedBox(height: DhenuSpacing.sm),
          _vmccList(t, vmccsAsync, flow, overnight),
        ],
      ),
    );
  }

  /// Headline qty for a VMCC row: its in-app collection when it logged any,
  /// else the milk received at the CC (manual receive — the VMCC never logged
  /// a pour), else what's still in transit. Without this fallback a manual
  /// receive shows 0.0 L even though milk physically arrived.
  double _shownQty(VmccCollection vc, _Flow? f, bool overnight) {
    // Overnight pools across two days, so the VMCC's same-day pour count doesn't
    // apply — drive purely off the windowed receipts.
    if (!overnight && vc.collected > 0) return vc.collected;
    if (f != null && f.received > 0) return f.received;
    return f?.transit ?? 0;
  }

  /// Group today's inbound consignments by source VMCC → (in-transit, received).
  Map<String, _Flow> _flowByNode(List<MpConsignment> cons) {
    final m = <String, _Flow>{};
    // Only live legs count — a reversed (deleted) receipt must not resurface as
    // in-transit milk.
    for (final c in cons.where((c) => c.kind == 'vmcc_to_cc' && (c.received || c.inTransit))) {
      final cur = m[c.fromNodeId] ?? (transit: 0.0, received: 0.0, amRecv: 0.0, pmRecv: 0.0);
      if (c.received) {
        final q = c.receiptQty ?? 0;
        m[c.fromNodeId] = (
          transit: cur.transit,
          received: cur.received + q,
          amRecv: cur.amRecv + (c.shift == Shift.am ? q : 0),
          pmRecv: cur.pmRecv + (c.shift == Shift.pm ? q : 0),
        );
      } else {
        m[c.fromNodeId] = (
          transit: cur.transit + (c.dispatchQty ?? 0),
          received: cur.received, amRecv: cur.amRecv, pmRecv: cur.pmRecv,
        );
      }
    }
    return m;
  }

  Widget _hero(DhenuTokens t, AsyncValue<List<VmccCollection>> vmccsAsync,
      Map<String, _Flow> flow, double inTransit, bool overnight) {
    return vmccsAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (e, _) => HeroNumberCard(label: 'ACROSS VMCCs', primaryValue: '—',
          footer: Text('$e', style: DhenuText.caption.copyWith(color: t.gradeC))),
      data: (rows) {
        // Sum the per-VMCC shown qty (in-app pour, else received, else transit)
        // so manually-received milk counts even when no pour was logged.
        final collected =
            rows.fold<double>(0, (a, r) => a + _shownQty(r, flow[r.vmcc.id], overnight));
        final active = rows.where((r) => _shownQty(r, flow[r.vmcc.id], overnight) > 0).length;
        return HeroNumberCard(
          label: overnight ? 'IN POOL · PREV PM + TODAY AM' : 'COLLECTED ACROSS VMCCs · TODAY',
          primaryValue: litres(collected, unit: true),
          gradient: const LinearGradient(
            colors: [DhenuColors.brand, DhenuColors.brandDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          footer: Text(
            '$active of ${rows.length} VMCCs · ${litres(inTransit, unit: true)} in transit',
            style: DhenuText.body.copyWith(color: Colors.white.withValues(alpha: 0.82)),
          ),
        );
      },
    );
  }

  /// Overnight CCs: tonight's PM collection pools with tomorrow's AM, so it's
  /// surfaced separately from the current dispatch pool.
  Widget _nextPoolNote(DhenuTokens t, double nextPm) => DhenuCard(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        child: Row(children: [
          Icon(DhenuIcons.clock, size: 16, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(child: Text('🌙 ${litres(nextPm, unit: true)} collecting for next dispatch',
              style: DhenuText.caption.copyWith(color: t.inkSoft))),
        ]),
      );

  Widget _quickLinks(BuildContext context, DhenuTokens t) => Row(children: [
        Expanded(child: _linkCard(context, t, DhenuIcons.history, 'History',
            CcReceiveHistory(node: node))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _linkCard(context, t, DhenuIcons.barChart, 'QC report',
            CcQcReport(node: node))),
      ]);

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
          Text(label, style: DhenuText.label.copyWith(color: t.ink)),
        ]),
      );

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
      Map<String, _Flow> flow, bool overnight) {
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
        rows.sort((a, b) => a.vmcc.name.toLowerCase().compareTo(b.vmcc.name.toLowerCase()));
        return DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              _vmccRow(t, rows[i], flow[rows[i].vmcc.id], overnight),
            ],
          ]),
        );
      },
    );
  }

  Widget _vmccRow(DhenuTokens t, VmccCollection vc, _Flow? f, bool overnight) {
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
          Text(
              overnight
                  ? '🌙 ${litres(_pmShown(vc, f, overnight))} · ☀️ ${litres(_amShown(vc, f, overnight))}'
                  : '☀️ ${litres(_amShown(vc, f, overnight))} · 🌙 ${litres(_pmShown(vc, f, overnight))}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: 1),
          Text('${vc.farmers} farmers', style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(_shownQty(vc, f, overnight), unit: true),
              style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 6),
          Row(mainAxisSize: MainAxisSize.min, children: overnight
              ? [
                  _shiftTick(t, '🌙', (f?.pmRecv ?? 0) > 0),
                  const SizedBox(width: 4),
                  _shiftTick(t, '☀️', (f?.amRecv ?? 0) > 0),
                ]
              : [
                  _shiftTick(t, '☀️', (f?.amRecv ?? 0) > 0),
                  const SizedBox(width: 4),
                  _shiftTick(t, '🌙', (f?.pmRecv ?? 0) > 0),
                ]),
        ]),
      ]),
    );
  }

  /// Per-shift headline qty: the VMCC's in-app pour for the slot, else the milk
  /// received at the CC for that shift (manual receive logged no pour).
  double _amShown(VmccCollection vc, _Flow? f, bool overnight) =>
      (!overnight && vc.amQty > 0) ? vc.amQty : (f?.amRecv ?? 0);
  double _pmShown(VmccCollection vc, _Flow? f, bool overnight) =>
      (!overnight && vc.pmQty > 0) ? vc.pmQty : (f?.pmRecv ?? 0);

  /// Receipt tick for one shift: green check when that shift's milk is in, a
  /// greyed check otherwise.
  Widget _shiftTick(DhenuTokens t, String glyph, bool received) {
    final color = received ? t.gradeA : t.inkSoft;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: received ? 0.14 : 0.06),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(glyph, style: DhenuText.caption),
        if (received) ...[
          const SizedBox(width: 3),
          Icon(DhenuIcons.check, size: 11, color: color),
        ],
      ]),
    );
  }
}
