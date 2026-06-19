import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/tts_service.dart';

const _prefKey = 'dhenu-locale';

/// A language Dhenu can run in. [nativeLabel] is shown in the picker in the
/// language's own script; [ttsTag] is the BCP-47 tag for read-aloud.
class DhenuLanguage {
  final String code, englishLabel, nativeLabel, ttsTag, shortLabel;
  const DhenuLanguage(this.code, this.englishLabel, this.nativeLabel, this.ttsTag, this.shortLabel);
  Locale get locale => Locale(code);
}

/// The languages targeted by Dhenu (spec §2.2 / §7). English ships fully;
/// the Indic UI-string translations are a follow-on pass needing native input.
const dhenuLanguages = <DhenuLanguage>[
  DhenuLanguage('en', 'English', 'English', 'en-IN', 'EN'),
  DhenuLanguage('hi', 'Hindi', 'हिन्दी', 'hi-IN', 'हि'),
  DhenuLanguage('ta', 'Tamil', 'தமிழ்', 'ta-IN', 'த'),
  DhenuLanguage('te', 'Telugu', 'తెలుగు', 'te-IN', 'తె'),
  DhenuLanguage('kn', 'Kannada', 'ಕನ್ನಡ', 'kn-IN', 'ಕ'),
  DhenuLanguage('ml', 'Malayalam', 'മലയാളം', 'ml-IN', 'മ'),
  DhenuLanguage('gu', 'Gujarati', 'ગુજરાતી', 'gu-IN', 'ગુ'),
  DhenuLanguage('bn', 'Bengali', 'বাংলা', 'bn-IN', 'বাং'),
];

DhenuLanguage languageForCode(String code) =>
    dhenuLanguages.firstWhere((l) => l.code == code, orElse: () => dhenuLanguages.first);

List<Locale> get supportedLocales => dhenuLanguages.map((l) => l.locale).toList();

/// User-selected app language. Persists across launches; defaults to English.
/// Also keeps the TTS engine's voice in step.
class LocaleController extends StateNotifier<Locale> {
  LocaleController() : super(const Locale('en')) {
    _restore();
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
