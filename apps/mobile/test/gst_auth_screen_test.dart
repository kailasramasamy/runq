import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/gst/gst_auth_screen.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// GSTN auth is a two-field form. As a bottom sheet the keyboard left it no
/// room — fields collapsed and the actions were half off-screen. As a route it
/// gets an app bar, a staged layout and a bottom action bar that the Scaffold
/// lifts above the keyboard.
void main() {
  Widget host({String? username}) => MaterialApp(
        theme: RunqTheme.light(),
        home: GstAuthScreen(gstin: '29AALFV5152D1ZZ', username: username),
      );

  testWidgets('has a back button, title and the GSTIN it is authenticating',
      (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();

    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    expect(find.text('Authenticate'), findsOneWidget);
    expect(find.text('GST Portal'), findsOneWidget);
    expect(find.text('29AALFV5152D1ZZ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('OTP field is hidden until an OTP has been requested',
      (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();

    expect(find.text('GSTN username'), findsOneWidget);
    expect(find.text('One-time password'), findsNothing);
    expect(find.text('Send OTP'), findsOneWidget);
    expect(find.text('Verify & continue'), findsNothing);
  });

  testWidgets('Send OTP stays disabled until a username is typed',
      (tester) async {
    await tester.pumpWidget(host());
    await tester.pump();

    FilledButton button() => tester.widget<FilledButton>(
        find.ancestor(of: find.text('Send OTP'), matching: find.byType(FilledButton)));

    expect(button().onPressed, isNull);

    await tester.enterText(find.byType(TextField).first, 'vrindavan_gst');
    await tester.pump();

    expect(button().onPressed, isNotNull);
  });

  testWidgets('action bar clears the keyboard inset', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    tester.view.viewInsets = const FakeViewPadding(bottom: 320);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(host());
    await tester.pumpAndSettle();

    // 800 tall viewport, 320 of it keyboard — the button must sit above 480.
    final bottom = tester.getBottomLeft(find.text('Send OTP')).dy;
    expect(bottom, lessThanOrEqualTo(480.0));
    expect(tester.takeException(), isNull);
  });
}
