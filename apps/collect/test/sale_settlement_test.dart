import 'package:dhenu/api/mp_models.dart';
import 'package:dhenu/utils/sale_settlement.dart';
import 'package:flutter_test/flutter_test.dart';

MpLedgerEntry _entry(String type, double amount, String on, [String? ref]) => MpLedgerEntry(
    id: on, farmerId: 'f', entryType: type, occurredOn: on, amount: amount, balanceAfter: 0, refType: ref);

void main() {
  test('an earlier over-recovery does not reduce this cycle\'s purchases', () {
    final s = SaleSettlement.from(
      sales: const [],
      entries: [
        _entry('farmer_sale', 110814, '2026-10-15'),
        _entry('repayment', 114334, '2026-10-15', 'farmer_sale'),
      ],
      periodStart: '2026-10-16', periodEnd: '2026-10-31', recovered: 0,
    );
    expect(s.earlier, 0);
    expect(s.carried, 0);
  });

  test('carries what the cycle could not recover', () {
    final s = SaleSettlement.from(
      sales: const [],
      entries: [
        _entry('farmer_sale', 500, '2026-10-01'),
        _entry('repayment', 200, '2026-10-15', 'advance'),
      ],
      periodStart: '2026-10-16', periodEnd: '2026-10-31', recovered: 300,
    );
    expect(s.earlier, 500);
    expect(s.carried, 200);
  });
}
