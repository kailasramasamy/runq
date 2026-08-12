import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/models.dart';
import 'package:runq_mobile/providers/data_providers.dart';
import 'package:runq_mobile/screens/gst_return_detail_screen.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// GSTR-1 review screens show statutory figures, so amounts render in full
/// Indian grouping with paise — never the "₹16.11L" / "₹1.6k" shorthand.
void main() {
  final now = DateTime(2026, 8, 1);

  final ret = GstReturn(
    id: 'r1',
    gstin: '29AAMCT1355L1ZS',
    returnType: 'gstr1',
    period: '072026',
    status: 'draft',
    arn: null,
    filedAt: null,
    errors: const [],
    createdAt: now,
    updatedAt: now,
  );

  // One B2B invoice carrying the real July B2B totals, so the section row and
  // the sheet both have a large value to format.
  final data = <String, dynamic>{
    'b2b': [
      {
        'invoiceNumber': '260722',
        'invoiceValue': 1620026.64,
        'items': [
          {
            'taxableValue': 1610864.44,
            'igstAmount': 0.0,
            'cgstAmount': 4581.10,
            'sgstAmount': 4581.10,
            'cessAmount': 0.0,
            'gstRate': 5,
          },
        ],
      },
    ],
    'nil': [
      {
        'supplyType': 'INTRA',
        'nilRatedAmount': 0.0,
        'exemptAmount': 784739.83,
        'nonGstAmount': 0.0,
      },
    ],
  };

  Widget host() => ProviderScope(
        overrides: [
          gstReturnDetailProvider.overrideWith(
            (ref, id) async => GstReturnDetail(ret: ret, data: data),
          ),
        ],
        child: MaterialApp(
          theme: RunqTheme.light(),
          home: const GstReturnDetailScreen(id: 'r1'),
        ),
      );

  Future<void> pumpNarrow(WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();
  }

  testWidgets('section row shows the full amount, not compact shorthand',
      (tester) async {
    await pumpNarrow(tester);

    expect(find.text('₹16,10,864.44'), findsWidgets);

    // No rendered amount may use the k / L / Cr shorthand. The B2C (large)
    // subtitle names the statutory ₹2.5L threshold in prose — that's a
    // description, not a figure, so it stays.
    const prose = {'Inter-state > ₹2.5L'};
    final compact = RegExp(r'₹[\d.,]+\s*(k|L|Cr)\b');
    final shortened = tester
        .widgetList<Text>(find.byType(Text))
        .map((w) => w.data ?? '')
        .where((s) => compact.hasMatch(s) && !prose.contains(s))
        .toList();
    expect(shortened, isEmpty, reason: 'found compact amounts: $shortened');
    expect(tester.takeException(), isNull);
  });

  testWidgets('entries sheet has a close button and full amounts',
      (tester) async {
    await pumpNarrow(tester);

    await tester.tap(find.text('B2B'));
    await tester.pumpAndSettle();

    expect(find.text('260722'), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    expect(find.text('₹16,10,864.44'), findsWidgets);
    // Both the section row underneath and the sheet entry render this.
    expect(find.text('+₹9,162.20 tax'), findsNWidgets(2));
    expect(tester.takeException(), isNull);

    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.close_rounded), findsNothing);
  });

  testWidgets('sheet explains the section and how to read a row',
      (tester) async {
    await pumpNarrow(tester);

    await tester.tap(find.text('B2B'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Table 4A · 1 entry'), findsOneWidget);
    expect(find.textContaining('claim input tax credit against'), findsOneWidget);
    expect(
        find.textContaining('Invoice number on the left'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('nil-rated sheet drops the tax half of the legend',
      (tester) async {
    // Nil-rated is the sixth section row: on a phone-height viewport it sits
    // under the pinned action bar, so taps land on the chrome instead. Use a
    // tall viewport — this test is about sheet content, not layout.
    tester.view.physicalSize = const Size(360, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Nil-rated'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Table 8 · 1 entry'), findsOneWidget);
    expect(find.textContaining('no tax column by definition'), findsOneWidget);
    expect(find.textContaining('exempt value on the right'), findsOneWidget);
    expect(find.textContaining('with GST beneath it'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sheet clears the status bar', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    tester.view.padding = const FakeViewPadding(top: 47);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(host());
    await tester.pumpAndSettle();
    await tester.tap(find.text('B2B'));
    await tester.pumpAndSettle();

    expect(tester.getTopLeft(find.text('B2B').last).dy,
        greaterThanOrEqualTo(47.0));
    expect(tester.takeException(), isNull);
  });
}
