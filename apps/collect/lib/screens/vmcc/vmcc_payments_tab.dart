import 'package:dhenu/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/section_header.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/source_row.dart';
import 'cycle_detail_screen.dart';

/// VMCC Payments tab — list this node's payout cycles + start a new one.
/// A cycle aggregates recorded pours in a period into per-farmer payouts.
class VmccPaymentsTab extends ConsumerWidget {
  const VmccPaymentsTab({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeCyclesProvider(node.id));
    await ref.read(nodeCyclesProvider(node.id).future);
  }

  void _open(BuildContext context, String cycleId) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CycleDetailScreen(node: node, cycleId: cycleId),
    ));
  }

  Future<void> _newCycle(BuildContext context, WidgetRef ref) async {
    final period = await showModalBottomSheet<MpCyclePeriod>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _PeriodPicker(),
    );
    if (period == null || !context.mounted) return;
    try {
      final cycle = await mpRepo.createCycle(
        periodStart: period.start,
        periodEnd: period.end,
        scopeNodeId: node.id,
      );
      ref.invalidate(nodeCyclesProvider(node.id));
      if (context.mounted && cycle != null) _open(context, cycle.id);
    } catch (e) {
      if (context.mounted) {
        showDhenuToast(context, '$e', type: DhenuToastType.error);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final cyclesAsync = ref.watch(nodeCyclesProvider(node.id));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: cyclesAsync.when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => ListView(children: [
            const SizedBox(height: DhenuSpacing.x4),
            DhenuEmptyState(icon: DhenuIcons.cloudOff, title: l.paymentsCouldNotLoadCycles, subtitle: '$e'),
          ]),
          data: (cycles) => _list(t, l, context, cycles),
        ),
      ),
      bottomSheet: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        child: PrimaryAction(
          label: l.paymentsStartNewCycle,
          icon: DhenuIcons.add,
          onPressed: () => _newCycle(context, ref),
        ),
      ),
    );
  }

  Widget _list(DhenuTokens t, AppLocalizations l, BuildContext context, List<MpPayoutCycle> cycles) {
    if (cycles.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, 120),
        children: [
          DhenuSectionHeader(l.navPayments),
          const SizedBox(height: DhenuSpacing.x4),
          DhenuEmptyState(
            icon: DhenuIcons.payments,
            title: l.paymentsNoCyclesTitle,
            subtitle: l.paymentsNoCyclesSubtitle,
          ),
        ],
      );
    }
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, 120),
      children: [
        DhenuSectionHeader(l.navPayments),
        const SizedBox(height: DhenuSpacing.xs),
        Text(l.paymentsCyclesDisbursements, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.lg),
        _summary(context, t, l, cycles),
        const SizedBox(height: DhenuSpacing.xl),
        Text(l.paymentsCyclesTitle, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        for (final c in cycles) ...[
          _cycleCard(t, l, context, c),
          const SizedBox(height: DhenuSpacing.md),
        ],
      ],
    );
  }

  /// At-a-glance: rupees still owed to farmers vs rupees already disbursed,
  /// summed across every live (non-reversed) cycle.
  Widget _summary(BuildContext context, DhenuTokens t, AppLocalizations l, List<MpPayoutCycle> cycles) {
    final live = cycles.where((c) => c.status != 'reversed');
    final pendingRs = live.fold<double>(0, (a, c) => a + c.pendingTotal);
    final pendingFarmers = live.fold<int>(0, (a, c) => a + c.pendingCount);
    final paidRs = live.fold<double>(0, (a, c) => a + c.paidTotal);
    final openCount = cycles.where((c) => c.status == 'open' || c.status == 'locked').length;
    // IntrinsicHeight gives the Row a bounded cross-axis so the two cards can
    // stretch to equal height inside the (vertically-unbounded) ListView.
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: _statCard(context, paid: false, label: l.paymentsPendingToPayLabel,
            value: rupees(pendingRs), sub: l.paymentsPendingFarmersSub(pendingFarmers, openCount),
            icon: DhenuIcons.clock)),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _statCard(context, paid: true, label: l.paymentsPaidLabel,
            value: rupees(paidRs), sub: l.paymentsPaidCyclesSub(cycles.length),
            icon: DhenuIcons.checkCircle)),
      ]),
    );
  }

  // Two distinct gradient surfaces: Paid in brand emerald (white text), Pending
  // in amber (dark text — the app's convention for text on amber, since
  // white-on-amber fails contrast). Both flip correctly in dark mode.
  Widget _statCard(
    BuildContext context, {
    required bool paid,
    required String label,
    required String value,
    required String sub,
    required IconData icon,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colors = paid
        ? (isDark
            ? const [DhenuColors.brandDark, DhenuColors.brandPressedDark]
            : const [DhenuColors.brand, DhenuColors.brandPressed])
        : (isDark
            ? const [DhenuColors.amDark, DhenuColors.amDeep]
            : const [DhenuColors.am, DhenuColors.amDeep]);
    final fg = paid ? Colors.white : DhenuColors.amInk;
    final faint = fg.withValues(alpha: 0.78);
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
        borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
        boxShadow: DhenuShadows.card,
      ),
      padding: const EdgeInsets.all(DhenuSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 15, color: fg),
          const SizedBox(width: DhenuSpacing.xs),
          Expanded(child: Text(label, style: DhenuText.caption.copyWith(color: faint))),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        Text(value, style: DhenuText.number(size: 20, color: fg)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(sub, style: DhenuText.caption.copyWith(color: faint)),
      ]),
    );
  }

  Widget _cycleCard(DhenuTokens t, AppLocalizations l, BuildContext context, MpPayoutCycle c) {
    final (label, color) = switch (c.status) {
      'open' => (l.paymentsCycleStatusOpen, t.gradeB),
      'locked' => (l.paymentsCycleStatusLocked, t.brand),
      'paid' => (l.paymentsCycleStatusPaid, t.gradeA),
      _ => (l.paymentsCycleStatusReversed, t.inkSoft),
    };
    final net = c.netTotal > 0 ? c.netTotal : c.totalNet;
    return DhenuCard(
      onTap: () => _open(context, c.id),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(c.cycleNo, style: DhenuText.title.copyWith(color: t.ink)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(DhenuRadii.pill),
            ),
            child: Text(label, style: DhenuText.label.copyWith(color: color)),
          ),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        Text('${prettyDate(c.periodStart)} – ${prettyDate(c.periodEnd)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Text(rupees(net), style: DhenuText.number(size: 20, color: t.ink)),
          Text('  ${l.paymentsNetLabel}', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          Text(l.paymentsFarmerCount(c.lineCount), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
        if (c.lineCount > 0) ...[
          const SizedBox(height: DhenuSpacing.md),
          BreakdownBar(height: 8, segments: [
            BreakdownSegment(c.paidTotal, t.gradeA),
            BreakdownSegment(c.pendingTotal, t.gradeB),
          ]),
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Icon(DhenuIcons.checkCircle, size: 13, color: t.gradeA),
            const SizedBox(width: DhenuSpacing.xs),
            Text(l.paymentsPaidCount(c.paidCount, c.lineCount),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const Spacer(),
            if (c.pendingTotal > 0)
              Text(l.paymentsAmountPending(rupees(c.pendingTotal)),
                  style: DhenuText.caption.copyWith(color: t.gradeB)),
          ]),
        ],
      ]),
    );
  }
}

/// Pick which recent cadence-aligned period to bill (index 0 = in-progress).
class _PeriodPicker extends ConsumerWidget {
  const _PeriodPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final periodsAsync = ref.watch(recentCyclePeriodsProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      minChildSize: 0.4,
      expand: false,
      builder: (context, ctrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(l.paymentsSelectPeriod, style: DhenuText.title.copyWith(color: t.ink)),
            ),
          ),
          Expanded(
            child: periodsAsync.when(
              loading: () => const DhenuLoadingList(),
              error: (e, _) => DhenuEmptyState(
                  icon: DhenuIcons.cloudOff, title: l.paymentsCouldNotLoadPeriods, subtitle: '$e'),
              data: (periods) => ListView.separated(
                controller: ctrl,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                itemCount: periods.length,
                separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
                itemBuilder: (_, i) {
                  final p = periods[i];
                  return SourceRow(
                    title: p.label,
                    litres: i == 0 ? l.paymentsPeriodInProgress : l.paymentsPeriodClosed,
                    onTap: () => Navigator.of(context).pop(p),
                  );
                },
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
