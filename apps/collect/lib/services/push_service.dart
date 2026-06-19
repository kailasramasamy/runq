import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../firebase_options.dart';
import '../router.dart' show openNotificationTarget;

/// Background isolate handler. The OS renders the tray notification from the
/// message's `notification` block itself — nothing to do here, but FCM
/// requires a registered handler for the data payload to be delivered.
@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {}

/// Register the FCM background handler + foreground presentation. Call once
/// from main() after Firebase is initialised. Idempotent.
Future<void> initFirebaseMessaging() async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  }
  FirebaseMessaging.onBackgroundMessage(_firebaseBgHandler);
  // iOS: show the system banner even when the app is foregrounded.
  await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
    alert: true,
    badge: true,
    sound: true,
  );
}

/// Owns the FCM device-token lifecycle and notification-tap routing. Tokens
/// register against the shared runq backend (`/dashboard/device-token`), which
/// is role-agnostic (farmer / field_operator included).
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  final _fm = FirebaseMessaging.instance;
  String? _registeredToken;
  StreamSubscription<String>? _refreshSub;
  bool _tapWired = false;
  // FlutterFire delivers the opening tap to BOTH getInitialMessage() and the
  // onMessageOpenedApp stream — dedupe so we don't route twice.
  String? _lastTapMessageId;

  /// Run after a successful login (or session restore): request permission,
  /// fetch the token, register it, wire tap routing.
  Future<void> onLogin() async {
    // Push is strictly best-effort: it must never throw into the login flow
    // (this runs unawaited). On iOS getToken() throws `apns-token-not-set`
    // until APNs registers — and forever on builds without the Push
    // entitlement — so guard on the APNS token first, then catch the rest.
    try {
      final settings = await _fm.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      if (defaultTargetPlatform == TargetPlatform.iOS && await _fm.getAPNSToken() == null) {
        if (kDebugMode) debugPrint('[push] APNS token unavailable — skipping FCM registration');
        return;
      }

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
    } on FirebaseException catch (e) {
      if (kDebugMode) debugPrint('[push] onLogin skipped: ${e.code}');
    }
  }

  /// Run on logout — unregister this device so it stops receiving push.
  Future<void> onLogout() async {
    var token = _registeredToken;
    if (token == null) {
      // getToken() can throw (apns-token-not-set / no entitlement) — logout
      // must never fail because of push.
      try {
        token = await _fm.getToken();
      } on FirebaseException {
        token = null;
      }
    }
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
    final id = message.messageId;
    if (id != null && id == _lastTapMessageId) return;
    _lastTapMessageId = id;

    final target = message.data['targetUrl'];
    if (target is String && target.isNotEmpty) openNotificationTarget(target);
  }
}
