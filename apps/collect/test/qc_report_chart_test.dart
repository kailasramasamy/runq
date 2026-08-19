import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/api/mp_models.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import 'package:dhenu/screens/shared/qc_report_view.dart';
import 'package:dhenu/theme/dhenu_theme.dart';
import 'package:dhenu/utils/format.dart';

final _bands = QualityBands.fromJson({
  'cow_a2': {
    'fat': {'goodMin': 4.0, 'watchMin': 3.5},
    'snf': {'goodMin': 8.3, 'watchMin': 8.0},
  },
});

Widget _host(List<QcSample> samples, int days, Brightness b) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: b == Brightness.light ? DhenuTheme.light() : DhenuTheme.dark(),
      home: Scaffold(
        body: QcReportView(
          samples: samples,
          days: days,
          heroLabel: 'QC',
          heroFooter: 'weighted',
          bands: _bands,
          milkType: MilkType.cowA2,
        ),
      ),
    );

/// Indus-CC-shaped readings: narrow-range FAT/SNF straddling the good band.
List<QcSample> _series(int days, {Set<int> skip = const {}}) => [
      for (var i = days - 1; i >= 0; i--)
        if (!skip.contains(i))
          (
            date: isoDaysAgo(i),
            qty: 40.0 + i,
            fat: 3.7 + (i % 5) * 0.15,
            snf: 8.0 + (i % 3) * 0.12,
            water: (i % 4).toDouble(),
          ),
    ];

void main() {
  for (final b in [Brightness.light, Brightness.dark]) {
    testWidgets('QC trend renders over banded metrics — $b', (tester) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_host(_series(7), 7, b));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      // The strip is a horizontal scroller — only the cards in view are built.
      expect(find.text('FAT  (%)'), findsOneWidget);
      expect(find.text('SNF  (%)'), findsOneWidget);
    });
  }

  testWidgets('a window with missing days still paints', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    // Days 3 and 4 skipped, and day 0 isolated between two gaps.
    await tester.pumpWidget(_host(_series(7, skip: {1, 3, 4}), 7, Brightness.light));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('90-day window paints without labels', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(_series(90), 90, Brightness.light));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('a metric with no readings falls back to the empty note', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    // FAT, because it is the card that starts on screen.
    final noFat = [
      for (final s in _series(7))
        (date: s.date, qty: s.qty, fat: null, snf: s.snf, water: s.water),
    ];
    await tester.pumpWidget(_host(noFat, 7, Brightness.light));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('No readings in this window'), findsOneWidget);
  });
}
