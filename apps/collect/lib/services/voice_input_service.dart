import 'package:speech_to_text/speech_to_text.dart';

/// Singleton STT wrapper for low-literacy VMCC operator voice input.
///
/// Maps the app's language code to an IN-locale BCP-47 tag (ta→ta-IN etc.).
/// [init] is lazy and retried until it succeeds, so granting the mic permission
/// on the first tap (or later) takes effect without restarting the app.
class VoiceInputService {
  VoiceInputService._();
  static final VoiceInputService instance = VoiceInputService._();

  final SpeechToText _stt = SpeechToText();
  bool _available = false;
  void Function(String status)? _onStatus;

  /// Requests mic + speech-recognition permission on first call. Returns whether
  /// recognition is usable; retries while unavailable (don't cache a failure —
  /// the operator may grant permission after the first prompt).
  Future<bool> init() async {
    if (_available) return true;
    try {
      _available = await _stt.initialize(
        onError: (_) => _onStatus?.call('notListening'),
        onStatus: (s) => _onStatus?.call(s),
      );
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
        'gu' => 'gu-IN',
        'bn' => 'bn-IN',
        _ => 'en-IN',
      };

  /// Start listening. [onStatus] fires with the engine status ('listening',
  /// 'notListening', 'done') so callers can reset their UI when speech ends.
  /// [onSoundLevel] streams the mic level (~0..10) for a "hearing you" animation.
  Future<void> listen({
    required String localeId,
    required void Function(String) onResult,
    void Function(String)? onStatus,
    void Function(double)? onSoundLevel,
  }) async {
    if (!_available) return;
    _onStatus = onStatus;
    try {
      await _stt.listen(
        onResult: (r) => onResult(r.recognizedWords),
        onSoundLevelChange: onSoundLevel,
        listenOptions: SpeechListenOptions(
          localeId: localeId,
          listenFor: const Duration(seconds: 30),
          pauseFor: const Duration(seconds: 4),
          partialResults: true,
        ),
      );
    } catch (_) {
      _onStatus?.call('notListening');
    }
  }

  Future<void> stop() async {
    try {
      await _stt.stop();
    } catch (_) {}
  }
}
