// HR "More" — profile card, persona toggle, quick-access grid, and
// grouped settings (HR setup, payroll config, account). Most settings
// rows are stubs that defer the heavy config to the web app — the mobile
// surface stays glanceable.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/app_module_provider.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_widgets.dart';

class HrMoreScreen extends ConsumerWidget {
  const HrMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final me = ref.watch(hrMeProvider).asData?.value;
    final role = ref.watch(appRoleProvider);
    // The profile card opens the user's own employee detail screen — but
    // only when a linked employee record exists. OTP-only users with no
    // such link get a static card (no chevron, no tap target).
    final empId = me?.employee?.id;

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('More'),
        leading: Navigator.of(context).canPop()
            ? IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              )
            : null,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 140),
        physics: const BouncingScrollPhysics(),
        children: [
          // Profile card
          Material(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            child: InkWell(
              onTap: empId != null ? () => context.push('/hr/people/$empId') : null,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                  border: Border.all(color: t.hairline, width: 0.5),
                  boxShadow: RunqShadows.card,
                ),
                child: Row(
                  children: [
                    HrAvatar(name: me?.displayName ?? '?', photoUrl: me?.employee?.photoUrl, employeeId: me?.employee?.id, size: 56, showOnlineDot: true, useGradient: true),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(me?.displayName ?? '—', style: RunqText.h3.copyWith(color: t.ink)),
                          const SizedBox(height: 2),
                          Text(
                            [
                              if (me?.systemRole != null) me!.systemRole,
                              if (me?.employee?.employeeCode != null && me!.employee!.employeeCode.isNotEmpty) me.employee!.employeeCode,
                            ].join(' · '),
                            style: RunqText.caption.copyWith(color: t.muted),
                          ),
                        ],
                      ),
                    ),
                    if (empId != null) Icon(Icons.chevron_right_rounded, color: t.muted),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _QuickGrid(
            items: [
              _QA(Icons.fingerprint_outlined, 'Check in', const Color(0xFF0EA5E9), () => context.push('/hr/check-in')),
              _QA(Icons.description_outlined, 'My Payslip', const Color(0xFF7C3AED), () => context.push('/hr/pay')),
              _QA(Icons.event_available_outlined, 'Leaves', const Color(0xFF06B6D4), () => context.push('/hr/leaves')),
              _QA(Icons.receipt_outlined, 'My Claims', const Color(0xFFD97706), () => context.push('/hr/pay?tab=expenses')),
              _QA(Icons.groups_outlined, 'Team', const Color(0xFF16A34A), () => context.push('/hr/people')),
              _QA(Icons.account_tree_outlined, 'Org chart', const Color(0xFF0D9488), () => context.push('/hr/org-chart')),
              _QA(Icons.help_outline, 'Helpdesk', const Color(0xFFEC4899), () => context.push('/hr/helpdesk')),
            ],
          ),
          const SizedBox(height: 12),
          _SettingsGroup(
            title: 'Self-service',
            rows: [
              _Row(Icons.event_busy_outlined, 'Regularize attendance', onTap: () => context.push('/hr/regularizations')),
              _Row(Icons.account_balance_outlined, 'Tax declarations (12BB)', onTap: () => context.push('/hr/tax-declarations')),
              _Row(Icons.credit_card_outlined, 'My loans', onTap: () => context.push('/hr/loans')),
              _Row(Icons.assignment_turned_in_outlined, 'My onboarding', onTap: () => context.push('/hr/onboarding')),
              _Row(Icons.contact_page_outlined, 'My resume', onTap: () => context.push('/hr/my-resume')),
              _Row(Icons.article_outlined, 'My letters', onTap: () => context.push('/hr/letters')),
              _Row(Icons.flag_circle_outlined, 'My performance', onTap: () => context.push('/hr/performance')),
              _Row(Icons.star_outline_rounded, 'Rewards', onTap: () => context.push('/hr/rewards')),
            ],
          ),
          const SizedBox(height: 16),
          // HR setup + Payroll are configuration surfaces — admins and HR
          // personnel only. Managers can approve leave but don't configure
          // the system; employees see neither group.
          if (role.canManageHrSetup) ...[
            _SettingsGroup(
              title: 'HR setup',
              rows: [
                _Row(Icons.people_alt_outlined, 'Employees',
                    onTap: () => context.push('/hr/people')),
                _Row(Icons.apartment_outlined, 'Departments',
                    onTap: () => context.push('/hr/departments')),
                _Row(Icons.badge_outlined, 'Designations',
                    onTap: () => context.push('/hr/designations')),
                // Contract / wage workers are paid outside payroll —
                // engagement, advances and settlement all live here.
                _Row(Icons.assignment_ind_outlined, 'Contracts',
                    onTap: () => context.push('/hr/contracts')),
                _Row(Icons.event_note_outlined, 'Leave types', onTap: () => context.push('/hr/leave-types')),
                _Row(Icons.tune_outlined, 'Adjust leave balance',
                    onTap: () => context.push('/hr/adjust-leave-balance')),
                _Row(Icons.schedule_outlined, 'Shifts',
                    onTap: () => context.push('/hr/shifts')),
                _Row(Icons.flag_outlined, 'Holidays', onTap: () => context.push('/hr/holidays')),
              ],
            ),
            const SizedBox(height: 12),
            _SettingsGroup(
              title: 'Payroll',
              rows: [
                _Row(Icons.calculate_outlined, 'Payroll runs',
                    onTap: () => context.push('/hr/payroll-runs')),
                _Row(Icons.tune_outlined, 'Salary components',
                    onTap: () => context.push('/hr/salary-components')),
                _Row(Icons.layers_outlined, 'Salary structures',
                    onTap: () => context.push('/hr/salary-structures')),
              ],
            ),
            const SizedBox(height: 12),
          ],
          _SettingsGroup(
            title: 'Account',
            rows: [
              _Row(Icons.dark_mode_outlined, 'Appearance',
                  onTap: () => context.push('/profile/appearance')),
              _Row(Icons.notifications_outlined, 'Notifications',
                  onTap: () => context.push('/profile/notifications')),
              _Row(Icons.translate_outlined, 'Language',
                  onTap: () => context.push('/profile/language')),
              // Module switch is admin-only — managers + employees have no
              // Finance surfaces, so the row would route them to a screen
              // the redirect immediately bounces back from.
              if (role.canSwitchModule)
                _Row(Icons.swap_horiz_rounded, 'Switch to Finance', onTap: () async {
                  await ref.read(appModuleProvider.notifier).setModule(AppModule.finance);
                  if (context.mounted) context.go('/home');
                }),
              _Row(Icons.logout_rounded, 'Sign out', danger: true, onTap: () async {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/signin');
              }),
            ],
          ),
          const SizedBox(height: 16),
          Center(
            child: Text('runQ HR · v1.0', style: RunqText.caption.copyWith(color: t.muted2)),
          ),
        ],
      ),
    );
  }
}

class _QA {
  final IconData icon;
  final String label;
  final Color tint;
  final VoidCallback onTap;
  const _QA(this.icon, this.label, this.tint, this.onTap);
}

class _QuickGrid extends StatelessWidget {
  final List<_QA> items;
  const _QuickGrid({required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.5,
      children: items.map((qa) => InkWell(
        onTap: qa.onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: qa.tint.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: qa.tint.withValues(alpha: 0.18), width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: qa.tint.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(10)),
                child: Icon(qa.icon, color: qa.tint, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(qa.label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
            ],
          ),
        ),
      )).toList(),
    );
  }
}

class _Row {
  final IconData icon;
  final String label;
  final bool danger;
  final VoidCallback? onTap;
  const _Row(this.icon, this.label, {this.danger = false, this.onTap});
}

class _SettingsGroup extends StatelessWidget {
  final String title;
  final List<_Row> rows;
  const _SettingsGroup({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(title.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                InkWell(
                  onTap: rows[i].onTap,
                  borderRadius: i == 0
                      ? const BorderRadius.vertical(top: Radius.circular(RunqRadii.smallCard))
                      : (i == rows.length - 1
                          ? const BorderRadius.vertical(bottom: Radius.circular(RunqRadii.smallCard))
                          : BorderRadius.zero),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                    child: Row(
                      children: [
                        Icon(rows[i].icon, size: 18, color: rows[i].danger ? const Color(0xFFDC2626) : t.muted),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(rows[i].label,
                              style: RunqText.body.copyWith(
                                color: rows[i].danger ? const Color(0xFFDC2626) : t.ink,
                              )),
                        ),
                        if (!rows[i].danger) Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
                      ],
                    ),
                  ),
                ),
                if (i < rows.length - 1) Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 44),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
