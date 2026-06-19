import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/primary_action.dart';

const _entryTypes = [
  ('advance_given', 'Advance'),
  ('feed_loan_given', 'Feed loan'),
  ('repayment', 'Repayment'),
];

class FarmerPaymentsTab extends ConsumerStatefulWidget {
  const FarmerPaymentsTab({super.key, required this.farmer});

  final MpFarmer farmer;

  @override
  ConsumerState<FarmerPaymentsTab> createState() => _FarmerPaymentsTabState();
}

class _FarmerPaymentsTabState extends ConsumerState<FarmerPaymentsTab> {
  final _amount = TextEditingController();
  String _entryType = 'advance_given';
  String _refType = 'advance';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amt = double.tryParse(_amount.text);
    if (amt == null || amt <= 0) {
      setState(() => _error = 'Enter a valid amount');
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
      _amount.clear();
      setState(() => _saving = false);
      ref.invalidate(farmerLedgerProvider(widget.farmer.id));
    } catch (e) {
      setState(() {
        _saving = false;
        _error = '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final ledgerAsync = ref.watch(farmerLedgerProvider(widget.farmer.id));
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.fromLTRB(
        DhenuSpacing.lg,
        DhenuSpacing.lg,
        DhenuSpacing.lg,
        DhenuSpacing.x4 + MediaQuery.of(context).viewInsets.bottom,
      ),
      children: [
        _balanceCard(t, ledgerAsync),
        const SizedBox(height: DhenuSpacing.xl),
        Text('Add entry', style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.md),
        _typeChips(t),
        if (_entryType == 'repayment') ...[
          const SizedBox(height: DhenuSpacing.md),
          _refChips(t),
        ],
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textCapitalization: TextCapitalization.none,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
          ],
          decoration: const InputDecoration(
            hintText: 'Amount (₹)',
            prefixText: '₹ ',
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: DhenuSpacing.sm),
          Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
        ],
        const SizedBox(height: DhenuSpacing.lg),
        PrimaryAction(
          label: 'Record entry',
          icon: DhenuIcons.check,
          onPressed: _save,
          loading: _saving,
        ),
        const SizedBox(height: DhenuSpacing.xl),
        Text('History', style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        _history(t, ledgerAsync),
      ],
    );
  }

  Widget _balanceCard(
    DhenuTokens t,
    AsyncValue<({double balance, List<MpLedgerEntry> entries})> a,
  ) {
    return a.when(
      loading: () => const DhenuLoadingList(rows: 1),
      error: (e, _) => Text(
        'Could not load ledger',
        style: DhenuText.body.copyWith(color: t.inkSoft),
      ),
      data: (d) => Row(
        children: [
          Text('Outstanding', style: DhenuText.body.copyWith(color: t.inkSoft)),
          const Spacer(),
          Text(
            rupees(d.balance),
            style: DhenuText.number(
              size: 24,
              color: d.balance > 0 ? t.gradeC : t.gradeA,
            ),
          ),
        ],
      ),
    );
  }

  Widget _typeChips(DhenuTokens t) => Row(
    children: _entryTypes.map((e) {
      final selected = _entryType == e.$1;
      return Expanded(
        child: Padding(
          padding: const EdgeInsets.only(right: DhenuSpacing.sm),
          child: _chip(
            t,
            e.$2,
            selected,
            () => setState(() => _entryType = e.$1),
          ),
        ),
      );
    }).toList(),
  );

  Widget _refChips(DhenuTokens t) => Row(
    children: [
      Expanded(
        child: _chip(
          t,
          'Against advance',
          _refType == 'advance',
          () => setState(() => _refType = 'advance'),
        ),
      ),
      const SizedBox(width: DhenuSpacing.sm),
      Expanded(
        child: _chip(
          t,
          'Against feed loan',
          _refType == 'cattle_feed_loan',
          () => setState(() => _refType = 'cattle_feed_loan'),
        ),
      ),
    ],
  );

  Widget _chip(
    DhenuTokens t,
    String label,
    bool selected,
    VoidCallback onTap,
  ) => InkWell(
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
        style: DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft),
      ),
    ),
  );

  Widget _history(
    DhenuTokens t,
    AsyncValue<({double balance, List<MpLedgerEntry> entries})> a,
  ) {
    return a.when(
      loading: () => const DhenuLoadingList(rows: 3),
      error: (_, _) => const SizedBox.shrink(),
      data: (d) {
        if (d.entries.isEmpty) {
          return const DhenuEmptyState(
            icon: DhenuIcons.receipt,
            title: 'No entries yet',
          );
        }
        return Column(
          children: d.entries
              .map(
                (e) => Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: DhenuSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _entryLabel(e.entryType),
                              style: DhenuText.body.copyWith(color: t.ink),
                            ),
                            Text(
                              prettyDate(e.occurredOn),
                              style: DhenuText.caption.copyWith(
                                color: t.inkSoft,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        rupees(e.amount),
                        style: DhenuText.number(size: 16, color: t.ink),
                      ),
                    ],
                  ),
                ),
              )
              .toList(),
        );
      },
    );
  }

  String _entryLabel(String entryType) => switch (entryType) {
    'advance_given' => 'Advance given',
    'feed_loan_given' => 'Feed loan given',
    'repayment' => 'Repayment',
    _ => 'Adjustment',
  };
}
