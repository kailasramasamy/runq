import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/manufacturing_models.dart';
import 'package:runq_mobile/screens/manufacturing/_record_production_alloc_list.dart';
import 'package:runq_mobile/screens/manufacturing/_record_production_wastage.dart';

InputPoolBatch b(String item, String name, String? batch, double qty) =>
    InputPoolBatch(
        itemId: item,
        itemName: name,
        batchNo: batch,
        qty: qty,
        unitCost: 0,
        expiryDate: null);

void main() {
  // Vrindavan's paneer run, 26 Aug: one milk line pooling A2 + A1 + Buffalo.
  final preview = ProductionPreview(
    bomId: 'bom',
    bomVersion: 1,
    bomCode: 'BOM-PANEER-UNPACKED',
    bomName: 'Paneer - unpacked',
    outputItemId: 'out',
    outputItemName: 'Paneer - unpacked',
    outputUom: '200g',
    outputTracksBatches: true,
    runs: 90,
    producedQty: 90,
    warehouseId: 'wh',
    warehouseName: 'Main',
    estimatedInputValue: 0,
    shortages: const [],
    allocations: [
      ProductionAllocation(
        bomLineId: 'l1',
        inputItemId: 'a2',
        inputItemName: 'A2 Milk (Raw)',
        uom: 'litre',
        requiredQty: 140.4,
        availableQty: 1084.7, // pool-wide: 600 + 376.8 + 107.9
        isOptional: false,
        substitutes: const [],
        batches: const [],
        pool: [
          b('a2', 'A2 Milk (Raw)', 'A2-MILK-2026-08-25-BAL', 7),
          b('a2', 'A2 Milk (Raw)', 'CON/2026-27/01620', 593),
          b('a1', 'A1 Milk (Raw)', 'CON/2026-27/01623', 376.8),
          b('buf', 'Buffalo Milk (Raw)', 'CON/2026-27/01624', 107.9),
        ],
        suggestion: const [],
      ),
    ],
  );

  test('only the drawn item gets a row, balanced against its own stock', () {
    final ctls = <String, TextEditingController>{
      drawKey('a2', 'A2-MILK-2026-08-25-BAL'): TextEditingController(text: '7'),
      drawKey('a2', 'CON/2026-27/01620'): TextEditingController(text: '133.4'),
    };

    final rows = closingStockRows(preview, ctls);

    // A1 and Buffalo were never touched — no row, so nothing to write off.
    expect(rows.length, 1);
    expect(rows.single.itemName, 'A2 Milk (Raw)');
    expect(rows.single.onHand, 600);
    expect(rows.single.drawn, 140.4);
    expect(rows.single.expectedLeft, closeTo(459.6, 0.001));

    // Counting the true A2 leftover writes off nothing. Before the fix this
    // balanced against 1084.7 and wasted 484.7 L of untouched substitutes.
    expect(wastageFromLeft(rows.single, '459.6'), 0);
    // A genuine 5 L loss still lands.
    expect(wastageFromLeft(rows.single, '454.6'), closeTo(5, 0.001));
    // Blank is not a claim of zero wastage.
    expect(wastageFromLeft(rows.single, ''), 0);
  });

  test('a substitute draw is balanced against the substitute', () {
    final ctls = <String, TextEditingController>{
      drawKey('a2', 'CON/2026-27/01620'): TextEditingController(text: '40.4'),
      drawKey('buf', 'CON/2026-27/01624'): TextEditingController(text: '100'),
    };

    final rows = closingStockRows(preview, ctls);
    expect(rows.map((r) => r.itemName), ['A2 Milk (Raw)', 'Buffalo Milk (Raw)']);
    expect(rows[1].onHand, 107.9);
    expect(rows[1].expectedLeft, closeTo(7.9, 0.001));
    expect(wastageFromLeft(rows[1], '7.9'), 0);
  });

  test('nothing drawn yields no rows at all', () {
    expect(closingStockRows(preview, {}), isEmpty);
  });
}
