// NOTE: Payment figures are computed from the farmer's own pours (gross milk +
// quality bonus via lineAmount vs qty×ratePerLitre) and ledger entries
// (deductions / advances / feed loans, identified by negative-amount entries).
// The net-payable card and history are grouped by the tenant's payout cycle
// (farmerCyclePeriodsProvider, cadence from /config/cycle); when no cadence is
// configured it falls back to calendar months.
// A farmer-scoped payout statement endpoint is not yet available; this is a
// ledger+pours approximation.
//
// BONUS NOTE: MpPour carries ratePerLitre (the full blended rate, already
// including any bonus component). There is no separate baseRatePerLitre on
// MpPour, so bonus cannot be cleanly isolated per pour. Quality bonus is
// approximated as (lineAmount − qty × ratePerLitre), which will be zero/near-
// zero if the server stores the final all-in rate. BreakdownBar omits the bonus
// segment when qualityBonus ≤ 0.01 (spec fallback noted).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/audio_play.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/section_header.dart';
import 'farmer_insights.dart';

/// Payments tab — transparent month payout breakdown + history (spec §6.3).
class FarmerPaymentsTab extends ConsumerWidget {
  const FarmerPaymentsTab({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(cycleConfigProvider);
    ref.invalidate(farmerCyclePeriodsProvider);
    ref.invalidate(farmerLedgerProvider);
    await Future.wait([
      ref.read(farmerCyclePeriodsProvider.future),
      ref.read(farmerLedgerProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final periodsAsync = ref.watch(farmerCyclePeriodsProvider);
    final ledgerAsync = ref.watch(farmerLedgerProvider);
    final periods = periodsAsync.asData?.value ?? const <MpCyclePeriod>[];
    final current = periods.isEmpty ? null : periods.first;
    final cyclePoursAsync = current == null
        ? const AsyncValue<List<MpPour>>.data([])
        : ref.watch(farmerCyclePoursProvider(current));

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          _stickyHeader(t, l),
          const SizedBox(height: DhenuSpacing.lg),
          _netPayableCard(context, t, l, cyclePoursAsync, ledgerAsync, current),
          const SizedBox(height: DhenuSpacing.xl),
          _historyHeader(t, l),
          const SizedBox(height: DhenuSpacing.sm),
          _historyList(periods.skip(1).toList()),
        ],
      ),
    );
  }

  // ── Sticky-ish title ────────────────────────────────────────────────────────
  Widget _stickyHeader(DhenuTokens t, AppLocalizations l) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          DhenuSectionHeader(l.farmerPaymentsTitle),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            l.farmerPaymentsSubtitle,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ],
      );

  Widget _historyHeader(DhenuTokens t, AppLocalizations l) => Text(
        l.farmerPaymentsHistoryHeader,
        style: DhenuText.caption.copyWith(
            color: t.inkSoft, fontWeight: FontWeight.w700, letterSpacing: 1.1),
      );

  // ── Net-payable card ────────────────────────────────────────────────────────
  Widget _netPayableCard(
    BuildContext context,
    DhenuTokens t,
    AppLocalizations l,
    AsyncValue<List<MpPour>> cyclePoursAsync,
    AsyncValue<({double balance, List<MpLedgerEntry> entries})> ledgerAsync,
    MpCyclePeriod? period,
  ) {
    final periodLabel = period?.label ?? '';
    if (cyclePoursAsync.isLoading || ledgerAsync.isLoading) {
      return const DhenuLoadingList(rows: 5);
    }
    if (cyclePoursAsync.hasError) {
      return DhenuErrorState(onRetry: () {});
    }

    final pours = cyclePoursAsync.asData?.value ?? [];
    final ledger = ledgerAsync.asData?.value;

    final grossMilk = pours.fold<double>(0, (s, p) => s + p.qtyLitres * p.ratePerLitre);
    final qualityBonus = pours.fold<double>(
        0, (s, p) => s + (p.lineAmount - p.qtyLitres * p.ratePerLitre));
    final hasBonus = qualityBonus > 0.01;

    final deductionMap = <String, double>{};
    if (ledger != null) {
      for (final e in ledger.entries) {
        if (e.amount < 0) {
          deductionMap[e.entryType] = (deductionMap[e.entryType] ?? 0) + e.amount.abs();
        }
      }
    }
    final totalDeductions = deductionMap.values.fold<double>(0, (s, v) => s + v);
    final netPayable = grossMilk + (hasBonus ? qualityBonus : 0) - totalDeductions;
    final balance = ledger?.balance ?? 0;
    final cycleLabel = periodLabel.isEmpty ? l.farmerHomeThisCycle : periodLabel.toUpperCase();

    final proj = period == null
        ? null
        : projectCycleEarnings(
            pours: pours, windowStart: period.start, windowEnd: period.end, today: DateTime.now());
    final projectedNet = proj == null ? 0.0 : (proj.projectedGross - totalDeductions);
    final showProj = proj != null && proj.isProjectable && projectedNet > netPayable + 1;

    return Container(
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
        border: Border.all(color: t.hairline),
        boxShadow: DhenuShadows.card,
      ),
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            l.farmerPaymentsNetPayable(cycleLabel),
            style: DhenuText.caption.copyWith(
                color: t.inkSoft, fontWeight: FontWeight.w700, letterSpacing: 1.1),
          ),
          const SizedBox(height: DhenuSpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  rupees(netPayable),
                  style: DhenuText.number(size: 40, w: FontWeight.w800, color: t.ink),
                ),
              ),
              AudioPlay(
                speak: l.farmerPaymentsListenSpeak(netPayable.toStringAsFixed(0)),
                label: l.farmerHomeHeroListenLabel,
                size: 16,
                iconColor: t.inkSoft,
                fillColor: t.hairline,
              ),
            ],
          ),
          if (showProj) ...[
            const SizedBox(height: DhenuSpacing.xs),
            Row(
              children: [
                Icon(DhenuIcons.trendingUp, size: 14, color: t.gradeA),
                const SizedBox(width: DhenuSpacing.xs),
                Text(
                  l.farmerPaymentsProjection(rupees(projectedNet)),
                  style:
                      DhenuText.caption.copyWith(color: t.inkSoft, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ],
          const SizedBox(height: DhenuSpacing.lg),
          BreakdownBar(
            height: 10,
            segments: [
              BreakdownSegment(grossMilk.clamp(0, double.infinity), t.gradeA),
              if (hasBonus) BreakdownSegment(qualityBonus, const Color(0xFF3DDC97)),
              if (totalDeductions > 0) BreakdownSegment(totalDeductions, t.gradeC),
            ],
          ),
          const SizedBox(height: DhenuSpacing.lg),
          _itemRow(t, t.gradeA, l.farmerPaymentsGrossMilk, rupees(grossMilk), t.ink),
          if (hasBonus) ...[
            _hairline(t),
            _itemRow(t, const Color(0xFF3DDC97), l.farmerPaymentsQualityBonus,
                '+ ${rupees(qualityBonus)}', t.gradeA),
          ],
          if (deductionMap.isNotEmpty) ...[
            _hairline(t),
            ...deductionMap.entries.toList().asMap().entries.map((entry) {
              final i = entry.key;
              final e = entry.value;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (i > 0) _hairline(t),
                  _itemRow(t, t.gradeC, _deductionLabel(l, e.key),
                      '− ${rupees(e.value)}', t.gradeC),
                ],
              );
            }),
          ],
          if (balance < 0) ...[
            const SizedBox(height: DhenuSpacing.md),
            _advanceChip(t, l, balance),
          ],
        ],
      ),
    );
  }

  Widget _itemRow(
      DhenuTokens t, Color dot, String label, String amount, Color amountColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(label, style: DhenuText.body.copyWith(color: t.ink)),
          ),
          Text(amount,
              style: DhenuText.number(size: 15, w: FontWeight.w600, color: amountColor)),
        ],
      ),
    );
  }

  Widget _hairline(DhenuTokens t) =>
      Divider(height: 1, thickness: 1, color: t.hairline);

  Widget _advanceChip(DhenuTokens t, AppLocalizations l, double balance) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
      decoration: BoxDecoration(
        color: t.gradeC.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        border: Border.all(color: t.gradeC.withValues(alpha: 0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(DhenuIcons.warning, size: 14, color: t.gradeC),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            l.farmerPaymentsOutstandingAdvance(rupees(balance.abs())),
            style: DhenuText.label.copyWith(color: t.gradeC),
          ),
        ],
      ),
    );
  }

  // ── Payment history ─────────────────────────────────────────────────────────
  Widget _historyList(List<MpCyclePeriod> periods) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: periods.map((p) => _HistoryRow(period: p)).toList(),
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  String _deductionLabel(AppLocalizations l, String type) {
    switch (type) {
      case 'cattle_feed_loan':
        return l.farmerPaymentsDeductCattleFeedLoan;
      case 'advance':
        return l.farmerPaymentsDeductAdvance;
      case 'medicine':
        return l.farmerPaymentsDeductMedicine;
      case 'insurance':
        return l.farmerPaymentsDeductInsurance;
      default:
        return type.replaceAll('_', ' ');
    }
  }
}

// ── History row widget ────────────────────────────────────────────────────────
class _HistoryRow extends ConsumerWidget {
  const _HistoryRow({required this.period});
  final MpCyclePeriod period;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final poursAsync = ref.watch(farmerCyclePoursProvider(period));

    if (poursAsync.isLoading) return const SizedBox.shrink();
    final pours = poursAsync.asData?.value ?? [];
    if (pours.isEmpty) return const SizedBox.shrink();

    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);
    final label = period.label;

    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
      child: DhenuCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label,
                      style:
                          DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                  const SizedBox(height: DhenuSpacing.xs),
                  Text(
                    l.farmerPaymentsHistorySummary(litres(totalL), pours.length),
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  ),
                ],
              ),
            ),
            const SizedBox(width: DhenuSpacing.md),
            _PaidChip(t: t, l: l),
            const SizedBox(width: DhenuSpacing.sm),
            Text(
              rupees(totalRs),
              style: DhenuText.number(size: 16, w: FontWeight.w800, color: t.ink),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaidChip extends StatelessWidget {
  const _PaidChip({required this.t, required this.l});
  final DhenuTokens t;
  final AppLocalizations l;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: t.gradeA.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(
        l.farmerPaymentsPaid,
        style: DhenuText.caption
            .copyWith(color: t.gradeA, fontWeight: FontWeight.w700, letterSpacing: 0.8),
      ),
    );
  }
}
