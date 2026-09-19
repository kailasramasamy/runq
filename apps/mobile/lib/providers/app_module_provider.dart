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
import 'app_role_provider.dart';
import 'auth_provider.dart';

enum AppModule { finance, hr, purchase, inventory, manufacturing }

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
    restored = _restore();
  }

  /// Completes once the stored choice has been read back.
  ///
  /// Anything that decides *where to open* must await this: reading the state
  /// while the disk read is still in flight returns the Finance default, and a
  /// user who left in Manufacturing was landed in Finance for it.
  late final Future<void> restored;

  /// True once something set the module deliberately — a switch, or the shell
  /// mirroring the route it is showing.
  ///
  /// The restore is async, so on a cold start it can land *after* the first
  /// screen has already declared which module it is. Without this guard it
  /// overwrote that with yesterday's choice, and the switcher chip then named
  /// a module the screen underneath it was not in.
  bool _claimed = false;

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefKey);
    if (_claimed) return;
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
    _claimed = true;
    if (state == m) return;
    state = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, m._persistKey);
  }
}

final appModuleProvider =
    StateNotifierProvider<AppModuleNotifier, AppModule>((ref) => AppModuleNotifier());

/// The order the app puts modules in — in the switcher menu, and when it
/// has to pick one to open.
///
/// Work first, HR last. Every employee holds HR self-service, so landing on
/// what everyone shares landed an operator on leave balances and holidays —
/// the one module they did not open the app for. The floor modules come first
/// because that is where the shift is spent; HR is where they go on purpose.
const _moduleOrder = [
  AppModule.manufacturing,
  AppModule.inventory,
  AppModule.purchase,
  AppModule.finance,
  AppModule.hr,
];

/// Modules the signed-in user may switch into — [_moduleOrder] filtered by the
/// effective grant from `/auth/me` (enum name == backend module code).
///
/// Ordered, not declaration-ordered: this list *is* the switcher menu, and
/// enum order put HR second — directly under the operator's thumb, above the
/// floor modules they opened the app for. While the session is still loading
/// we don't yet know the grant, so we show everything rather than flash an
/// empty switcher; once loaded we honour it.
final allowedModulesProvider = Provider<List<AppModule>>((ref) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading) return _moduleOrder;
  return _moduleOrder.where((m) => auth.modules.contains(m.name)).toList();
});

/// The module a cold start should open.
///
/// The module last used wins whenever it is still held — context beats a
/// default — with one exception: HR. Everyone holds HR self-service and
/// everyone dips into it (a check-in, a payslip), so letting it stick as
/// "last used" is how an operator ends up opening the app on leave balances
/// the next morning. It is a place to visit, not a place to be left. Anyone
/// holding a work module therefore comes back to work; an HR-only user is
/// unaffected, since HR is all they hold.
///
/// Otherwise the first module in [_moduleOrder] the user holds. Finance is
/// skipped for non-admins whatever the grant says: the route guard bounces
/// them straight back out of it.
///
/// Read this only after `appModuleProvider.notifier.restored` and the auth
/// session have settled, or "last used" reads as the Finance default.
final landingModuleProvider = Provider<AppModule>((ref) {
  final allowed = ref.watch(allowedModulesProvider).toSet();
  final canFinance = ref.watch(appRoleProvider).canAccessFinance;
  bool held(AppModule m) =>
      allowed.contains(m) && (canFinance || m != AppModule.finance);
  final last = ref.watch(appModuleProvider);
  if (held(last) && last != AppModule.hr) return last;
  return _moduleOrder.firstWhere(held, orElse: () => AppModule.hr);
});

/// True when there is somewhere to switch to. The *module grant* decides this,
/// never the role: an ordinary employee granted Inventory + Manufacturing needs
/// the switcher just as much as an owner does. False while the session loads so
/// the pill doesn't flash for HR-only users.
final canSwitchModuleProvider = Provider<bool>((ref) {
  if (ref.watch(authProvider).isLoading) return false;
  return ref.watch(allowedModulesProvider).length > 1;
});
