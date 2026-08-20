import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/sheet_grabber.dart';
import 'farmer_statement_share.dart';

/// What one farmer is owed for one cycle, and the two things an operator does
/// with it: hand over the statement, and tick the money off once it's paid.
///
/// The cycle list can only carry the net figure. A farmer asking "why is it
/// less than last time" is answered by the gross → bonus → deductions chain,
/// which is what this sheet lays out.
Future<void> showPayoutLineSheet(
  BuildContext context, {
  required MpPayoutCycle cycle,
  required MpPayoutLine line,
  required MpFarmer? farmer,
  required bool paid,
  required Future<bool> Function() onTogglePaid,
}) {
  final t = DT(context);
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: t.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
    ),
    builder: (_) => _PayoutLineSheet(
      cycle: cycle, line: line, farmer: farmer, paid: paid, onTogglePaid: onTogglePaid,
    ),
  );
}

class _PayoutLineSheet extends ConsumerStatefulWidget {
  const _PayoutLineSheet({
    required this.cycle,
    required this.line,
    required this.farmer,
    required this.paid,
    required this.onTogglePaid,
  });

  final MpPayoutCycle cycle;
  final MpPayoutLine line;
  final MpFarmer? farmer;
  final bool paid;
  final Future<bool> Function() onTogglePaid;

  @override
  ConsumerState<_PayoutLineSheet> createState() => _PayoutLineSheetState();
}

class _PayoutLineSheetState extends ConsumerState<_PayoutLineSheet> {
  late bool _paid = widget.paid;
  bool _busy = false;

  MpPayoutLine get line => widget.line;
  MpPayoutCycle get cycle => widget.cycle;

  /// The cycle's own window, so the statement can't be shared for a period the
  /// operator isn't looking at.
  MpCyclePeriod get _period => MpCyclePeriod(
        cycle.periodStart,
        cycle.periodEnd,
        '${prettyDate(cycle.periodStart)} – ${prettyDate(cycle.periodEnd)}',
      );

  Future<void> _toggle() async {
    setState(() => _busy = true);
    final now = await widget.onTogglePaid();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _paid = now;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final f = widget.farmer;
    return SafeArea(
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(f == null ? l.historyFarmerFallback : farmerName(context, f),
                  style: DhenuText.h2.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(
                '${cycle.cycleNo} · ${prettyDate(cycle.periodStart)} – ${prettyDate(cycle.periodEnd)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
              const SizedBox(height: DhenuSpacing.lg),
              _amounts(t, l),
              const SizedBox(height: DhenuSpacing.md),
              _paidLine(t, l),
              const SizedBox(height: DhenuSpacing.lg),
              if (f != null) ...[
                ShareStatementButton(farmer: f, period: _period),
                const SizedBox(height: DhenuSpacing.md),
              ],
              // A reversed cycle's money never moved, so there is nothing to
              // tick off — the sheet stays a read-only record of it.
              if (cycle.status != 'reversed')
                PrimaryAction(
                  label: _paid ? l.payoutLineMarkUnpaid : l.payoutLineMarkPaid,
                  icon: _paid ? DhenuIcons.close : DhenuIcons.check,
                  loading: _busy,
                  onPressed: _busy ? null : _toggle,
                ),
            ]),
          ),
        ]),
      ),
    );
  }

  /// Gross → bonus → each deduction → net, in the order the money is worked
  /// out. Statement number last: it is what the farmer quotes back.
  Widget _amounts(DhenuTokens t, AppLocalizations l) {
    return Column(children: [
      _row(t, l.payoutLineQty, litres(line.qtyLitres, unit: true)),
      _row(t, l.payoutLineGross, rupees(line.grossAmount)),
      if (line.bonusAmount > 0)
        _row(t, l.payoutLineBonus, rupees(line.bonusAmount), color: t.gradeA, inset: true),
      for (final d in line.deductions)
        _row(t, _deductionLabel(l, d.deductionType), '− ${rupees(d.amount)}', color: t.gradeC),
      // A total with no itemised rows behind it is worse than none: show the
      // lump sum only when the breakdown didn't arrive.
      if (line.deductions.isEmpty && line.deductionTotal > 0)
        _row(t, l.payoutLineDeductions, '− ${rupees(line.deductionTotal)}', color: t.gradeC),
      Divider(height: DhenuSpacing.lg, color: t.hairline),
      _row(t, l.cycleNetPayable, rupees(line.netAmount), strong: true),
      if (line.statementNo != null)
        _row(t, l.payoutLineStatementNo, line.statementNo!, muted: true),
    ]);
  }

  Widget _row(DhenuTokens t, String label, String value,
      {Color? color, bool strong = false, bool muted = false, bool inset = false}) {
    return Padding(
      padding: EdgeInsets.only(
          top: DhenuSpacing.xs, bottom: DhenuSpacing.xs, left: inset ? DhenuSpacing.md : 0),
      child: Row(children: [
        Expanded(
          child: Text(label,
              style: (strong ? DhenuText.label : DhenuText.body)
                  .copyWith(color: muted ? t.inkSoft : t.ink)),
        ),
        Text(value,
            style: muted
                ? DhenuText.caption.copyWith(color: t.inkSoft)
                : DhenuText.number(size: strong ? 20 : 16, color: color ?? t.ink)),
      ]),
    );
  }

  /// Disbursement state — the operator's own tick, not the cycle's GL status.
  /// [MpPayoutLine.paidAt] is when it was ticked, which is the date the farmer
  /// is told the money went out.
  Widget _paidLine(DhenuTokens t, AppLocalizations l) {
    final at = line.paidAt;
    final color = _paid ? t.gradeA : t.gradeB;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
      ),
      child: Row(children: [
        Icon(_paid ? DhenuIcons.checkCircle : DhenuIcons.clock, size: 16, color: color),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(
          child: Text(
            !_paid
                ? l.payoutLineNotPaid
                : (at == null
                    ? l.farmerPaymentsPaid
                    : l.payoutLinePaidOn(memberSinceLabel(at.toLocal()))),
            style: DhenuText.caption.copyWith(color: t.ink),
          ),
        ),
      ]),
    );
  }

  String _deductionLabel(AppLocalizations l, String type) => switch (type) {
        'farmer_sale' => l.farmerPaymentsSold,
        'advance' => l.farmerPaymentsTypeAdvance,
        'cattle_feed_loan' => l.farmerPaymentsFeedLoan,
        _ => l.payoutLineOtherDeduction,
      };
}
