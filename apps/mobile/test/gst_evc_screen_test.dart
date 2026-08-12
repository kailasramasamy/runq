import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/gst/gst_evc_screen.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// Filing is the last, irreversible step. As a sheet the numeric keypad left it
/// a code box and a half-visible button; as a route it gets an app bar, room to
/// say what filing does, and an action bar the keyboard can't bury.
void main() {
  Widget host() => MaterialApp(
        theme: RunqTheme.light(),
        home: const GstEvcScreen(returnId: 'r1'),
      );

  testWidgets('has back button, title and states that filing is final',
      (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();

    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    expect(find.text('File return'), findsWidgets);
    expect(find.text('GST Portal'), findsOneWidget);
    expect(find.text('Final step'), findsOneWidget);
    expect(find.textContaining('period is locked after this'), findsOneWidget);
  });

  testWidgets('File return is disabled until 6 digits are entered',
      (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();

    FilledButton button() => tester.widget<FilledButton>(
        find.ancestor(of: find.text('File return'), matching: find.byType(FilledButton)));

    expect(button().onPressed, isNull);

    await tester.enterText(find.byType(TextField), '12345');
    await tester.pump();
    expect(button().onPressed, isNull, reason: '5 digits is short of an EVC');

    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    expect(button().onPressed, isNotNull);
  });

  testWidgets('accepts an alphanumeric EVC and uppercases it', (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.keyboardType, TextInputType.text,
        reason: 'a numeric keypad cannot type an EVC like EA1094');
    expect(field.autofillHints, contains(AutofillHints.oneTimeCode));

    await tester.enterText(find.byType(TextField), 'ea1094');
    await tester.pump();

    expect(find.text('EA1094'), findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'File return'))
            .onPressed,
        isNotNull);
  });

  testWidgets('returns the entered code to the caller', (tester) async {
    String? result;
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: Builder(
        builder: (context) => ElevatedButton(
          onPressed: () async {
            result = await openGstEvc(context, returnId: 'r1');
          },
          child: const Text('open'),
        ),
      ),
    ));

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '654321');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'File return'));
    await tester.pumpAndSettle();

    expect(result, '654321');
    expect(find.text('Final step'), findsNothing);
  });

  testWidgets('action bar clears the keypad inset', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    tester.view.viewInsets = const FakeViewPadding(bottom: 320);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(host());
    await tester.pumpAndSettle();

    final bottom =
        tester.getBottomLeft(find.widgetWithText(FilledButton, 'File return')).dy;
    expect(bottom, lessThanOrEqualTo(480.0));
  });
}
