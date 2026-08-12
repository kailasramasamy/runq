import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_form.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_setup_widgets.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// Every HR editor sheet is mostly text inputs, so the keyboard covers half
/// the form and dragging to reach the rest has to put it away. That is a
/// standing rule for scrollables in this app, and it lives in one place —
/// [HrEditorSheet] — so one assertion protects every sheet built on it.
void main() {
  Future<void> pumpSheet(WidgetTester tester, {bool dark = false}) async {
    await tester.pumpWidget(MaterialApp(
      theme: dark ? RunqTheme.dark() : RunqTheme.light(),
      home: Scaffold(
        body: HrEditorSheet(
          title: 'New contract',
          saveLabel: 'Create',
          saving: false,
          canSave: true,
          onSave: () {},
          children: [
            HrFormSection(children: [
              for (var i = 0; i < 12; i++)
                HrTextField(
                  label: 'Field $i',
                  controller: TextEditingController(),
                ),
            ]),
          ],
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('the sheet body dismisses the keyboard on drag', (tester) async {
    await pumpSheet(tester);
    final scroller = tester.widget<SingleChildScrollView>(
      find.byType(SingleChildScrollView),
    );
    expect(
      scroller.keyboardDismissBehavior,
      ScrollViewKeyboardDismissBehavior.onDrag,
      reason: 'HrEditorSheet backs every HR sheet — a form you cannot scroll '
          'out from under the keyboard is unusable on a small phone',
    );
  });

  testWidgets('a long form actually scrolls', (tester) async {
    await pumpSheet(tester);
    // Sanity: the behaviour above only matters if the body is scrollable at
    // all, so confirm the sheet is not simply sizing to its content.
    final position = tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position;
    expect(position.maxScrollExtent, greaterThan(0));
    expect(tester.takeException(), isNull);
  });

  testWidgets('renders in dark mode without overflow', (tester) async {
    await pumpSheet(tester, dark: true);
    expect(tester.takeException(), isNull);
  });
}
