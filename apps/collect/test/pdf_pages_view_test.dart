import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/theme/dhenu_theme.dart';
import 'package:dhenu/widgets/pdf_preview_screen.dart';
import 'package:printing/printing.dart';

/// Smallest valid PNG — the pages only need to be real ImageProviders here.
final _png = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

PdfPreviewPageData _page() =>
    PdfPreviewPageData(image: MemoryImage(_png), width: 1650, height: 2340);

void main() {
  testWidgets('the document is one pinch-zoomable surface', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: DhenuTheme.light(),
      home: Scaffold(
        body: PdfPagesView(pages: [_page(), _page()], maxScale: 4),
      ),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    // One viewer over the whole document, not one per page — two would fight
    // each other for the drag, and neither would scroll once zoomed.
    final viewer = tester.widget<InteractiveViewer>(find.byType(InteractiveViewer));
    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(viewer.maxScale, 4);
    // Unconstrained is what lets panning double as scrolling through pages.
    expect(viewer.constrained, isFalse);
    expect(find.byType(Image), findsNWidgets(2));
  });
}
