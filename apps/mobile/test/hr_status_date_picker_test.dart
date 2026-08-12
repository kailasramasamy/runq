import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/hr_models.dart';
import 'package:runq_mobile/providers/hr_providers.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_status_date_picker.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// The point of this picker over Material's is that a day carries its status
/// while you're choosing it. If the legend goes missing or a day outside the
/// allowed window stays tappable, it has stopped earning its place.
void main() {
  const employeeId = 'emp-1';

  HrAttendanceRow row(int day, String status) => HrAttendanceRow(
        id: 'att-$day',
        employeeId: employeeId,
        employeeCode: 'E001',
        employeeName: 'Asha R',
        status: status,
        date: DateTime(2026, 8, day),
      );

  String key(int day) => '2026-08-${day.toString().padLeft(2, '0')}';

  HrAttendanceMonth month({List<int> weeklyOffDays = const []}) =>
      HrAttendanceMonth(
        query: HrMonthQuery(employeeId: employeeId, year: 2026, month: 8),
        rows: {
          key(3): row(3, 'present'),
          key(4): row(4, 'absent'),
          key(5): row(5, 'leave'),
        },
        holidays: const {},
        weeklyOffDays: weeklyOffDays,
        leaves: const [],
      );

  /// Opens the picker and returns a getter for whatever it popped.
  Future<DateTime? Function()> openPicker(
    WidgetTester tester, {
    required DateTime firstDate,
    required DateTime lastDate,
    DateTime? initialDate,
    HrAttendanceMonth? data,
    bool dark = false,
  }) async {
    DateTime? picked;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        hrAttendanceMonthProvider(
          HrMonthQuery(employeeId: employeeId, year: 2026, month: 8),
        ).overrideWith((ref) async => data ?? month()),
      ],
      child: MaterialApp(
        theme: dark ? RunqTheme.dark() : RunqTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () async {
                picked = await showHrStatusDatePicker(
                  ctx,
                  employeeId: employeeId,
                  initialDate: initialDate ?? DateTime(2026, 8, 10),
                  firstDate: firstDate,
                  lastDate: lastDate,
                  title: 'Mark through',
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    return () => picked;
  }

  testWidgets('shows the month grid and a legend of the statuses present',
      (tester) async {
    await openPicker(
      tester,
      firstDate: DateTime(2026, 8, 1),
      lastDate: DateTime(2026, 8, 31),
    );
    expect(find.text('Mark through'), findsOneWidget);
    expect(find.text('August 2026'), findsOneWidget);
    // The three statuses seeded above, plus the 'unmarked' gap days.
    expect(find.text('Present'), findsOneWidget);
    expect(find.text('Absent'), findsOneWidget);
    expect(find.text('Leave'), findsOneWidget);
    expect(find.text('Not marked'), findsOneWidget);
  });

  testWidgets('tapping an in-range day returns it and closes', (tester) async {
    final picked = await openPicker(
      tester,
      firstDate: DateTime(2026, 8, 1),
      lastDate: DateTime(2026, 8, 31),
    );
    await tester.tap(find.text('12'));
    await tester.pumpAndSettle();
    expect(picked(), DateTime(2026, 8, 12));
    expect(find.text('Mark through'), findsNothing);
  });

  testWidgets('a day before firstDate is inert and the sheet stays open',
      (tester) async {
    final picked = await openPicker(
      tester,
      firstDate: DateTime(2026, 8, 17),
      lastDate: DateTime(2026, 8, 31),
    );
    await tester.tap(find.text('3'));
    await tester.pumpAndSettle();
    expect(picked(), isNull);
    expect(find.text('Mark through'), findsOneWidget);
  });

  testWidgets('a day after lastDate is inert', (tester) async {
    final picked = await openPicker(
      tester,
      firstDate: DateTime(2026, 8, 1),
      lastDate: DateTime(2026, 8, 10),
    );
    await tester.tap(find.text('25'));
    await tester.pumpAndSettle();
    expect(picked(), isNull);
  });

  /// Paging past the bound would land the user in a month with nothing
  /// selectable, so both arrows disable at the edge.
  testWidgets('month paging stops at the bounding months', (tester) async {
    await openPicker(
      tester,
      firstDate: DateTime(2026, 8, 1),
      lastDate: DateTime(2026, 8, 31),
    );
    final arrows = tester.widgetList<IconButton>(find.byType(IconButton));
    expect(arrows.every((b) => b.onPressed == null), isTrue,
        reason: 'both bounds sit inside August, so neither arrow is live');
  });

  testWidgets('renders in dark mode without overflow', (tester) async {
    await openPicker(
      tester,
      firstDate: DateTime(2026, 8, 1),
      lastDate: DateTime(2026, 8, 31),
      data: month(weeklyOffDays: const [0, 6]),
      dark: true,
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Week off'), findsOneWidget);
  });
}
