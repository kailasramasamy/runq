import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/app_localizations.dart';
import '../providers/mp_payout_providers.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import '../utils/sale_settlement.dart';

/// A payout line's `farmer_sale` deduction, shown as what the farmer bought and
/// how that reaches the amount recovered. Falls back to the recovered figure
/// until the sales and ledger have loaded.
class SaleRecoveryRows extends ConsumerWidget {
  const SaleRecoveryRows({
    super.key,
    required this.farmerId,
    required this.periodStart,
    required this.periodEnd,
    required this.recovered,
    required this.rowBuilder,
  });

  final String farmerId, periodStart, periodEnd;
  final double recovered;

  /// The host sheet's own row, so these match the rows around them.
  final Widget Function(String label, String value, Color color) rowBuilder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final sales = ref.watch(farmerSalesProvider(farmerId)).asData?.value;
    final ledger = ref.watch(farmerLedgerProvider(farmerId)).asData?.value;
    if (sales == null || ledger == null) {
      return rowBuilder(l.farmerPaymentsBought, '− ${rupees(recovered)}', t.gradeC);
    }
    final s = SaleSettlement.from(
      sales: sales, entries: ledger.entries,
      periodStart: periodStart, periodEnd: periodEnd, recovered: recovered,
    );
    return Column(children: [
      if (s.purchased >= 1)
        rowBuilder(l.farmerPaymentsBought, '− ${rupees(s.purchased)}', t.gradeC),
      if (s.earlier >= 1)
        rowBuilder(l.farmerPaymentsEarlierPurchases, '− ${rupees(s.earlier)}', t.gradeC),
      if (s.carried >= 1)
        rowBuilder(l.farmerPaymentsCarriedNext, '+ ${rupees(s.carried)}', t.ink),
    ]);
  }
}
