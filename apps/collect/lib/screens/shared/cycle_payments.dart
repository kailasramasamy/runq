import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/source_row.dart';

/// The parts a payout-cycle screen is built from, shared by the VMCC and CC
/// Payments tabs. Both read the same cycles down the same two axes — a VMCC
/// against its farmers, a CC against its centres — so the money furniture is
/// one implementation and only the second axis differs.

/// Rupees still owed vs rupees already disbursed, across every live cycle.
class CyclePaymentsSummary extends StatelessWidget {
  const CyclePaymentsSummary({super.key, required this.cycles});

  final List<MpPayoutCycle> cycles;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final live = cycles.where((c) => c.status != 'reversed');
    final pendingRs = live.fold<double>(0, (a, c) => a + c.pendingTotal);
    final pendingCount = live.fold<int>(0, (a, c) => a + c.pendingCount);
    final paidRs = live.fold<double>(0, (a, c) => a + c.disbursedTotal);
    final openCount =
        cycles.where((c) => c.status == 'open' || c.status == 'locked').length;
    // A CC that buys wholesale pays centres, not farmers — label the count for
    // whoever actually receives the money.
    final byCentre = cycles.isNotEmpty && cycles.every((c) => c.isBillBased);
    // IntrinsicHeight gives the Row a bounded cross-axis so the two cards can
    // stretch to equal height inside the (vertically-unbounded) ListView.
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
          child: _StatCard(
            paid: false,
            label: l.paymentsPendingToPayLabel,
            value: rupees(pendingRs),
            sub: byCentre
                ? l.paymentsPendingCentresSub(pendingCount, openCount)
                : l.paymentsPendingFarmersSub(pendingCount, openCount),
            icon: DhenuIcons.clock,
          ),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: _StatCard(
            paid: true,
            label: l.paymentsPaidLabel,
            value: rupees(paidRs),
            sub: l.paymentsPaidCyclesSub(cycles.length),
            icon: DhenuIcons.checkCircle,
          ),
        ),
      ]),
    );
  }
}

// Two distinct gradient surfaces: Paid in brand emerald (white text), Pending
// in amber (dark text — the app's convention for text on amber, since
// white-on-amber fails contrast). Both flip correctly in dark mode.
class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.paid,
    required this.label,
    required this.value,
    required this.sub,
    required this.icon,
  });

  final bool paid;
  final String label, value, sub;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
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
          Expanded(
              child: Text(label,
                  style: DhenuText.caption.copyWith(color: faint))),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        Text(value, style: DhenuText.number(size: 20, color: fg)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(sub, style: DhenuText.caption.copyWith(color: faint)),
      ]),
    );
  }
}

/// One payout cycle: window, status, net, and how much of it is disbursed.
class CycleCard extends StatelessWidget {
  const CycleCard({super.key, required this.cycle, required this.onTap});

  final MpPayoutCycle cycle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final c = cycle;
    final (label, color) = switch (c.status) {
      'open' => (l.paymentsCycleStatusOpen, t.gradeB),
      'locked' => (l.paymentsCycleStatusLocked, t.brand),
      'paid' => (l.paymentsCycleStatusPaid, t.gradeA),
      _ => (l.paymentsCycleStatusReversed, t.inkSoft),
    };
    // Bill-settled cycles carry no farmer lines, so netTotal/totalNet are both
    // 0 and the card read "₹ 0" over a lakh-rupee cycle. payableTotal covers
    // either shape.
    final net = c.payableTotal > 0 ? c.payableTotal : c.totalNet;
    return DhenuCard(
      onTap: onTap,
      elevated: true,
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // The window is what an operator identifies a cycle by — the document
        // number only matters once they're already looking at the right one.
        Row(children: [
          Expanded(
            child: Text('${shortDate(c.periodStart)} – ${prettyDate(c.periodEnd)}',
                style: DhenuText.title.copyWith(color: t.ink)),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: DhenuSpacing.md, vertical: 2),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(DhenuRadii.pill),
            ),
            child: Text(label, style: DhenuText.label.copyWith(color: color)),
          ),
        ]),
        Text(c.cycleNo, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          Text(rupees(net), style: DhenuText.number(size: 20, color: t.ink)),
          Text('  ${l.paymentsNetLabel}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          Text(
              c.isBillBased
                  ? l.paymentsCentreCount(c.billCount)
                  : l.paymentsFarmerCount(c.lineCount),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
        // Only while money is still owed. A full-width green bar under a card
        // already chipped "Paid" restates it and costs a third of the height.
        if (c.pendingTotal > 0) ...[
          const SizedBox(height: DhenuSpacing.sm),
          BreakdownBar(height: 6, segments: [
            BreakdownSegment(c.disbursedTotal, t.gradeA),
            BreakdownSegment(c.pendingTotal, t.gradeB),
          ]),
          const SizedBox(height: DhenuSpacing.xs),
          Row(children: [
            Text(l.paymentsPaidCount(c.payeePaidCount, c.payeeCount),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const Spacer(),
            Text(l.paymentsAmountPending(rupees(c.pendingTotal)),
                style: DhenuText.caption.copyWith(color: t.gradeB)),
          ]),
        ],
      ]),
    );
  }
}

/// Two views of one ledger, as a pill switch rather than two screens.
class PaymentsViewSwitch extends StatelessWidget {
  const PaymentsViewSwitch({
    super.key,
    required this.firstLabel,
    required this.secondLabel,
    required this.secondSelected,
    required this.onSelect,
  });

  final String firstLabel, secondLabel;
  final bool secondSelected;
  final ValueChanged<bool> onSelect;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.hairline,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(children: [
        Expanded(child: _tab(t, firstLabel, !secondSelected, false)),
        Expanded(child: _tab(t, secondLabel, secondSelected, true)),
      ]),
    );
  }

  Widget _tab(DhenuTokens t, String label, bool selected, bool isSecond) =>
      GestureDetector(
        onTap: () => onSelect(isSecond),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          height: DhenuSpacing.minTap,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? t.brand.withValues(alpha: 0.18) : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
            border: selected
                ? Border.all(color: t.brand.withValues(alpha: 0.4), width: 1.5)
                : null,
          ),
          child: Text(label,
              style:
                  DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft)),
        ),
      );
}

/// Pick which recent cadence-aligned period to bill (index 0 = in-progress).
class CyclePeriodPicker extends ConsumerWidget {
  const CyclePeriodPicker({super.key});

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
          borderRadius: const BorderRadius.vertical(
              top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(l.paymentsSelectPeriod,
                  style: DhenuText.title.copyWith(color: t.ink)),
            ),
          ),
          Expanded(
            child: periodsAsync.when(
              loading: () => const DhenuLoadingList(),
              error: (e, _) => DhenuEmptyState(
                  icon: DhenuIcons.cloudOff,
                  title: l.paymentsCouldNotLoadPeriods,
                  subtitle: '$e'),
              data: (periods) => ListView.separated(
                controller: ctrl,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                itemCount: periods.length,
                separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
                itemBuilder: (_, i) {
                  final p = periods[i];
                  return SourceRow(
                    title: p.label,
                    litres: i == 0
                        ? l.paymentsPeriodInProgress
                        : l.paymentsPeriodClosed,
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

/// A cycle's money broken out per VMCC, for a chilling centre that settles its
/// centres wholesale. Such a cycle has no farmer payout lines at all, so this
/// is the only readable account of where the total went.
class VmccBillBreakup extends StatelessWidget {
  const VmccBillBreakup({super.key, required this.bills});

  final List<MpVmccBill> bills;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final live = bills.where((b) => !b.isReversed).toList()
      ..sort((a, b) => a.vmccName.compareTo(b.vmccName));
    if (live.isEmpty) {
      return DhenuEmptyState(
          icon: DhenuIcons.store, title: l.cycleNoBills);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(l.cycleCentreBreakup, style: DhenuText.title.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.sm),
      for (final b in live) _row(t, l, b),
    ]);
  }

  Widget _row(DhenuTokens t, AppLocalizations l, MpVmccBill b) => Column(
        children: [
          SourceRow(
            title: b.vmccName,
            leadingInitials:
                b.vmccName.isNotEmpty ? b.vmccName[0].toUpperCase() : 'V',
            // Milk and comp separately: a query about a bill is nearly always
            // about which of the two moved.
            subtitle: [
              l.ccCycleBalanceMilk(rupees(b.milkCost)),
              if (b.operatorComp > 0) l.ccCycleBalanceComp(rupees(b.operatorComp)),
            ].join(' · '),
            litres: litres(b.qtyLitres, unit: true),
            amount: rupees(b.totalAmount),
            trailingStatus: Text(
              b.isPaid ? l.paymentsCycleStatusPaid : l.cycleBillDue,
              style: DhenuText.caption.copyWith(
                  color: b.isPaid ? t.gradeA : t.gradeB,
                  fontWeight: FontWeight.w700),
            ),
          ),
          Divider(height: 1, color: t.hairline),
        ],
      );
}
