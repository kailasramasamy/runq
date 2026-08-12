import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/models.dart';
import 'package:runq_mobile/providers/data_providers.dart';
import 'package:runq_mobile/screens/gst_return_detail_screen.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// The return detail screen's chrome sits on the Scaffold rather than inside
/// the scroll view, so the back button survives scrolling *and* the loading /
/// error states. Previously it was a sliver in the data branch only: a return
/// that failed to load left the user with no way back.
void main() {
  final now = DateTime(2026, 8, 1);

  GstReturn ret({String status = 'draft'}) => GstReturn(
        id: 'r1',
        gstin: '29AAMCT1355L1ZS',
        returnType: 'gstr1',
        period: '072026',
        status: status,
        arn: null,
        filedAt: null,
        errors: const [],
        createdAt: now,
        updatedAt: now,
      );

  Widget host(Override override) => ProviderScope(
        overrides: [override],
        child: MaterialApp(
          theme: RunqTheme.light(),
          home: const GstReturnDetailScreen(id: 'r1'),
        ),
      );

  testWidgets('back button and title render while loading', (tester) async {
    await tester.pumpWidget(host(
      gstReturnDetailProvider.overrideWith((ref, id) => Completer<GstReturnDetail>().future),
    ));
    await tester.pump();

    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    expect(find.text('Return'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('back button survives a load failure', (tester) async {
    await tester.pumpWidget(host(
      gstReturnDetailProvider.overrideWith((ref, id) async => throw Exception('boom')),
    ));
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loaded state shows type, period, status chip and menu',
      (tester) async {
    await tester.pumpWidget(host(
      gstReturnDetailProvider.overrideWith(
        (ref, id) async => GstReturnDetail(ret: ret(), data: const {}),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    expect(find.text('GSTR-1'), findsWidgets);
    expect(find.text('Draft'), findsOneWidget);
    expect(find.byIcon(Icons.more_horiz_rounded), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('chrome stays put when the body scrolls', (tester) async {
    await tester.pumpWidget(host(
      gstReturnDetailProvider.overrideWith(
        (ref, id) async => GstReturnDetail(ret: ret(), data: const {}),
      ),
    ));
    await tester.pumpAndSettle();

    final before = tester.getTopLeft(find.byIcon(Icons.arrow_back_rounded));
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
    await tester.pumpAndSettle();

    // Guard against a vacuous pass: if the body didn't actually move, the
    // assertion below proves nothing about the bar being pinned.
    final position = tester
        .state<ScrollableState>(find.descendant(
          of: find.byType(CustomScrollView),
          matching: find.byType(Scrollable),
        ))
        .position;
    expect(position.pixels, greaterThan(0));

    expect(tester.getTopLeft(find.byIcon(Icons.arrow_back_rounded)), before);
    expect(tester.takeException(), isNull);
  });
}
