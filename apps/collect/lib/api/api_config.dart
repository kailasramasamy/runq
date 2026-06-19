import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';

/// Dhenu talks to the SAME runq backend as the ERP — the milk-procurement
/// module lives under `/api/v1/milk-procurement/`. Debug builds hit the local
/// Mac API + `runq_dev` (mirrors prod IDs), never production
/// (see `project_mobile_debug_backend`).
class ApiConfig {
  static const _override = String.fromEnvironment('DHENU_API_BASE_URL', defaultValue: '');
  static const _prodUrl = 'https://api.runq.in/api/v1';

  static String get baseUrl {
    if (_override.isNotEmpty) return _override;
    if (kDebugMode) {
      try {
        if (Platform.isAndroid) return 'http://10.0.2.2:3003/api/v1';
      } catch (_) {/* not on a platform with dart:io */}
      // 127.0.0.1 dodges iOS IPv6 resolution quirks some sim builds hit.
      return 'http://127.0.0.1:3003/api/v1';
    }
    return _prodUrl;
  }
}
