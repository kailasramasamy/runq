// Single source of truth for the user's *effective* role in the mobile
// app. Derives from /hr/me (which already merges the system role with the
// "has direct reports" signal) so every gate in the UI reads the same enum.
//
// Mapping:
//   admin    — system role owner | accountant | hr (People Ops persona)
//   manager  — non-admin with `hasReports = true` (set server-side via
//              employees.reportingToId backfill) OR a department head
//              (server includes them in the manager scope)
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

enum AppRole { admin, hr, manager, employee }

extension AppRoleX on AppRole {
  /// Finance access is owner/accountant only. HR and Managers are walled
  /// off — they only see the HR module.
  bool get canAccessFinance => this == AppRole.admin;
  /// Manager dashboards + persona toggle — admins, HR, and team managers.
  bool get canSeeManagerPersona =>
      this == AppRole.admin || this == AppRole.hr || this == AppRole.manager;
  /// Only admins have a Finance module to flip into. HR is HR-only.
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
  if (r == 'hr') return AppRole.hr;
  if (me.isManager) return AppRole.manager;
  return AppRole.employee;
}
