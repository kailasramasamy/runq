import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../services/push_service.dart';

const _tokenKey = 'dhenu-token';

/// Which home a signed-in user lands on. Derived from the runq role:
///  - farmer        → the moat (read-mostly own milk/quality/money)
///  - field_operator → VMCC/CC/PP operator dashboards (node type comes from
///                      the assigned node, resolved after login)
///  - owner/accountant/viewer → admin "view-as" entry (org-wide)
///  - unknown        → no Dhenu access for this account
enum Persona { farmer, operator, admin, unknown }

class AuthUser {
  final String id, email;
  final String? name, role, tenant, phone;
  AuthUser({required this.id, required this.email, this.name, this.role, this.tenant, this.phone});

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: (j['id'] ?? '').toString(),
        email: (j['email'] ?? '').toString(),
        name: j['name'] as String?,
        role: j['role'] as String?,
        tenant: j['tenant'] as String?,
        phone: j['phone'] as String?,
      );

  Persona get persona {
    switch (role) {
      case 'farmer':
        return Persona.farmer;
      case 'field_operator':
        return Persona.operator;
      case 'owner':
      case 'accountant':
      case 'client_owner':
      case 'viewer':
        return Persona.admin;
      default:
        return Persona.unknown;
    }
  }
}

class AuthState {
  final AuthUser? user;
  final String? token;

  /// Effective module access in the active tenant. Dhenu needs
  /// `milk_procurement` to be present (premium add-on).
  final List<String> modules;
  final bool isLoading;
  final bool sessionExpired;
  const AuthState({
    this.user,
    this.token,
    this.modules = const [],
    this.isLoading = true,
    this.sessionExpired = false,
  });

  bool get isAuthenticated => token != null && user != null;
  bool get hasMilkProcurement => modules.contains('milk_procurement');
  Persona get persona => user?.persona ?? Persona.unknown;

  AuthState copyWith({
    AuthUser? user,
    String? token,
    List<String>? modules,
    bool? isLoading,
    bool? sessionExpired,
    bool clearUser = false,
    bool clearToken = false,
  }) =>
      AuthState(
        user: clearUser ? null : (user ?? this.user),
        token: clearToken ? null : (token ?? this.token),
        modules: modules ?? this.modules,
        isLoading: isLoading ?? this.isLoading,
        sessionExpired: sessionExpired ?? this.sessionExpired,
      );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController() : super(const AuthState(isLoading: true)) {
    apiClient.setOnUnauthorized(_handleSessionExpired);
    _restore();
  }

  /// Minimum time the splash stays up so it never flashes on a fast restore.
  static const _minSplash = Duration(milliseconds: 1500);

  Future<void> _restore() async {
    final minSplash = Future<void>.delayed(_minSplash);
    final (next, doLoginPush) = await _resolveRestored();
    await minSplash; // hold the splash for a standard minimum — no flash
    state = next;
    if (doLoginPush) unawaited(PushService.instance.onLogin());
  }

  /// Resolve the post-restore state without touching `state`, so `_restore`
  /// can enforce the minimum splash duration before applying it.
  Future<(AuthState, bool)> _resolveRestored() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_tokenKey);
    if (stored == null) return (const AuthState(isLoading: false), false);
    if (_isExpired(stored)) {
      await prefs.remove(_tokenKey);
      return (const AuthState(isLoading: false, sessionExpired: true), false);
    }
    apiClient.setToken(stored);
    try {
      // Boot probe: fail fast so an unreachable API drops to login in seconds,
      // not the 30s request timeout used for normal calls.
      final res = await apiClient.get('/auth/me').timeout(const Duration(seconds: 8));
      return (
        AuthState(token: stored, user: _userFrom(res), modules: _modulesFrom(res), isLoading: false),
        true,
      );
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await prefs.remove(_tokenKey);
        apiClient.setToken(null);
        return (const AuthState(isLoading: false, sessionExpired: true), false);
      }
      return (const AuthState(isLoading: false), false);
    } catch (_) {
      // Network/timeout on boot (e.g. API down): never leave the splash hung.
      // Keep the token and drop to login; a later sign-in/refresh recovers.
      return (const AuthState(isLoading: false), false);
    }
  }

  /// Request a login OTP for [phone] (MSG91 SMS).
  Future<void> requestOtp(String phone) =>
      apiClient.post('/auth/mp/otp/request', {'phone': phone.trim()});

  /// Phone + OTP login — the sole Dhenu sign-in. The server matches the
  /// credential by phone, verifies the OTP, then issues the session.
  Future<void> loginWithOtp(String phone, String otp) async {
    final res = await apiClient.post('/auth/mp/phone/login', {'phone': phone.trim(), 'otp': otp.trim()});
    await _finishLogin(res);
  }

  Future<void> _finishLogin(Object? res) async {
    final data = (res is Map && res['data'] is Map) ? res['data'] as Map : res as Map;
    final token = data['token'] as String?;
    if (token == null) {
      throw ApiException(statusCode: 0, message: 'Login response missing token');
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    apiClient.setToken(token);
    try {
      final me = await apiClient.get('/auth/me');
      state = AuthState(token: token, user: _userFrom(me), modules: _modulesFrom(me), isLoading: false);
    } on ApiException {
      state = AuthState(token: token, user: _userFrom(data), isLoading: false);
    }
    unawaited(PushService.instance.onLogin());
  }

  Future<void> logout() async {
    // Unregister the device first — the API call needs the still-valid token.
    await PushService.instance.onLogout();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    apiClient.setToken(null);
    state = const AuthState(isLoading: false);
  }

  void clearSessionExpired() {
    if (state.sessionExpired) state = state.copyWith(sessionExpired: false);
  }

  void _handleSessionExpired() {
    SharedPreferences.getInstance().then((p) => p.remove(_tokenKey));
    apiClient.setToken(null);
    state = const AuthState(isLoading: false, sessionExpired: true);
  }

  AuthUser? _userFrom(Object? body) {
    if (body is Map && body['user'] is Map) {
      return AuthUser.fromJson((body['user'] as Map).cast<String, dynamic>());
    }
    if (body is Map && body['data'] is Map && (body['data'] as Map)['user'] is Map) {
      return AuthUser.fromJson(((body['data'] as Map)['user'] as Map).cast<String, dynamic>());
    }
    return null;
  }

  List<String> _modulesFrom(Object? body) {
    final data = (body is Map && body['data'] is Map) ? body['data'] as Map : body;
    if (data is Map && data['modules'] is List) {
      return (data['modules'] as List).map((e) => e.toString()).toList();
    }
    return const [];
  }

  bool _isExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return false;
      final payload = parts[1];
      final padded = payload.padRight(payload.length + (4 - payload.length % 4) % 4, '=');
      final json = jsonDecode(utf8.decode(base64Url.decode(padded)));
      final exp = json['exp'];
      if (exp is num) return DateTime.now().millisecondsSinceEpoch >= exp.toInt() * 1000;
      return false;
    } on FormatException {
      return false;
    }
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController());
