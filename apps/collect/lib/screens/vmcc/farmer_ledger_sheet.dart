import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/sheet_grabber.dart';
import 'add_farmer_screen.dart';

/// Bottom sheet: a farmer's running ledger (advances / feed-loans / repayments)
/// with an inline add-entry form. Deductions auto-apply at the next cycle.
Future<void> showFarmerLedgerSheet(BuildContext context, MpFarmer farmer) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FarmerLedgerSheet(farmer: farmer),
  );
}

const _entryTypeKeys = ['advance_given', 'feed_loan_given', 'repayment'];

class _FarmerLedgerSheet extends ConsumerStatefulWidget {
  const _FarmerLedgerSheet({required this.farmer});
  final MpFarmer farmer;
  @override
  ConsumerState<_FarmerLedgerSheet> createState() => _FarmerLedgerSheetState();
}

class _FarmerLedgerSheetState extends ConsumerState<_FarmerLedgerSheet> {
  final _amount = TextEditingController();
  String _entryType = 'advance_given';
  String _refType = 'advance'; // only used for repayment
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _openEdit() async {
    final nav = Navigator.of(context);
    nav.pop(); // close this sheet; the edit screen refreshes the list on save
    await nav.push<bool>(
      MaterialPageRoute(builder: (_) => AddFarmerScreen(existing: widget.farmer)),
    );
  }

  Future<void> _save() async {
    final l = AppLocalizations.of(context);
    final amt = double.tryParse(_amount.text);
    if (amt == null || amt <= 0) {
      setState(() => _error = l.ledgerInvalidAmount);
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await mpRepo.addLedgerEntry({
        'farmerId': widget.farmer.id,
        'entryType': _entryType,
        'amount': amt,
        'occurredOn': todayIso(),
        if (_entryType == 'repayment') 'refType': _refType,
      });
      _amount.clear();
      setState(() => _saving = false);
      ref.invalidate(farmerLedgerProvider(widget.farmer.id));
    } catch (e) {
      setState(() { _saving = false; _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final ledgerAsync = ref.watch(farmerLedgerProvider(widget.farmer.id));
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (context, ctrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Expanded(
            child: ListView(
              controller: ctrl,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.x4),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(farmerName(context, widget.farmer), style: DhenuText.h2.copyWith(color: t.ink)),
                          Text(widget.farmer.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: _openEdit,
                      icon: Icon(DhenuIcons.edit, color: t.brand),
                      tooltip: l.ledgerEditDetails,
                    ),
                  ],
                ),
                const SizedBox(height: DhenuSpacing.lg),
                _balanceCard(t, l, ledgerAsync),
                const SizedBox(height: DhenuSpacing.xl),
                Text(l.ledgerAddEntry, style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.md),
                _typeChips(t, l),
                if (_entryType == 'repayment') ...[
                  const SizedBox(height: DhenuSpacing.md),
                  _refChips(t, l),
                ],
                const SizedBox(height: DhenuSpacing.md),
                TextField(
                  controller: _amount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
                  decoration: InputDecoration(hintText: l.ledgerAmountHint, prefixText: '₹ '),
                ),
                if (_error != null) ...[
                  const SizedBox(height: DhenuSpacing.sm),
                  Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
                ],
                const SizedBox(height: DhenuSpacing.lg),
                PrimaryAction(
                  label: l.ledgerRecordEntry,
                  icon: DhenuIcons.check,
                  onPressed: _save,
                  loading: _saving,
                ),
                const SizedBox(height: DhenuSpacing.xl),
                Text(l.ledgerHistory, style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.sm),
                _history(t, l, ledgerAsync),
              ],
            ),
          ),
        ]),
      ),
    );
  }

  Widget _balanceCard(DhenuTokens t, AppLocalizations l, AsyncValue<({double balance, List<MpLedgerEntry> entries})> a) {
    return a.when(
      loading: () => const DhenuLoadingList(rows: 1),
      error: (e, _) => Text(l.ledgerLoadError, style: DhenuText.body.copyWith(color: t.inkSoft)),
      data: (d) => Row(children: [
        Text(l.ledgerOutstanding, style: DhenuText.body.copyWith(color: t.inkSoft)),
        const Spacer(),
        Text(rupees(d.balance),
            style: DhenuText.number(size: 24, color: d.balance > 0 ? t.gradeC : t.gradeA)),
      ]),
    );
  }

  Widget _typeChips(DhenuTokens t, AppLocalizations l) {
    final labels = [l.ledgerEntryAdvance, l.ledgerEntryFeedLoan, l.ledgerEntryRepayment];
    return Row(
      children: List.generate(_entryTypeKeys.length, (i) {
        final key = _entryTypeKeys[i];
        final selected = _entryType == key;
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.only(right: DhenuSpacing.sm),
            child: _chip(t, labels[i], selected, () => setState(() => _entryType = key)),
          ),
        );
      }),
    );
  }

  Widget _refChips(DhenuTokens t, AppLocalizations l) => Row(children: [
        Expanded(child: _chip(t, l.ledgerAgainstAdvance, _refType == 'advance',
            () => setState(() => _refType = 'advance'))),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(child: _chip(t, l.ledgerAgainstFeedLoan, _refType == 'cattle_feed_loan',
            () => setState(() => _refType = 'cattle_feed_loan'))),
      ]);

  Widget _chip(DhenuTokens t, String label, bool selected, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? t.brandSubtle : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
            border: Border.all(color: selected ? t.brand : t.hairline),
          ),
          child: Text(label,
              style: DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft)),
        ),
      );

  Widget _history(DhenuTokens t, AppLocalizations l, AsyncValue<({double balance, List<MpLedgerEntry> entries})> a) {
    return a.when(
      loading: () => const DhenuLoadingList(rows: 3),
      error: (_, _) => const SizedBox.shrink(),
      data: (d) {
        if (d.entries.isEmpty) {
          return DhenuEmptyState(icon: DhenuIcons.receipt, title: l.ledgerNoEntries);
        }
        return Column(
          children: d.entries.map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
                child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_label(l, e.entryType), style: DhenuText.body.copyWith(color: t.ink)),
                    Text(prettyDate(e.occurredOn),
                        style: DhenuText.caption.copyWith(color: t.inkSoft)),
                  ])),
                  Text(rupees(e.amount), style: DhenuText.number(size: 16, color: t.ink)),
                ]),
              )).toList(),
        );
      },
    );
  }

  String _label(AppLocalizations l, String entryType) => switch (entryType) {
        'advance_given' => l.ledgerHistoryAdvanceGiven,
        'feed_loan_given' => l.ledgerHistoryFeedLoanGiven,
        'repayment' => l.ledgerHistoryRepayment,
        _ => l.ledgerHistoryAdjustment,
      };
}
