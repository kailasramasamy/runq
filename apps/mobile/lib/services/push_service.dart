import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../firebase_options.dart';
import '../router.dart' show rootKey, openNotificationTarget;

/// Background isolate handler. The OS renders the tray notification from the
/// message's `notification` block on its own — nothing to do here, but FCM
/// requires a registered handler for the data payload to be delivered.
@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {}

/// Initialise Firebase and register the background handler. Call once from
/// main() before runApp().
Future<void> initFirebaseMessaging() async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(_firebaseBgHandler);
  // iOS: show the system banner even when the app is in the foreground.
  await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
    alert: true,
    badge: true,
    sound: true,
  );
}

/// Owns the FCM device token lifecycle and notification-tap routing.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  final _fm = FirebaseMessaging.instance;
  String? _registeredToken;
  StreamSubscription<String>? _refreshSub;
  bool _tapWired = false;
  // Last notification-tap we routed. FlutterFire delivers the opening tap
  // to BOTH getInitialMessage() and the onMessageOpenedApp stream, so the
  // same tap would otherwise push its target screen twice.
  String? _lastTapMessageId;

  /// Run after a successful login (or session restore). Requests permission,
  /// fetches the FCM token, registers it with the API, and wires tap routing.
  Future<void> onLogin() async {
    final settings = await _fm.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    final token = await _fm.getToken();
    if (kDebugMode) {
      debugPrint('[push] permission=${settings.authorizationStatus.name} '
          'token=${token == null ? 'null' : 'acquired'}');
    }
    if (token != null) await _register(token);

    _refreshSub ??= _fm.onTokenRefresh.listen(_register);
    if (!_tapWired) {
      _tapWired = true;
      FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);
      final initial = await _fm.getInitialMessage();
      if (initial != null) _handleTap(initial);
    }
  }

  /// Run on logout — unregister this device so it stops receiving push.
  Future<void> onLogout() async {
    final token = _registeredToken ?? await _fm.getToken();
    if (token != null) {
      try {
        await apiClient.post('/dashboard/device-token/remove', {'token': token});
      } on ApiException {
        // Best-effort: server also prunes the token when FCM reports it dead.
      }
    }
    _registeredToken = null;
  }

  Future<void> _register(String token) async {
    if (token == _registeredToken) return;
    try {
      await apiClient.post('/dashboard/device-token', {
        'token': token,
        'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      });
      _registeredToken = token;
    } on ApiException {
      // Leave _registeredToken null so the next onLogin() retries.
    }
  }

  void _handleTap(RemoteMessage message) {
    // Drop the duplicate delivery of the opening tap (see _lastTapMessageId)
    // so the target screen isn't stacked twice.
    final id = message.messageId;
    if (id != null && id == _lastTapMessageId) return;
    _lastTapMessageId = id;

    final target = message.data['targetUrl'];
    if (target is! String || target.isEmpty) return;
    final ctx = rootKey.currentContext;
    // Pushes (not go) so the current screen stays underneath, but skips the
    // push when the target is already on top — see openNotificationTarget.
    if (ctx != null) openNotificationTarget(ctx, target);
  }
}
