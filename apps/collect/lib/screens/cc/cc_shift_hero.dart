import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';

/// One shift's slice of the CC's inbound day: how much that slot brought in,
/// what's still on the road, and how many of the feeding VMCCs have landed.
typedef CcShiftTally = ({double qty, double transit, int received, int centres});

/// One section of the CC hero — a shift, and for a pooled CC the day it came
/// from (the pool spans two dates, so "PM" alone would be ambiguous).
typedef CcHeroShift = ({Shift shift, String? date, CcShiftTally tally});

/// The CC home hero: the day (or pool) total up top, then one section per
/// collection shift underneath.
///
/// Split by shift because AM and PM arrive, are tested and are dispatched
/// onward independently — a single day figure can't say the morning is already
/// in the tank while the evening is still on the road, which is what the CC
/// operator is actually deciding on.
class CcShiftHero extends StatelessWidget {
  const CcShiftHero({
    super.key,
    required this.label,
    required this.total,
    required this.activeCentres,
    required this.totalCentres,
    required this.inTransit,
    required this.shifts,
  });

  /// Uppercase caption over the total (e.g. "COLLECTED ACROSS VMCCs · TODAY").
  final String label;
  final double total, inTransit;
  final int activeCentres, totalCentres;
  final List<CcHeroShift> shifts;

  static final Color _soft = Colors.white.withValues(alpha: 0.82);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [DhenuColors.brand, DhenuColors.brandDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        boxShadow: DhenuShadows.brand,
      ),
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(),
            style: DhenuText.caption.copyWith(color: _soft, letterSpacing: 1.1)),
        const SizedBox(height: DhenuSpacing.sm),
        Text(litres(total, unit: true),
            style: DhenuText.hero.copyWith(color: Colors.white),
            maxLines: 1, overflow: TextOverflow.ellipsis),
        const SizedBox(height: DhenuSpacing.xs),
        Text(l.ccHomeActiveOfTotal(activeCentres, totalCentres, litres(inTransit, unit: true)),
            style: DhenuText.body.copyWith(color: _soft)),
        if (shifts.isNotEmpty) ...[
          const SizedBox(height: DhenuSpacing.md),
          Divider(height: 1, color: Colors.white.withValues(alpha: 0.22)),
          const SizedBox(height: DhenuSpacing.md),
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (var i = 0; i < shifts.length; i++) ...[
                if (i > 0) ...[
                  const SizedBox(width: DhenuSpacing.md),
                  Container(width: 1, color: Colors.white.withValues(alpha: 0.22)),
                  const SizedBox(width: DhenuSpacing.md),
                ],
                Expanded(child: _section(l, shifts[i])),
              ],
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _section(AppLocalizations l, CcHeroShift s) {
    final am = s.shift == Shift.am;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(am ? DhenuIcons.sun : DhenuIcons.moon, size: 14, color: _soft),
        const SizedBox(width: DhenuSpacing.xs),
        Flexible(
          child: Text(
            s.date == null
                ? (am ? l.ccHomeMorning : l.ccHomeEvening)
                : '${shortDate(s.date!)} ${am ? l.shiftAm : l.shiftPm}',
            style: DhenuText.label.copyWith(color: _soft),
            maxLines: 1, overflow: TextOverflow.ellipsis,
          ),
        ),
      ]),
      const SizedBox(height: DhenuSpacing.xs),
      // Milk still at the VMCC is an expectation, not an amount in the tank, so
      // it reads at three-quarter strength. Solid white for both figures made
      // the evening look every bit as banked as the morning.
      Text(litres(s.tally.qty, unit: true),
          style: DhenuText.number(
              size: 24,
              color: _awaiting(s.tally) ? Colors.white.withValues(alpha: 0.72) : Colors.white),
          maxLines: 1, overflow: TextOverflow.ellipsis),
      const SizedBox(height: DhenuSpacing.sm),
      _pill(l, s.tally),
    ]);
  }

  /// The shift's milk is collected upstream but nothing has been dispatched:
  /// not on the road, not in the tank. Distinct from "nothing yet" (the VMCC
  /// hasn't collected either), which needs no chasing.
  static bool _awaiting(CcShiftTally t) =>
      t.received == 0 && t.centres > 0 && t.transit <= 0.05 && t.qty > 0.05;

  /// What the shift still owes the operator, in the order it matters: milk on
  /// the road first, then how many centres have landed. Band/state colour can't
  /// carry meaning on this gradient (every step fails contrast), so the pill
  /// stays white on a translucent scrim and leans on its icon.
  Widget _pill(AppLocalizations l, CcShiftTally t) {
    // Milk sitting at the VMCC is the one state that needs chasing, so it gets
    // the only solid pill on this card — amber with dark ink, which clears
    // contrast on the green gradient where a tinted translucent pill cannot.
    // "0 of 1 in" said the same thing in arithmetic and was missed.
    if (_awaiting(t)) {
      return _chip(DhenuIcons.clock, l.ccHomeShiftAwaitingVmcc,
          background: DhenuColors.gradeB, foreground: DhenuColors.amInk);
    }
    final (icon, text) = t.transit > 0.05
        ? (DhenuIcons.truck, l.ccHomeShiftInTransit(litres(t.transit, unit: true)))
        : t.centres > 0
            ? (DhenuIcons.checkCircle, l.ccHomeShiftReceivedCount(t.received, t.centres))
            : (DhenuIcons.clock, l.ccHomeShiftNothingIn);
    final idle = t.transit <= 0.05 && t.centres == 0;
    return _chip(icon, text,
        background: Colors.black.withValues(alpha: idle ? 0.16 : 0.28),
        foreground: idle ? _soft : Colors.white);
  }

  Widget _chip(IconData icon, String text,
          {required Color background, required Color foreground}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 12, color: foreground),
          const SizedBox(width: 4),
          Flexible(
            child: Text(text,
                style: DhenuText.caption.copyWith(color: foreground),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ]),
      );
}
