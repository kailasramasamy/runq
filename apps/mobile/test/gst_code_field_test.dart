import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/gst/gst_form_kit.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// GSTN issues two different codes through this one field. The login OTP is
/// six digits; a filing EVC is alphanumeric (`EA1094`). The field shipped
/// digits-only for both, so an EVC could neither be typed on the numeric
/// keypad nor survive iOS SMS autofill.
void main() {
  Widget host({required bool alphanumeric, required TextEditingController c}) =>
      MaterialApp(
        theme: RunqTheme.light(),
        home: Scaffold(
          body: GstCodeField(
            controller: c,
            hint: 'code',
            alphanumeric: alphanumeric,
            onSubmit: () {},
          ),
        ),
      );

  testWidgets('EVC mode keeps letters, uppercases them, and offers a text '
      'keyboard', (tester) async {
    final c = TextEditingController();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(alphanumeric: true, c: c));

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.keyboardType, TextInputType.text);
    expect(field.autofillHints, contains(AutofillHints.oneTimeCode));

    await tester.enterText(find.byType(TextField), 'ea1094');
    expect(c.text, 'EA1094');
  });

  testWidgets('EVC mode still rejects punctuation and spaces', (tester) async {
    final c = TextEditingController();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(alphanumeric: true, c: c));

    await tester.enterText(find.byType(TextField), 'EA-10 94!');
    expect(c.text, 'EA1094');
  });

  testWidgets('OTP mode stays numeric and strips letters', (tester) async {
    final c = TextEditingController();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(alphanumeric: false, c: c));

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.keyboardType, TextInputType.number);

    await tester.enterText(find.byType(TextField), 'ea1094');
    expect(c.text, '1094', reason: 'the login OTP is digits only');
  });
}
