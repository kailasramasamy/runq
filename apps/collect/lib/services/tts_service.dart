import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_tts/flutter_tts.dart';

/// Read-aloud for low-literacy users (design spec §1.6, §7) — the 🔊 affordance
/// next to rate and payment figures. A thin singleton over flutter_tts.
///
/// The [localeTag] follows the app's selected language (e.g. 'hi-IN'); TTS
/// gracefully falls back to the device default if the engine lacks that voice.
class TtsService {
  TtsService._();
  static final TtsService instance = TtsService._();

  final FlutterTts _tts = FlutterTts();
  bool _ready = false;
  String _localeTag = 'en-IN';

  Future<void> _ensure() async {
    if (_ready) return;
    await _tts.setSpeechRate(0.45); // slow + clear for rural users
    await _tts.setPitch(1.0);
    _ready = true;
  }

  /// Set the BCP-47 locale tag (called when the app language changes).
  void setLocale(String tag) => _localeTag = tag;

  /// Speak [text]. Best-effort — never throws into the UI.
  Future<void> speak(String text) async {
    if (text.trim().isEmpty) return;
    await _ensure();
    try {
      await _tts.setLanguage(_localeTag);
    } on PlatformException {
      // Voice for this locale unavailable — fall back to the engine default.
    }
    await _tts.stop();
    await _tts.speak(text);
  }

  Future<void> stop() => _tts.stop();
}
