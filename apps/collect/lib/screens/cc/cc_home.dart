import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/centre_switcher.dart';
import '../../widgets/notification_bell.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/pending_dispatch_alert.dart';
import '../../widgets/quick_link_card.dart';
import '../shared/pending_work.dart';
import 'cc_dispatch_tab.dart';
import '../../widgets/tank_gauge.dart';
import '../../utils/friendly_error.dart';
import '../shared/node_qc_report.dart';
import '../shared/receive_history.dart';
import '../shared/receive_leg.dart';
import 'cc_rate_charts.dart';
import 'cc_report_tab.dart';
import 'cc_shift_hero.dart';

/// Per-VMCC inbound-to-this-CC tally derived from today's consignments.
/// [amRecv]/[pmRecv] split the received total by the consignment's shift so the
/// row can show per-shift quantities and AM/PM receipt ticks; [amTransit]/
/// [pmTransit] do the same for milk still on the road.
typedef _Flow = ({
  double transit,
  double received,
  double amRecv,
  double pmRecv,
  double amTransit,
  double pmTransit,
});

const _Flow _zeroFlow =
    (transit: 0.0, received: 0.0, amRecv: 0.0, pmRecv: 0.0, amTransit: 0.0, pmTransit: 0.0);

/// Accumulates qty-weighted QC for one shift while summing a VMCC's receipts.
class _QcAcc {
  double _q = 0, _fat = 0, _snf = 0, _water = 0;
  void add(double qty, double? fat, double? snf, double? water) {
    _q += qty;
    if (fat != null) _fat += qty * fat;
    if (snf != null) _snf += qty * snf;
    if (water != null) _water += qty * water;
  }

  ShiftQc toQc() => _q <= 0
      ? (fat: 0, snf: 0, water: 0, rate: 0)
      : (fat: _fat / _q, snf: _snf / _q, water: _water / _q, rate: 0);
}

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
    ref.invalidate(pendingDispatchProvider(node.id));
    if (node.isOvernightPool) {
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
    final l = AppLocalizations.of(context);
    final vmccsAsync = ref.watch(ccVmccCollectionsProvider(node.id));
    final overnight = node.isOvernightPool;
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
    final receiptQc = _receiptQcByNode(cons);
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
          // No sync chip: the offline queue only holds VMCC farmer pours, so a
          // CC has nothing to sync and the chip was permanently inert.
          DhenuSectionHeader(node.name,
              leadingTrailing: const CentreSwitcherButton(),
              trailing: const NotificationBell()),
          const SizedBox(height: DhenuSpacing.lg),
          PendingDispatchAlert(nodeId: node.id, onOpenSlot: _openSlot),
          _hero(context, t, l, vmccsAsync, flow, inTransit, overnight),
          const SizedBox(height: DhenuSpacing.md),
          if (node.capacityLitres != null) ...[
            DhenuCard(child: TankGauge(
                current: received, capacity: node.capacityLitres!, label: l.ccHomeChillingTank)),
            const SizedBox(height: DhenuSpacing.md),
          ],
          _statsRow(t, l, inTransit, ready),
          if (overnight && nextPm > 0.05) ...[
            const SizedBox(height: DhenuSpacing.md),
            _nextPoolNote(t, l, nextPm),
          ],
          const SizedBox(height: DhenuSpacing.md),
          _quickLinks(context, t, l),
          const SizedBox(height: DhenuSpacing.x3),
          Text(overnight ? l.ccHomeVmccsPool : l.ccHomeVmccsToday,
              style: DhenuText.title.copyWith(color: t.ink)),
          if (overnight) ...[
            const SizedBox(height: 4),
            Row(children: [
              Icon(DhenuIcons.moon, size: 12, color: t.inkSoft),
              const SizedBox(width: 4),
              Text('${shortDate(isoDaysAgo(1))} ${l.shiftPm}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
              Text('  ·  ', style: DhenuText.caption.copyWith(color: t.inkSoft)),
              Icon(DhenuIcons.sun, size: 12, color: t.inkSoft),
              const SizedBox(width: 4),
              Text('${shortDate(todayIso())} ${l.shiftAm}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ]),
          ],
          const SizedBox(height: DhenuSpacing.sm),
          _vmccList(context, t, l, vmccsAsync, flow, receiptQc, overnight),
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
      final cur = m[c.fromNodeId] ?? _zeroFlow;
      // A pooled VMCC dispatches its whole day untagged; the backend books such
      // legs to AM, so the split follows suit rather than inventing a third slot.
      final isPm = c.shift == Shift.pm;
      if (c.received) {
        final q = c.receiptQty ?? 0;
        m[c.fromNodeId] = (
          transit: cur.transit,
          received: cur.received + q,
          amRecv: cur.amRecv + (isPm ? 0 : q),
          pmRecv: cur.pmRecv + (isPm ? q : 0),
          amTransit: cur.amTransit,
          pmTransit: cur.pmTransit,
        );
      } else {
        final q = c.dispatchQty ?? 0;
        m[c.fromNodeId] = (
          transit: cur.transit + q,
          received: cur.received,
          amRecv: cur.amRecv,
          pmRecv: cur.pmRecv,
          amTransit: cur.amTransit + (isPm ? 0 : q),
          pmTransit: cur.pmTransit + (isPm ? q : 0),
        );
      }
    }
    return m;
  }

  /// Qty-weighted receipt QC per source VMCC, split by shift, from the pool's
  /// consignments. Fills FAT/SNF/water for manual-receive VMCCs (no pours) and
  /// matches the overnight pool window, which the today-scoped pour summary
  /// misses. Whole-day (null-shift) receipts count as AM, like the backend.
  Map<String, ({ShiftQc am, ShiftQc pm})> _receiptQcByNode(List<MpConsignment> cons) {
    final am = <String, _QcAcc>{};
    final pm = <String, _QcAcc>{};
    for (final c in cons.where((c) => c.kind == 'vmcc_to_cc' && c.received)) {
      final q = c.receiptQty ?? 0;
      if (q <= 0) continue;
      final bucket = c.shift == Shift.pm ? pm : am;
      (bucket[c.fromNodeId] ??= _QcAcc()).add(q, c.receiptFat, c.receiptSnf, c.receiptWater);
    }
    return {
      for (final id in {...am.keys, ...pm.keys})
        id: (am: (am[id] ?? _QcAcc()).toQc(), pm: (pm[id] ?? _QcAcc()).toQc()),
    };
  }

  /// Manual-receipt QC overrides the VMCC's pour QC: the milk is re-tested at the
  /// CC on receipt, so that reading is authoritative. Falls back to pours when no
  /// receipt QC was captured (fat == 0 means no sample).
  ShiftQc _resolveQc(ShiftQc pour, ShiftQc? receipt) =>
      (receipt != null && receipt.fat > 0) ? receipt : pour;

  Widget _hero(BuildContext context, DhenuTokens t, AppLocalizations l,
      AsyncValue<List<VmccCollection>> vmccsAsync,
      Map<String, _Flow> flow, double inTransit, bool overnight) {
    return vmccsAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (e, _) => HeroNumberCard(label: l.ccHomeAcrossVmccs, primaryValue: '—',
          footer: Text(friendlyError(context, e), style: DhenuText.caption.copyWith(color: t.gradeC))),
      data: (rows) {
        // Sum the per-VMCC shown qty (in-app pour, else received, else transit)
        // so manually-received milk counts even when no pour was logged.
        final collected =
            rows.fold<double>(0, (a, r) => a + _shownQty(r, flow[r.vmcc.id], overnight));
        final active = rows.where((r) => _shownQty(r, flow[r.vmcc.id], overnight) > 0).length;
        return CcShiftHero(
          label: overnight ? l.ccHomeInPoolLabel : l.ccHomeCollectedTodayLabel,
          total: collected,
          activeCentres: active,
          totalCentres: rows.length,
          inTransit: inTransit,
          shifts: _heroShifts(rows, flow, overnight),
        );
      },
    );
  }

  /// Which shift sections the hero shows, in the order the milk arrives.
  ///
  /// A pooled CC's window is yesterday PM then today AM, so both sections are
  /// stamped with their own date — "PM" alone would read as tonight's milk,
  /// which belongs to the *next* pool. Otherwise the sections follow the shifts
  /// the centre collects in, plus any shift that has milk anyway (a back-dated
  /// or misconfigured slot still has to be visible).
  List<CcHeroShift> _heroShifts(
      List<VmccCollection> rows, Map<String, _Flow> flow, bool overnight) {
    CcShiftTally tally(bool am) {
      var qty = 0.0, transit = 0.0;
      var received = 0, centres = 0;
      for (final r in rows) {
        final f = flow[r.vmcc.id];
        final q = am ? _amShown(r, f, overnight) : _pmShown(r, f, overnight);
        if (q <= 0.05) continue;
        centres++;
        qty += q;
        transit += (am ? f?.amTransit : f?.pmTransit) ?? 0;
        if (((am ? f?.amRecv : f?.pmRecv) ?? 0) > 0) received++;
      }
      return (qty: qty, transit: transit, received: received, centres: centres);
    }

    final am = tally(true), pm = tally(false);
    if (overnight) {
      return [
        (shift: Shift.pm, date: isoDaysAgo(1), tally: pm),
        (shift: Shift.am, date: todayIso(), tally: am),
      ];
    }
    return [
      if (node.collectsShift('am') || am.centres > 0)
        (shift: Shift.am, date: null, tally: am),
      if (node.collectsShift('pm') || pm.centres > 0)
        (shift: Shift.pm, date: null, tally: pm),
    ];
  }

  /// Overnight CCs: tonight's PM collection pools with tomorrow's AM, so it's
  /// surfaced separately from the current dispatch pool.
  Widget _nextPoolNote(DhenuTokens t, AppLocalizations l, double nextPm) => DhenuCard(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        child: Row(children: [
          Icon(DhenuIcons.moon, size: 14, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(child: Text(l.ccHomeNextPoolNote(litres(nextPm, unit: true)),
              style: DhenuText.caption.copyWith(color: t.inkSoft))),
        ]),
      );

  /// 2×2 grid. Four across left each card ~a quarter of the width, which wrapped
  /// the two-word labels onto a second line and left the cards visibly uneven.
  /// IntrinsicHeight keeps a pair level even if a translation still wraps.
  Widget _quickLinks(BuildContext context, DhenuTokens t, AppLocalizations l) {
    final leg = ReceiveLeg.vmccToCc(l);
    final links = <(IconData, String, Widget)>[
      (DhenuIcons.history, l.homeHistory, ReceiveHistory(node: node, leg: leg)),
      (DhenuIcons.trendingUp, l.ccHomeReportLink, CcReportTab(node: node)),
      (DhenuIcons.barChart, l.ccHomeQcReportLink, NodeQcReport(node: node, leg: leg)),
      (DhenuIcons.grid, l.ccHomeRateChartLink, const CcRateCharts()),
    ];
    Widget pair(int a, int b) => IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: _linkCard(context, t, links[a])),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: _linkCard(context, t, links[b])),
          ]),
        );
    return Column(children: [
      pair(0, 1),
      const SizedBox(height: DhenuSpacing.md),
      pair(2, 3),
    ]);
  }

  Widget _linkCard(
          BuildContext context, DhenuTokens t, (IconData, String, Widget) link) =>
      QuickLinkCard(
        icon: link.$1,
        label: link.$2,
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(link.$2, style: DhenuText.h2.copyWith(color: t.ink))),
            body: link.$3,
          ),
        )),
      );

  /// Open one stuck slot on the dispatch screen, at its own date. A CC both
  /// closes and dispatches there, so both kinds share the destination — the
  /// close control appears on the slot that still needs it.
  Future<void> _openSlot(BuildContext context, MpPendingDispatch slot, PendingWorkKind kind) async {
    final l = AppLocalizations.of(context);
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (ctx) => Scaffold(
        appBar:
            AppBar(title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: DT(ctx).ink))),
        body: CcDispatchTab(
          node: node,
          initialDate: slot.collectionDate,
          // A pooled CC sends its whole window as one tanker; naming a shift
          // would point at a figure it can't draw against.
          initialShift: slot.shift == null ? null : shiftFrom(slot.shift!),
        ),
      ),
    ));
  }


  Widget _statsRow(DhenuTokens t, AppLocalizations l, double inTransit, double ready) => Row(children: [
        Expanded(child: _miniStat(t, l.ccInTransitLabel, litres(inTransit, unit: true),
            DhenuIcons.truck, t.am)),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _miniStat(t, l.ccHomePlantReadyLabel, litres(ready, unit: true),
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

  Widget _vmccList(BuildContext context, DhenuTokens t, AppLocalizations l,
      AsyncValue<List<VmccCollection>> vmccsAsync,
      Map<String, _Flow> flow, Map<String, ({ShiftQc am, ShiftQc pm})> receiptQc,
      bool overnight) {
    return vmccsAsync.when(
      loading: () => const DhenuLoadingList(),
      error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff, title: l.ccVmccsLoadError, subtitle: friendlyError(context, e)),
      data: (rows) {
        if (rows.isEmpty) {
          return DhenuEmptyState(
            icon: DhenuIcons.store,
            title: l.ccNoVmccsLinkedTitle,
            subtitle: l.ccNoVmccsLinkedSubtitle,
          );
        }
        rows.sort((a, b) => a.vmcc.name.toLowerCase().compareTo(b.vmcc.name.toLowerCase()));
        return DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              _VmccEntry(
                name: rows[i].vmcc.name,
                farmers: rows[i].farmers,
                overnight: overnight,
                totalQty: _shownQty(rows[i], flow[rows[i].vmcc.id], overnight),
                amQty: _amShown(rows[i], flow[rows[i].vmcc.id], overnight),
                pmQty: _pmShown(rows[i], flow[rows[i].vmcc.id], overnight),
                amQc: _resolveQc(rows[i].am, receiptQc[rows[i].vmcc.id]?.am),
                pmQc: _resolveQc(rows[i].pm, receiptQc[rows[i].vmcc.id]?.pm),
                milkType: rows[i].vmcc.effectiveMilkType,
                byMilkType: rows[i].byMilkType,
                nodeId: rows[i].vmcc.id,
                amReceived: (flow[rows[i].vmcc.id]?.amRecv ?? 0) > 0,
                pmReceived: (flow[rows[i].vmcc.id]?.pmRecv ?? 0) > 0,
              ),
            ],
          ]),
        );
      },
    );
  }

  /// Per-shift headline qty: the VMCC's in-app pour for the slot, else the milk
  /// received at the CC for that shift (manual receive logged no pour), else
  /// what that shift still has on the road — the same ladder [_shownQty] walks,
  /// so the two shift figures add back up to the row's total.
  double _amShown(VmccCollection vc, _Flow? f, bool overnight) =>
      (!overnight && vc.amQty > 0) ? vc.amQty : ((f?.amRecv ?? 0) > 0 ? f!.amRecv : f?.amTransit ?? 0);
  double _pmShown(VmccCollection vc, _Flow? f, bool overnight) =>
      (!overnight && vc.pmQty > 0) ? vc.pmQty : ((f?.pmRecv ?? 0) > 0 ? f!.pmRecv : f?.pmTransit ?? 0);

}

/// One VMCC row on the CC home. Collapsed: name, per-shift qty + receipt ticks,
/// day total. Tap to expand into a per-shift AM/PM breakdown of qty, quality
/// (fat / SNF / water) and the effective ₹/L rate.
class _VmccEntry extends ConsumerStatefulWidget {
  const _VmccEntry({
    required this.name,
    required this.farmers,
    required this.overnight,
    required this.totalQty,
    required this.amQty,
    required this.pmQty,
    required this.amQc,
    required this.pmQc,
    required this.amReceived,
    required this.pmReceived,
    required this.milkType,
    required this.byMilkType,
    required this.nodeId,
  });

  final String name;
  final int farmers;
  final bool overnight, amReceived, pmReceived;
  final double totalQty, amQty, pmQty;
  final ShiftQc amQc, pmQc;
  final MilkType milkType;
  final List<MpMilkTypeSummary> byMilkType;
  final String nodeId;

  @override
  ConsumerState<_VmccEntry> createState() => _VmccEntryState();
}

class _VmccEntryState extends ConsumerState<_VmccEntry> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Column(children: [
      InkWell(
        onTap: () => setState(() => _expanded = !_expanded),
        child: _collapsed(t, l),
      ),
      AnimatedCrossFade(
        firstChild: const SizedBox(width: double.infinity),
        secondChild: _detail(t, l),
        crossFadeState:
            _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
        duration: const Duration(milliseconds: 180),
      ),
    ]);
  }

  Widget _collapsed(DhenuTokens t, AppLocalizations l) {
    // AM before PM by default; overnight pools show the carried PM first.
    final shifts = widget.overnight
        ? [(DhenuIcons.moon, widget.pmQty), (DhenuIcons.sun, widget.amQty)]
        : [(DhenuIcons.sun, widget.amQty), (DhenuIcons.moon, widget.pmQty)];
    final ticks = widget.overnight
        ? [(DhenuIcons.moon, widget.pmReceived), (DhenuIcons.sun, widget.amReceived)]
        : [(DhenuIcons.sun, widget.amReceived), (DhenuIcons.moon, widget.pmReceived)];
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(
              color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.store, size: 20, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.name,
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Row(children: [
            _shiftQty(t, shifts[0].$1, shifts[0].$2),
            Text('  ·  ', style: DhenuText.caption.copyWith(color: t.inkSoft)),
            _shiftQty(t, shifts[1].$1, shifts[1].$2),
          ]),
          const SizedBox(height: 1),
          Text(l.ccHomeFarmersCount(widget.farmers),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(widget.totalQty, unit: true),
              style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 6),
          Row(mainAxisSize: MainAxisSize.min, children: [
            _shiftTick(t, ticks[0].$1, ticks[0].$2),
            const SizedBox(width: 4),
            _shiftTick(t, ticks[1].$1, ticks[1].$2),
          ]),
        ]),
        const SizedBox(width: DhenuSpacing.xs),
        AnimatedRotation(
          turns: _expanded ? 0.5 : 0,
          duration: const Duration(milliseconds: 180),
          child: Icon(DhenuIcons.chevronDown, size: 18, color: t.inkSoft),
        ),
      ]),
    );
  }

  /// Expanded panel: one block per shift with qty, quality and ₹/L rate.
  Widget _detail(DhenuTokens t, AppLocalizations l) => Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.brand.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(DhenuRadii.card),
        ),
        child: Column(children: [
          _shiftDetail(t, l, l.ccHomeMorning, DhenuIcons.sun, t.am, Shift.am,
              widget.amQty, widget.amQc),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
            child: Divider(height: 1, color: t.hairline),
          ),
          _shiftDetail(t, l, l.ccHomeEvening, DhenuIcons.moon, t.pm, Shift.pm,
              widget.pmQty, widget.pmQc),
        ]),
      );

  Widget _shiftDetail(DhenuTokens t, AppLocalizations l, String label,
      IconData icon, Color accent, Shift shift, double qty, ShiftQc qc) {
    // No collection this shift → dash every metric rather than show stale zeros.
    final has = qty > 0;
    // Pour-priced rate when present; otherwise resolve the receipt QC against the
    // node's rate chart (manual receipts carry no per-litre rate).
    double? rate = qc.rate > 0 ? qc.rate : null;
    if (rate == null && has && qc.fat > 0) {
      rate = ref
          .watch(receiptRateProvider((
            milkType: widget.milkType, fat: qc.fat, snf: qc.snf, nodeId: widget.nodeId, onDate: null,
          )))
          .valueOrNull;
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 14, color: accent),
        const SizedBox(width: 6),
        Text(label,
            style: DhenuText.label.copyWith(color: accent, fontWeight: FontWeight.w700)),
        const Spacer(),
        Text(has ? litres(qty, unit: true) : '—',
            style: DhenuText.number(size: 15, color: t.ink)),
      ]),
      const SizedBox(height: 4),
      _qcLine(t, has: has, qc: qc, rate: rate),
      ..._typeRows(t, l, shift),
    ]);
  }

  /// The shift's blended reading as one caption line. Metrics the centre didn't
  /// measure are left out rather than printed as a dash — a lactometer-less
  /// VMCC records no water, and a row of "—" columns read as missing data the
  /// operator ought to chase.
  Widget _qcLine(DhenuTokens t, {required bool has, required ShiftQc qc, double? rate}) {
    final parts = <String>[
      if (has && qc.fat > 0) 'FAT ${oneDp(qc.fat)}',
      if (has && qc.snf > 0) 'SNF ${oneDp(qc.snf)}',
      if (has && qc.water > 0) 'WATER ${oneDp(qc.water)}',
    ];
    final priced = has && rate != null && rate > 0;
    if (parts.isEmpty && !priced) {
      return Text('—', style: DhenuText.caption.copyWith(color: t.inkSoft));
    }
    return Row(children: [
      Expanded(
        child: Text(parts.join('  ·  '),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
            maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      // The rate is the one figure here that is money, so it keeps the brand
      // colour and its own end of the line instead of queueing behind the QC.
      if (priced)
        Text('₹${rate.toStringAsFixed(2)}/L',
            style: DhenuText.number(size: 13, color: t.brand)),
    ]);
  }

  /// Milk-type breakup for one shift: a line per type that actually poured in
  /// that slot, biggest first. Manual-receive shifts carry no pours, so the
  /// summary has nothing to split — the block simply doesn't render.
  ///
  /// A single type is skipped too: its figures are the blended line above,
  /// restated. The split earns its space only when there is a split.
  List<Widget> _typeRows(DhenuTokens t, AppLocalizations l, Shift shift) {
    double qtyOf(MpMilkTypeSummary m) => shift == Shift.am ? m.amQty : m.pmQty;
    final rows = widget.byMilkType.where((m) => qtyOf(m) > 0).toList()
      ..sort((a, b) => qtyOf(b).compareTo(qtyOf(a)));
    if (rows.length < 2) return const [];
    return [
      const SizedBox(height: DhenuSpacing.sm),
      for (final m in rows)
        Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Row(children: [
            Expanded(
              child: Text(milkTypeL10n(l, m.milkType),
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            // Fixed columns, so FAT readings and litres line up down the list
            // however wide the type names are.
            SizedBox(
              width: 52,
              child: Text(
                  (shift == Shift.am ? m.amFat : m.pmFat) > 0
                      ? oneDp(shift == Shift.am ? m.amFat : m.pmFat)
                      : '',
                  textAlign: TextAlign.right,
                  style: DhenuText.number(size: 13, color: t.inkSoft)),
            ),
            SizedBox(
              width: 74,
              child: Text(litres(qtyOf(m), unit: true),
                  textAlign: TextAlign.right,
                  style: DhenuText.number(size: 13, color: t.ink)),
            ),
          ]),
        ),
    ];
  }

  /// Receipt tick for one shift: green check when that shift's milk is in, a
  /// greyed check otherwise.
  Widget _shiftTick(DhenuTokens t, IconData icon, bool received) {
    final color = received ? t.gradeA : t.inkSoft;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: received ? 0.14 : 0.06),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        if (received) ...[
          const SizedBox(width: 3),
          Icon(DhenuIcons.check, size: 11, color: color),
        ],
      ]),
    );
  }

  /// Inline "icon qty" for the per-VMCC AM/PM line.
  Widget _shiftQty(DhenuTokens t, IconData icon, double v) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: t.inkSoft),
        const SizedBox(width: 4),
        Text(litres(v), style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]);
}
