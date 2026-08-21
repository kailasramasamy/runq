import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/inventory/inventory_adjustment_common.dart';

void main() {
  final d = DateTime(2026, 8, 21);

  test('uses the SKU whole — a clipped product code names nothing', () {
    expect(
      invSuggestBatchNo(sku: 'SUNFLOWER-OIL-BULK', itemName: 'Sunflower Oil - Bulk', on: d),
      'SUNFLOWER-OIL-BULK-26233',
    );
  });

  test('folds punctuation and case in the SKU', () {
    expect(
      invSuggestBatchNo(sku: 'rm 014/a', itemName: 'Whatever', on: d),
      'RM-014-A-26233',
    );
  });

  test('falls back to a name slug when there is no SKU', () {
    expect(
      invSuggestBatchNo(sku: '', itemName: 'A1 Milk (Raw)', on: d),
      'A1-MILK-RAW-26233',
    );
  });

  test('trims a long name on a word boundary', () {
    expect(
      invSuggestBatchNo(
        sku: null,
        itemName: 'Cold Pressed Groundnut Oil Premium Reserve',
        on: d,
      ),
      'COLD-PRESSED-GROUNDNUT-26233',
    );
  });

  test('still yields a usable code when the item has neither', () {
    expect(invSuggestBatchNo(sku: '', itemName: '', on: d), 'BATCH-26233');
  });

  test('pads the day-of-year to three digits', () {
    expect(invSuggestBatchNo(sku: 'X', itemName: 'X', on: DateTime(2026, 1, 5)), 'X-26005');
  });

  test('Julian stamp counts leap days', () {
    // 2028 is a leap year: 1 Mar is day 61, one later than in a common year.
    expect(invJulianStamp(DateTime(2028, 3, 1)), '28061');
    expect(invJulianStamp(DateTime(2026, 3, 1)), '26060');
  });

  test('Julian stamp holds at the year boundary', () {
    expect(invJulianStamp(DateTime(2026, 1, 1)), '26001');
    expect(invJulianStamp(DateTime(2026, 12, 31)), '26365');
  });
}
