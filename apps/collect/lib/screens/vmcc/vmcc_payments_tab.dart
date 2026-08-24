import 'package:dhenu/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/section_header.dart';
import '../../widgets/running_cycle_card.dart';
import '../shared/cycle_payments.dart';
import 'cycle_detail_screen.dart';
import 'farmer_payouts.dart';
import 'vmcc_bills_view.dart';

/// VMCC Payments tab — the node's payout cycles (and starting one), plus the
/// same money read per farmer. Two views of one ledger: a cycle says who is
/// still owed this fortnight, a farmer says what they have earned all year.
///
/// A centre with no farmers registered is settled in bulk instead, so it reads
/// [VmccBillsView]. Neither half of this screen can serve it: there are no
/// farmers to list, and the cycle it would ask for is the parent CC's, which a
/// VMCC operator is not scoped to — the tab came up empty or errored outright.
class VmccPaymentsTab extends ConsumerStatefulWidget {
  const VmccPaymentsTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<VmccPaymentsTab> createState() => _VmccPaymentsTabState();
}

class _VmccPaymentsTabState extends ConsumerState<VmccPaymentsTab> {
  bool _byFarmer = false;

  MpNode get node => widget.node;

  Future<void> _refresh() async {
    ref.invalidate(runningBalanceProvider(node.id));
    ref.invalidate(nodeCyclesProvider(node.payoutScopeNodeId));
    ref.invalidate(nodeFarmersProvider(node.id));
    await ref.read(nodeCyclesProvider(node.payoutScopeNodeId).future);
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
    if (period == null || !context.mounted) return;
    try {
      final cycle = await mpRepo.createCycle(
        periodStart: period.start,
        periodEnd: period.end,
        scopeNodeId: node.payoutScopeNodeId,
      );
      ref.invalidate(nodeCyclesProvider(node.payoutScopeNodeId));
      if (mounted && cycle != null) _open(cycle.id);
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, '$e', type: DhenuToastType.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    // Withheld while the roster loads, so a bulk centre never flashes the
    // farmer screens it can't use on the way to its bills.
    final farmers = ref.watch(nodeFarmersProvider(node.id)).valueOrNull;
    if (farmers != null && farmers.isEmpty) {
      return Scaffold(body: VmccBillsView(node: node));
    }
    final cyclesAsync = ref.watch(nodeCyclesProvider(node.payoutScopeNodeId));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: cyclesAsync.when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => ListView(children: [
            const SizedBox(height: DhenuSpacing.x4),
            DhenuEmptyState(icon: DhenuIcons.cloudOff, title: l.paymentsCouldNotLoadCycles, subtitle: '$e'),
          ]),
          data: (cycles) => _list(t, l, cycles),
        ),
      ),
      // Starting a cycle acts on the cycles list; under the farmer view it
      // would be a button for a screen the operator isn't looking at.
      bottomSheet: _byFarmer
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
        Text(l.paymentsCyclesDisbursements, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        // Above the view switch, because it belongs to neither axis: it is the
        // centre's position in the window no cycle has been cut for yet, and
        // the first thing asked for before bills are generated.
        _runningCycle(t, l),
        const SizedBox(height: DhenuSpacing.md),
        PaymentsViewSwitch(
          firstLabel: l.paymentsCyclesTitle,
          secondLabel: l.homeFarmers,
          secondSelected: _byFarmer,
          onSelect: (v) => setState(() => _byFarmer = v),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        if (_byFarmer)
          FarmerPayoutsList(node: node)
        else if (cycles.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.payments,
            title: l.paymentsNoCyclesTitle,
            subtitle: l.paymentsNoCyclesSubtitle,
          )
        else ...[
          CyclePaymentsSummary(cycles: cycles),
          const SizedBox(height: DhenuSpacing.xl),
          Text(l.paymentsCyclesTitle, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          for (final c in cycles) ...[
            CycleCard(cycle: c, onTap: () => _open(c.id)),
            const SizedBox(height: DhenuSpacing.md),
          ],
        ],
      ],
    );
  }

  /// The centre's running total for the open window — every farmer's milk less
  /// the advances and purchases the next bill will recover.
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
        subtitle: b.totals.farmerCount > 0
            ? l.runningCycleFarmerCount(b.totals.farmerCount)
            : null,
      ),
    );
  }

}
