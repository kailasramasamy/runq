/// Single source of truth for the user-facing app version. Keep in sync
/// with the `version:` field in `pubspec.yaml` when bumping for a release —
/// pulling it in via package_info_plus would work but adds a dependency for
/// a value that almost never changes between releases.
const String kAppVersion = '1.0.0';
