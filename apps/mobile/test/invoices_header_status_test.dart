// The status filters moved out of the scope strip into their own row under
// the search field — pin that they render there with their counts.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/invoices_header.dart';

void main() {
  testWidgets('status filters render below search with counts', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: InvoicesHeader(
          count: 1078,
          amount: 677000,
          amountLabel: 'outstanding',
          customerName: null,
          onPickCustomer: () {},
          onClearCustomer: () {},
          rangeLabel: 'All time',
          rangeActive: false,
          onPickRange: () {},
          tabKey: 'all',
          badges: const {'all': 1078, 'draft': 20, 'overdue': 7, 'unpaid': 143, 'paid': 908},
          onTab: (_) {},
          searchController: TextEditingController(),
          onSearchChanged: (_) {},
        ),
      ),
    ));
    await tester.pumpAndSettle();

    for (final label in ['All', 'Draft', 'Overdue', 'Unpaid', 'Paid']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('20'), findsOneWidget);
    expect(find.text('908'), findsOneWidget);

    // Every status pill sits under the search field, not in the scope strip.
    final searchBottom = tester.getRect(find.byType(TextField)).bottom;
    expect(tester.getRect(find.text('Draft')).top, greaterThan(searchBottom));
    expect(tester.takeException(), isNull);
  });
}
