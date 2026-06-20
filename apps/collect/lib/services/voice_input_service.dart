import 'package:speech_to_text/speech_to_text.dart';

/// Singleton STT wrapper for low-literacy VMCC operator voice input.
///
/// Maps the app's language code to an IN-locale BCP-47 tag (ta→ta-IN etc.)
/// and delegates everything to the speech_to_text plugin. Failure is always
/// silent — a missing mic or denied permission downgrades the VoiceField to
/// text-only without crashing.
class VoiceInputService {
  VoiceInputService._();
  static final VoiceInputService instance = VoiceInputService._();

  final SpeechToText _stt = SpeechToText();
  bool _available = false;
  bool _initialised = false;

  /// Idempotent: safe to call on every screen open.
  Future<bool> init() async {
    if (_initialised) return _available;
    _initialised = true;
    try {
      _available = await _stt.initialize(onError: (_) {});
    } catch (_) {
      _available = false;
    }
    return _available;
  }

  bool get isListening => _stt.isListening;

  /// Maps a two-letter language code to an India BCP-47 locale id.
  static String localeId(String langCode) => switch (langCode) {
        'ta' => 'ta-IN',
        'kn' => 'kn-IN',
        'hi' => 'hi-IN',
        'ml' => 'ml-IN',
        'te' => 'te-IN',
        'mr' => 'mr-IN',
        _ => 'en-IN',
      };

  Future<void> listen({
    required String localeId,
    required void Function(String) onResult,
    void Function(bool)? onListeningChange,
  }) async {
    if (!_available) return;
    try {
      await _stt.listen(
        onResult: (r) => onResult(r.recognizedWords),
        onSoundLevelChange: null,
        listenOptions: SpeechListenOptions(
          localeId: localeId,
          listenFor: const Duration(seconds: 30),
          pauseFor: const Duration(seconds: 3),
          partialResults: true,
        ),
      );
      onListeningChange?.call(true);
    } catch (_) {
      onListeningChange?.call(false);
    }
  }

  Future<void> stop() async {
    if (!_available) return;
    try {
      await _stt.stop();
    } catch (_) {}
  }
}
