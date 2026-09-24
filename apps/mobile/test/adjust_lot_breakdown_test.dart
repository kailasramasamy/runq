import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/inventory_models.dart';
import 'package:runq_mobile/screens/inventory/widgets/adjust_stock_widgets.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// The adjust screen pools every lot in a warehouse into one number, because
/// that is what someone counting a shelf counts. The breakdown is what lets
/// that pooled figure be checked against the lots behind it.
void main() {
  InvItemStockRow lot(
    String batchNo,
    double qty, {
    String? collectedOn,
    String? shift,
  }) =>
      InvItemStockRow(
        warehouseId: 'w1',
        warehouseName: 'Vrindavan Main Plant',
        batchNo: batchNo,
        qty: qty,
        avgCost: 0,
        value: 0,
        origin: collectedOn == null
            ? null
            : BatchOrigin(
                kind: 'mp_receipt',
                label: 'Indus CC',
                date: collectedOn,
                shift: shift,
              ),
      );

  AdjustHolding holding(List<InvItemStockRow> batches) => AdjustHolding(
        warehouseId: 'w1',
        warehouseName: 'Vrindavan Main Plant',
        qty: batches.fold(0.0, (a, b) => a + b.qty),
        batches: batches,
      );

  Future<void> pump(WidgetTester tester, AdjustHolding h) => tester.pumpWidget(
        MaterialApp(
          theme: RunqTheme.light(),
          home: Scaffold(body: AdjustLotBreakdown(holding: h)),
        ),
      );

  testWidgets('lists every pooled lot with its own quantity', (tester) async {
    await pump(tester, holding([
      lot('RM-A1-0901', 120.5),
      lot('RM-A1-0902', 100),
      lot('RM-A1-0903', 90.43),
      lot('RM-A1-0904', 43.5),
    ]));

    for (final batch in ['RM-A1-0901', 'RM-A1-0902', 'RM-A1-0903', 'RM-A1-0904']) {
      expect(find.textContaining(batch), findsOneWidget);
    }
    expect(find.text('120.5'), findsOneWidget);
    expect(find.text('90.43'), findsOneWidget);
  });

  testWidgets('tells same-day AM and PM consignments apart', (tester) async {
    // The reason the line needs a date and shift at all: these two codes are
    // the same centre on the same day, and the number alone cannot say which
    // milk is which.
    await pump(tester, holding([
      lot('CON/2026-27/02433', 135.5, collectedOn: '2026-08-28', shift: 'am'),
      lot('CON/2026-27/02434', 97.2, collectedOn: '2026-08-28', shift: 'pm'),
    ]));

    expect(find.textContaining('28 Aug AM'), findsOneWidget);
    expect(find.textContaining('28 Aug PM'), findsOneWidget);
  });

  testWidgets('falls back to the batch number when the lot has no collection',
      (tester) async {
    // A GRN or an adjustment has no shift to name.
    await pump(tester, holding([lot('ADJ-000199-01', 11.2), lot('X', 1)]));

    expect(find.text('ADJ-000199-01'), findsOneWidget);
  });

  testWidgets('names an unbatched pool rather than leaving the row blank',
      (tester) async {
    await pump(tester, holding([lot('', 200), lot('RM-A1-0902', 154.43)]));
    expect(find.textContaining('No batch number'), findsOneWidget);
  });

  testWidgets('renders nothing when the figure is a single lot', (tester) async {
    await pump(tester, holding([lot('RM-A1-0901', 354.43)]));
    expect(find.byType(Text), findsNothing);
  });
}
