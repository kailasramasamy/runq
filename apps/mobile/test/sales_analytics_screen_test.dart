// Renders the sales analytics screen against a stubbed payload: the cards,
// charts and range chips must lay out without overflow, and the presets must
// resolve to the windows they claim.
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/sales_analytics_models.dart';
import 'package:runq_mobile/providers/sales_analytics_providers.dart';
import 'package:runq_mobile/screens/sales/sales_analytics_screen.dart';

SalesAnalytics _fixture() => SalesAnalytics.fromJson({
      'period': {'from': '2026-08-01', 'to': '2026-08-10', 'grain': 'day'},
      'headline': {
        'grossRevenue': 674967.0,
        'creditNotes': 420.0,
        'netRevenue': 674547.0,
        'taxableValue': 670138.0,
        'taxAmount': 4828.0,
        'invoiceCount': 61,
        'avgInvoiceValue': 11065.0,
        'activeCustomers': 4,
      },
      'trend': [
        for (var d = 1; d <= 10; d++)
          {
            'bucket': '2026-08-${d.toString().padLeft(2, '0')}',
            'revenue': 90000.0 + d * 5000,
            'invoiceCount': 5 + d,
          },
      ],
      'topCustomers': [
        {
          'customerId': 'c1',
          'name': 'Think FreshFirst Technologies Pvt Ltd',
          'revenue': 618693.0,
          'invoiceCount': 41,
          'share': 91.7,
        },
        {'customerId': 'c2', 'name': 'Razorpay Pvt Ltd', 'revenue': 40000.0, 'invoiceCount': 8, 'share': 5.9},
      ],
      'topItems': [
        {'description': 'A2 Desi Cow Milk', 'revenue': 266592.0, 'quantity': 3204.0, 'uom': 'L'},
      ],
      'statusSplit': [
        {'status': 'paid', 'count': 6, 'amount': 231200.0},
        {'status': 'sent', 'count': 55, 'amount': 443767.0},
      ],
      'collections': {
        'receivedInPeriod': 231200.0,
        'outstandingFromPeriod': 443767.0,
        'collectedRatio': 34.3,
        'avgDaysToPay': 5,
      },
    });

void main() {
  testWidgets('renders every section without overflow', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        salesAnalyticsProvider.overrideWith((ref, query) async => _fixture()),
      ],
      child: const MaterialApp(home: SalesAnalyticsScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('NET REVENUE'), findsOneWidget);
    expect(find.text('Revenue'), findsOneWidget);
    expect(find.text('Collections'), findsOneWidget);
    expect(find.text('This month'), findsOneWidget);
    expect(tester.takeException(), isNull);

    // Scroll to the sections below the fold and check they render too.
    await tester.drag(find.byType(ListView).first, const Offset(0, -1200));
    await tester.pumpAndSettle();
    expect(find.text('Top customers'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('revenue chart opens on the latest 5 buckets and scrolls back',
      (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        salesAnalyticsProvider.overrideWith((ref, query) async => _fixture()),
      ],
      child: const MaterialApp(home: SalesAnalyticsScreen()),
    ));
    await tester.pumpAndSettle();

    // The plot's own scroll view — scoped through the chart, since the range
    // chips above are also a horizontal list.
    final scrollable = find.ancestor(
      of: find.byType(LineChart).last,
      matching: find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.right,
      ),
    );
    expect(scrollable, findsOneWidget);

    // 10 buckets at 7 per viewport means there is history to scroll back to,
    // and we open parked at the newest end.
    final position = (tester.state(scrollable) as ScrollableState).position;
    expect(position.maxScrollExtent, greaterThan(0));
    expect(position.pixels, moreOrLessEquals(position.maxScrollExtent, epsilon: 0.5));

    // Both labels exist in the tree — the whole series is laid out inside the
    // scroll view — so visibility is a geometry question, not a finder one.
    // Centres rather than edges: the test font boxes every glyph at the full
    // font size, so label widths here are roughly double a real device's.
    final viewport = tester.getRect(scrollable);
    double centreX(String label) => tester.getRect(find.text(label)).center.dx;

    // The last 5 buckets (6–10 Aug) are the ones parked in view.
    expect(centreX('10 Aug'), lessThan(viewport.right));
    expect(centreX('6 Aug'), greaterThan(viewport.left));
    expect(centreX('1 Aug'), lessThan(viewport.left),
        reason: 'oldest bucket should be scrolled off to the left');


    await tester.drag(scrollable, const Offset(400, 0));
    await tester.pumpAndSettle();
    expect(centreX('1 Aug'), greaterThan(viewport.left));
    expect(tester.takeException(), isNull);
  });

  test('presets resolve to the windows they claim', () {
    final now = DateTime(2026, 8, 10);

    final thisMonth = SalesRange.forPreset(SalesRangePreset.thisMonth, now: now);
    expect(thisMonth.from, DateTime(2026, 8, 1));
    expect(thisMonth.to, DateTime(2026, 8, 10));

    final lastMonth = SalesRange.forPreset(SalesRangePreset.lastMonth, now: now);
    expect(lastMonth.from, DateTime(2026, 7, 1));
    expect(lastMonth.to, DateTime(2026, 7, 31));

    // 90 days is inclusive of both ends — 89 days back plus today.
    final days90 = SalesRange.forPreset(SalesRangePreset.days90, now: now);
    expect(days90.to.difference(days90.from).inDays, 89);

    // Indian FY starts 1 April; August falls in the FY opened that same year.
    expect(SalesRange.forPreset(SalesRangePreset.thisFy, now: now).from,
        DateTime(2026, 4, 1));
    // A January date belongs to the FY that opened the previous April.
    expect(
      SalesRange.forPreset(SalesRangePreset.thisFy, now: DateTime(2026, 1, 20)).from,
      DateTime(2025, 4, 1),
    );
  });
}
