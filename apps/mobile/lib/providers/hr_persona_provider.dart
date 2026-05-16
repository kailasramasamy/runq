// Persona toggle within the HR module: `employee` (self-service view) or
// `manager` (team dashboards + approvals).
//
// Defaulting rules:
//   - Employee role: locked to `employee`. The toggle widget itself is
//     hidden for employees so they never enter manager state.
//   - Manager / Admin: starts at `manager` on first sign-in (so a team
//     lead lands on team dashboards by default), but the user's own
//     toggle overrides — once they flip to `employee`, that sticks until
//     they flip back.
//
// Persistence:
//   - `_prefKey` stores 'employee' | 'manager' once the user has made an
//     explicit choice.
//   - `_seededKey` records whether we've already done a one-time
//     role-based seed, so a manager downgraded to employee doesn't get
//     re-defaulted back into manager view on every cold start.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_role_provider.dart';

enum HrPersona { employee, manager }

const _prefKey = 'hr_persona_v1';
const _seededKey = 'hr_persona_seeded_v1';

class HrPersonaNotifier extends StateNotifier<HrPersona> {
  HrPersonaNotifier() : super(HrPersona.employee) {
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefKey);
    if (raw == 'manager') state = HrPersona.manager;
  }

  Future<void> setPersona(HrPersona p) async {
    if (state == p) return;
    state = p;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, p == HrPersona.manager ? 'manager' : 'employee');
    // Setting explicitly counts as having been seeded — don't override
    // the user's choice on the next role refresh.
    await prefs.setBool(_seededKey, true);
  }

  /// One-time default biased by role: managers + admins land on the
  /// manager view by default. Skipped once the user has explicitly
  /// toggled. Always forces `employee` for the employee role so a stale
  /// stored value can't leak manager UI to a downgraded user.
  Future<void> seedFromRole(AppRole role) async {
    final prefs = await SharedPreferences.getInstance();
    if (role == AppRole.employee) {
      // Hard-floor for employees, regardless of past prefs.
      if (state != HrPersona.employee) state = HrPersona.employee;
      await prefs.setString(_prefKey, 'employee');
      return;
    }
    final seeded = prefs.getBool(_seededKey) ?? false;
    if (seeded) return;
    state = HrPersona.manager;
    // Persist BOTH keys so the next cold start's `_restore` picks up
    // manager directly — without this, _prefKey stays at its default
    // and the user flickers into employee view before this seed runs.
    await prefs.setString(_prefKey, 'manager');
    await prefs.setBool(_seededKey, true);
  }
}

final hrPersonaProvider =
    StateNotifierProvider<HrPersonaNotifier, HrPersona>((ref) => HrPersonaNotifier());
