import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Full-screen look at a server-rendered PDF, with share and print on the
/// preview's own action bar.
///
/// Opening the document beats handing it straight to the OS share sheet
/// wherever the operator is the reader rather than the sender — they can check
/// the figure before deciding whether anyone else needs it, and sharing is
/// still one tap away instead of being the only thing the button did.
///
/// The page layout is ours rather than the package's default, for two reasons
/// that together made the document unreadable: the default only zooms on a
/// double-tap (no pinch, and nothing on screen says so), and it rasterises each
/// page at exactly the viewport width, so magnifying it enlarges pixels that
/// were never rendered. Here one [InteractiveViewer] carries the whole
/// document — pinch to zoom, drag to pan and to scroll between pages — over a
/// raster with enough headroom to stay sharp when it is zoomed into.
class PdfPreviewScreen extends StatelessWidget {
  const PdfPreviewScreen({
    super.key,
    required this.title,
    required this.bytes,
    required this.filename,
  });

  final String title;
  final Uint8List bytes;

  /// The server's own download name, so every surface hands over the same file.
  final String filename;

  /// How far in the operator can pinch, and so how much detail the raster has
  /// to carry to survive it.
  static const maxScale = 4.0;

  /// A4 width in points — every statement the server renders is A4, and the
  /// raster resolution is derived from it.
  static const _a4WidthPt = 595.28;

  /// Cap on rasterisation, in dots per inch. A4 at 200dpi is ~1650×2340 px per
  /// page, which is sharp well past a 4× pinch without asking a field phone to
  /// hold print-resolution bitmaps for every page at once.
  static const _maxDpi = 200.0;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final mq = MediaQuery.of(context);
    // The package would raster to fit the width exactly; multiplying by the
    // zoom ceiling is what leaves something to magnify.
    final dpi = math.min(
      _maxDpi,
      mq.size.width * mq.devicePixelRatio * maxScale / _a4WidthPt * 72,
    );
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(title, style: DhenuText.h2.copyWith(color: t.ink))),
      body: PdfPreview.builder(
        build: (_) => bytes,
        pdfFileName: filename,
        // Share is the only action. The document is already paginated by the
        // server, so page-size and orientation controls would only invite the
        // operator to re-lay-out fixed bytes — and orientation is a separate
        // flag from format, which is why two page buttons survived turning the
        // format picker off. A field phone has no printer to send it to either.
        allowSharing: true,
        allowPrinting: false,
        canChangePageFormat: false,
        canChangeOrientation: false,
        canDebug: false,
        // Without this the package paints its own grey gradient behind the
        // pages — a hardcoded light slab that ignores the theme and stays
        // light in dark mode. The paper should sit on the app's own surface.
        scrollViewDecoration: BoxDecoration(color: t.surface),
        dpi: dpi,
        pagesBuilder: (context, pages) => PdfPagesView(pages: pages, maxScale: maxScale),
      ),
    );
  }
}

/// Every page of a rasterised document stacked in one pan-and-zoom surface.
///
/// Deliberately not a scrollable inside a zoomer: the two fight over vertical
/// drags, and whichever wins, the other stops working the moment the page is
/// zoomed. With `constrained: false` the viewer owns the gesture outright and
/// panning *is* the scrolling, so a zoomed-in page still moves under the finger.
class PdfPagesView extends StatelessWidget {
  const PdfPagesView({super.key, required this.pages, required this.maxScale});

  final List<PdfPreviewPageData> pages;
  final double maxScale;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return InteractiveViewer(
      constrained: false,
      minScale: 1,
      maxScale: maxScale,
      child: SizedBox(
        width: width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final page in pages) ...[
              const SizedBox(height: DhenuSpacing.md),
              // filterQuality matters at scale: the default nearest-neighbour
              // sampling turns zoomed text into stair-stepped edges even when
              // the raster behind it is fine.
              DecoratedBox(
                decoration: BoxDecoration(boxShadow: DhenuShadows.card),
                child: Image(
                  image: page.image,
                  width: width,
                  filterQuality: FilterQuality.medium,
                ),
              ),
            ],
            const SizedBox(height: DhenuSpacing.md),
          ],
        ),
      ),
    );
  }
}
