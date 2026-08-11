import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_month_calendar.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// The month grid derives its layout from the 1st's weekday, so an
/// off-by-one in the Monday-first offset silently shifts every status onto
/// the wrong day — the kind of bug nobody spots until payroll disagrees.
void main() {
  Future<void> pumpCalendar(
    WidgetTester tester,
    DateTime month, {
    String Function(DateTime)? statusFor,
    bool dark = false,
  }) async {
    await tester.pumpWidget(MaterialApp(
      theme: dark ? RunqTheme.dark() : RunqTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: HrMonthCalendar(
            month: month,
            statusFor: statusFor ?? (_) => 'present',
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('renders exactly one cell per day of the month',
      (tester) async {
    // Aug 2026 has 31 days and starts on a Saturday — five leading blanks.
    await pumpCalendar(tester, DateTime(2026, 8));
    for (final day in [1, 15, 31]) {
      expect(find.text('$day'), findsOneWidget);
    }
    expect(find.text('32'), findsNothing);
  });

  testWidgets('February in a leap year stops at 29', (tester) async {
    await pumpCalendar(tester, DateTime(2028, 2));
    expect(find.text('29'), findsOneWidget);
    expect(find.text('30'), findsNothing);
  });

  testWidgets('non-leap February stops at 28', (tester) async {
    await pumpCalendar(tester, DateTime(2026, 2));
    expect(find.text('28'), findsOneWidget);
    expect(find.text('29'), findsNothing);
  });

  testWidgets('tapping a day reports that exact date', (tester) async {
    DateTime? tapped;
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: HrMonthCalendar(
            month: DateTime(2026, 8),
            statusFor: (_) => 'present',
            onTapDay: (d) => tapped = d,
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('17'));
    expect(tapped, DateTime(2026, 8, 17));
  });

  testWidgets('summary counts render for every status present',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: const Scaffold(
        body: HrMonthSummary(
          counts: {'present': 18, 'half_day': 2, 'leave': 3, 'unmarked': 1},
          otHours: 4.5,
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('18'), findsOneWidget);
    expect(find.text('Half day'), findsOneWidget);
    expect(find.text('Not marked'), findsOneWidget);
    expect(find.text('4.5'), findsOneWidget);
  });

  testWidgets('renders in dark mode without overflow', (tester) async {
    await pumpCalendar(
      tester,
      DateTime(2026, 8),
      statusFor: (d) => d.day.isEven ? 'leave' : 'week_off',
      dark: true,
    );
    expect(tester.takeException(), isNull);
  });
}
