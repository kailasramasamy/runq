// The "Needs your attention" strip lives in a fixed-height SizedBox, so the
// cards are one typography change away from a RenderFlex overflow. Pin the
// fit across the text scales a user can actually set.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/models.dart';
import 'package:runq_mobile/providers/data_providers.dart';
import 'package:runq_mobile/screens/dashboard/spotlight_cards.dart';

DashboardSummary _summary() => DashboardSummary(
      outstandingPayables: 100000,
      outstandingReceivables: 250000,
      cashPosition: 432100,
      overdueAmount: 187500,
      upcomingAmount: 96000,
      overdueCount: 4,
      upcomingCount: 3,
      unreconciledTxnCount: 2,
      outstandingPayablesCount: 6,
      outstandingReceivablesCount: 9,
    );

void main() {
  for (final scale in [1.0, 1.15, 1.3]) {
    testWidgets('spotlight cards fit at textScale $scale', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          dashboardSummaryProvider.overrideWith((ref) async => _summary()),
        ],
        child: MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: const Scaffold(body: SpotlightCards()),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('OVERDUE'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
