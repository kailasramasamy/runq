import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_running_models.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../vmcc/vmcc_bills_view.dart';

/// One centre's money, as its chilling centre sees it: what this cycle owes so
/// far, then every cycle already settled.
///
/// The open-window figures are handed down from the CC's roll-up rather than
/// re-queried here — a drill-in that recomputed could disagree with the row the
/// manager tapped, and two different numbers for one centre is worse than none.
class CcCentrePayments extends ConsumerWidget {
  const CcCentrePayments({super.key, required this.node, required this.running});

  final MpNode node;

  /// This centre's slice of the parent CC's open cycle. Null when the CC's
  /// balance hasn't loaded — the history below is still worth showing.
  final MpRunningVmcc? running;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(node.name,
            style: DhenuText.title
                .copyWith(fontWeight: FontWeight.w800, color: t.ink)),
      ),
      // stretch, not the default centre: a padded child in a centred Column
      // shrinks to its own intrinsic width, so the card sat narrower than
      // everything under it.
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (running != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(DhenuSpacing.screen,
                DhenuSpacing.md, DhenuSpacing.screen, 0),
            child: _currentCard(context, t, running!),
          ),
        // The bills view brings its own scroll + pull-to-refresh.
        Expanded(child: VmccBillsView(node: node)),
      ]),
    );
  }

  /// The open cycle, before any bill exists for it.
  Widget _currentCard(BuildContext context, DhenuTokens t, MpRunningVmcc v) {
    final l = AppLocalizations.of(context);
    return DhenuCard(
      elevated: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l.runningCycleTitle,
            style: DhenuText.label
                .copyWith(color: t.inkSoft, fontWeight: FontWeight.w700)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(l.runningCycleNetPayable,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(rupees(v.total), style: DhenuText.number(size: 24, color: t.gradeA)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          [
            litres(v.qtyLitres, unit: true),
            l.ccCycleBalanceMilk(rupees(v.milkCost)),
            if (v.operatorComp > 0) l.ccCycleBalanceComp(rupees(v.operatorComp)),
          ].join(' · '),
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
      ]),
    );
  }
}
