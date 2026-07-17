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

/// The request never reached the server — offline, DNS failure, or timed
/// out. Extends [ApiException] with statusCode 0 so every existing
/// `on ApiException` handler surfaces a friendly message app-wide, while
/// callers that care can special-case `is NetworkException`.
class NetworkException extends ApiException {
  final bool isTimeout;
  NetworkException._(String message, {this.isTimeout = false})
      : super(statusCode: 0, message: message, code: isTimeout ? 'timeout' : 'offline');
  factory NetworkException.offline() =>
      NetworkException._('No internet — check your connection and try again.');
  factory NetworkException.timeout() => NetworkException._(
      'Request timed out — check your connection and try again.',
      isTimeout: true);
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

  /// Sends [request], enforces [timeout], and buffers the response — mapping
  /// every "never reached the server" failure to a [NetworkException] so the
  /// whole app's `on ApiException` handlers give a friendly message instead of
  /// a raw, uncaught transport error.
  Future<http.Response> _roundTrip(
      Future<http.StreamedResponse> Function() request, Duration timeout) async {
    try {
      final streamed = await request().timeout(timeout);
      return await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw NetworkException.timeout();
    } on SocketException {
      throw NetworkException.offline();
    } on http.ClientException {
      throw NetworkException.offline();
    } on HandshakeException {
      throw NetworkException.offline();
    }
  }

  Map<String, String> _headers({bool jsonBody = false}) {
    final h = <String, String>{'Accept': 'application/json'};
    if (jsonBody) h['Content-Type'] = 'application/json';
    final t = _token;
    if (t != null && t.isNotEmpty) h['Authorization'] = 'Bearer $t';
    return h;
  }

  Future<dynamic> get(String path) => _send('GET', path);

  /// Returns the body plus the server's Content-Disposition filename (null when
  /// unset), so callers can name a download the way the server named it instead
  /// of hand-rolling a second scheme.
  Future<({List<int> bytes, String? filename})> getBytes(String path) async {
    final sentToken = _token;
    final req = http.Request('GET', _uri(path))..headers.addAll(_headers());
    final res = await _roundTrip(() => _inner.send(req), const Duration(seconds: 60));

    if (res.statusCode == 401 && sentToken != null) {
      _token = null;
      _onUnauthorized?.call();
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return (bytes: res.bodyBytes, filename: _dispositionFilename(res.headers));
    }
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

  /// `attachment; filename="x.pdf"` → `x.pdf`. Null when absent or unparseable.
  static String? _dispositionFilename(Map<String, String> headers) {
    final cd = headers['content-disposition'];
    if (cd == null) return null;
    final m = RegExp(r'filename\*?=(?:UTF-8'
            r"''"
            r')?"?([^";]+)"?')
        .firstMatch(cd);
    final name = m?.group(1)?.trim();
    return (name == null || name.isEmpty) ? null : Uri.decodeComponent(name);
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

    final res = await _roundTrip(() => _inner.send(req), const Duration(seconds: 120));

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

    // 30s matches apps/mobile and the auth boot-probe comment.
    final res = await _roundTrip(() => _inner.send(req), const Duration(seconds: 30));

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
