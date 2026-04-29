import 'dart:io' show Platform;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../api/api_client.dart';

/// Where to send users to update. Hardcoded because store URLs never
/// change once an app is listed — they're keyed by app/package ID.
/// Update these once your listings exist; an empty string disables the
/// prompt for that platform (the version-check then silently skips).
const String _iosStoreUrl = '';
const String _androidStoreUrl = '';

/// Maintenance manifest sub-object.
class MaintenanceConfig {
  final bool enabled;
  final String message;
  const MaintenanceConfig({required this.enabled, required this.message});

  factory MaintenanceConfig.fromJson(Map<String, dynamic> j) => MaintenanceConfig(
        enabled: j['enabled'] == true,
        message: (j['message'] ?? '').toString(),
      );

  static const empty = MaintenanceConfig(enabled: false, message: '');
}

/// Server-side manifest from `/public/app-config`. Mobile compares its
/// running version against `currentVersion` and `minVersion` to choose
/// between a blocking dialog, a soft prompt, or silence. The server can
/// also push a custom `forceUpdateMessage` and toggle a global maintenance
/// banner via `maintenance.enabled`.
class AppConfig {
  final String currentVersion;
  final String minVersion;
  final String forceUpdateMessage;
  final MaintenanceConfig maintenance;

  const AppConfig({
    required this.currentVersion,
    required this.minVersion,
    required this.forceUpdateMessage,
    required this.maintenance,
  });

  factory AppConfig.fromJson(Map<String, dynamic> j) => AppConfig(
        currentVersion: (j['currentVersion'] ?? '').toString(),
        minVersion: (j['minVersion'] ?? '').toString(),
        forceUpdateMessage: (j['forceUpdateMessage'] ?? '').toString(),
        maintenance: j['maintenance'] is Map
            ? MaintenanceConfig.fromJson((j['maintenance'] as Map).cast<String, dynamic>())
            : MaintenanceConfig.empty,
      );
}

enum UpdateRequirement {
  /// `current >= currentVersion` — nothing to do.
  none,

  /// `minVersion <= current < currentVersion` — show a dismissable prompt.
  optional,

  /// `current < minVersion` — block the app until the user updates.
  forced,
}

class UpdateCheck {
  final UpdateRequirement requirement;
  final AppConfig config;
  final String runningVersion;
  const UpdateCheck({
    required this.requirement,
    required this.config,
    required this.runningVersion,
  });

  /// The right store URL for the platform we're running on. Empty string
  /// when not configured for this platform — callers should treat that as
  /// "no update flow available" and skip the prompt.
  String get storeUrlForPlatform {
    if (Platform.isIOS) return _iosStoreUrl;
    if (Platform.isAndroid) return _androidStoreUrl;
    return '';
  }
}

/// Comparator for dotted-int versions ("1.2.3"). Returns -1/0/1 like
/// `compareTo`. Trailing segments default to 0, so "1.2" == "1.2.0".
int compareSemver(String a, String b) {
  final aParts = a.split('.').map((p) => int.tryParse(p) ?? 0).toList();
  final bParts = b.split('.').map((p) => int.tryParse(p) ?? 0).toList();
  final n = aParts.length > bParts.length ? aParts.length : bParts.length;
  for (var i = 0; i < n; i++) {
    final x = i < aParts.length ? aParts[i] : 0;
    final y = i < bParts.length ? bParts[i] : 0;
    if (x != y) return x < y ? -1 : 1;
  }
  return 0;
}

final appVersionCheckProvider = FutureProvider<UpdateCheck>((ref) async {
  final results = await Future.wait([
    PackageInfo.fromPlatform(),
    apiClient.get('/public/app-config'),
  ]);
  final info = results[0] as PackageInfo;
  final res = results[1];
  final body = (res is Map && res['data'] is Map)
      ? (res['data'] as Map).cast<String, dynamic>()
      : <String, dynamic>{};
  final config = AppConfig.fromJson(body);
  final running = info.version;

  final requirement = config.minVersion.isNotEmpty &&
          compareSemver(running, config.minVersion) < 0
      ? UpdateRequirement.forced
      : (config.currentVersion.isNotEmpty &&
              compareSemver(running, config.currentVersion) < 0
          ? UpdateRequirement.optional
          : UpdateRequirement.none);

  return UpdateCheck(
    requirement: requirement,
    config: config,
    runningVersion: running,
  );
});
