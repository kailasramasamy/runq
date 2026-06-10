// Profile-completeness checklist for an employee. A single, navigation-free
// source of truth shared by the People list card (a setup-progress bar) and
// the employee detail (a guided "what's missing" card). Computed entirely
// from the employee row the list/detail endpoints already return, so it
// needs no extra fetch.

library;

import 'package:flutter/material.dart';
import '../../api/hr_models.dart';

/// Where an HR user fixes a missing item. Mapped to a concrete action by the
/// detail screen, keeping this file free of routing/UI dependencies.
enum ProfileFix { edit, photo, manager, salary }

class ProfileCheck {
  final String label;
  final bool done;
  final bool critical;
  final IconData icon;
  final ProfileFix fix;
  const ProfileCheck({
    required this.label,
    required this.done,
    required this.critical,
    required this.icon,
    required this.fix,
  });
}

class ProfileCompleteness {
  final List<ProfileCheck> checks;
  const ProfileCompleteness(this.checks);

  int get total => checks.length;
  int get doneCount => checks.where((c) => c.done).length;
  double get fraction => total == 0 ? 1 : doneCount / total;
  int get percent => (fraction * 100).round();
  bool get isComplete => doneCount == total;

  /// Missing items in fill order — criticals first (they lead the list).
  List<ProfileCheck> get missing => checks.where((c) => !c.done).toList();
  int get criticalMissing =>
      checks.where((c) => !c.done && c.critical).length;
}

bool _has(String? s) => s != null && s.trim().isNotEmpty;

/// Payroll-ready definition: Phone, Department, Compensation, Bank account
/// and PAN are critical — they block payroll / statutory compliance. The
/// rest are recommended. Order is the sequence HR should ideally fill, with
/// the critical items first so [ProfileCompleteness.missing] surfaces them
/// at the top.
ProfileCompleteness employeeCompleteness(HrEmployee e) {
  return ProfileCompleteness([
    ProfileCheck(
        label: 'Phone number',
        done: _has(e.phone),
        critical: true,
        icon: Icons.phone_outlined,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'Department',
        done: _has(e.departmentId),
        critical: true,
        icon: Icons.apartment_outlined,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'Compensation',
        done: e.ctcAnnual != null || e.dailyWageRate != null,
        critical: true,
        icon: Icons.payments_outlined,
        fix: ProfileFix.salary),
    ProfileCheck(
        label: 'Bank account',
        done: _has(e.bankAccountNumber) && _has(e.bankIfsc),
        critical: true,
        icon: Icons.account_balance_outlined,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'PAN',
        done: _has(e.pan),
        critical: true,
        icon: Icons.fingerprint_rounded,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'Designation',
        done: _has(e.designationId),
        critical: false,
        icon: Icons.badge_outlined,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'Reporting manager',
        done: _has(e.reportingToId),
        critical: false,
        icon: Icons.account_tree_outlined,
        fix: ProfileFix.manager),
    ProfileCheck(
        label: 'Aadhaar',
        done: _has(e.aadhaar),
        critical: false,
        icon: Icons.credit_card_outlined,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'Date of birth',
        done: e.dateOfBirth != null,
        critical: false,
        icon: Icons.cake_outlined,
        fix: ProfileFix.edit),
    ProfileCheck(
        label: 'Photo',
        done: _has(e.photoUrl),
        critical: false,
        icon: Icons.photo_camera_outlined,
        fix: ProfileFix.photo),
  ]);
}
