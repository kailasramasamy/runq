import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/quality_badge.dart';

/// Where a shift's milk has got to, in the order it moves. The operator's whole
/// day is these five steps twice over, so the hero states them outright rather
/// than leaving them to be inferred from a "to dispatch" figure.
enum ShiftState { notStarted, collecting, toDispatch, inTransit, atCc }

/// The VMCC home hero: one section per shift the centre collects in — litres
/// plus where that milk stands — over a single day total.
///
/// Split by shift because AM and PM close and dispatch independently: a day
/// figure can't say that the morning is already at the CC while the evening is
/// still being poured, which is exactly what the operator is deciding on.
class VmccShiftHero extends ConsumerWidget {
  const VmccShiftHero({
    super.key,
    required this.node,
    required this.summary,
    required this.bands,
  });

  final MpNode node;
  final MpCollectionSummary? summary;
  final QualityBands? bands;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final status = ref.watch(shiftStatusProvider(node.id)).valueOrNull;
    final outbound = ref.watch(nodeOutboundConsignmentsProvider(node.id)).valueOrNull
        ?? const <MpConsignment>[];
    final shifts = [
      if (node.collectsShift('am')) Shift.am,
      if (node.collectsShift('pm')) Shift.pm,
    ];
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
        Text(l.homeHeroToday.toUpperCase(),
            style: DhenuText.caption.copyWith(color: _soft, letterSpacing: 1.1)),
        const SizedBox(height: DhenuSpacing.md),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (var i = 0; i < shifts.length; i++) ...[
              if (i > 0) ...[
                const SizedBox(width: DhenuSpacing.md),
                Container(width: 1, color: Colors.white.withValues(alpha: 0.22)),
                const SizedBox(width: DhenuSpacing.md),
              ],
              Expanded(child: _section(l, shifts[i], status, outbound)),
            ],
          ]),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        Divider(height: 1, color: Colors.white.withValues(alpha: 0.22)),
        const SizedBox(height: DhenuSpacing.md),
        _total(l),
      ]),
    );
  }

  static final Color _soft = Colors.white.withValues(alpha: 0.82);

  Widget _section(AppLocalizations l, Shift shift, MpShiftStatus? status,
      List<MpConsignment> outbound) {
    final s = summary;
    final qty = s == null ? 0.0 : (shift == Shift.am ? s.amQty : s.pmQty);
    final state = _stateFor(shift, qty, status, outbound);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon, size: 14, color: _soft),
        const SizedBox(width: DhenuSpacing.xs),
        Text(shift == Shift.am ? l.shiftAm : l.shiftPm,
            style: DhenuText.label.copyWith(color: _soft)),
      ]),
      const SizedBox(height: DhenuSpacing.xs),
      Text(litres(qty, unit: true),
          style: DhenuText.number(size: 26, color: Colors.white),
          maxLines: 1, overflow: TextOverflow.ellipsis),
      const SizedBox(height: DhenuSpacing.sm),
      _statusPill(l, state),
    ]);
  }

  /// Legs first: once milk has left, where it is outranks whether the slot was
  /// closed. A pooled VMCC sends AM and PM as one untagged tanker, so its legs
  /// speak for both halves of the day; a per-shift VMCC's only for the shift
  /// they carry. Reversed legs are ignored — a cancelled dispatch left the
  /// milk exactly where it was.
  ShiftState _stateFor(Shift shift, double qty, MpShiftStatus? status,
      List<MpConsignment> outbound) {
    final legs = outbound
        .where((c) => !c.isReversed && (node.isPooledDispatch || c.shift == shift))
        .toList();
    if (legs.isNotEmpty) {
      if (legs.any((c) => c.inTransit)) return ShiftState.inTransit;
      if (legs.every((c) => c.received)) return ShiftState.atCc;
    }
    final closed = status != null &&
        (node.isPooledDispatch ? status.dayClosed : status.closedFor(shift.name));
    if (closed) return ShiftState.toDispatch;
    return qty > 0.05 ? ShiftState.collecting : ShiftState.notStarted;
  }

  /// Band colour can't be used on this gradient (every step fails contrast), so
  /// the pill stays white on a translucent scrim and leans on its icon to
  /// separate the states — the same rule the quality readout below follows.
  Widget _statusPill(AppLocalizations l, ShiftState state) {
    final (icon, label) = switch (state) {
      ShiftState.notStarted => (DhenuIcons.clock, l.homeShiftNotStarted),
      ShiftState.collecting => (DhenuIcons.drop, l.homeShiftCollecting),
      ShiftState.toDispatch => (DhenuIcons.package, l.homeShiftToDispatch),
      ShiftState.inTransit => (DhenuIcons.truck, l.homeShiftInTransit),
      ShiftState.atCc => (DhenuIcons.checkCircle, l.homeShiftAtCc),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: state == ShiftState.notStarted ? 0.16 : 0.28),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: state == ShiftState.notStarted ? _soft : Colors.white),
        const SizedBox(width: 4),
        Flexible(
          child: Text(label,
              style: DhenuText.caption.copyWith(
                  color: state == ShiftState.notStarted ? _soft : Colors.white),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ]),
    );
  }

  Widget _total(AppLocalizations l) {
    final s = summary;
    final total = s?.totalQty ?? 0;
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.homeHeroTotalToday.toUpperCase(),
              style: DhenuText.caption.copyWith(color: _soft, letterSpacing: 1.1)),
          const SizedBox(height: 2),
          Text(litres(total, unit: true),
              style: DhenuText.hero.copyWith(color: Colors.white),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      ),
      if (s != null && total > 0.05)
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(l.homeFarmerCount(s.farmerCount),
              style: DhenuText.body.copyWith(color: _soft)),
          if (s.avgFat > 0) ...[
            const SizedBox(height: DhenuSpacing.xs),
            _quality(s),
          ],
        ]),
    ]);
  }

  /// Quality readout for the brand-gradient hero.
  ///
  /// Band COLOUR cannot be used on this surface: against the gradient every
  /// band step fails contrast — 1.06:1 at worst, and even a 65% black scrim
  /// only lifts the red band to 4.08:1. So the values stay white on a
  /// translucent scrim (~5:1) and a breach is signalled by an icon instead,
  /// which survives any background.
  Widget _quality(MpCollectionSummary s) {
    final breached = QualityBadge.anyOutOfBand(
        bands, node.effectiveMilkType, {'fat': s.avgFat, 'snf': s.avgSnf});
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (breached) ...[
          const Icon(DhenuIcons.warning, size: 12, color: Colors.white),
          const SizedBox(width: 4),
        ],
        Text(
          'FAT ${s.avgFat.toStringAsFixed(1)} · SNF ${s.avgSnf.toStringAsFixed(1)}'
          '${s.avgWater > 0 ? ' · W ${s.avgWater.toStringAsFixed(1)}' : ''}',
          style: DhenuText.caption.copyWith(color: Colors.white),
        ),
      ]),
    );
  }
}
