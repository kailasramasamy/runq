import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/sync_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/sync_queue_sheet.dart';
import '../../widgets/sync_status.dart';
import '../../widgets/tank_gauge.dart';
import '../../utils/friendly_error.dart';
import 'cc_qc_report.dart';
import 'cc_rate_charts.dart';
import 'cc_receive_history.dart';
import 'cc_report_tab.dart';

/// Per-VMCC inbound-to-this-CC tally derived from today's consignments.
/// [amRecv]/[pmRecv] split the received total by the consignment's shift so the
/// row can show per-shift quantities and AM/PM receipt ticks.
typedef _Flow = ({double transit, double received, double amRecv, double pmRecv});

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
    final l = AppLocalizations.of(context);
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
          DhenuSectionHeader(node.name, trailing: SyncStatus(
            state: sync.state, pendingCount: sync.pendingCount,
            failedCount: sync.failedCount,
            onTap: () => showSyncQueueSheet(context, ref, node.id),
          )),
          const SizedBox(height: DhenuSpacing.lg),
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
        return HeroNumberCard(
          label: overnight ? l.ccHomeInPoolLabel : l.ccHomeCollectedTodayLabel,
          primaryValue: litres(collected, unit: true),
          gradient: const LinearGradient(
            colors: [DhenuColors.brand, DhenuColors.brandDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          footer: Text(
            l.ccHomeActiveOfTotal(active, rows.length, litres(inTransit, unit: true)),
            style: DhenuText.body.copyWith(color: Colors.white.withValues(alpha: 0.82)),
          ),
        );
      },
    );
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

  Widget _quickLinks(BuildContext context, DhenuTokens t, AppLocalizations l) => Row(children: [
        Expanded(child: _linkCard(context, t, DhenuIcons.history, l.homeHistory,
            CcReceiveHistory(node: node))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _linkCard(context, t, DhenuIcons.trendingUp, l.ccHomeReportLink,
            CcReportTab(node: node))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _linkCard(context, t, DhenuIcons.barChart, l.ccHomeQcReportLink,
            CcQcReport(node: node))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _linkCard(context, t, DhenuIcons.grid, l.ccHomeRateChartLink,
            const CcRateCharts())),
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
  /// received at the CC for that shift (manual receive logged no pour).
  double _amShown(VmccCollection vc, _Flow? f, bool overnight) =>
      (!overnight && vc.amQty > 0) ? vc.amQty : (f?.amRecv ?? 0);
  double _pmShown(VmccCollection vc, _Flow? f, bool overnight) =>
      (!overnight && vc.pmQty > 0) ? vc.pmQty : (f?.pmRecv ?? 0);

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
    required this.nodeId,
  });

  final String name;
  final int farmers;
  final bool overnight, amReceived, pmReceived;
  final double totalQty, amQty, pmQty;
  final ShiftQc amQc, pmQc;
  final MilkType milkType;
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
          _shiftDetail(t, l.ccHomeMorning, DhenuIcons.sun, t.am, widget.amQty, widget.amQc),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
            child: Divider(height: 1, color: t.hairline),
          ),
          _shiftDetail(t, l.ccHomeEvening, DhenuIcons.moon, t.pm, widget.pmQty, widget.pmQc),
        ]),
      );

  Widget _shiftDetail(DhenuTokens t, String label, IconData icon, Color accent,
      double qty, ShiftQc qc) {
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
      const SizedBox(height: 6),
      Wrap(spacing: DhenuSpacing.lg, runSpacing: DhenuSpacing.xs, children: [
        _qcCell(t, 'FAT', has && qc.fat > 0 ? oneDp(qc.fat) : '—', t.ink),
        _qcCell(t, 'SNF', has && qc.snf > 0 ? oneDp(qc.snf) : '—', t.ink),
        _qcCell(t, 'WATER', has && qc.water > 0 ? oneDp(qc.water) : '—', t.ink),
        _qcCell(t, '₹/L', has && rate != null && rate > 0 ? rate.toStringAsFixed(2) : '—', t.brand),
      ]),
    ]);
  }

  Widget _qcCell(DhenuTokens t, String label, String value, Color color) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$label ',
              style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.4)),
          Text(value, style: DhenuText.number(size: 13, color: color)),
        ],
      );

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
