import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/api_client.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/payout_status_chip.dart';
import '../../widgets/sheet_grabber.dart';
import '../pdf_viewer_screen.dart';

/// The Payouts half of a farmer's Payments hub: one row per server payout line,
/// newest cycle first. Each row carries the cycle window, litres, net, its
/// status, a statement PDF and — on a locked-but-unpaid line — mark paid.
class FarmerPayoutHistory extends ConsumerWidget {
  const FarmerPayoutHistory({super.key, required this.farmer});

  final MpFarmer farmer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final linesAsync = ref.watch(payoutLinesForFarmerProvider(farmer.id));
    return linesAsync.when(
      loading: () => const DhenuLoadingList(rows: 3),
      error: (e, _) => DhenuEmptyState(
        icon: DhenuIcons.cloudOff,
        title: l.farmerPaymentsPayoutsLoadError,
        subtitle: '$e',
      ),
      data: (lines) {
        if (lines.isEmpty) {
          return DhenuEmptyState(
            icon: DhenuIcons.receipt,
            title: l.farmerPaymentsNoPayouts,
            subtitle: l.farmerPaymentsNoPayoutsSubtitle,
          );
        }
        return Column(
          children: [
            for (final line in lines) ...[
              _PayoutRow(farmer: farmer, line: line),
              const SizedBox(height: DhenuSpacing.md),
            ],
          ],
        );
      },
    );
  }

  /// Period as the row and the statement both label it, e.g. "1–15 Aug 2026".
  /// Falls back to whichever bound exists; a line always has a cycle, but the
  /// window is only joined on by the farmer-scoped endpoint.
  static String periodLabel(MpPayoutLine line) {
    final from = line.periodStart, to = line.periodEnd;
    if (from == null || to == null) return prettyDate(from ?? to ?? '');
    return '${shortDate(from)} – ${prettyDate(to)}';
  }
}

class _PayoutRow extends ConsumerStatefulWidget {
  const _PayoutRow({required this.farmer, required this.line});
  final MpFarmer farmer;
  final MpPayoutLine line;

  @override
  ConsumerState<_PayoutRow> createState() => _PayoutRowState();
}

class _PayoutRowState extends ConsumerState<_PayoutRow> {
  /// Optimistic paid flag; null until this row toggles it. Reverts on error.
  bool? _override;
  bool _saving = false;

  MpPayoutLine get line => widget.line;
  bool get _isPaid => _override ?? line.isPaid;

  /// An open cycle is still accruing pours — its net is not final, so there is
  /// nothing legitimate to disburse against yet. The cycle detail screen omits
  /// this guard only because it never lists an open cycle; this list does.
  bool get _canMarkPaid => !_isPaid && line.cycleStatus != 'open';

  Future<void> _togglePaid() async {
    final l = AppLocalizations.of(context);
    final next = !_isPaid;
    setState(() {
      _override = next;
      _saving = true;
    });
    try {
      await mpRepo.markLinePaid(line.payoutCycleId, line.id, next);
      ref.invalidate(payoutLinesForFarmerProvider(widget.farmer.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _override = !next);
      showDhenuToast(context, '${l.farmerPaymentsMarkPaidError}: ${e.message}',
          type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final status = PayoutStatus.of([line]);
    return DhenuCard(
      onTap: () => showPayoutLineSheet(context, widget.farmer, line, _isPaid),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(FarmerPayoutHistory.periodLabel(line),
                  style: DhenuText.title.copyWith(color: t.ink)),
            ),
            if (_isPaid)
              const PayoutStatusChip(status: PayoutStatus.paid)
            else if (status != null)
              PayoutStatusChip(status: status),
          ]),
          const SizedBox(height: DhenuSpacing.xs),
          Row(children: [
            Expanded(
              child: Text(
                l.farmerPaymentsLitresNet(
                    litres(line.qtyLitres), rupees(line.netAmount)),
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
            ),
            _StatementIcon(farmer: widget.farmer, line: line),
          ]),
          if (_canMarkPaid) ...[
            const SizedBox(height: DhenuSpacing.sm),
            _markPaidButton(t, l),
          ],
        ],
      ),
    );
  }

  Widget _markPaidButton(DhenuTokens t, AppLocalizations l) => Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          onPressed: _saving ? null : _togglePaid,
          icon: Icon(DhenuIcons.check, size: 16, color: t.brand),
          label: Text(l.farmerPaymentsMarkPaid,
              style: DhenuText.label.copyWith(color: t.brand)),
          style: OutlinedButton.styleFrom(
            side: BorderSide(color: t.brand),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(DhenuRadii.pill)),
            padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
            minimumSize: const Size(0, 36),
          ),
        ),
      );
}

/// Fetches the server's own statement PDF and opens it in-app. Viewing before
/// sharing is deliberate — the operator hands this to a farmer, so they should
/// see what they are sending.
class _StatementIcon extends ConsumerStatefulWidget {
  const _StatementIcon({required this.farmer, required this.line});
  final MpFarmer farmer;
  final MpPayoutLine line;

  @override
  ConsumerState<_StatementIcon> createState() => _StatementIconState();
}

class _StatementIconState extends ConsumerState<_StatementIcon> {
  bool _busy = false;

  Future<void> _open() async {
    final l = AppLocalizations.of(context);
    final line = widget.line;
    if (line.periodStart == null || line.periodEnd == null) return;
    setState(() => _busy = true);
    try {
      final doc = await mpRepo.farmerPourStatementPdf(
        farmerId: widget.farmer.id,
        from: line.periodStart!,
        to: line.periodEnd!,
        label: FarmerPayoutHistory.periodLabel(line),
      );
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfViewerScreen(
          title: l.statementViewerTitle,
          bytes: doc.bytes,
          filename: doc.filename,
        ),
      ));
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
      onPressed: _busy ? null : _open,
      tooltip: AppLocalizations.of(context).statementDownloadButton,
      visualDensity: VisualDensity.compact,
      icon: _busy
          ? const SizedBox(
              width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(DhenuIcons.download, size: 18, color: t.brand),
    );
  }
}

/// Where the cycle's money went: gross + bonus, every deduction by type, net.
Future<void> showPayoutLineSheet(
  BuildContext context,
  MpFarmer farmer,
  MpPayoutLine line,
  bool isPaid,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PayoutLineSheet(farmer: farmer, line: line, isPaid: isPaid),
  );
}

class _PayoutLineSheet extends StatelessWidget {
  const _PayoutLineSheet({
    required this.farmer,
    required this.line,
    required this.isPaid,
  });

  final MpFarmer farmer;
  final MpPayoutLine line;
  final bool isPaid;

  String _deductionLabel(AppLocalizations l, String type) => switch (type) {
        'advance' => l.farmerPaymentsDeductionAdvance,
        'cattle_feed_loan' => l.farmerPaymentsDeductionFeedLoan,
        _ => l.farmerPaymentsDeductionOther,
      };

  String _modeLabel(AppLocalizations l, String mode) => switch (mode) {
        'bank_transfer' => l.farmerPaymentsModeBankTransfer,
        'upi' => l.farmerPaymentsModeUpi,
        'cash' => l.farmerPaymentsModeCash,
        'cheque' => l.farmerPaymentsModeCheque,
        _ => l.farmerPaymentsModeOther,
      };

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    // grossAmount already contains bonusAmount (server prices base+bonus), so
    // the bar splits gross into base / bonus / deductions — never adds bonus on.
    final base = line.grossAmount - line.bonusAmount;
    final hasBonus = line.bonusAmount > 0.01;
    final hasDeductions = line.deductions.isNotEmpty || line.deductionTotal > 0.01;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.x4),
        children: [
          const SheetGrabber(),
          _header(t, l),
          const SizedBox(height: DhenuSpacing.lg),
          // A single-segment bar compares nothing — only worth drawing once the
          // cycle actually splits into bonus or deductions.
          if (hasBonus || hasDeductions) ...[
            BreakdownBar(segments: [
              BreakdownSegment(base, t.brand),
              BreakdownSegment(line.bonusAmount, t.gradeA),
              BreakdownSegment(line.deductionTotal, t.gradeC),
            ]),
            const SizedBox(height: DhenuSpacing.lg),
            _caption(t, l.farmerPaymentsEarnings),
            _row(t, l.farmerPaymentsGross, rupees(base)),
            if (hasBonus)
              _row(t, l.farmerPaymentsBonus, rupees(line.bonusAmount),
                  color: t.gradeA),
            if (hasDeductions) ...[
              const SizedBox(height: DhenuSpacing.sm),
              _caption(t, l.farmerPaymentsDeductions),
              for (final d in line.deductions)
                _row(t, _deductionLabel(l, d.deductionType),
                    '− ${rupees(d.amount)}',
                    color: t.gradeC),
            ],
            Divider(height: DhenuSpacing.xl, color: t.hairline),
          ],
          _row(t, l.farmerPaymentsNet, rupees(line.netAmount), emphasis: true),
          const SizedBox(height: DhenuSpacing.lg),
          _caption(t, l.farmerPaymentsPaymentSection),
          ..._paymentRows(t, l),
        ],
      ),
    );
  }

  Widget _header(DhenuTokens t, AppLocalizations l) {
    final status = PayoutStatus.of([line]);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(FarmerPayoutHistory.periodLabel(line),
              style: DhenuText.h2.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text('${litres(line.qtyLitres, unit: true)} · ${farmer.code}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
      ),
      if (isPaid)
        const PayoutStatusChip(status: PayoutStatus.paid)
      else if (status != null)
        PayoutStatusChip(status: status),
    ]);
  }

  /// Settlement confirmation — the operator is asked to prove a payout landed,
  /// so the UTR sits with the mode and date rather than being dropped.
  List<Widget> _paymentRows(DhenuTokens t, AppLocalizations l) {
    final paidOn =
        line.paymentDate ?? line.paidAt?.toIso8601String().substring(0, 10);
    final rows = <Widget>[
      if (paidOn != null)
        _row(t, l.farmerPaymentsPaidOnLabel, prettyDate(paidOn)),
      if (line.paymentMode != null)
        _row(t, l.farmerPaymentsPaymentMode, _modeLabel(l, line.paymentMode!)),
      if (line.paymentReference != null)
        _row(t, l.farmerPaymentsReference, line.paymentReference!),
      if (line.statementNo != null)
        _row(t, l.farmerPaymentsStatementNo, line.statementNo!),
    ];
    if (rows.isEmpty) {
      return [
        Text(l.farmerPaymentsNotConfirmed,
            style: DhenuText.body.copyWith(color: t.inkSoft)),
      ];
    }
    return rows;
  }

  Widget _caption(DhenuTokens t, String text) => Padding(
        padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
        child: Text(
          text.toUpperCase(),
          style: DhenuText.caption.copyWith(
              color: t.inkSoft, fontWeight: FontWeight.w700, letterSpacing: 1.1),
        ),
      );

  Widget _row(DhenuTokens t, String label, String value,
          {Color? color, bool emphasis = false}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: emphasis
                  ? DhenuText.label.copyWith(color: t.ink)
                  : DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(width: DhenuSpacing.lg),
          Expanded(
            child: Text(value,
                textAlign: TextAlign.right,
                style: DhenuText.number(
                    size: emphasis ? 18 : 14, color: color ?? t.ink)),
          ),
        ]),
      );
}
