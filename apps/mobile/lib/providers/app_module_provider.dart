// App-wide module switcher state. The mobile app can be in Finance, HR,
// or Inventory mode at any time. The active module drives the bottom-nav
// tabs, the centre-FAB action sheet, and the initial route after sign-in.
//
// Choice is persisted to SharedPreferences so a user who lives in one
// module doesn't have to flip on every cold start.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_provider.dart';

enum AppModule { finance, hr, inventory, purchase, manufacturing }

extension AppModuleX on AppModule {
  String get label => switch (this) {
        AppModule.finance => 'Finance',
        AppModule.hr => 'HR',
        AppModule.inventory => 'Inventory',
        AppModule.purchase => 'Purchase',
        AppModule.manufacturing => 'Manufacturing',
      };

  /// Home route to land on when switching into this module.
  String get homeRoute => switch (this) {
        AppModule.finance => '/home',
        AppModule.hr => '/hr/home',
        AppModule.inventory => '/inventory',
        AppModule.purchase => '/purchase',
        AppModule.manufacturing => '/manufacturing',
      };

  /// Pref-store key (kept stable so existing users don't reset).
  String get _persistKey => switch (this) {
        AppModule.finance => 'finance',
        AppModule.hr => 'hr',
        AppModule.inventory => 'inventory',
        AppModule.purchase => 'purchase',
        AppModule.manufacturing => 'manufacturing',
      };

  IconData get icon => switch (this) {
        AppModule.finance => Icons.account_balance_wallet_outlined,
        AppModule.hr => Icons.groups_2_outlined,
        AppModule.inventory => Icons.inventory_2_outlined,
        AppModule.purchase => Icons.shopping_cart_outlined,
        AppModule.manufacturing => Icons.factory_outlined,
      };
}

const _prefKey = 'app_module_v1';

class AppModuleNotifier extends StateNotifier<AppModule> {
  AppModuleNotifier() : super(AppModule.finance) {
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefKey);
    if (raw == 'hr') {
      state = AppModule.hr;
    } else if (raw == 'inventory') {
      state = AppModule.inventory;
    } else if (raw == 'purchase') {
      state = AppModule.purchase;
    } else if (raw == 'manufacturing') {
      state = AppModule.manufacturing;
    }
  }

  Future<void> setModule(AppModule m) async {
    if (state == m) return;
    state = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, m._persistKey);
  }
}

final appModuleProvider =
    StateNotifierProvider<AppModuleNotifier, AppModule>((ref) => AppModuleNotifier());

/// Modules the signed-in user may switch into — `AppModule.values` filtered by
/// the effective grant from `/auth/me` (enum name == backend module code).
/// While the session is still loading we don't yet know the grant, so we show
/// everything rather than flash an empty switcher; once loaded we honour it.
final allowedModulesProvider = Provider<List<AppModule>>((ref) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading) return AppModule.values;
  return AppModule.values.where((m) => auth.modules.contains(m.name)).toList();
});
