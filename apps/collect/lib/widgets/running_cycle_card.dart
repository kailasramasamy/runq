import 'package:flutter/material.dart';
import '../api/mp_running_models.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'dhenu_card.dart';

/// The open cycle's balance, as a card.
///
/// Cycles are only generated once their window closes, so for most of a
/// fortnight there is no bill to read and the operator is asked for a number
/// nothing on screen can answer. This shows it early: milk collected so far,
/// less what the farmer owes against advances and goods bought, leaving what
/// they'd actually be handed if the cycle were settled today.
///
/// The deduction is the server's, not a client re-derivation — same rule the
/// real bill uses, so the two can't disagree.
class RunningCycleCard extends StatelessWidget {
  const RunningCycleCard({
    super.key,
    required this.balance,
    this.subtitle,
    this.onTap,
  });

  final MpRunningBalance balance;

  /// Optional line under the amount — e.g. how many farmers or centres it covers.
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    if (!balance.hasWindow) return _noCadence(t, l);

    final totals = balance.totals;
    final absorbed = totals.netPayable == 0 && totals.gross > 0;
    return DhenuCard(
      onTap: onTap,
      elevated: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(l.runningCycleTitle,
                style: DhenuText.label.copyWith(
                    color: t.inkSoft, fontWeight: FontWeight.w700)),
          ),
          _stateChip(t, l),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        Text(_period(balance), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        if (totals.gross == 0)
          Text(l.runningCycleNoPours,
              style: DhenuText.body.copyWith(color: t.inkSoft))
        else ...[
          Text(l.runningCycleNetPayable,
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(rupees(totals.netPayable),
              style: DhenuText.number(
                  size: 24, color: absorbed ? t.inkSoft : t.gradeA)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(_breakdown(l, totals),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          if (absorbed) ...[
            const SizedBox(height: DhenuSpacing.xs),
            Text(l.runningCycleFullyRecovered,
                style: DhenuText.caption.copyWith(color: t.gradeC)),
          ],
        ],
        if (subtitle != null) ...[
          const SizedBox(height: DhenuSpacing.xs),
          Text(subtitle!, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ]),
    );
  }

  /// "2,618.3 L · milk ₹1,54,574 · less dues ₹10,560" — the arithmetic behind
  /// the headline, so the operator can defend the number at the counter.
  String _breakdown(AppLocalizations l, MpRunningTotals totals) {
    final parts = <String>[
      litres(totals.qtyLitres, unit: true),
      '${l.runningCycleGross} ${rupees(totals.gross)}',
      if (totals.deductionTotal > 0)
        l.runningCycleDeducted(rupees(totals.deductionTotal)),
      if (totals.operatorComp > 0)
        l.runningCycleComp(rupees(totals.operatorComp)),
    ];
    return parts.join(' · ');
  }

  /// A locked cycle's figure is final; an open one still moves with every pour.
  Widget _stateChip(DhenuTokens t, AppLocalizations l) {
    final frozen = balance.frozen;
    final color = frozen ? t.inkSoft : DhenuColors.accent;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(frozen ? l.runningCycleFrozen : l.runningCycleLive,
          style: DhenuText.caption.copyWith(
              color: frozen ? t.inkSoft : t.gradeA,
              fontWeight: FontWeight.w700)),
    );
  }

  Widget _noCadence(DhenuTokens t, AppLocalizations l) => DhenuCard(
        elevated: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.runningCycleNoCadence,
              style: DhenuText.body.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(l.runningCycleNoCadenceHint,
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
      );

  static String _period(MpRunningBalance b) =>
      '${shortDate(b.periodStart!)} – ${prettyDate(b.periodEnd!)}';
}
