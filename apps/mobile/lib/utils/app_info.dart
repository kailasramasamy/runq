import 'package:package_info_plus/package_info_plus.dart';

/// Resolved at app startup from the platform (pubspec `version:` is the
/// source of truth, baked into the iOS/Android bundle). Falls back to
/// '—' if `loadAppInfo()` hasn't been awaited yet, which only happens
/// before runApp returns.
String _appVersion = '—';
String _appBuild = '';

String get kAppVersion => _appVersion;

/// Display form, e.g. "1.0.0 (2)". Empty build defaults to bare version.
String get kAppVersionLabel =>
    _appBuild.isEmpty ? _appVersion : '$_appVersion ($_appBuild)';

Future<void> loadAppInfo() async {
  final info = await PackageInfo.fromPlatform();
  _appVersion = info.version;
  _appBuild = info.buildNumber;
}
