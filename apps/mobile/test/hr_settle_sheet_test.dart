import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/hr_contract_models.dart';
import 'package:runq_mobile/providers/hr_providers.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_settle_sheet.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// The settle sheet is the last thing read before a wage posts and advances
/// clear, so what it shows must match what the server will do. The crew
/// cases matter most: a mason and a helper are handed different amounts,
/// and an advance one of them took must not reduce the other's pay.
void main() {
  const contractId = 'c-1';

  HrContract contract({
    String type = 'crew_daily',
    List<Map<String, dynamic>> members = const [],
  }) =>
      HrContract.fromJson({
        'id': contractId,
        'contractNumber': 'CTR-00001',
        'name': 'Build a room',
        'leadPersonName': 'Ramesh',
        'contractType': type,
        'startDate': '2026-08-01',
        'status': 'active',
        'members': members,
      });

  Map<String, dynamic> line(
    String name, {
    String? role,
    double? rate,
    double days = 0,
    double earned = 0,
    double advance = 0,
  }) =>
      {
        'memberId': name.toLowerCase(),
        'memberName': name,
        'memberRole': role,
        'dailyRate': rate,
        'daysWorked': days,
        'earned': earned,
        'advancesRecovered': advance,
        'netPayable': earned - advance,
      };

  Map<String, dynamic> preview({
    String type = 'crew_daily',
    double earned = 20000,
    double advances = 0,
    double? net,
    bool openEnded = false,
    List<Map<String, dynamic>> lines = const [],
    List<String> warnings = const [],
  }) =>
      {
        'contractNumber': 'CTR-00001',
        'name': 'Build a room',
        'leadPersonName': 'Ramesh',
        'contractType': type,
        'fromDate': '2026-08-01',
        'throughDate': '2026-08-10',
        'isOpenEnded': openEnded,
        'earned': earned,
        'advancesRecovered': advances,
        'otherDeductions': 0,
        'netPayable': net ?? (earned - advances),
        'lines': lines,
        'warnings': warnings,
      };

  Future<void> openSheet(
    WidgetTester tester, {
    required Map<String, dynamic> previewJson,
    HrContract? c,
    bool dark = false,
  }) async {
    final subject = c ?? contract();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        // The sheet re-queries when the through-date changes, so the
        // override has to answer for any key, not one fixed query.
        hrSettlementPreviewProvider.overrideWith(
          (ref, q) async => HrSettlementPreview.fromJson(previewJson),
        ),
      ],
      child: MaterialApp(
        theme: dark ? RunqTheme.dark() : RunqTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => showHrSettleSheet(ctx, subject),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('breaks a crew down person by person', (tester) async {
    await openSheet(
      tester,
      previewJson: preview(
        earned: 24500,
        advances: 5000,
        lines: [
          line('Ramesh', role: 'mason', rate: 1200, days: 10, earned: 12000, advance: 5000),
          line('Suresh', role: 'assistant', rate: 800, days: 10, earned: 8000),
          line('Kumar', role: 'helper', rate: 500, days: 9, earned: 4500),
        ],
      ),
    );
    expect(find.text('Who gets what'), findsOneWidget);
    expect(find.text('Ramesh · mason'), findsOneWidget);
    expect(find.text('Suresh · assistant'), findsOneWidget);
    // Ramesh's advance shows on his line and nets only his pay.
    expect(find.textContaining('advance ₹5,000'), findsOneWidget);
    expect(find.text('₹7,000'), findsOneWidget);
    expect(find.text('₹8,000'), findsOneWidget);
  });

  testWidgets('shows days × rate for each member', (tester) async {
    await openSheet(
      tester,
      previewJson: preview(
        lines: [
          line('Ramesh', role: 'mason', rate: 1200, days: 10, earned: 12000),
          line('Suresh', role: 'assistant', rate: 800, days: 10, earned: 8000),
        ],
      ),
    );
    expect(find.text('10d × ₹1,200'), findsOneWidget);
    expect(find.text('10d × ₹800'), findsOneWidget);
  });

  testWidgets('offers the net on the button', (tester) async {
    await openSheet(tester, previewJson: preview(earned: 24500, advances: 5000));
    expect(find.text('Settle ₹19,500'), findsOneWidget);
  });

  /// The server refuses a zero-earning settlement, so the button must say
  /// so rather than posting and failing.
  testWidgets('blocks settling when nothing has been earned', (tester) async {
    await openSheet(
      tester,
      previewJson: preview(
        earned: 0,
        warnings: const ['Nothing has been earned yet — every day in the term is marked as leave.'],
      ),
    );
    expect(find.text('Cannot settle'), findsOneWidget);
    expect(find.textContaining('Nothing has been earned'), findsOneWidget);
    final btn = tester.widget<FilledButton>(find.byType(FilledButton).last);
    expect(btn.onPressed, isNull);
  });

  testWidgets('blocks settling when advances exceed earnings', (tester) async {
    await openSheet(
      tester,
      previewJson: preview(
        earned: 3000, advances: 8000, net: -5000,
        warnings: const ['Advances of ₹8,000 exceed earnings of ₹3,000.'],
      ),
    );
    expect(find.text('Cannot settle'), findsOneWidget);
    expect(find.textContaining('exceed earnings'), findsOneWidget);
  });

  /// Settling an open-ended contract closes it, so the closing date has to
  /// be visible and editable rather than silently defaulted.
  testWidgets('an open-ended contract shows the closing date', (tester) async {
    await openSheet(
      tester,
      previewJson: preview(
        openEnded: true,
        warnings: const ['This contract is open-ended. Settling closes it at 2026-08-10.'],
      ),
    );
    expect(find.text('Close the contract on'), findsOneWidget);
    expect(find.textContaining('open-ended'), findsOneWidget);
  });

  testWidgets('a dated contract just settles up to its end', (tester) async {
    await openSheet(tester, previewJson: preview());
    expect(find.text('Settle up to'), findsOneWidget);
  });

  testWidgets('a typed deduction updates the net immediately', (tester) async {
    await openSheet(tester, previewJson: preview(earned: 24500, advances: 5000));
    expect(find.text('Settle ₹19,500'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '500');
    await tester.pumpAndSettle();

    expect(find.text('Other deductions'), findsOneWidget);
    expect(find.text('Settle ₹19,000'), findsOneWidget);
  });

  testWidgets('a deduction that overshoots blocks the settle', (tester) async {
    await openSheet(tester, previewJson: preview(earned: 3000));
    await tester.enterText(find.byType(TextField).first, '5000');
    await tester.pumpAndSettle();
    expect(find.text('Cannot settle'), findsOneWidget);
    expect(find.textContaining('pushes this below zero'), findsOneWidget);
  });

  /// A task contract is one line against the lead, with no day arithmetic.
  testWidgets('a task lumpsum reads as an agreed amount', (tester) async {
    await openSheet(
      tester,
      c: contract(type: 'task_lumpsum'),
      previewJson: preview(
        type: 'task_lumpsum',
        earned: 15000,
        advances: 4000,
        lines: [
          {
            'memberId': null,
            'memberName': 'Papu',
            'memberRole': 'Crew lead',
            'dailyRate': null,
            'daysWorked': 0,
            'earned': 15000,
            'advancesRecovered': 4000,
            'netPayable': 11000,
          },
        ],
      ),
    );
    expect(find.text('Settle ₹11,000'), findsOneWidget);
    expect(find.text('Total earned'), findsOneWidget);
  });

  testWidgets('renders in dark mode without overflow', (tester) async {
    await openSheet(
      tester,
      dark: true,
      previewJson: preview(
        earned: 24500,
        advances: 5000,
        lines: [
          line('Ramesh', role: 'mason', rate: 1200, days: 10, earned: 12000, advance: 5000),
          line('Suresh', role: 'assistant', rate: 800, days: 10, earned: 8000),
        ],
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
