import 'dart:io';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

/// On-device reader for customer-PO photos. Runs entirely on the phone
/// (Apple Vision on iOS, an on-device model on Android) with no network, and
/// returns the recognised text so the server can parse it locally instead of
/// calling the AI vision fallback. Returns null when the text is too sparse to
/// be worth parsing, so the caller uploads the raw image for AI extraction.
class PoOcr {
  static final TextRecognizer _recognizer =
      TextRecognizer(script: TextRecognitionScript.latin);

  /// Minimum recognised characters for the text to be worth a local parse.
  /// The server text parser needs a header row plus a line item or two; a
  /// blurry photo that yields a handful of characters is better left to AI.
  static const int _minChars = 60;

  static Future<String?> tryExtract(File image) async {
    try {
      final input = InputImage.fromFilePath(image.path);
      final result = await _recognizer.processImage(input);
      final text = result.text.trim();
      return text.length >= _minChars ? text : null;
    } catch (_) {
      return null;
    }
  }
}
