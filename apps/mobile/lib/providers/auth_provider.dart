import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../services/push_service.dart';

const _tokenKey = 'runq-token';

class AuthUser {
  final String id, email;
  final String? name, role, tenant;
  AuthUser({required this.id, required this.email, this.name, this.role, this.tenant});

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: (j['id'] ?? '').toString(),
        email: (j['email'] ?? '').toString(),
        name: j['name'] as String?,
        role: j['role'] as String?,
        tenant: j['tenant'] as String?,
      );
}

class AuthState {
  final AuthUser? user;
  final String? token;
  /// Effective module access in the active tenant (codes from MODULE_CODES:
  /// finance/hr/inventory/purchase/manufacturing). Drives the module switcher.
  final List<String> modules;
  final bool isLoading;
  final bool sessionExpired;
  const AuthState({this.user, this.token, this.modules = const [], this.isLoading = true, this.sessionExpired = false});

  bool get isAuthenticated => token != null && user != null;

  AuthState copyWith({AuthUser? user, String? token, List<String>? modules, bool? isLoading, bool? sessionExpired, bool clearUser = false, bool clearToken = false}) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      token: clearToken ? null : (token ?? this.token),
      modules: modules ?? this.modules,
      isLoading: isLoading ?? this.isLoading,
      sessionExpired: sessionExpired ?? this.sessionExpired,
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController() : super(const AuthState(isLoading: true)) {
    apiClient.setOnUnauthorized(_handleSessionExpired);
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_tokenKey);
    if (stored == null) {
      state = state.copyWith(isLoading: false);
      return;
    }
    if (_isExpired(stored)) {
      await prefs.remove(_tokenKey);
      state = const AuthState(isLoading: false, sessionExpired: true);
      return;
    }
    apiClient.setToken(stored);
    try {
      final res = await apiClient.get('/auth/me');
      state = AuthState(token: stored, user: _userFrom(res), modules: _modulesFrom(res), isLoading: false);
      unawaited(PushService.instance.onLogin());
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await prefs.remove(_tokenKey);
        apiClient.setToken(null);
        state = const AuthState(isLoading: false, sessionExpired: true);
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> login(String email, String password, {String tenant = ''}) async {
    final res = await apiClient.post('/auth/login', {
      'email': email.trim(),
      'password': password,
      'tenant': tenant,
    });
    await _finishLogin(res);
  }

  // The number the current OTP was sent to, held between the request and verify
  // steps so the login call submits the exact same phone.
  String? _otpPhone;

  /// Request an SMS OTP for the given 10-digit national [phone]. The server
  /// (MSG91 + Redis) sends and stores the code; nothing is verified client-side.
  /// Throws [ApiException] (e.g. 404 when no employee matches the number).
  Future<void> requestOtp(String phone) async {
    final national = _national(phone);
    await apiClient.post('/auth/otp/request', {'phone': national});
    _otpPhone = national;
  }

  /// Submit the user-typed [otp] for the number the code was sent to. On success
  /// the server verifies the code, matches the employee, and returns a runq JWT.
  Future<void> submitOtp(String otp) async {
    final phone = _otpPhone;
    if (phone == null) {
      throw ApiException(statusCode: 0, message: 'Request a code first');
    }
    final res = await apiClient.post('/auth/phone/login', {
      'phone': phone,
      'otp': otp.trim(),
    });
    await _finishLogin(res);
    _otpPhone = null;
  }

  // Reduce any input to the bare 10-digit national number the API expects.
  String _national(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    return digits.length > 10 ? digits.substring(digits.length - 10) : digits;
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
    // The login response carries token + user but not the per-user module
    // grant — fetch /auth/me for the authoritative session so the switcher
    // gates correctly from the first frame. Fall back to login data if it fails.
    try {
      final me = await apiClient.get('/auth/me');
      state = AuthState(token: token, user: _userFrom(me), modules: _modulesFrom(me), isLoading: false, sessionExpired: false);
    } catch (_) {
      state = AuthState(token: token, user: _userFrom(data), isLoading: false, sessionExpired: false);
    }
    unawaited(PushService.instance.onLogin());
  }

  Future<void> logout() async {
    // Unregister the device first — the API call needs the still-valid token.
    await PushService.instance.onLogout();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    apiClient.setToken(null);
    _otpPhone = null;
    state = const AuthState(isLoading: false);
  }

  void clearSessionExpired() {
    if (state.sessionExpired) {
      state = state.copyWith(sessionExpired: false);
    }
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

  // `modules` is a sibling of `user` under `data`. Accepts either the full
  // response ({ data: { modules } }) or a bare data map ({ modules }).
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
    } catch (_) {
      return false;
    }
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController());
