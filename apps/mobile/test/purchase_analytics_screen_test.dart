// Renders the purchase analytics screen against a stubbed payload: the cards,
// charts and range chips must lay out without overflow, and the spend chart
// must open on its latest buckets.
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/purchase_analytics_models.dart';
import 'package:runq_mobile/providers/purchase_analytics_providers.dart';
import 'package:runq_mobile/screens/purchase/purchase_analytics_screen.dart';

PurchaseAnalytics _fixture() => PurchaseAnalytics.fromJson({
      'period': {'from': '2026-08-01', 'to': '2026-08-10', 'grain': 'day'},
      'headline': {
        'grossSpend': 493000.0,
        'debitNotes': 2500.0,
        'netSpend': 490500.0,
        'taxableValue': 470000.0,
        'taxAmount': 23000.0,
        'billCount': 196,
        'avgBillValue': 25151.0,
        'activeVendors': 77,
      },
      'trend': [
        for (var d = 1; d <= 10; d++)
          {
            'bucket': '2026-08-${d.toString().padLeft(2, '0')}',
            'spend': 40000.0 + d * 2500,
            'billCount': 3 + d,
          },
      ],
      'topVendors': [
        {
          'vendorId': 'v1',
          'name': 'Farm Taste (OPC)',
          'spend': 534784.0,
          'billCount': 7,
          'share': 19.8,
        },
        {'vendorId': 'v2', 'name': 'SRI VIJAYALAKSHMI AND CO', 'spend': 16200.0, 'billCount': 3, 'share': 4.1},
      ],
      'topItems': [
        {'description': 'WELLTECH PANEL BOARD 12.5 HP', 'spend': 13729.0, 'quantity': 2.0, 'sku': 'WT-125'},
      ],
      'statusSplit': [
        {'status': 'paid', 'count': 194, 'amount': 4904665.0},
        {'status': 'approved', 'count': 2, 'amount': 24957.0},
      ],
      'payments': {
        'paidInPeriod': 4904665.0,
        'outstandingFromPeriod': 24957.0,
        'paidRatio': 99.5,
        'avgDaysToPay': 20,
      },
    });

void main() {
  testWidgets('renders every section without overflow', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        purchaseAnalyticsProvider.overrideWith((ref, query) async => _fixture()),
      ],
      child: const MaterialApp(home: PurchaseAnalyticsScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('NET SPEND'), findsOneWidget);
    expect(find.text('Spend'), findsOneWidget);
    expect(find.text('Payments'), findsOneWidget);
    expect(find.text('All vendors'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.drag(find.byType(ListView).first, const Offset(0, -1200));
    await tester.pumpAndSettle();
    expect(find.text('Top vendors'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('spend chart opens on the latest 5 buckets and scrolls back',
      (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        purchaseAnalyticsProvider.overrideWith((ref, query) async => _fixture()),
      ],
      child: const MaterialApp(home: PurchaseAnalyticsScreen()),
    ));
    await tester.pumpAndSettle();

    final scrollable = find.ancestor(
      of: find.byType(LineChart).last,
      matching: find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.right,
      ),
    );
    expect(scrollable, findsOneWidget);

    final position = (tester.state(scrollable) as ScrollableState).position;
    expect(position.maxScrollExtent, greaterThan(0));
    expect(position.pixels, moreOrLessEquals(position.maxScrollExtent, epsilon: 0.5));

    // Centres rather than edges: the test font boxes every glyph at the full
    // font size, so label widths here are roughly double a real device's.
    final viewport = tester.getRect(scrollable);
    double centreX(String label) => tester.getRect(find.text(label)).center.dx;
    expect(centreX('10 Aug'), lessThan(viewport.right));
    expect(centreX('6 Aug'), greaterThan(viewport.left));
    expect(centreX('1 Aug'), lessThan(viewport.left));

    await tester.drag(scrollable, const Offset(400, 0));
    await tester.pumpAndSettle();
    expect(centreX('1 Aug'), greaterThan(viewport.left));
    expect(tester.takeException(), isNull);
  });
}
