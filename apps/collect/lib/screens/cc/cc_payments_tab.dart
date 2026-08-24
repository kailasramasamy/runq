import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../api/mp_running_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/running_cycle_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/source_row.dart';
import '../shared/cycle_payments.dart';
import 'cc_centre_payments.dart';
import '../vmcc/cycle_detail_screen.dart';

/// CC Payments tab — the same money screen a VMCC operator gets, down the axis
/// a chilling centre settles on.
///
/// Cycles are CC-scoped (one per CC + period), so this is where they actually
/// live: a VMCC only ever borrows its parent's. The second view is Centres
/// rather than Farmers because a CC pays per VMCC — its farmers' net plus the
/// operator comp on the same bill, and for bulk centres no farmers at all.
class CcPaymentsTab extends ConsumerStatefulWidget {
  const CcPaymentsTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<CcPaymentsTab> createState() => _CcPaymentsTabState();
}

class _CcPaymentsTabState extends ConsumerState<CcPaymentsTab> {
  bool _byCentre = false;

  MpNode get node => widget.node;

  Future<void> _refresh() async {
    ref.invalidate(runningBalanceProvider(node.id));
    ref.invalidate(nodeCyclesProvider(node.id));
    await ref.read(nodeCyclesProvider(node.id).future);
  }

  void _open(String cycleId) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CycleDetailScreen(node: node, cycleId: cycleId),
    ));
  }

  Future<void> _newCycle() async {
    final period = await showModalBottomSheet<MpCyclePeriod>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const CyclePeriodPicker(),
    );
    if (period == null || !mounted) return;
    try {
      final cycle = await mpRepo.createCycle(
        periodStart: period.start,
        periodEnd: period.end,
        scopeNodeId: node.id,
      );
      ref.invalidate(nodeCyclesProvider(node.id));
      if (mounted && cycle != null) _open(cycle.id);
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, friendlyError(context, e),
            type: DhenuToastType.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final cyclesAsync = ref.watch(nodeCyclesProvider(node.id));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: cyclesAsync.when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => ListView(children: [
            const SizedBox(height: DhenuSpacing.x4),
            DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: l.paymentsCouldNotLoadCycles,
              subtitle: friendlyError(context, e),
            ),
          ]),
          data: (cycles) => _list(t, l, cycles),
        ),
      ),
      // Starting a cycle acts on the cycles list; under the centres view it
      // would be a button for a screen the operator isn't looking at.
      bottomSheet: _byCentre
          ? null
          : Padding(
              padding: const EdgeInsets.all(DhenuSpacing.screen),
              child: PrimaryAction(
                label: l.paymentsStartNewCycle,
                icon: DhenuIcons.add,
                onPressed: _newCycle,
              ),
            ),
    );
  }

  Widget _list(DhenuTokens t, AppLocalizations l, List<MpPayoutCycle> cycles) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, 120),
      children: [
        DhenuSectionHeader(l.navPayments),
        const SizedBox(height: DhenuSpacing.xs),
        Text(l.paymentsCyclesDisbursements,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        // Above the switch, because it belongs to neither axis: the open window
        // has no cycle row yet, and this is the figure asked for before bills.
        _runningCycle(t, l),
        const SizedBox(height: DhenuSpacing.md),
        PaymentsViewSwitch(
          firstLabel: l.paymentsCyclesTitle,
          secondLabel: l.ccPaymentsCentresTitle,
          secondSelected: _byCentre,
          onSelect: (v) => setState(() => _byCentre = v),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        if (_byCentre)
          _centres(t, l)
        else if (cycles.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.payments,
            title: l.paymentsNoCyclesTitle,
            subtitle: l.paymentsNoCyclesSubtitle,
          )
        else ...[
          CyclePaymentsSummary(cycles: cycles),
          const SizedBox(height: DhenuSpacing.xl),
          Text(l.paymentsCyclesTitle,
              style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          for (final c in cycles) ...[
            CycleCard(cycle: c, onTap: () => _open(c.id)),
            const SizedBox(height: DhenuSpacing.md),
          ],
        ],
      ],
    );
  }

  /// The whole CC's payable for the open window — every centre's milk less the
  /// advances and purchases the next bill recovers, plus operator comp.
  Widget _runningCycle(DhenuTokens t, AppLocalizations l) {
    final async = ref.watch(runningBalanceProvider(node.id));
    return async.when(
      loading: () => const DhenuLoadingList(rows: 1),
      error: (e, _) => DhenuCard(
        child: Text(l.runningCycleLoadError,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ),
      data: (b) => RunningCycleCard(
        balance: b,
        subtitle:
            b.vmccs.isEmpty ? null : l.runningCycleVmccCount(b.vmccs.length),
      ),
    );
  }

  /// Per-VMCC split of that same window — what each centre would be paid today.
  Widget _centres(DhenuTokens t, AppLocalizations l) {
    // Subscribed, not just read on tap: the roster is what turns a roll-up row
    // back into a node, and an unloaded family would make the row inert.
    ref.watch(nodesByTypeProvider('vmcc'));
    final async = ref.watch(runningBalanceProvider(node.id));
    return async.when(
      loading: () => const DhenuLoadingList(rows: 4),
      error: (e, _) => DhenuEmptyState(
        icon: DhenuIcons.cloudOff,
        title: l.runningCycleLoadError,
        subtitle: friendlyError(context, e),
      ),
      data: (b) => b.vmccs.isEmpty
          ? DhenuEmptyState(icon: DhenuIcons.store, title: l.ccCycleBalanceEmpty)
          : Column(children: [for (final v in b.vmccs) _centreRow(t, l, v)]),
    );
  }

  /// Open the centre's own payments — this cycle's position, then its settled
  /// bills. Needs the node itself for the bill history, which the CC's VMCC
  /// roster already holds.
  void _openCentre(MpRunningVmcc v) {
    final node = ref
        .read(nodesByTypeProvider('vmcc'))
        .valueOrNull
        ?.where((n) => n.id == v.vmccNodeId)
        .firstOrNull;
    if (node == null) return;
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CcCentrePayments(node: node, running: v),
    ));
  }

  Widget _centreRow(DhenuTokens t, AppLocalizations l, MpRunningVmcc v) =>
      Column(children: [
        SourceRow(
          onTap: () => _openCentre(v),
          title: v.vmccName,
          leadingInitials:
              v.vmccName.isNotEmpty ? v.vmccName[0].toUpperCase() : 'V',
          // The two halves of the bill, spelled out — a manager querying a
          // total asks which half moved.
          subtitle: [
            l.ccCycleBalanceMilk(rupees(v.milkCost)),
            if (v.operatorComp > 0) l.ccCycleBalanceComp(rupees(v.operatorComp)),
          ].join(' · '),
          litres: litres(v.qtyLitres, unit: true),
          amount: rupees(v.total),
        ),
        Divider(height: 1, color: t.hairline),
      ]);
}
