part of '../hr_employee_detail_screen.dart';

// Info tab: profile-completeness card, missing-field routing, the Info
// tab body itself, and the shared Section/InfoRow list primitives.

// ─── Info tab ─────────────────────────────────────────────────────────────

// ─── Profile setup guidance ───────────────────────────────────────────────

/// Top-of-Info card that scores the profile and guides HR to the missing
/// pieces. Each incomplete item links straight to the action that fixes it.
class _ProfileSetupCard extends StatelessWidget {
  final HrEmployee emp;
  final bool canManage;
  const _ProfileSetupCard({required this.emp, required this.canManage});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final c = employeeCompleteness(emp);
    final crit = c.criticalMissing;
    final accent = c.isComplete
        ? const Color(0xFF16A34A)
        : (crit > 0 ? const Color(0xFFDC2626) : const Color(0xFFD97706));

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(
          color: c.isComplete ? t.hairline : accent.withValues(alpha: 0.45),
          width: c.isComplete ? 0.5 : 1,
        ),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(c.isComplete ? Icons.check_circle_rounded : Icons.assignment_outlined,
                  color: accent, size: 18),
              const SizedBox(width: 8),
              Text('Profile setup',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const Spacer(),
              Text('${c.percent}%',
                  style: RunqText.tabular(size: 15, w: FontWeight.w800, color: accent)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: c.fraction,
              minHeight: 6,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation<Color>(accent),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            c.isComplete
                ? 'All set — every key detail is filled in.'
                : '${c.missing.length} to add${crit > 0 ? ' · $crit critical for payroll' : ''}',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          if (!c.isComplete) ...[
            const SizedBox(height: 8),
            Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
            for (final m in c.missing)
              _MissingRow(
                check: m,
                onTap: canManage ? () => _runProfileFix(context, m, emp) : null,
              ),
          ],
        ],
      ),
    );
  }
}

class _MissingRow extends StatelessWidget {
  final ProfileCheck check;
  final VoidCallback? onTap;
  const _MissingRow({required this.check, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            Icon(check.icon, size: 18, color: t.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(check.label, style: RunqText.body.copyWith(color: t.ink)),
            ),
            if (check.critical) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFDC2626).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('Critical',
                    style: RunqText.label.copyWith(color: const Color(0xFFDC2626))),
              ),
              const SizedBox(width: 8),
            ],
            if (onTap != null)
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

/// Routes a missing-item tap to the action that fixes it. Each action already
/// invalidates hrEmployeeProvider, so the card re-scores on return.
void _runProfileFix(BuildContext context, ProfileCheck check, HrEmployee emp) {
  switch (check.fix) {
    case ProfileFix.edit:
      // Jump straight to the wizard step that holds the tapped field.
      context.push('/hr/employees/edit?step=${check.editStep}', extra: emp);
    case ProfileFix.photo:
      _pickAndUploadPhoto(context, emp);
    case ProfileFix.manager:
      _setReportingManager(context, emp);
    case ProfileFix.salary:
      showAssignSalarySheet(context, emp);
  }
}

class _InfoTab extends StatelessWidget {
  final HrEmployee emp;
  final bool canManage;
  const _InfoTab({required this.emp, required this.canManage});

  @override
  Widget build(BuildContext context) {
    // Sections mirror the web HR employee page (Personal / Statutory /
    // Payroll settings / Bank / Contract labour). Dept/designation/code
    // already live in the hero so they don't repeat here.
    final personal = <_InfoRow>[
      if (emp.email != null) _InfoRow(icon: Icons.mail_outline_rounded, label: 'Email', value: emp.email!),
      if (emp.phone != null) _InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: emp.phone!),
      if (emp.dateOfBirth != null)
        _InfoRow(icon: Icons.cake_outlined, label: 'Date of birth', value: _date(emp.dateOfBirth!)),
      if (emp.gender != null) _InfoRow(icon: Icons.person_outline_rounded, label: 'Gender', value: _cap(emp.gender!)),
      if (emp.bloodGroup != null)
        _InfoRow(icon: Icons.bloodtype_outlined, label: 'Blood group', value: emp.bloodGroup!),
      if (emp.address != null)
        _InfoRow(icon: Icons.location_on_outlined, label: 'Address', value: emp.address!),
    ];
    final statutory = <_InfoRow>[
      if (emp.pan != null) _InfoRow(icon: Icons.fingerprint_rounded, label: 'PAN', value: emp.pan!),
      if (emp.aadhaarMasked != null)
        _InfoRow(icon: Icons.credit_card_outlined, label: 'Aadhaar', value: emp.aadhaarMasked!),
      if (emp.uan != null) _InfoRow(icon: Icons.account_balance_outlined, label: 'UAN (PF)', value: emp.uan!),
      if (emp.pfNumber != null)
        _InfoRow(icon: Icons.savings_outlined, label: 'PF number', value: emp.pfNumber!),
      if (emp.esiNumber != null)
        _InfoRow(icon: Icons.medical_services_outlined, label: 'ESI number', value: emp.esiNumber!),
    ];
    final payroll = <_InfoRow>[
      if (emp.ctcAnnual != null) ...[
        _InfoRow(icon: Icons.calendar_month_outlined, label: 'Monthly salary', value: '${hrFormatINR(emp.ctcAnnual! / 12)} / month'),
        _InfoRow(icon: Icons.payments_outlined, label: 'Annual CTC', value: hrFormatINR(emp.ctcAnnual!)),
      ],
      _InfoRow(icon: Icons.category_outlined, label: 'Employment type', value: _emp(emp.employmentType)),
      _InfoRow(icon: Icons.toggle_on_outlined, label: 'Status', value: _statusLabel(emp.status)),
      if (emp.joiningDate != null)
        _InfoRow(icon: Icons.event_outlined, label: 'Joined', value: _date(emp.joiningDate!)),
      if (emp.confirmationDate != null)
        _InfoRow(icon: Icons.verified_outlined, label: 'Confirmed', value: _date(emp.confirmationDate!)),
      if (emp.exitDate != null)
        _InfoRow(icon: Icons.logout_rounded, label: 'Exited', value: _date(emp.exitDate!)),
    ];
    final bank = <_InfoRow>[
      if (emp.bankName != null)
        _InfoRow(icon: Icons.account_balance_rounded, label: 'Bank', value: emp.bankName!),
      if (emp.bankAccountMasked != null)
        _InfoRow(icon: Icons.account_balance_wallet_outlined, label: 'Account no.', value: emp.bankAccountMasked!),
      if (emp.bankIfsc != null) _InfoRow(icon: Icons.code_rounded, label: 'IFSC', value: emp.bankIfsc!),
    ];
    final contract = <_InfoRow>[
      if (emp.agency != null) _InfoRow(icon: Icons.business_outlined, label: 'Agency', value: emp.agency!),
      if (emp.dailyWageRate != null)
        _InfoRow(icon: Icons.engineering_outlined, label: 'Daily wage rate', value: hrFormatINR(emp.dailyWageRate!)),
    ];
    // Always shown — surfaces the reporting line and signals it's unset.
    // Change it via the … menu → Set reporting manager.
    final reporting = <_InfoRow>[
      _InfoRow(
        icon: Icons.account_tree_outlined,
        label: 'Reports to',
        value: emp.reportingToName ?? 'Not set',
      ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        _ProfileSetupCard(emp: emp, canManage: canManage),
        const SizedBox(height: 14),
        _ContactRail(emp: emp),
        const SizedBox(height: 14),
        _Section(title: 'Reporting', rows: reporting),
        const SizedBox(height: 12),
        if (personal.isNotEmpty) ...[
          _Section(title: 'Personal', rows: personal),
          const SizedBox(height: 12),
        ],
        if (statutory.isNotEmpty) ...[
          _Section(title: 'Statutory', rows: statutory),
          const SizedBox(height: 12),
        ],
        if (payroll.isNotEmpty) ...[
          _Section(title: 'Payroll settings', rows: payroll),
          const SizedBox(height: 12),
        ],
        if (bank.isNotEmpty) ...[
          _Section(title: 'Bank details', rows: bank),
          const SizedBox(height: 12),
        ],
        if (contract.isNotEmpty)
          _Section(title: 'Contract labour', rows: contract),
      ],
    );
  }

  static String _statusLabel(String s) => switch (s) {
        'active' => 'Active',
        'on_leave' => 'On leave',
        'inactive' => 'Inactive',
        'terminated' => 'Terminated',
        _ => _cap(s),
      };

  static String _emp(String s) => switch (s) {
        'permanent' => 'Permanent',
        'contract'  => 'Contract',
        'intern'    => 'Intern',
        'consultant'=> 'Consultant',
        'wage'      => 'Wage worker',
        _           => _cap(s),
      };
  static String _cap(String s) =>
      s.isEmpty ? s : s.substring(0, 1).toUpperCase() + s.substring(1);
  static String _date(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

// ─── Section + Row (reused by Info tab) ───────────────────────────────────

class _Section extends StatelessWidget {
  final String title;
  final List<_InfoRow> rows;
  const _Section({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(
            title.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                rows[i],
                if (i < rows.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 46),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label, value;
  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 15, color: HrColors.brand(context)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: RunqText.bodyStrong.copyWith(color: t.ink),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
