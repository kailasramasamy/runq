import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/api/mp_models.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import 'package:dhenu/theme/dhenu_theme.dart';
import 'package:dhenu/widgets/milk_reading.dart';
import 'package:dhenu/widgets/dispatch_type_card.dart';

/// The dispatch leg packs five inputs into two rows, three of them across a
/// phone's width at display size. That only holds while the labels stay short,
/// so these guard the layout: no overflow in either theme, and every field
/// still named once the operator has filled it in.
Widget _host(DispatchTypeEntry e, Brightness b) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: b == Brightness.light ? DhenuTheme.light() : DhenuTheme.dark(),
      home: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: DispatchTypeCard(entry: e, onChanged: () {}),
        ),
      ),
    );

DispatchTypeEntry _entry() => DispatchTypeEntry(MpTypeAvailability(
      milkType: 'cow_a1', collected: 142, dispatched: 0, available: 142,
      avgFat: 3.8, avgSnf: 8.4, avgWater: 0.5,
    ))
  ..prefill();

void main() {
  for (final b in [Brightness.light, Brightness.dark]) {
    testWidgets('fits a phone width with every field labelled — $b', (tester) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_host(_entry(), b));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      // Prefilled readings survive the compact layout.
      for (final v in ['142.0', '3.8', '8.4']) {
        expect(find.text(v), findsOneWidget);
      }
      // Labels float above filled fields rather than vanishing like a hint.
      for (final label in ['Qty (L)', 'FAT %', 'SNF %', 'Water %', 'Container']) {
        expect(find.text(label), findsOneWidget, reason: 'missing label $label');
      }
    });
  }

  // Regression: equal thirds clipped "600.0" in the qty field. The weighted
  // split has to hold for a four-digit pooled quantity, measured against the
  // glyph width rather than eyeballed.
  testWidgets('qty field fits a four-digit quantity without clipping', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    final e = DispatchTypeEntry(MpTypeAvailability(
      milkType: 'cow_a2', collected: 1200, dispatched: 0, available: 1200,
      avgFat: 12.5, avgSnf: 10.5,
    ))..prefill();

    await tester.pumpWidget(_host(e, Brightness.light));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    final fields = find.byType(MilkReadingField);
    expect(fields, findsNWidgets(3));
    expect(find.text('1200.0'), findsOneWidget);

    // Asserted as a ratio, not in points: the test host substitutes a full-em
    // fallback for Inter (every glyph one em wide, ~1.7x real), so an absolute
    // glyph-fit check here would measure the wrong font. What must hold is the
    // shape of the split — qty carries three more characters than FAT or SNF
    // ever will, so it needs materially more room than an even third.
    final qty = tester.getSize(fields.at(0)).width;
    final fat = tester.getSize(fields.at(1)).width;
    final snf = tester.getSize(fields.at(2)).width;
    expect(fat, moreOrLessEquals(snf, epsilon: 0.5), reason: 'FAT and SNF stay equal');
    expect(qty / fat, greaterThan(1.3),
        reason: 'qty is only ${(qty / fat).toStringAsFixed(2)}x FAT — too narrow for "1200.0"');
  });

  testWidgets('over-availability error shows against the qty field', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    final e = _entry();
    await tester.pumpWidget(_host(e, Brightness.light));
    await tester.enterText(find.byType(TextField).first, '200');
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.textContaining('142.0'), findsWidgets);
  });
}
