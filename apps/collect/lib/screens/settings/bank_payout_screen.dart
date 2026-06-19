import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';

/// Read-only payout summary for a field operator: how they're paid (comp terms),
/// this month's earning, and whether a bank payee is on file. Bank account
/// capture stays an admin task — surfaced here only as a status line.
class BankPayoutScreen extends ConsumerWidget {
  const BankPayoutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final selfAsync = ref.watch(operatorSelfProvider);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text('Bank & payout', style: DhenuText.h2.copyWith(color: t.ink))),
      body: selfAsync.when(
        loading: () => const DhenuLoadingList(rows: 3),
        error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff,
          title: 'Could not load payout',
          subtitle: '$e',
        ),
        data: (rows) => rows.isEmpty
            ? const DhenuEmptyState(
                icon: DhenuIcons.payments,
                title: 'No payout terms yet',
                subtitle: 'Your compensation is set up by your admin and will appear here.',
              )
            : ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(
                    DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
                children: [
                  for (var i = 0; i < rows.length; i++) ...[
                    if (i > 0) const SizedBox(height: DhenuSpacing.xl),
                    ..._nodeBlock(t, rows[i]),
                  ],
                ],
              ),
      ),
    );
  }

  List<Widget> _nodeBlock(DhenuTokens t, MpOperatorSelf o) => [
        Text(o.nodeName, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        _earningCard(t, o),
        const SizedBox(height: DhenuSpacing.md),
        _termsCard(t, o),
        const SizedBox(height: DhenuSpacing.md),
        _accountCard(t, o),
      ];

  // This month's earning hero.
  Widget _earningCard(DhenuTokens t, MpOperatorSelf o) {
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('THIS MONTH', style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.8)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(rupees(o.monthEarning), style: DhenuText.h1.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.xs),
        Text('${litres(o.monthQty, unit: true)} collected · est. earning so far',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]),
    );
  }

  // Comp arrangement breakdown.
  Widget _termsCard(DhenuTokens t, MpOperatorSelf o) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        _row(t, icon: DhenuIcons.bank, label: 'Payout method', value: _compLabel(o)),
        if (o.rentAmount != null && o.rentAmount! > 0) ...[
          _divider(t),
          _row(t, icon: DhenuIcons.about, label: 'Rent', value: '${rupees(o.rentAmount!)} / month'),
        ],
        _divider(t),
        _row(t, icon: DhenuIcons.calendar, label: 'Since',
            value: memberSinceLabel(DateTime.tryParse(o.effectiveFrom) ?? DateTime(2000))),
      ]),
    );
  }

  // Bank payee status — capture is an admin task.
  Widget _accountCard(DhenuTokens t, MpOperatorSelf o) {
    final ok = o.hasPayee;
    return DhenuCard(
      child: Row(children: [
        Icon(ok ? DhenuIcons.shieldCheck : DhenuIcons.warning,
            size: 20, color: ok ? t.gradeA : t.gradeC),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: Text(
            ok
                ? 'Payouts go to your registered bank account.'
                : 'No bank account on file — ask your admin to add one.',
            style: DhenuText.body.copyWith(color: t.ink),
          ),
        ),
      ]),
    );
  }

  String _compLabel(MpOperatorSelf o) {
    if (o.compType == 'fixed_salary') {
      return o.monthlySalary != null ? '${rupees(o.monthlySalary!)} / month' : 'Fixed salary';
    }
    return o.ratePerLitre != null ? '${rupees(o.ratePerLitre!, paise: true)} / litre' : 'Per-litre commission';
  }

  Widget _row(DhenuTokens t, {required IconData icon, required String label, required String value}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: t.brandSubtle,
            borderRadius: BorderRadius.circular(DhenuRadii.input),
          ),
          child: Icon(icon, size: 18, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Text(label, style: DhenuText.body.copyWith(color: t.ink))),
        Text(value, style: DhenuText.label.copyWith(color: t.ink)),
      ]),
    );
  }

  Widget _divider(DhenuTokens t) => Padding(
        padding: const EdgeInsets.only(left: DhenuSpacing.lg + 36 + DhenuSpacing.md),
        child: Container(height: 1, color: t.hairline),
      );
}
