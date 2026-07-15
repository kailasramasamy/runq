import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/tts_service.dart';

const _prefKey = 'dhenu-locale';

/// A language Dhenu can run in. [nativeLabel] is shown in the picker in the
/// language's own script; [ttsTag] is the BCP-47 tag for read-aloud.
class DhenuLanguage {
  final String code, englishLabel, nativeLabel, ttsTag, shortLabel;

  /// Whether the UI strings are actually translated and shippable. Unsupported
  /// languages are shown in the picker as "Coming soon" and can't be selected.
  final bool supported;
  const DhenuLanguage(this.code, this.englishLabel, this.nativeLabel, this.ttsTag, this.shortLabel,
      {this.supported = false});
  Locale get locale => Locale(code);
}

/// The languages targeted by Dhenu (spec §2.2 / §7). Supported languages
/// (those with generated l10n) come first; the rest are listed as "Coming soon"
/// until their Indic UI-string translations land.
const dhenuLanguages = <DhenuLanguage>[
  DhenuLanguage('en', 'English', 'English', 'en-IN', 'EN', supported: true),
  DhenuLanguage('kn', 'Kannada', 'ಕನ್ನಡ', 'kn-IN', 'ಕ', supported: true),
  DhenuLanguage('ta', 'Tamil', 'தமிழ்', 'ta-IN', 'த', supported: true),
  DhenuLanguage('hi', 'Hindi', 'हिन्दी', 'hi-IN', 'हि'),
  DhenuLanguage('te', 'Telugu', 'తెలుగు', 'te-IN', 'తె'),
  DhenuLanguage('ml', 'Malayalam', 'മലയാളം', 'ml-IN', 'മ'),
  DhenuLanguage('gu', 'Gujarati', 'ગુજરાતી', 'gu-IN', 'ગુ'),
  DhenuLanguage('bn', 'Bengali', 'বাংলা', 'bn-IN', 'বাং'),
];

/// Languages whose UI is fully translated and selectable today.
List<DhenuLanguage> get supportedLanguages => dhenuLanguages.where((l) => l.supported).toList();

DhenuLanguage languageForCode(String code) =>
    dhenuLanguages.firstWhere((l) => l.code == code, orElse: () => dhenuLanguages.first);

List<Locale> get supportedLocales => dhenuLanguages.map((l) => l.locale).toList();

/// User-selected app language. Persists across launches; first run seeds from
/// the device locale when it's one we support (a Kannada phone opens in
/// Kannada — the login screen must be readable before any picker is reachable).
/// Also keeps the TTS engine's voice in step.
class LocaleController extends StateNotifier<Locale> {
  LocaleController() : super(_deviceDefault()) {
    TtsService.instance.setLocale(languageForCode(state.languageCode).ttsTag);
    _restore();
  }

  static Locale _deviceDefault() {
    final device = WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    final match = dhenuLanguages.where((l) => l.supported && l.code == device);
    return match.isEmpty ? const Locale('en') : match.first.locale;
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_prefKey);
    if (code != null) {
      state = Locale(code);
      TtsService.instance.setLocale(languageForCode(code).ttsTag);
    }
  }

  Future<void> set(String code) async {
    state = Locale(code);
    TtsService.instance.setLocale(languageForCode(code).ttsTag);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, code);
  }

  DhenuLanguage get current => languageForCode(state.languageCode);
}

final localeProvider = StateNotifierProvider<LocaleController, Locale>((ref) => LocaleController());
