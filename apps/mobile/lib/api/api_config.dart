import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';

class ApiConfig {
  static const _override = String.fromEnvironment('RUNQ_API_BASE_URL', defaultValue: '');
  static const _prodUrl = 'https://api.runq.in/api/v1';

  static String get baseUrl {
    if (_override.isNotEmpty) return _override;
    if (kDebugMode) {
      try {
        if (Platform.isAndroid) return 'http://10.0.2.2:3003/api/v1';
      } catch (_) {/* not on a platform that supports dart:io */}
      // 127.0.0.1 dodges iOS IPv6 resolution quirks that some sim builds hit.
      return 'http://127.0.0.1:3003/api/v1';
    }
    return _prodUrl;
  }
}
