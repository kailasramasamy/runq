import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_form.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// Editing one field used to mean tapping Continue through every step to
/// reach it. The header strip now names each step and jumps straight to it —
/// but only where that's safe: a create flow must still gate steps the user
/// hasn't validated their way into.
void main() {
  const titles = ['Basic', 'Job', 'Personal', 'Statutory', 'Pay + Bank'];

  Future<void> pumpWizard(
    WidgetTester tester, {
    required bool allowStepJump,
    int initialStep = 0,
    bool Function()? canAdvance,
  }) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: HrWizard(
        title: 'Edit employee',
        allowStepJump: allowStepJump,
        initialStep: initialStep,
        submitLabel: 'Save changes',
        onSubmit: () async {},
        steps: [
          for (final name in titles)
            HrWizardStep(
              title: name,
              canAdvance: canAdvance ?? () => true,
              // Body text is distinct per step so we can assert which one
              // is actually on screen, not merely which chip looks active.
              build: (_) => Text('body:$name'),
            ),
        ],
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('names every step in the header strip', (tester) async {
    await pumpWizard(tester, allowStepJump: true);
    for (final name in titles) {
      // Each name appears in the strip; the current step also shows it as
      // the page heading, so 'Basic' lands twice on step one.
      expect(find.text(name), findsWidgets);
    }
    expect(find.text('body:Basic'), findsOneWidget);
  });

  testWidgets('edit mode jumps straight to a later step', (tester) async {
    await pumpWizard(tester, allowStepJump: true);
    expect(find.text('body:Basic'), findsOneWidget);

    await tester.tap(find.text('Statutory').last);
    await tester.pumpAndSettle();

    expect(find.text('body:Statutory'), findsOneWidget);
    expect(find.text('body:Basic'), findsNothing);
    // Landing on a middle step keeps Continue, not the submit label.
    expect(find.text('Continue'), findsOneWidget);
  });

  testWidgets('jumping to the last step offers the submit action',
      (tester) async {
    await pumpWizard(tester, allowStepJump: true);
    await tester.tap(find.text('Pay + Bank').last);
    await tester.pumpAndSettle();
    expect(find.text('body:Pay + Bank'), findsOneWidget);
    expect(find.text('Save changes'), findsOneWidget);
  });

  testWidgets('create mode will not jump to an unvisited step',
      (tester) async {
    await pumpWizard(tester, allowStepJump: false);
    await tester.tap(find.text('Statutory').last);
    await tester.pumpAndSettle();
    expect(find.text('body:Basic'), findsOneWidget,
        reason: 'forward jumps stay gated behind Continue while creating');
  });

  testWidgets('create mode jumps back to steps already visited',
      (tester) async {
    await pumpWizard(tester, allowStepJump: false);
    // Walk forward two steps the long way.
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('body:Personal'), findsOneWidget);

    await tester.tap(find.text('Basic').last);
    await tester.pumpAndSettle();
    expect(find.text('body:Basic'), findsOneWidget);

    // Having reached Personal once, it stays reachable after stepping back.
    await tester.tap(find.text('Personal').last);
    await tester.pumpAndSettle();
    expect(find.text('body:Personal'), findsOneWidget);
  });

  testWidgets('opening at a later step keeps the earlier ones reachable',
      (tester) async {
    await pumpWizard(tester, allowStepJump: false, initialStep: 3);
    expect(find.text('body:Statutory'), findsOneWidget);
    await tester.tap(find.text('Job').last);
    await tester.pumpAndSettle();
    expect(find.text('body:Job'), findsOneWidget);
  });

  testWidgets('renders in dark mode without overflow', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.dark(),
      home: HrWizard(
        title: 'Edit employee',
        allowStepJump: true,
        onSubmit: () async {},
        steps: [
          for (final name in titles)
            HrWizardStep(
              title: name,
              canAdvance: () => true,
              build: (_) => Text('body:$name'),
            ),
        ],
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
