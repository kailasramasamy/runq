import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/sheet_grabber.dart';

/// Bottom sheet: record one advance / feed-loan / repayment against a farmer.
/// Deductions auto-apply at the next cycle.
///
/// Entry only — the running balance and the entry history live in the farmer's
/// Payments hub, which opens this sheet. Resolves true when an entry was saved,
/// so the caller can refresh without this sheet reaching for its providers.
Future<bool?> showFarmerLedgerSheet(BuildContext context, MpFarmer farmer) {
  return showModalBottomSheet<bool>(
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

  Future<void> _save() async {
    final l = AppLocalizations.of(context);
    final amt = double.tryParse(_amount.text);
    if (amt == null || amt <= 0) {
      setState(() => _error = l.ledgerInvalidAmount);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await mpRepo.addLedgerEntry({
        'farmerId': widget.farmer.id,
        'entryType': _entryType,
        'amount': amt,
        'occurredOn': todayIso(),
        if (_entryType == 'repayment') 'refType': _refType,
      });
      ref.invalidate(farmerLedgerProvider(widget.farmer.id));
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showDhenuToast(context, l.farmerPaymentsEntrySaved);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: ListView(
          shrinkWrap: true,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.x4),
          children: [
            const SheetGrabber(),
            Text(l.ledgerAddEntry, style: DhenuText.h2.copyWith(color: t.ink)),
            const SizedBox(height: DhenuSpacing.xs),
            Text(
              '${farmerName(context, widget.farmer)} · ${widget.farmer.code}',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            _typeChips(t, l),
            if (_entryType == 'repayment') ...[
              const SizedBox(height: DhenuSpacing.md),
              _refChips(t, l),
            ],
            const SizedBox(height: DhenuSpacing.md),
            TextField(
              controller: _amount,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textCapitalization: TextCapitalization.none,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
              ],
              decoration: InputDecoration(
                hintText: l.farmerPaymentsAmountHint,
                prefixText: '₹ ',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: DhenuSpacing.sm),
              Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
            ],
            const SizedBox(height: DhenuSpacing.lg),
            PrimaryAction(
              label: l.farmerPaymentsRecordEntry,
              icon: DhenuIcons.check,
              onPressed: _save,
              loading: _saving,
            ),
          ],
        ),
      ),
    );
  }

  Widget _typeChips(DhenuTokens t, AppLocalizations l) {
    final labels = [
      l.farmerPaymentsTypeAdvance,
      l.farmerPaymentsFeedLoan,
      l.farmerPaymentsRepayment,
    ];
    return Row(
      children: List.generate(_entryTypeKeys.length, (i) {
        final code = _entryTypeKeys[i];
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
                right: i == _entryTypeKeys.length - 1 ? 0 : DhenuSpacing.sm),
            child: _chip(t, labels[i], _entryType == code,
                () => setState(() => _entryType = code)),
          ),
        );
      }),
    );
  }

  Widget _refChips(DhenuTokens t, AppLocalizations l) => Row(children: [
        Expanded(
          child: _chip(t, l.farmerPaymentsAgainstAdvance, _refType == 'advance',
              () => setState(() => _refType = 'advance')),
        ),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(
          child: _chip(t, l.farmerPaymentsAgainstFeedLoan,
              _refType == 'cattle_feed_loan',
              () => setState(() => _refType = 'cattle_feed_loan')),
        ),
      ]);

  Widget _chip(DhenuTokens t, String label, bool selected, VoidCallback onTap) =>
      InkWell(
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
          child: Text(
            label,
            style: DhenuText.label
                .copyWith(color: selected ? t.brand : t.inkSoft),
          ),
        ),
      );
}
