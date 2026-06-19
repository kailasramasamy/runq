import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'api_config.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final String? code;
  final Map<String, dynamic>? body;
  ApiException({required this.statusCode, required this.message, this.code, this.body});

  @override
  String toString() => message;
}

typedef OnUnauthorized = void Function();

class ApiClient {
  ApiClient({http.Client? inner}) : _inner = inner ?? http.Client();

  final http.Client _inner;
  String? _token;
  OnUnauthorized? _onUnauthorized;

  void setToken(String? token) => _token = token;
  String? get token => _token;
  void setOnUnauthorized(OnUnauthorized? cb) => _onUnauthorized = cb;

  Uri _uri(String path) => Uri.parse('${ApiConfig.baseUrl}$path');

  Map<String, String> _headers({bool jsonBody = false}) {
    final h = <String, String>{'Accept': 'application/json'};
    if (jsonBody) h['Content-Type'] = 'application/json';
    final t = _token;
    if (t != null && t.isNotEmpty) h['Authorization'] = 'Bearer $t';
    return h;
  }

  Future<dynamic> get(String path) => _send('GET', path);

  Future<List<int>> getBytes(String path) async {
    final sentToken = _token;
    final req = http.Request('GET', _uri(path))..headers.addAll(_headers());
    final streamed = await _inner.send(req).timeout(const Duration(seconds: 60));
    final res = await http.Response.fromStream(streamed);

    if (res.statusCode == 401 && sentToken != null) {
      _token = null;
      _onUnauthorized?.call();
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return res.bodyBytes;
    String message = 'Download failed (${res.statusCode})';
    try {
      final decoded = jsonDecode(utf8.decode(res.bodyBytes));
      if (decoded is Map<String, dynamic>) {
        final err = decoded['error'];
        if (err is Map<String, dynamic> && err['message'] is String) {
          message = err['message'] as String;
        } else if (decoded['message'] is String) {
          message = decoded['message'] as String;
        }
      }
    } catch (_) {}
    throw ApiException(statusCode: res.statusCode, message: message);
  }

  Future<dynamic> upload(
    String path,
    File file, {
    String fileField = 'file',
    Map<String, String> fields = const {},
    String? mimeType,
  }) async {
    final sentToken = _token;
    final req = http.MultipartRequest('POST', _uri(path))
      ..headers.addAll(_headers())
      ..fields.addAll(fields);
    final stream = http.ByteStream(file.openRead());
    final length = await file.length();
    final part = http.MultipartFile(
      fileField,
      stream,
      length,
      filename: file.path.split(Platform.pathSeparator).last,
      contentType: mimeType != null ? MediaType.parse(mimeType) : null,
    );
    req.files.add(part);

    final streamed = await _inner.send(req).timeout(const Duration(seconds: 120));
    final res = await http.Response.fromStream(streamed);

    if (res.statusCode == 401 && sentToken != null) {
      _token = null;
      _onUnauthorized?.call();
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return null;
      return jsonDecode(res.body);
    }
    String message = 'Upload failed (${res.statusCode})';
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) {
        final err = decoded['error'];
        if (err is Map<String, dynamic> && err['message'] is String) {
          message = err['message'] as String;
        } else if (decoded['message'] is String) {
          message = decoded['message'] as String;
        }
      }
    } catch (_) {}
    throw ApiException(statusCode: res.statusCode, message: message);
  }

  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final sentToken = _token;
    final hasBody = body != null;
    final req = http.Request(method, _uri(path));
    req.headers.addAll(_headers(jsonBody: hasBody));
    if (hasBody) req.body = jsonEncode(body);

    final streamed = await _inner.send(req).timeout(const Duration(seconds: 15));
    final res = await http.Response.fromStream(streamed);

    if (res.statusCode == 401 && sentToken != null) {
      _token = null;
      _onUnauthorized?.call();
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.statusCode == 204 || res.body.isEmpty) return null;
      return jsonDecode(res.body);
    }

    Map<String, dynamic>? errBody;
    String message = 'Request failed (${res.statusCode})';
    String? code;
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) {
        errBody = decoded;
        final err = decoded['error'];
        if (err is Map<String, dynamic>) {
          message = (err['message'] as String?) ?? message;
          code = err['code'] as String?;
        } else if (decoded['message'] is String) {
          message = decoded['message'] as String;
        }
      }
    } catch (_) {}
    throw ApiException(statusCode: res.statusCode, message: message, code: code, body: errBody);
  }
}

final apiClient = ApiClient();
