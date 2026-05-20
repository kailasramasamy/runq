import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _prefKey = 'runq-language';

/// User-selected app language code. Persists across launches via
/// SharedPreferences; defaults to English. Localization is not yet wired —
/// this only records the preference.
class LanguageController extends StateNotifier<String> {
  LanguageController() : super('en') {
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_prefKey);
    if (code != null && code != state) state = code;
  }

  Future<void> set(String code) async {
    state = code;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, code);
  }
}

final languageProvider = StateNotifierProvider<LanguageController, String>(
  (ref) => LanguageController(),
);
