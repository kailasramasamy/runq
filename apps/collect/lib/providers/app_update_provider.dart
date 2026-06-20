import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../api/api_client.dart';

/// Force-update config served from the backend (`dhenu.*` keys in app_config),
/// exposed at the public, no-auth `/public/app-config` endpoint.
class AppUpdateConfig {
  const AppUpdateConfig({
    required this.minVersion,
    required this.currentVersion,
    required this.forceUpdateMessage,
  });

  final String minVersion;
  final String currentVersion;
  final String forceUpdateMessage;

  factory AppUpdateConfig.fromJson(Map<String, dynamic> j) => AppUpdateConfig(
        minVersion: (j['minVersion'] as String?) ?? '0.0.0',
        currentVersion: (j['currentVersion'] as String?) ?? '0.0.0',
        forceUpdateMessage: (j['forceUpdateMessage'] as String?) ??
            'Please update to the latest version of Dhenu.',
      );
}

/// Outcome of the launch-time version check.
class AppUpdateStatus {
  const AppUpdateStatus({required this.forceUpdate, this.config});

  final bool forceUpdate;
  final AppUpdateConfig? config;

  static const ok = AppUpdateStatus(forceUpdate: false);
}

/// Fetches the Dhenu force-update config and compares the running build against
/// `minVersion`. Fail-open by design: any network/parse error returns
/// [AppUpdateStatus.ok], so a server outage can never brick the app.
final appUpdateStatusProvider = FutureProvider<AppUpdateStatus>((ref) async {
  try {
    final res = await apiClient.get('/public/app-config');
    final data = (res is Map) ? res['data'] : null;
    final dhenu = (data is Map) ? data['dhenu'] : null;
    if (dhenu is! Map) return AppUpdateStatus.ok;

    final config = AppUpdateConfig.fromJson(dhenu.cast<String, dynamic>());
    final running = (await PackageInfo.fromPlatform()).version;

    final forced = _isOlder(running, config.minVersion);
    return AppUpdateStatus(forceUpdate: forced, config: config);
  } catch (_) {
    // Offline / server down / unparseable → never block the user.
    return AppUpdateStatus.ok;
  }
});

/// True when [version] is strictly below [minimum] on a major.minor.patch
/// comparison. Returns false (fail-open) if either string can't be parsed.
bool _isOlder(String version, String minimum) {
  final v = _parse(version);
  final m = _parse(minimum);
  if (v == null || m == null) return false;
  for (var i = 0; i < 3; i++) {
    if (v[i] != m[i]) return v[i] < m[i];
  }
  return false;
}

List<int>? _parse(String s) {
  // Tolerate a build suffix ("1.0.0+3") and pre-release noise.
  final core = s.trim().split('+').first.split('-').first;
  final parts = core.split('.');
  final out = <int>[0, 0, 0];
  for (var i = 0; i < 3 && i < parts.length; i++) {
    final n = int.tryParse(parts[i]);
    if (n == null) return null;
    out[i] = n;
  }
  return out;
}
