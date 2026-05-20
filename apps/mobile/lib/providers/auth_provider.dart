import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';

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
  final bool isLoading;
  final bool sessionExpired;
  const AuthState({this.user, this.token, this.isLoading = true, this.sessionExpired = false});

  bool get isAuthenticated => token != null && user != null;

  AuthState copyWith({AuthUser? user, String? token, bool? isLoading, bool? sessionExpired, bool clearUser = false, bool clearToken = false}) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      token: clearToken ? null : (token ?? this.token),
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
      final user = _userFrom(res);
      state = AuthState(token: stored, user: user, isLoading: false);
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

  // Phone+OTP is the only sign-in path on mobile. Two-step:
  // requestOtp() is a no-op on the server today (no SMS yet) but we still
  // call it so the UX is honest about which screen is which, and so wiring
  // SMS dispatch later doesn't require client changes.
  Future<void> requestOtp(String phone) async {
    await apiClient.post('/auth/phone-otp/request', {'phone': phone.trim()});
  }

  Future<void> verifyOtp(String phone, String otp) async {
    final res = await apiClient.post('/auth/phone-otp/verify', {
      'phone': phone.trim(),
      'otp': otp.trim(),
    });
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
    state = AuthState(
      token: token,
      user: _userFrom(data),
      isLoading: false,
      sessionExpired: false,
    );
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    apiClient.setToken(null);
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
