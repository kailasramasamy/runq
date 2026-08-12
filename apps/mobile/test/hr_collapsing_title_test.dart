import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_collapsing_title.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// The compact name/code exists only for the collapsed state — if it bleeds
/// into the expanded hero it double-prints the name, and if it never appears
/// a scrolled-down record is anonymous again.
void main() {
  FlexibleSpaceBarSettings settings(double current) =>
      FlexibleSpaceBarSettings(
        toolbarOpacity: 1,
        minExtent: 100,
        maxExtent: 300,
        currentExtent: current,
        child: const SizedBox.shrink(),
      );

  group('opacityFor', () {
    test('is 0 when fully expanded', () {
      expect(HrCollapsingTitle.opacityFor(settings(300)), 0);
    });

    test('is 1 when fully collapsed', () {
      expect(HrCollapsingTitle.opacityFor(settings(100)), 1);
    });

    test('is still 0 half way down, before the fade band', () {
      expect(HrCollapsingTitle.opacityFor(settings(200)), 0);
    });

    test('ramps between the fade band and the minimum', () {
      // 35% of the way up the collapsible range is the top of the band.
      final atBand = HrCollapsingTitle.opacityFor(settings(170));
      final inside = HrCollapsingTitle.opacityFor(settings(135));
      expect(atBand, closeTo(0, 0.001));
      expect(inside, closeTo(0.5, 0.02));
    });

    test('no settings means nothing to collapse against', () {
      expect(HrCollapsingTitle.opacityFor(null), 0);
    });

    test('a degenerate range does not divide by zero', () {
      final flat = FlexibleSpaceBarSettings(
        toolbarOpacity: 1,
        minExtent: 100,
        maxExtent: 100,
        currentExtent: 100,
        child: const SizedBox.shrink(),
      );
      expect(HrCollapsingTitle.opacityFor(flat), 0);
    });

    test('rises monotonically as the header shrinks', () {
      final samples = <double>[300, 250, 200, 170, 150, 130, 110, 100]
          .map((e) => HrCollapsingTitle.opacityFor(settings(e)))
          .toList();
      for (var i = 1; i < samples.length; i++) {
        expect(samples[i], greaterThanOrEqualTo(samples[i - 1]));
      }
      expect(samples.last, 1);
    });
  });

  Future<void> pump(WidgetTester tester, double currentExtent) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: Scaffold(
        body: FlexibleSpaceBarSettings(
          toolbarOpacity: 1,
          minExtent: 100,
          maxExtent: 300,
          currentExtent: currentExtent,
          child: const Row(
            children: [
              Expanded(
                child: HrCollapsingTitle(title: 'Asha Ramesh', subtitle: 'E001'),
              ),
            ],
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('renders nothing while the hero is expanded', (tester) async {
    await pump(tester, 300);
    expect(find.text('Asha Ramesh'), findsNothing);
    expect(find.text('E001'), findsNothing);
  });

  testWidgets('shows name and code once collapsed', (tester) async {
    await pump(tester, 100);
    expect(find.text('Asha Ramesh'), findsOneWidget);
    expect(find.text('E001'), findsOneWidget);
    final opacity = tester.widget<Opacity>(find.byType(Opacity));
    expect(opacity.opacity, 1);
  });

  testWidgets('a blank subtitle drops the second line', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: Scaffold(
        body: FlexibleSpaceBarSettings(
          toolbarOpacity: 1,
          minExtent: 100,
          maxExtent: 300,
          currentExtent: 100,
          child: const Row(
            children: [
              Expanded(
                child: HrCollapsingTitle(title: 'Asha Ramesh', subtitle: '  '),
              ),
            ],
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Asha Ramesh'), findsOneWidget);
    expect(find.byType(Text), findsOneWidget);
  });

  testWidgets('a long name ellipsizes instead of overflowing', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.light(),
      home: Scaffold(
        body: SizedBox(
          width: 140,
          child: FlexibleSpaceBarSettings(
            toolbarOpacity: 1,
            minExtent: 100,
            maxExtent: 300,
            currentExtent: 100,
            child: const Row(
              children: [
                Expanded(
                  child: HrCollapsingTitle(
                    title: 'Venkataramanaswamy Subrahmanyan Iyer',
                    subtitle: 'EMP-000042',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
