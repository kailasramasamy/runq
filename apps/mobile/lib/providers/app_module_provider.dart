// App-wide module switcher state. The mobile app can be in either Finance
// or HR mode at any time. The active module drives the bottom-nav tabs,
// the centre-FAB action sheet, and the initial route after sign-in.
//
// Choice is persisted to SharedPreferences so a user who lives in HR
// doesn't have to flip the switch on every cold start.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppModule { finance, hr }

const _prefKey = 'app_module_v1';

class AppModuleNotifier extends StateNotifier<AppModule> {
  AppModuleNotifier() : super(AppModule.finance) {
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefKey);
    if (raw == 'hr') state = AppModule.hr;
  }

  Future<void> setModule(AppModule m) async {
    if (state == m) return;
    state = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, m == AppModule.hr ? 'hr' : 'finance');
  }

  /// Convenience flip used by the top-bar module pill.
  Future<void> toggle() async =>
      setModule(state == AppModule.finance ? AppModule.hr : AppModule.finance);
}

final appModuleProvider =
    StateNotifierProvider<AppModuleNotifier, AppModule>((ref) => AppModuleNotifier());
