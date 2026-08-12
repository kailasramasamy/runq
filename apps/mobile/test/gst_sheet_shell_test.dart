import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/gst/gst_form_kit.dart';

/// GstSheetShell hosts both the tiny OTP/EVC sheets and the GSTR-1 section
/// sheets, which can list hundreds of entries (a real July B2B section has
/// 243 invoices). A Flex lays non-flex children out with an unbounded main
/// axis, so before the Flexible wrapper the list-backed sheets sized to full
/// content height and overflowed by ~14.5k pixels.
void main() {
  Widget host(Widget child) => MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.bottomCenter,
            child: GstSheetShell(child: child),
          ),
        ),
      );

  Widget listSheet(int count) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('B2B'),
          const SizedBox(height: 12),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: count,
              itemBuilder: (_, i) => SizedBox(height: 60, child: Text('row $i')),
            ),
          ),
        ],
      );

  testWidgets('long section list scrolls instead of overflowing',
      (tester) async {
    await tester.pumpWidget(host(listSheet(243)));
    expect(tester.takeException(), isNull);

    final shellHeight = tester.getSize(find.byType(GstSheetShell)).height;
    expect(shellHeight, lessThanOrEqualTo(600));
  });

  testWidgets('short sheet keeps its natural height', (tester) async {
    await tester.pumpWidget(host(
      const Column(
        mainAxisSize: MainAxisSize.min,
        children: [SizedBox(height: 120, child: Text('Enter OTP'))],
      ),
    ));
    expect(tester.takeException(), isNull);

    // 120 content + 4 handle + 16 handle margin + 12/20 shell padding.
    final shellHeight = tester.getSize(find.byType(GstSheetShell)).height;
    expect(shellHeight, lessThan(300));
  });
}
