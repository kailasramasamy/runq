import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/models.dart';
import 'package:runq_mobile/providers/data_providers.dart';
import 'package:runq_mobile/screens/dashboard/gst_section.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// After GSTR-1 is filed the readiness strip retargets to GSTR-3B. It used to
/// drop any mention of GSTR-1, so a just-filed return looked like it hadn't
/// happened.
void main() {
  GstReadiness readiness({
    required ReadinessTarget target,
    required String gstr1,
    required String gstr3b,
  }) =>
      GstReadiness(
        period: '072026',
        periodLabel: 'Jul 2026',
        target: target,
        targetLabel: target == ReadinessTarget.gstr3b ? 'GSTR-3B' : 'GSTR-1',
        score: 100,
        signals: const [],
        gstr1Status: GstReturnStatus(exists: true, status: gstr1),
        gstr3bStatus: GstReturnStatus(exists: true, status: gstr3b),
        filedExternally: false,
        preparing: false,
      );

  Future<void> pump(WidgetTester tester, GstReadiness g) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [gstReadinessProvider.overrideWith((ref) async => g)],
      child: MaterialApp(
        theme: RunqTheme.light(),
        home: const Scaffold(body: GstSection()),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('names the filed GSTR-1 while GSTR-3B is outstanding',
      (tester) async {
    await pump(
        tester,
        readiness(
            target: ReadinessTarget.gstr3b, gstr1: 'filed', gstr3b: 'draft'));

    expect(find.text('GSTR-1 filed for Jul 2026'), findsOneWidget);
    expect(find.textContaining('GSTR-3B'), findsOneWidget);
  });

  testWidgets('says nothing about GSTR-1 while it is still the target',
      (tester) async {
    await pump(
        tester,
        readiness(
            target: ReadinessTarget.gstr1, gstr1: 'draft', gstr3b: 'draft'));

    expect(find.text('GSTR-1 filed for Jul 2026'), findsNothing);
  });

  testWidgets('drops the line once both returns are filed', (tester) async {
    await pump(
        tester,
        readiness(
            target: ReadinessTarget.gstr3b, gstr1: 'filed', gstr3b: 'filed'));

    // "Filed" pill already carries the message; the extra line would be noise.
    expect(find.text('GSTR-1 filed for Jul 2026'), findsNothing);
    expect(find.text('Filed'), findsOneWidget);
  });
}
