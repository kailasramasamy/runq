import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_segmented.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/payout_status_chip.dart';
import '../../widgets/primary_action.dart';
import 'farmer_ledger_sheet.dart';
import 'farmer_payout_history.dart';

enum _PaymentsView { payouts, ledger }

/// A farmer's Payments hub, as the VMCC operator sees it. Two halves of the same
/// money story: what the farmer was paid per cycle (server-authoritative payout
/// lines, with statement and disbursement flag) and what they owe against
/// advances and feed loans.
class FarmerPaymentsTab extends ConsumerStatefulWidget {
  const FarmerPaymentsTab({super.key, required this.farmer});

  final MpFarmer farmer;

  @override
  ConsumerState<FarmerPaymentsTab> createState() => _FarmerPaymentsTabState();
}

class _FarmerPaymentsTabState extends ConsumerState<FarmerPaymentsTab> {
  _PaymentsView _view = _PaymentsView.payouts;

  MpFarmer get farmer => widget.farmer;

  Future<void> _refresh() async {
    ref.invalidate(farmerLedgerProvider(farmer.id));
    ref.invalidate(payoutLinesForFarmerProvider(farmer.id));
    await Future.wait([
      ref.read(farmerLedgerProvider(farmer.id).future),
      ref.read(payoutLinesForFarmerProvider(farmer.id).future),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(DhenuSpacing.screen, DhenuSpacing.lg,
            DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          _summary(t, l),
          const SizedBox(height: DhenuSpacing.lg),
          DhenuSegmented<_PaymentsView>(
            current: _view,
            onSelect: (v) => setState(() => _view = v),
            options: [
              (_PaymentsView.payouts, l.farmerPaymentsSegPayouts, null),
              (_PaymentsView.ledger, l.farmerPaymentsSegLedger, null),
            ],
          ),
          const SizedBox(height: DhenuSpacing.lg),
          if (_view == _PaymentsView.payouts)
            FarmerPayoutHistory(farmer: farmer)
          else
            _ledger(t, l),
        ],
      ),
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  /// Outstanding and last payout side by side — the two numbers an operator is
  /// asked for at the counter, before they pick a history to read.
  Widget _summary(DhenuTokens t, AppLocalizations l) {
    final ledger = ref.watch(farmerLedgerProvider(farmer.id)).valueOrNull;
    final lines =
        ref.watch(payoutLinesForFarmerProvider(farmer.id)).valueOrNull ?? const [];
    final last = lines.isEmpty ? null : lines.first;
    // IntrinsicHeight, not a stretched Row: the cards must match heights (only
    // one carries the advance/feed split line), but a bare stretch inside the
    // ListView asks them to fill an unbounded cross axis.
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: _outstandingCard(t, l, ledger)),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _lastPayoutCard(t, l, last)),
      ]),
    );
  }

  Widget _outstandingCard(DhenuTokens t, AppLocalizations l, MpFarmerLedger? d) {
    final owed = d?.balance ?? 0;
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l.farmerPaymentsOutstanding,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(rupees(owed),
            style: DhenuText.number(
                size: 20, color: owed > 0 ? t.gradeC : t.gradeA)),
        if (d != null && owed > 0) ...[
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            '${l.farmerPaymentsAdvanceDue(rupees(d.advanceDue))} · '
            '${l.farmerPaymentsFeedLoanDue(rupees(d.feedLoanDue))}',
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ],
      ]),
    );
  }

  Widget _lastPayoutCard(DhenuTokens t, AppLocalizations l, MpPayoutLine? last) {
    final status = last == null ? null : PayoutStatus.of([last]);
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l.farmerPaymentsLastPayout,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(last == null ? '—' : rupees(last.netAmount),
            style: DhenuText.number(size: 20, color: t.ink)),
        if (last != null) ...[
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            last.isPaid && last.paidAt != null
                ? l.farmerPaymentsPaidOn(prettyDate(
                    last.paidAt!.toIso8601String().substring(0, 10)))
                : (status?.label(l) ?? FarmerPayoutHistory.periodLabel(last)),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ],
      ]),
    );
  }

  // ── Advances & loans ──────────────────────────────────────────────────────

  Widget _ledger(DhenuTokens t, AppLocalizations l) {
    final ledgerAsync = ref.watch(farmerLedgerProvider(farmer.id));
    return Column(children: [
      PrimaryAction(
        label: l.farmerPaymentsRecordEntryButton,
        icon: DhenuIcons.add,
        onPressed: () => showFarmerLedgerSheet(context, farmer),
      ),
      const SizedBox(height: DhenuSpacing.lg),
      ledgerAsync.when(
        loading: () => const DhenuLoadingList(rows: 3),
        error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff,
          title: l.farmerPaymentsLoadError,
          subtitle: '$e',
        ),
        data: (d) => d.entries.isEmpty
            ? DhenuEmptyState(
                icon: DhenuIcons.receipt, title: l.farmerPaymentsNoEntries)
            : DhenuCard(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  for (var i = 0; i < d.entries.length; i++) ...[
                    if (i > 0) Divider(height: 1, color: t.hairline),
                    _entryRow(t, l, d.entries[i]),
                  ],
                ]),
              ),
      ),
    ]);
  }

  Widget _entryRow(DhenuTokens t, AppLocalizations l, MpLedgerEntry e) {
    // Ledger amounts are always positive; the entry type carries direction.
    final isRepayment = e.entryType == 'repayment';
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_entryLabel(l, e.entryType),
                style: DhenuText.body.copyWith(color: t.ink)),
            const SizedBox(height: DhenuSpacing.xs),
            Text(prettyDate(e.occurredOn),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ),
        Text('${isRepayment ? '− ' : '+ '}${rupees(e.amount)}',
            style: DhenuText.number(
                size: 16, color: isRepayment ? t.gradeA : t.ink)),
      ]),
    );
  }

  String _entryLabel(AppLocalizations l, String entryType) => switch (entryType) {
        'advance_given' => l.farmerPaymentsAdvanceGiven,
        'feed_loan_given' => l.farmerPaymentsFeedLoanGiven,
        'repayment' => l.farmerPaymentsRepaymentLabel,
        _ => l.farmerPaymentsAdjustment,
      };
}
