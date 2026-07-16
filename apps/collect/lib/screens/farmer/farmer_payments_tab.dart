// NOTE: The current (open) cycle card is a live estimate from the farmer's own
// pours: gross = Σ lineAmount, split into base (Σ baseAmount) and quality bonus
// (Σ bonusAmount) — the server prices each pour as base+bonus, so lineAmount
// already contains the bonus. The deduction shown is an ESTIMATE: the farmer's
// outstanding ledger balance capped at gross, mirroring the server's
// computeDeductions at cycle creation. Ledger amounts are always positive —
// the entry type carries direction, and a positive balance means the farmer
// owes (advance/feed loan outstanding).
// History rows are server-authoritative where a payout line exists
// (farmerPayoutLinesProvider → GET /payouts/my-lines): net amount + real
// Paid/Processing/Pending status. Periods with no line show litres + gross
// with no status chip. Cycle windows come from farmerCyclePeriodsProvider
// (cadence via /config/cycle, calendar-month fallback).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import '../../api/api_client.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../widgets/dhenu_toast.dart';
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
    ref.invalidate(farmerPayoutLinesProvider);
    await Future.wait([
      ref.read(farmerCyclePeriodsProvider.future),
      ref.read(farmerLedgerProvider.future),
      ref.read(farmerPayoutLinesProvider.future),
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
          _historyList(
            periods.skip(1).toList(),
            ref.watch(farmerPayoutLinesProvider).asData?.value ?? const [],
          ),
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

    // lineAmount = baseAmount + bonusAmount server-side; never add bonus on top.
    final gross = pours.fold<double>(0, (s, p) => s + p.lineAmount);
    final baseMilk = pours.fold<double>(0, (s, p) => s + p.baseAmount);
    final qualityBonus = pours.fold<double>(0, (s, p) => s + p.bonusAmount);
    final hasBonus = qualityBonus > 0.01;

    // Estimated recovery this cycle: outstanding balance (positive = owed),
    // capped at gross — mirrors the server's computeDeductions at cycle creation.
    final balance = ledger?.balance ?? 0;
    final outstanding = balance > 0 ? balance : 0.0;
    final estDeduction = outstanding > gross ? gross : outstanding;
    final netPayable = gross - estDeduction;
    final cycleLabel = periodLabel.isEmpty ? l.farmerHomeThisCycle : periodLabel.toUpperCase();

    final proj = period == null
        ? null
        : projectCycleEarnings(
            pours: pours, windowStart: period.start, windowEnd: period.end, today: DateTime.now());
    final projectedNet = proj == null ? 0.0 : (proj.projectedGross - estDeduction);
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
              BreakdownSegment(baseMilk.clamp(0, double.infinity), t.gradeA),
              if (hasBonus) BreakdownSegment(qualityBonus, t.brand),
              if (estDeduction > 0) BreakdownSegment(estDeduction, t.gradeC),
            ],
          ),
          const SizedBox(height: DhenuSpacing.lg),
          _itemRow(t, t.gradeA, l.farmerPaymentsGrossMilk, rupees(baseMilk), t.ink),
          if (hasBonus) ...[
            _hairline(t),
            _itemRow(t, t.brand, l.farmerPaymentsQualityBonus,
                '+ ${rupees(qualityBonus)}', t.gradeA),
          ],
          if (estDeduction > 0) ...[
            _hairline(t),
            _itemRow(t, t.gradeC, l.farmerPaymentsEstimatedDeduction,
                '− ${rupees(estDeduction)}', t.gradeC),
          ],
          if (balance > 0) ...[
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
  Widget _historyList(List<MpCyclePeriod> periods, List<MpPayoutLine> lines) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: periods.map((p) => _HistoryRow(period: p, lines: lines)).toList(),
    );
  }
}

// ── History row widget ────────────────────────────────────────────────────────
class _HistoryRow extends ConsumerWidget {
  const _HistoryRow({required this.period, required this.lines});
  final MpCyclePeriod period;
  final List<MpPayoutLine> lines;

  /// Server lines whose cycle window overlaps this client period. Client
  /// windows are calendar-derived while server cycles are operator-chosen date
  /// ranges, so 0..n lines can match.
  List<MpPayoutLine> _matching() => lines
      .where((ln) =>
          ln.periodStart != null &&
          ln.periodEnd != null &&
          ln.periodStart!.compareTo(period.end) <= 0 &&
          ln.periodEnd!.compareTo(period.start) >= 0)
      .toList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final poursAsync = ref.watch(farmerCyclePoursProvider(period));

    if (poursAsync.isLoading) {
      return const Padding(
        padding: EdgeInsets.only(bottom: DhenuSpacing.md),
        child: DhenuLoadingList(rows: 1),
      );
    }
    final pours = poursAsync.asData?.value ?? [];
    if (pours.isEmpty) return const SizedBox.shrink();

    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final matching = _matching();
    // Authoritative net where a payout line exists; gross-from-pours otherwise.
    final totalRs = matching.isNotEmpty
        ? matching.fold<double>(0, (s, ln) => s + ln.netAmount)
        : pours.fold<double>(0, (s, p) => s + p.lineAmount);

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
                  Text(period.label,
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
            ..._statusChip(t, l, matching),
            Text(
              rupees(totalRs),
              style: DhenuText.number(size: 16, w: FontWeight.w800, color: t.ink),
            ),
            _ShareStatementIcon(period: period),
          ],
        ),
      ),
    );
  }

  /// Paid: every line disbursed (operator mark-paid) or its cycle paid via GL.
  /// Pending: any cycle still open. Processing: locked, awaiting payment.
  /// No matching line → no chip (status unknown, show period + gross only).
  List<Widget> _statusChip(DhenuTokens t, AppLocalizations l, List<MpPayoutLine> matching) {
    if (matching.isEmpty) return const [];
    final String label;
    final Color color;
    if (matching.every((ln) => ln.isPaid || ln.cycleStatus == 'paid')) {
      label = l.farmerPaymentsPaid;
      color = t.gradeA;
    } else if (matching.any((ln) => ln.cycleStatus == 'open')) {
      label = l.farmerPaymentsStatusPending;
      color = t.inkSoft;
    } else {
      label = l.farmerPaymentsStatusProcessing;
      color = t.gradeB;
    }
    return [
      _StatusChip(label: label, color: color),
      const SizedBox(width: DhenuSpacing.sm),
    ];
  }
}

/// Per-cycle statement share (audit E2) — the same server PDF operators share,
/// now self-serve: farmers need statements for loans and their own records.
class _ShareStatementIcon extends ConsumerStatefulWidget {
  const _ShareStatementIcon({required this.period});
  final MpCyclePeriod period;
  @override
  ConsumerState<_ShareStatementIcon> createState() => _ShareStatementIconState();
}

class _ShareStatementIconState extends ConsumerState<_ShareStatementIcon> {
  bool _busy = false;

  Future<void> _share() async {
    final l = AppLocalizations.of(context);
    final self = await ref.read(farmerSelfProvider.future);
    if (!mounted || self == null) return;
    setState(() => _busy = true);
    try {
      final p = widget.period;
      final bytes = await mpRepo.farmerPourStatementPdf(
          farmerId: self.id, from: p.start, to: p.end, label: p.label);
      await Printing.sharePdf(
          bytes: bytes, filename: 'statement-${self.code}-${p.start}.pdf');
    } on ApiException catch (e) {
      if (mounted) {
        showDhenuToast(context, l.statementGenerateError(e.message),
            type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return IconButton(
      onPressed: _busy ? null : _share,
      tooltip: AppLocalizations.of(context).statementShareButton,
      icon: _busy
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(DhenuIcons.share, size: 18, color: t.brand),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(
        label,
        style: DhenuText.caption
            .copyWith(color: color, fontWeight: FontWeight.w700, letterSpacing: 0.8),
      ),
    );
  }
}
