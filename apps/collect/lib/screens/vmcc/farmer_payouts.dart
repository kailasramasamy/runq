import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/source_row.dart';
import 'farmer_statement_share.dart';

/// Payments → Farmers: the same money the Cycles list holds, read down the
/// other axis. A cycle answers "who is still owed this fortnight"; this answers
/// "what has this farmer been paid all year", which is the question asked at
/// the counter — usually with the farmer standing there.
class FarmerPayoutsList extends ConsumerStatefulWidget {
  const FarmerPayoutsList({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<FarmerPayoutsList> createState() => _FarmerPayoutsListState();
}

class _FarmerPayoutsListState extends ConsumerState<FarmerPayoutsList> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final farmers = ref.watch(nodeFarmersProvider(widget.node.id)).valueOrNull
        ?? const <MpFarmer>[];
    // The ₹ column is the newest live cycle's line, so the list costs one extra
    // request rather than one per farmer. A reversed cycle is not money owed.
    final cycles = ref.watch(nodeCyclesProvider(widget.node.payoutScopeNodeId)).valueOrNull
        ?? const <MpPayoutCycle>[];
    final latest = cycles.where((c) => c.status != 'reversed').firstOrNull;
    final lines = latest == null
        ? const <MpPayoutLine>[]
        : ref.watch(cycleDetailProvider(latest.id)).valueOrNull?.lines ?? const [];
    final byFarmer = {for (final ln in lines) ln.farmerId: ln};
    final shown = [
      for (final f in farmers)
        if (_matches(context, f)) f,
    ]..sort((a, b) => a.code.compareTo(b.code));

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _search(t, l),
      const SizedBox(height: DhenuSpacing.md),
      if (latest != null)
        Padding(
          padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
          child: Text(
            l.payoutsLatestCycle(
                '${prettyDate(latest.periodStart)} – ${prettyDate(latest.periodEnd)}'),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ),
      if (shown.isEmpty)
        DhenuEmptyState(
            icon: farmers.isEmpty ? DhenuIcons.users : DhenuIcons.filterOff,
            title: farmers.isEmpty ? l.farmersEmptyTitle : l.cycleNoFarmersMatch)
      else
        DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < shown.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              _row(context, l, shown[i], byFarmer[shown[i].id]),
            ],
          ]),
        ),
    ]);
  }

  bool _matches(BuildContext context, MpFarmer f) {
    if (_query.isEmpty) return true;
    return farmerName(context, f).toLowerCase().contains(_query) ||
        f.name.toLowerCase().contains(_query) ||
        f.code.toLowerCase().contains(_query);
  }

  Widget _search(DhenuTokens t, AppLocalizations l) => TextField(
        onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
        textCapitalization: TextCapitalization.words,
        style: DhenuText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          hintText: l.historySearchFarmer,
          isDense: true,
          prefixIcon: Icon(DhenuIcons.search, color: t.inkSoft),
          filled: true,
          fillColor: t.inputFill,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(DhenuRadii.input),
            borderSide: BorderSide(color: t.hairline),
          ),
        ),
      );

  Widget _row(BuildContext context, AppLocalizations l, MpFarmer f, MpPayoutLine? ln) => SourceRow(
        title: farmerName(context, f),
        subtitle: f.code,
        farmer: f,
        litres: ln == null ? '—' : litres(ln.qtyLitres, unit: true),
        amount: ln == null ? null : rupees(ln.netAmount),
        amountFirst: true,
        trailingStatus: ln == null ? null : PayoutStatusChip(line: ln),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => FarmerPayoutHistoryScreen(farmer: f),
        )),
      );
}

/// One farmer's payout record: what they have earned across every cycle, how
/// much of it has actually reached them, and the statement to hand over.
class FarmerPayoutHistoryScreen extends ConsumerWidget {
  const FarmerPayoutHistoryScreen({super.key, required this.farmer});
  final MpFarmer farmer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final async = ref.watch(payoutLinesForFarmerProvider(farmer.id));
    return Scaffold(
      appBar: AppBar(
          title: Text(farmerName(context, farmer), style: DhenuText.h2.copyWith(color: t.ink))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(payoutLinesForFarmerProvider(farmer.id)),
        child: async.when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: l.payoutsLoadError,
              subtitle: friendlyError(context, e)),
          data: (lines) => _body(context, t, l, lines),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, DhenuTokens t, AppLocalizations l, List<MpPayoutLine> lines) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _summary(t, l, lines),
        const SizedBox(height: DhenuSpacing.lg),
        // The statement is the point of the screen for a farmer at the counter,
        // so it sits with the summary rather than below the whole history.
        ShareStatementButton(farmer: farmer),
        const SizedBox(height: DhenuSpacing.xl),
        Text(l.payoutsCycleHistory, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        if (lines.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.payments,
            title: l.payoutsEmptyTitle,
            subtitle: l.payoutsEmptySubtitle,
          )
        else
          DhenuCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (var i = 0; i < lines.length; i++) ...[
                if (i > 0) Divider(height: 1, color: t.hairline),
                _cycleRow(t, l, lines[i]),
              ],
            ]),
          ),
      ],
    );
  }

  /// Earned across every cycle, split into what has reached the farmer and what
  /// has not. "Paid" counts a line the operator ticked off OR one whose cycle
  /// was paid through the GL — the two ways money actually leaves.
  Widget _summary(DhenuTokens t, AppLocalizations l, List<MpPayoutLine> lines) {
    final earned = lines.fold<double>(0, (a, ln) => a + ln.netAmount);
    final paid = lines
        .where((ln) => ln.isPaid || ln.cycleStatus == 'paid')
        .fold<double>(0, (a, ln) => a + ln.netAmount);
    final due = (earned - paid).clamp(0, double.infinity).toDouble();
    final qty = lines.fold<double>(0, (a, ln) => a + ln.qtyLitres);
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l.payoutsEarnedLabel(lines.length).toUpperCase(),
            style: DhenuText.caption.copyWith(
                color: t.inkSoft, fontWeight: FontWeight.w700, letterSpacing: 1.1)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(rupees(earned), style: DhenuText.number(size: 32, color: t.ink)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(litres(qty, unit: true), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Icon(DhenuIcons.checkCircle, size: 14, color: t.gradeA),
          const SizedBox(width: DhenuSpacing.xs),
          Text(l.payoutsPaidAmount(rupees(paid)),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          if (due > 0) ...[
            Icon(DhenuIcons.clock, size: 14, color: t.gradeB),
            const SizedBox(width: DhenuSpacing.xs),
            Text(l.payoutsDueAmount(rupees(due)),
                style: DhenuText.caption.copyWith(color: t.gradeB)),
          ],
        ]),
      ]),
    );
  }

  Widget _cycleRow(DhenuTokens t, AppLocalizations l, MpPayoutLine ln) {
    final period = (ln.periodStart == null || ln.periodEnd == null)
        ? l.payoutsCycleFallback
        : '${prettyDate(ln.periodStart!)} – ${prettyDate(ln.periodEnd!)}';
    return SourceRow(
      title: period,
      hideLeading: true,
      subtitle: ln.deductionTotal > 0
          ? l.payoutsGrossLessDeductions(rupees(ln.grossAmount), rupees(ln.deductionTotal))
          : null,
      litres: litres(ln.qtyLitres, unit: true),
      amount: rupees(ln.netAmount),
      amountFirst: true,
      trailingStatus: PayoutStatusChip(line: ln),
    );
  }
}

/// Where one cycle's money stands for this farmer. Paid = disbursed (ticked off
/// by the operator, or the whole cycle settled through the GL). Processing = the
/// cycle is locked, so the amount is final but not yet out. Pending = the cycle
/// is still open and the figure can still move.
class PayoutStatusChip extends StatelessWidget {
  const PayoutStatusChip({super.key, required this.line});
  final MpPayoutLine line;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final (label, color) = switch (line) {
      _ when line.isPaid || line.cycleStatus == 'paid' => (l.farmerPaymentsPaid, t.gradeA),
      _ when line.cycleStatus == 'open' => (l.farmerPaymentsStatusPending, t.inkSoft),
      _ => (l.farmerPaymentsStatusProcessing, t.gradeB),
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
