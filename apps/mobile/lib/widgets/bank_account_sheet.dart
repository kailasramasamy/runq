import 'package:flutter/material.dart';
import '../api/models.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'bank_logo.dart';

bool _isCash(BankAccount a) =>
    a.accountType.toLowerCase() == 'cash' || a.bankName.toLowerCase() == 'cash';

String _subtitle(BankAccount a) {
  if (_isCash(a)) return 'Cash in hand';
  final type = a.accountType.isEmpty
      ? ''
      : '${a.accountType[0].toUpperCase()}${a.accountType.substring(1)} · ';
  return '$type${a.masked}';
}

/// Bottom sheet for choosing the account money was paid from: bank logo (or a
/// wallet for cash), name, type and masked number, with the current choice
/// ticked. Returns the picked account, or null when dismissed.
Future<BankAccount?> showBankAccountSheet(
  BuildContext context, {
  required List<BankAccount> accounts,
  String? selectedId,
  String title = 'Paid from',
}) {
  final t = RT(context);
  return showModalBottomSheet<BankAccount>(
    context: context,
    backgroundColor: t.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: _handle(t)),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
              child: Text(title, style: RunqText.h3.copyWith(color: t.ink)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Text('Choose the account the money went out of',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                itemCount: accounts.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _AccountRow(
                  account: accounts[i],
                  selected: accounts[i].id == selectedId,
                  onTap: () => Navigator.pop(ctx, accounts[i]),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

Widget _handle(RunqTokens t) => Container(
      width: 40,
      height: 4,
      margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
    );

class _AccountRow extends StatelessWidget {
  final BankAccount account;
  final bool selected;
  final VoidCallback onTap;
  const _AccountRow({required this.account, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final radius = BorderRadius.circular(14);
    return Material(
      color: selected ? RunqColors.indigo.withValues(alpha: 0.08) : t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(
          color: selected ? RunqColors.indigo.withValues(alpha: 0.45) : t.hairline,
          width: selected ? 1.2 : 0.8,
        ),
      ),
      child: InkWell(
        borderRadius: radius,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              _leading(),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(account.bankName,
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Text(_subtitle(account), style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                size: 22,
                color: selected ? RunqColors.indigo : t.muted2,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _leading() {
    if (!_isCash(account)) {
      return BankLogo(bankName: account.bankName, logoUrl: account.logoUrl, size: 42);
    }
    return Container(
      width: 42,
      height: 42,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: RunqColors.indigo.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Icon(Icons.account_balance_wallet_outlined, color: RunqColors.indigo, size: 21),
    );
  }
}
