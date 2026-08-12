// Behaviour guards for the app-wide toast (lib/widgets/runq_snack.dart).
//
// These lock in the parts of the toast contract that are easy to regress by
// editing the widget tree: severity drives how long the toast stays, an
// actionable error waits for the user instead of timing out, and identical
// toasts fired back to back collapse into one.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/theme/runq_theme.dart';
import 'package:runq_mobile/widgets/runq_snack.dart';

Widget _host(void Function(BuildContext) show) => MaterialApp(
      theme: RunqTheme.light(),
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () => show(context),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    );

Future<void> _tapShow(WidgetTester tester) async {
  await tester.tap(find.text('go'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('success toast clears within its 4s window', (tester) async {
    await tester.pumpWidget(_host((c) => RunqSnack.success(c, 'Saved')));
    await _tapShow(tester);
    expect(find.text('Saved'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsNothing);
  });

  testWidgets('error toast outlives the success window', (tester) async {
    await tester.pumpWidget(_host((c) => RunqSnack.error(c, 'Post failed')));
    await _tapShow(tester);

    await tester.pump(const Duration(seconds: 5));
    expect(find.text('Post failed'), findsOneWidget,
        reason: 'errors get 8s, not the 4s success timeout');

    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Post failed'), findsNothing);
  });

  testWidgets('actionable error waits for the user and offers a dismiss',
      (tester) async {
    var retried = false;
    await tester.pumpWidget(_host((c) => RunqSnack.error(
          c,
          'Upload failed',
          actionLabel: 'Retry',
          onAction: () => retried = true,
        )));
    await _tapShow(tester);

    await tester.pump(const Duration(seconds: 30));
    expect(find.text('Upload failed'), findsOneWidget,
        reason: 'an error with a recovery action must not auto-dismiss');
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(retried, isTrue);
    expect(find.text('Upload failed'), findsNothing);
  });

  testWidgets('description renders under the title', (tester) async {
    await tester.pumpWidget(_host((c) => RunqSnack.warning(
          c,
          'Enter a batch number',
          description: 'This item is batch-tracked.',
        )));
    await _tapShow(tester);
    expect(find.text('Enter a batch number'), findsOneWidget);
    expect(find.text('This item is batch-tracked.'), findsOneWidget);
  });

  testWidgets('an identical toast fired twice shows once', (tester) async {
    await tester.pumpWidget(_host((c) {
      RunqSnack.error(c, 'Row failed');
      RunqSnack.error(c, 'Row failed');
    }));
    await _tapShow(tester);
    expect(find.text('Row failed'), findsOneWidget);
  });
}
