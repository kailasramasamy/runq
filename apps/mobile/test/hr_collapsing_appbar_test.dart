import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/hr/widgets/hr_collapsing_title.dart';
import 'package:runq_mobile/theme/runq_theme.dart';

/// Wiring test for the employee-detail header shape.
///
/// The unit tests around `opacityFor` pass whatever settings they're handed —
/// they cannot catch the title being mounted somewhere the settings never
/// reach, or somewhere that gets clipped away on collapse. That is exactly
/// the bug this covers: the title first lived inside the FlexibleSpaceBar
/// background, which is bottom-anchored, so collapsing clipped it off the top
/// along with the back button. It belongs on the SliverAppBar itself.
void main() {
  const name = 'Asha Ramesh';
  const code = 'E001';

  Future<void> pumpDetail(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: RunqTheme.dark(),
      home: Scaffold(
        body: NestedScrollView(
          headerSliverBuilder: (ctx, _) => [
            SliverAppBar(
              expandedHeight: 278,
              pinned: true,
              automaticallyImplyLeading: false,
              leading: IconButton(
                onPressed: () {},
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              titleSpacing: 0,
              centerTitle: false,
              title: const HrCollapsingTitle(title: name, subtitle: code),
              flexibleSpace: const FlexibleSpaceBar(
                background: SizedBox.expand(child: Text('hero')),
                collapseMode: CollapseMode.pin,
              ),
              bottom: const PreferredSize(
                preferredSize: Size.fromHeight(58),
                child: SizedBox(height: 58),
              ),
            ),
          ],
          body: ListView(
            children: [
              for (var i = 0; i < 40; i++)
                SizedBox(height: 48, child: Text('row $i')),
            ],
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('name and code are hidden while the header is expanded',
      (tester) async {
    await pumpDetail(tester);
    expect(find.text(name), findsNothing);
    expect(find.text(code), findsNothing);
  });

  testWidgets('name and code appear once scrolled to collapsed',
      (tester) async {
    await pumpDetail(tester);
    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();

    expect(find.text(name), findsOneWidget);
    expect(find.text(code), findsOneWidget);
  });

  /// The original bug in one assertion: the back button must not be clipped
  /// away by the collapse, or a scrolled-down record has no way out.
  testWidgets('the back button survives the collapse', (tester) async {
    await pumpDetail(tester);
    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();

    final icon = find.byIcon(Icons.arrow_back_rounded);
    expect(icon, findsOneWidget);
    // Still on screen, not merely still in the tree.
    final box = tester.getRect(icon);
    expect(box.top, greaterThanOrEqualTo(0.0));
    expect(box.bottom,
        lessThanOrEqualTo(tester.view.physicalSize.height / tester.view.devicePixelRatio));
  });

  testWidgets('scrolling back up hides the title again', (tester) async {
    await pumpDetail(tester);
    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();
    expect(find.text(name), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text(name), findsNothing);
  });
}
