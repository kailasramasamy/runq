// Single source of truth for the user's *effective* role in the mobile
// app. Derives from /hr/me (which already merges the system role with the
// "has direct reports" signal) so every gate in the UI reads the same enum.
//
// Mapping:
//   admin    — system role owner | accountant
//   manager  — non-admin with `hasReports = true` (set server-side via
//              employees.reportingToId backfill)
//   employee — everything else (viewer, client_owner, or a user with no
//              employee row at all)
//
// Resolution order:
//   - while /hr/me is loading → AppRole.employee (least-privileged default;
//     no premature gating, no flicker into a Finance landing)
//   - on success → mapped per above
//   - on error → employee (same fallback so a broken HR backend doesn't
//     lock people out of HR self-service)

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/hr_models.dart';
import 'hr_providers.dart';

enum AppRole { admin, manager, employee }

extension AppRoleX on AppRole {
  bool get canAccessFinance => this == AppRole.admin;
  bool get canSeeManagerPersona => this == AppRole.admin || this == AppRole.manager;
  bool get canSwitchModule => this == AppRole.admin;
}

/// Returns the effective role for the logged-in user. Sync — collapses
/// the async HrMe load to a single enum so route redirects can read it
/// without `await`.
final appRoleProvider = Provider<AppRole>((ref) {
  final me = ref.watch(hrMeProvider);
  return me.maybeWhen(
    data: _classify,
    orElse: () => AppRole.employee,
  );
});

/// Same as [appRoleProvider] but yields null while HrMe is still loading.
/// Router redirects use this to defer routing decisions until role is
/// known — otherwise a freshly-signed-in admin would briefly land on
/// /hr/home before being moved to /home.
final appRoleAsyncProvider = Provider<AsyncValue<AppRole>>((ref) {
  final me = ref.watch(hrMeProvider);
  return me.whenData(_classify);
});

AppRole _classify(HrMe me) {
  final r = me.systemRole.toLowerCase();
  if (r == 'owner' || r == 'accountant') return AppRole.admin;
  if (me.isManager) return AppRole.manager;
  return AppRole.employee;
}
