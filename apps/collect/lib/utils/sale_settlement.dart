import '../api/mp_models.dart';

/// How a cycle's purchases reconcile to what it recovered. Recovery is capped at
/// the milk value, so on its own it says nothing about what the farmer bought:
/// purchased + earlier − carried = recovered, always.
class SaleSettlement {
  const SaleSettlement({required this.purchased, required this.earlier, required this.carried});

  /// Goods bought inside the cycle's window.
  final double purchased;

  /// Still owed from before the window. Never negative.
  final double earlier;

  /// Left over for the next payment.
  final double carried;

  factory SaleSettlement.from({
    required List<MpFarmerSale> sales,
    required List<MpLedgerEntry> entries,
    required String periodStart,
    required String periodEnd,
    required double recovered,
  }) {
    final purchased = sales
        .where((s) => !s.isReversed
            && s.saleDate.compareTo(periodStart) >= 0
            && s.saleDate.compareTo(periodEnd) <= 0)
        .fold<double>(0, (sum, s) => sum + s.amount);
    var earlier = 0.0;
    for (final e in entries) {
      if (e.occurredOn.compareTo(periodStart) >= 0) continue;
      if (e.entryType == 'farmer_sale') {
        earlier += e.amount;
      } else if (e.refType == 'farmer_sale'
          && (e.entryType == 'repayment' || e.entryType == 'adjustment')) {
        earlier -= e.amount;
      }
    }
    if (earlier < 0) earlier = 0;
    return SaleSettlement(
      purchased: purchased, earlier: earlier, carried: earlier + purchased - recovered);
  }
}
