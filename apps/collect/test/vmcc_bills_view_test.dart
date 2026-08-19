import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/api/mp_models.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import 'package:dhenu/providers/mp_payout_providers.dart';
import 'package:dhenu/screens/vmcc/vmcc_bills_view.dart';
import 'package:dhenu/theme/dhenu_theme.dart';

final _node = MpNode.fromJson({
  'id': 'n1', 'code': 'VM1', 'name': 'Chikkasadanahalli',
  'nodeType': 'vmcc', 'parentNodeId': 'cc1', 'payoutMode': 'via_vmcc',
});

/// Shaped on the real Indus CC bills.
MpVmccBill _bill({
  required String no,
  required String from,
  required String to,
  required String status,
  String? paidOn,
  double qty = 1353,
  double milk = 56826,
  double salary = 2000,
}) =>
    MpVmccBill(
      id: no, billNo: no, cycleNo: 'CYC/2026-27/00005',
      periodStart: from, periodEnd: to, status: status,
      qtyLitres: qty, milkCost: milk, commission: 0, salary: salary, rent: 0,
      totalAmount: milk + salary, paymentDate: paidOn,
    );

Widget _host(List<MpVmccBill> bills, Brightness b) => ProviderScope(
      overrides: [
        nodeVmccBillsProvider.overrideWith((ref, nodeId) async => bills),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: b == Brightness.light ? DhenuTheme.light() : DhenuTheme.dark(),
        home: Scaffold(body: VmccBillsView(node: _node)),
      ),
    );

void main() {
  for (final b in [Brightness.light, Brightness.dark]) {
    testWidgets('a bulk centre reads its settlement bills — $b', (tester) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_host([
        _bill(no: 'BILL/2026-27/00028', from: '2026-07-16', to: '2026-07-31',
            status: 'paid', paidOn: '2026-08-04'),
        _bill(no: 'BILL/2026-27/00014', from: '2026-07-01', to: '2026-07-15',
            status: 'generated', qty: 1399, milk: 58758),
      ], b));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      // The amount for each cycle, and the split behind it.
      expect(find.text('₹ 58,826'), findsNWidgets(2)); // paid bill + "paid to date"
      expect(find.text('₹ 60,758'), findsNWidgets(2)); // unpaid bill + "awaiting"
      expect(find.text('Milk ₹ 56,826'), findsOneWidget);
      expect(find.text('Milk ₹ 58,758'), findsOneWidget);
      expect(find.text('Operator ₹ 2,000'), findsNWidgets(2));
      expect(find.text('Total'), findsNWidgets(2));
      // State reads off the pill; the line under it carries when and how.
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('Due'), findsOneWidget);
      expect(find.text('4 Aug'), findsOneWidget);
      expect(find.text('Statement'), findsNWidgets(2));
    });
  }

  testWidgets('a bill with no operator pay drops the split', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host([
      _bill(no: 'BILL/2026-27/00026', from: '2026-07-16', to: '2026-07-31',
          status: 'paid', paidOn: '2026-08-09', milk: 9628.9, salary: 0),
    ], Brightness.light));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    // Total is the milk cost, so a breakdown of one segment says nothing.
    expect(find.text('₹ 9,629'), findsNWidgets(2)); // card + "paid to date"
    expect(find.textContaining('Operator'), findsNothing);
  });

  testWidgets('the card holds together on a narrow phone', (tester) async {
    // 320dp — the narrowest handset an operator is likely to be issued.
    tester.view.physicalSize = const Size(320 * 3, 720 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host([
      _bill(no: 'BILL/2026-27/00028', from: '2026-07-16', to: '2026-07-31',
          status: 'paid', paidOn: '2026-08-04'),
    ], Brightness.light));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('a centre with no bills yet says so', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(const [], Brightness.light));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('No bills yet'), findsOneWidget);
    expect(find.text('Statement'), findsNothing);
  });
}
