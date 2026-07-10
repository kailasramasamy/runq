import 'dart:io';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import '../api/models.dart';

/// On-device reader for UPI / bank payment-confirmation screenshots. Runs
/// entirely on the phone (Apple Vision on iOS, an on-device model on Android)
/// with no network, and parses the fields a quick payment needs. Returns null
/// when it can't read the critical field (amount) so the caller can fall back
/// to the server extractor.
class UpiConfirmationOcr {
  static final TextRecognizer _recognizer =
      TextRecognizer(script: TextRecognitionScript.latin);

  static Future<ExtractedConfirmation?> tryExtract(File image) async {
    try {
      final input = InputImage.fromFilePath(image.path);
      final result = await _recognizer.processImage(input);
      final conf = _parse(result);
      // Amount is the one field we must get for the capture to be useful; if
      // it's missing, treat OCR as a miss and let the server extractor try.
      return conf.amount != null ? conf : null;
    } catch (_) {
      return null;
    }
  }

  static ExtractedConfirmation _parse(RecognizedText r) {
    final lines = <_Line>[];
    for (final b in r.blocks) {
      for (final l in b.lines) {
        lines.add(_Line(l.text, l.boundingBox.height.toDouble()));
      }
    }
    final flat = r.text.replaceAll('\n', ' ');
    return ExtractedConfirmation(
      amount: _amount(lines),
      upiRef: _upiRef(flat),
      payeeName: _payee(lines),
      paymentDate: _date(flat),
    );
  }

  // Amount: the ₹/INR/Rs figure on the tallest line — every UPI app renders
  // the paid amount as the most prominent number on the screen.
  static final RegExp _amountRe = RegExp(
    r'(?:₹|INR|RS\.?)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)',
    caseSensitive: false,
  );
  static double? _amount(List<_Line> lines) {
    double? best;
    double bestH = -1;
    for (final l in lines) {
      final m = _amountRe.firstMatch(l.text);
      if (m == null) continue;
      final v = double.tryParse(m.group(1)!.replaceAll(',', ''));
      if (v == null || v <= 0) continue;
      if (l.h > bestH) {
        bestH = l.h;
        best = v;
      }
    }
    return best;
  }

  // UPI transaction id / UTR: a 10–22 char code after a recognised label.
  static final RegExp _refRe = RegExp(
    r'(?:UPI\s*(?:transaction\s*id|ref(?:erence)?(?:\s*no\.?)?)|UTR(?:\s*no\.?)?|transaction\s*id|txn\.?\s*id|ref(?:erence)?\s*no\.?)\s*[:\-#]?\s*([A-Za-z0-9]{10,22})',
    caseSensitive: false,
  );
  static String? _upiRef(String flat) => _refRe.firstMatch(flat)?.group(1);

  // Payee: the text after "Paid to" / "To" / "Beneficiary" on a line, kept
  // only when it looks like a name (not a VPA or a number).
  static final RegExp _payeeLineRe = RegExp(
    r'^(?:paid\s*to|to\b|beneficiary(?:\s*name)?|banking\s*name|received\s*by)\s*[:\-]?\s*(.+)$',
    caseSensitive: false,
  );
  static String? _payee(List<_Line> lines) {
    for (final l in lines) {
      final m = _payeeLineRe.firstMatch(l.text.trim());
      if (m == null) continue;
      final name = m.group(1)!.trim();
      if (_looksLikeName(name)) return name;
    }
    return null;
  }

  static bool _looksLikeName(String s) {
    if (s.length < 2 || s.length > 40) return false;
    if (s.contains('@')) return false; // a VPA, not a name
    final letters = RegExp(r'[A-Za-z]').allMatches(s).length;
    final digits = RegExp(r'[0-9]').allMatches(s).length;
    return letters >= 2 && digits <= letters;
  }

  // Date: "12 Jul 2026", "12 July 2026", "12/07/2026", "12-07-26". A missing
  // year falls back to the current year; future dates are ignored.
  static String? _date(String flat) {
    final now = DateTime.now();
    DateTime? d;

    final m1 = RegExp(r'\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b').firstMatch(flat);
    if (m1 != null) {
      final mo = _month(m1.group(2)!);
      if (mo != null) d = DateTime(int.parse(m1.group(3)!), mo, int.parse(m1.group(1)!));
    }
    if (d == null) {
      final m2 = RegExp(r'\b(\d{1,2})\s+([A-Za-z]{3,9})\b').firstMatch(flat);
      if (m2 != null) {
        final mo = _month(m2.group(2)!);
        if (mo != null) d = DateTime(now.year, mo, int.parse(m2.group(1)!));
      }
    }
    if (d == null) {
      // DD/MM/YYYY (Indian apps) — day first.
      final m3 = RegExp(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b').firstMatch(flat);
      if (m3 != null) {
        var y = int.parse(m3.group(3)!);
        if (y < 100) y += 2000;
        d = DateTime(y, int.parse(m3.group(2)!), int.parse(m3.group(1)!));
      }
    }
    if (d == null || d.isAfter(now)) return null;
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  static int? _month(String s) {
    const m = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    };
    return m[s.toLowerCase().substring(0, 3)];
  }
}

class _Line {
  final String text;
  final double h;
  _Line(this.text, this.h);
}
