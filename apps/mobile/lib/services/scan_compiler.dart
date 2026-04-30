import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Stitches one or more scanned page images into a single multi-page PDF.
///
/// Each page is converted to grayscale and re-encoded as JPEG-q75 before
/// being embedded — typically 3–5× smaller than the original color JPEGs
/// while remaining well within the OCR/AI legibility threshold.
///
/// Returns a File pointing to the temp PDF. Caller is responsible for
/// uploading and discarding.
Future<File> compileScansToPdf(
  List<File> pageImages, {
  bool grayscale = true,
  int jpegQuality = 75,
  int maxDimension = 2200,
}) async {
  if (pageImages.isEmpty) {
    throw ArgumentError('At least one page image is required');
  }

  final doc = pw.Document();

  for (final pageFile in pageImages) {
    final raw = await pageFile.readAsBytes();
    final processed = await compute<_ProcessArgs, Uint8List>(
      _processPage,
      _ProcessArgs(raw: raw, grayscale: grayscale, jpegQuality: jpegQuality, maxDimension: maxDimension),
    );

    final image = pw.MemoryImage(processed);
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(0),
        build: (ctx) => pw.Center(
          child: pw.Image(image, fit: pw.BoxFit.contain),
        ),
      ),
    );
  }

  final bytes = await doc.save();
  final dir = Directory.systemTemp.createTempSync('runq_scan_');
  final ts = DateTime.now().millisecondsSinceEpoch;
  final out = File('${dir.path}/scan-$ts.pdf');
  await out.writeAsBytes(bytes);
  return out;
}

class _ProcessArgs {
  final Uint8List raw;
  final bool grayscale;
  final int jpegQuality;
  final int maxDimension;
  _ProcessArgs({
    required this.raw,
    required this.grayscale,
    required this.jpegQuality,
    required this.maxDimension,
  });
}

/// Heavy work — runs in an isolate via `compute` to keep the UI thread free.
/// Decodes the image, downscales if oversized, optionally desaturates to
/// grayscale, then re-encodes as JPEG.
Uint8List _processPage(_ProcessArgs args) {
  var src = img.decodeImage(args.raw);
  if (src == null) {
    // Couldn't decode — pass the original through. PDF will still embed it
    // (most likely a JPEG that the package can also handle natively).
    return args.raw;
  }

  // Downscale if either dimension exceeds maxDimension. Keeps text legible
  // while preventing runaway file sizes from high-res phone cameras.
  final longSide = src.width > src.height ? src.width : src.height;
  if (longSide > args.maxDimension) {
    final scale = args.maxDimension / longSide;
    src = img.copyResize(
      src,
      width: (src.width * scale).round(),
      height: (src.height * scale).round(),
      interpolation: img.Interpolation.average,
    );
  }

  if (args.grayscale) {
    src = img.grayscale(src);
  }

  final jpg = img.encodeJpg(src, quality: args.jpegQuality);
  return jpg;
}
