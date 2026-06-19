import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/push_service.dart';

const _prefKey = 'dhenu-push-enabled';

/// Whether the user has opted in to push notifications. Persists across
/// launches; defaults to `true`. Drives FCM registration/unregistration
/// via [PushService] so OS-level permission and token lifecycle stay in sync.
class NotificationPrefsController extends StateNotifier<bool> {
  NotificationPrefsController() : super(true) {
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    // Key absent on first run → default true (state already set in super).
    final stored = prefs.getBool(_prefKey);
    if (stored != null && stored != state) state = stored;
  }

  /// Persist [enabled] and drive FCM registration accordingly. Best-effort —
  /// [PushService] methods never throw into the call stack.
  Future<void> set(bool enabled) async {
    state = enabled;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefKey, enabled);
    if (enabled) {
      await PushService.instance.onLogin();
    } else {
      await PushService.instance.onLogout();
    }
  }
}

/// Global push-notification preference. Read with [notificationPrefsProvider],
/// toggle via `.notifier.set(bool)`.
final notificationPrefsProvider =
    StateNotifierProvider<NotificationPrefsController, bool>(
  (ref) => NotificationPrefsController(),
);
