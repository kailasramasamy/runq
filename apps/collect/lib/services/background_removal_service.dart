import 'dart:io';
import 'package:google_mlkit_selfie_segmentation/google_mlkit_selfie_segmentation.dart';
import 'package:image/image.dart' as img;

/// On-device person cut-out for farmer profile photos. Runs ML Kit selfie
/// segmentation, then composites the person onto a solid brand fill. Everything
/// is on-device (offline + private) and falls back to the original image on any
/// failure — it must never block onboarding.
class BackgroundRemovalService {
  BackgroundRemovalService._();

  static final SelfieSegmenter _segmenter =
      SelfieSegmenter(mode: SegmenterMode.single, enableRawSizeMask: true);

  // Brand emerald (#0F7A5A) — matches the initials-avatar fill.
  static const _bgR = 15, _bgG = 122, _bgB = 90;

  /// Returns a new JPEG with the person on the brand fill, or [source] on error.
  static Future<File> personOnBrandFill(File source) async {
    try {
      final decoded = img.decodeImage(await source.readAsBytes());
      if (decoded == null) return source;
      // Normalise orientation so the mask aligns with the pixels, and cap the
      // size so the per-pixel composite stays fast.
      var im = img.bakeOrientation(decoded);
      if (im.width > 720 || im.height > 720) {
        im = img.copyResize(im,
            width: im.width >= im.height ? 720 : null,
            height: im.height > im.width ? 720 : null);
      }
      final normalized = File('${source.path}.norm.jpg')
        ..writeAsBytesSync(img.encodeJpg(im, quality: 92));

      final mask =
          await _segmenter.processImage(InputImage.fromFile(normalized));
      if (mask == null) return source;

      final out = _composite(im, mask);
      return File('${source.path}.cutout.jpg')
        ..writeAsBytesSync(img.encodeJpg(out, quality: 90));
    } catch (_) {
      return source;
    }
  }

  /// Blend each pixel toward the brand fill by its background probability, so
  /// edges stay soft instead of a hard, jagged cut.
  static img.Image _composite(img.Image im, SegmentationMask mask) {
    final out = img.Image(width: im.width, height: im.height);
    final mw = mask.width, mh = mask.height;
    final conf = mask.confidences;
    for (var y = 0; y < im.height; y++) {
      final my = (y * mh / im.height).floor().clamp(0, mh - 1);
      for (var x = 0; x < im.width; x++) {
        final mx = (x * mw / im.width).floor().clamp(0, mw - 1);
        final a = conf[my * mw + mx]; // foreground probability 0..1
        final p = im.getPixel(x, y);
        out.setPixelRgb(
          x,
          y,
          (p.r * a + _bgR * (1 - a)).round(),
          (p.g * a + _bgG * (1 - a)).round(),
          (p.b * a + _bgB * (1 - a)).round(),
        );
      }
    }
    return out;
  }
}
