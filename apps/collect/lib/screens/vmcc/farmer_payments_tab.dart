import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_segmented.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/payout_status_chip.dart';
import '../../widgets/primary_action.dart';
import 'farmer_ledger_sheet.dart';
import 'farmer_sale_actions.dart';
import 'farmer_sale_sheet.dart';
import 'farmer_payout_history.dart';

enum _PaymentsView { payouts, ledger, sold }

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
    ref.invalidate(farmerSalesProvider(farmer.id));
    ref.invalidate(payoutLinesForFarmerProvider(farmer.id));
    await Future.wait([
      ref.read(farmerLedgerProvider(farmer.id).future),
      ref.read(farmerSalesProvider(farmer.id).future),
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
              (_PaymentsView.sold, l.farmerPaymentsSegSold, null),
            ],
          ),
          const SizedBox(height: DhenuSpacing.lg),
          switch (_view) {
            _PaymentsView.payouts => FarmerPayoutHistory(farmer: farmer),
            _PaymentsView.ledger => _ledger(t, l),
            _PaymentsView.sold => _sold(t, l),
          },
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
            // Recovery order, so the split reads the way the next cycle pays it.
            [
              if (d.saleDue > 0)
                l.farmerPaymentsSaleDue(rupees(d.saleDue)),
              l.farmerPaymentsAdvanceDue(rupees(d.advanceDue)),
              l.farmerPaymentsFeedLoanDue(rupees(d.feedLoanDue)),
            ].join(' · '),
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
        // Milk sales have their own tab, with the litres and type this list
        // cannot show. Leaving them here too read as duplicate advances.
        data: (d) => _entryList(
            t, l, d.entries.where((e) => !e.isSale).toList()),
      ),
    ]);
  }

  Widget _entryList(DhenuTokens t, AppLocalizations l, List<MpLedgerEntry> entries) {
    if (entries.isEmpty) {
      return DhenuEmptyState(
          icon: DhenuIcons.receipt, title: l.farmerPaymentsNoEntries);
    }
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < entries.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          _entryRow(t, l, entries[i]),
        ],
      ]),
    );
  }

  // ── Milk sold ─────────────────────────────────────────────────────────────

  /// What this farmer BOUGHT from us — bulk milk or products — with the qty,
  /// unit and rate the ledger list can't carry. The detail an operator is
  /// challenged on at the counter.
  Widget _sold(DhenuTokens t, AppLocalizations l) {
    final salesAsync = ref.watch(farmerSalesProvider(farmer.id));
    return Column(children: [
      PrimaryAction(
        label: l.farmerSaleTitle,
        icon: DhenuIcons.milk,
        onPressed: () async {
          if (await showFarmerSaleSheet(context, farmer) == true) {
            ref.invalidate(farmerSalesProvider(farmer.id));
          }
        },
      ),
      const SizedBox(height: DhenuSpacing.lg),
      salesAsync.when(
        loading: () => const DhenuLoadingList(rows: 3),
        error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff,
          title: l.farmerPaymentsLoadError,
          subtitle: '$e',
        ),
        data: (sales) => sales.isEmpty
            ? DhenuEmptyState(
                icon: DhenuIcons.milk, title: l.farmerSaleNoneYet)
            : DhenuCard(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  for (var i = 0; i < sales.length; i++) ...[
                    if (i > 0) Divider(height: 1, color: t.hairline),
                    _saleRow(t, l, sales[i]),
                  ],
                ]),
              ),
      ),
    ]);
  }

  Widget _saleRow(DhenuTokens t, AppLocalizations l, MpFarmerSale s) {
    final reversed = s.isReversed;
    return InkWell(
      // Tap opens the actions sheet — Edit and Delete both visible, the way a
      // pour row works. Delete behind a long-press was undiscoverable.
      onTap: reversed ? null : () => _openActions(l, s),
      child: Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              '${s.qty.toStringAsFixed(s.qty % 1 == 0 ? 0 : 1)}'
              '${s.isMilk ? ' ' : ' × '}${s.unit} · ${_soldLabel(l, s)}',
              style: DhenuText.body.copyWith(
                color: reversed ? t.inkSoft : t.ink,
                decoration: reversed ? TextDecoration.lineThrough : null,
              ),
            ),
            const SizedBox(height: DhenuSpacing.xs),
            Text(
              '${prettyDate(s.saleDate)}'
              '${s.shift == null ? '' : ' · ${s.shift == 'am' ? l.shiftAm : l.shiftPm}'}'
              ' · ${rupees(s.ratePerUnit)}/${s.unit}',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ]),
        ),
        Text(
          rupees(s.amount),
          style: DhenuText.number(
              size: 16, color: reversed ? t.inkSoft : t.ink),
        ),
        if (!reversed) ...[
          const SizedBox(width: DhenuSpacing.xs),
          Icon(DhenuIcons.chevronRight, size: 16, color: t.inkSoft),
        ],
      ]),
      ),
    );
  }

  Future<void> _openActions(AppLocalizations l, MpFarmerSale s) async {
    final action = await showFarmerSaleActions(context, s);
    // The sheet is gone by now, so the next dialog needs a live tree.
    if (!mounted) return;
    switch (action) {
      case FarmerSaleAction.edit:
        await _editSale(s);
      case FarmerSaleAction.delete:
        await _confirmDelete(l, s);
      case null:
        break;
    }
  }

  Future<void> _editSale(MpFarmerSale s) async {
    if (await showFarmerSaleSheet(context, farmer, existing: s) == true) {
      ref.invalidate(farmerSalesProvider(farmer.id));
      ref.invalidate(farmerLedgerProvider(farmer.id));
    }
  }

  /// Deleting removes the sale AND its deduction, so it asks first — and says
  /// what stops being deducted, not just "are you sure".
  Future<void> _confirmDelete(AppLocalizations l, MpFarmerSale s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.farmerSaleDelete),
        content: Text(l.farmerSaleDeleteConfirm),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(l.commonCancel)),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l.farmerSaleDelete)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await mpRepo.deleteFarmerSale(s.id);
      ref.invalidate(farmerSalesProvider(farmer.id));
      ref.invalidate(farmerLedgerProvider(farmer.id));
      if (mounted) showDhenuToast(context, l.farmerSaleDeleted);
    } catch (e) {
      if (mounted) showDhenuToast(context, '$e', type: DhenuToastType.error);
    }
  }

  /// A product names itself; bulk milk names its type.
  String _soldLabel(AppLocalizations l, MpFarmerSale s) =>
      s.itemName ?? (s.milkType == null ? '' : milkTypeL10n(l, s.milkType!));

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
        'farmer_sale' => l.farmerPaymentsSold,
        'advance_given' => l.farmerPaymentsAdvanceGiven,
        'feed_loan_given' => l.farmerPaymentsFeedLoanGiven,
        'repayment' => l.farmerPaymentsRepaymentLabel,
        _ => l.farmerPaymentsAdjustment,
      };
}
