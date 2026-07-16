import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';

/// Read-only view of where the farmer's milk money goes (bank/UPI mirrored
/// from their vendor row). Farmers can't edit — the VMCC operator maintains
/// payout identity — but they must be able to SEE it (audit E1: the old
/// "Bank & payout" row was an operator-only dead end for farmers).
class FarmerBankScreen extends ConsumerWidget {
  const FarmerBankScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final farmerAsync = ref.watch(farmerSelfProvider);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(l.profileBankPayout, style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: farmerAsync.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuErrorState(onRetry: () => ref.invalidate(farmerSelfProvider)),
        data: (f) => _body(t, l, f),
      ),
    );
  }

  Widget _body(DhenuTokens t, AppLocalizations l, MpFarmer? f) {
    final rows = <(String, String)>[
      if (f?.bankAccountName != null) (l.farmerBankAccountHolder, f!.bankAccountName!),
      if (f?.bankAccountNumber != null) (l.farmerBankAccountNumber, _mask(f!.bankAccountNumber!)),
      if (f?.bankIfsc != null) (l.farmerBankIfsc, f!.bankIfsc!),
      if (f?.bankName != null) (l.farmerBankName, f!.bankName!),
      if (f?.upiId != null) (l.farmerBankUpi, f!.upiId!),
    ];
    if (rows.isEmpty) {
      return DhenuEmptyState(
        icon: DhenuIcons.bank,
        title: l.farmerBankEmpty,
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        DhenuCard(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) Divider(height: DhenuSpacing.lg, thickness: 1, color: t.hairline),
                Row(children: [
                  Expanded(
                    child: Text(rows[i].$1, style: DhenuText.body.copyWith(color: t.inkSoft)),
                  ),
                  Text(rows[i].$2,
                      style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                ]),
              ],
            ],
          ),
        ),
        const SizedBox(height: DhenuSpacing.md),
        Text(l.farmerBankFootnote, style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ],
    );
  }

  /// Mask all but the last 4 digits — enough for the farmer to recognise the
  /// account without displaying the full number on a shared/borrowed phone.
  String _mask(String acc) => acc.length <= 4
      ? acc
      : '${'•' * (acc.length - 4)}${acc.substring(acc.length - 4)}';
}
