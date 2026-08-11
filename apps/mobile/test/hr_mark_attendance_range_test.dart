import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/hr_models.dart';
import 'package:runq_mobile/providers/hr_providers.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_mark_attendance_sheet.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// Marking a day defaults to that one day, with the end date adjustable.
/// The half-day case is special: the server refuses a `halfDay` leave that
/// spans dates, so the range control has to lock rather than let the user
/// build a request that will be rejected on submit.
void main() {
  final tapped = DateTime(2026, 8, 17); // a Monday

  Future<void> openSheet(
    WidgetTester tester, {
    List<HrLeaveType> leaveTypes = const [],
    bool isSelf = false,
  }) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        hrLeaveTypesForEmployeeProvider('emp-1')
            .overrideWith((ref) async => leaveTypes),
        hrMeProvider.overrideWith((ref) => throw UnimplementedError()),
      ],
      child: MaterialApp(
        theme: RunqTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => showHrMarkAttendanceSheet(
                ctx,
                employeeId: 'emp-1',
                employeeName: 'Asha R',
                date: tapped,
                isSelf: isSelf,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('defaults to a single day with From and To on the tapped date',
      (tester) async {
    await openSheet(tester);
    expect(find.text('From'), findsOneWidget);
    expect(find.text('To'), findsOneWidget);
    // Both boxes show the tapped day.
    expect(find.text('Mon, 17 Aug'), findsNWidgets(2));
    expect(find.text('1 day will be marked.'), findsOneWidget);
    // Nothing to reset while the range is still one day.
    expect(find.text('Reset'), findsNothing);
  });

  testWidgets('the range control is offered for plain statuses too',
      (tester) async {
    await openSheet(tester);
    // 'present' is the default status — the Dates section must still be
    // there, since ranges are not a leave-only affordance.
    expect(find.text('Dates'), findsOneWidget);
    await tester.tap(find.text('Week off'));
    await tester.pumpAndSettle();
    expect(find.text('Dates'), findsOneWidget);
    expect(find.text('1 day will be marked.'), findsOneWidget);
  });

  testWidgets('half day locks the range to a single date', (tester) async {
    await openSheet(tester);
    await tester.tap(find.text('Half day'));
    await tester.pumpAndSettle();
    expect(find.text('A half day is always a single date.'), findsOneWidget);
    expect(find.text('1 day will be marked.'), findsNothing);
  });

  testWidgets('button names the action without a count on a single day',
      (tester) async {
    await openSheet(tester);
    expect(find.text('Mark'), findsOneWidget);
  });

  testWidgets('renders in dark mode without overflow', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        hrLeaveTypesForEmployeeProvider('emp-1').overrideWith((ref) async => []),
      ],
      child: MaterialApp(
        theme: RunqTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => showHrMarkAttendanceSheet(
                ctx,
                employeeId: 'emp-1',
                employeeName: 'Asha R',
                date: tapped,
                isSelf: false,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
