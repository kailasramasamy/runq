// Employee add / edit wizard. 5 steps:
//   1. Basic     — name, code, email, phone
//   2. Job       — joining date, designation, department, type, manager
//   3. Personal  — DOB, gender, blood group, address
//   4. Statutory — PAN, Aadhaar, UAN, PF/ESI numbers
//   5. Pay+Bank  — CTC / daily wage + bank trio + (contract) agency
//
// Validation mirrors the server's createEmployeeSchema: required fields
// gate the Continue button, regex-validated fields show inline errors,
// and the final Save POST/PUTs to /hr/employees(/:id).

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_form.dart';

class HrEmployeeFormScreen extends ConsumerStatefulWidget {
  /// Edit existing when set; create new when null.
  final HrEmployee? existing;
  /// Zero-based wizard step to open on. Lets the profile-setup checklist jump
  /// straight to the step holding a missing field.
  final int initialStep;
  const HrEmployeeFormScreen({super.key, this.existing, this.initialStep = 0});

  @override
  ConsumerState<HrEmployeeFormScreen> createState() => _HrEmployeeFormScreenState();
}

class _HrEmployeeFormScreenState extends ConsumerState<HrEmployeeFormScreen> {
  // Step 1 — Basic
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _code = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();

  // Step 2 — Job
  DateTime? _joiningDate;
  DateTime? _confirmationDate;
  String? _departmentId;
  String? _designationId;
  String _employmentType = 'permanent';
  String? _reportingToId;

  // Step 3 — Personal
  DateTime? _dob;
  String? _gender;
  String? _bloodGroup;
  final _address = TextEditingController();

  // Step 4 — Statutory
  final _pan = TextEditingController();
  final _aadhaar = TextEditingController();
  final _uan = TextEditingController();
  final _pfNumber = TextEditingController();
  final _esiNumber = TextEditingController();

  // Step 5 — Pay + Bank
  final _ctcAnnual = TextEditingController();
  final _bankName = TextEditingController();
  final _bankAcct = TextEditingController();
  final _bankIfsc = TextEditingController();
  final _agency = TextEditingController();
  final _dailyWage = TextEditingController();

  static final _panRegex = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
  static final _aadhaarRegex = RegExp(r'^[0-9]{12}$');
  static final _ifscRegex = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _firstName.text = e.firstName;
      _lastName.text = e.lastName ?? '';
      _code.text = e.employeeCode;
      _email.text = e.email ?? '';
      _phone.text = e.phone ?? '';
      _joiningDate = e.joiningDate;
      _confirmationDate = e.confirmationDate;
      _departmentId = e.departmentId;
      _designationId = e.designationId;
      _employmentType = e.employmentType;
      _reportingToId = e.reportingToId;
      _dob = e.dateOfBirth;
      _gender = e.gender;
      _bloodGroup = e.bloodGroup;
      _address.text = e.address ?? '';
      _pan.text = e.pan ?? '';
      _aadhaar.text = e.aadhaar ?? '';
      _uan.text = e.uan ?? '';
      _pfNumber.text = e.pfNumber ?? '';
      _esiNumber.text = e.esiNumber ?? '';
      _ctcAnnual.text = e.ctcAnnual == null ? '' : e.ctcAnnual!.toStringAsFixed(0);
      _bankName.text = e.bankName ?? '';
      _bankAcct.text = e.bankAccountNumber ?? '';
      _bankIfsc.text = e.bankIfsc ?? '';
      _agency.text = e.agency ?? '';
      _dailyWage.text = e.dailyWageRate == null ? '' : e.dailyWageRate!.toStringAsFixed(0);
    }
  }

  @override
  void dispose() {
    for (final c in [
      _firstName, _lastName, _code, _email, _phone, _address,
      _pan, _aadhaar, _uan, _pfNumber, _esiNumber,
      _ctcAnnual, _bankName, _bankAcct, _bankIfsc, _agency, _dailyWage,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  // ─── Validation gates per step ──────────────────────────────────────────

  bool _canAdvanceBasic() {
    // Code is optional on create — blank means the server continues the
    // tenant's numbering. Editing keeps it required: an existing record
    // already has one and blanking it would be a rename, not a default.
    if (widget.existing != null && _code.text.trim().isEmpty) return false;
    return _firstName.text.trim().isNotEmpty;
  }

  bool _canAdvanceJob() => _joiningDate != null;

  bool _canAdvancePersonal() => true;

  bool _canAdvanceStatutory() {
    // Empty is fine; if filled, must match server regex so the final
    // POST doesn't fail late.
    final pan = _pan.text.trim().toUpperCase();
    final aad = _aadhaar.text.trim();
    final uan = _uan.text.trim();
    if (pan.isNotEmpty && !_panRegex.hasMatch(pan)) return false;
    if (aad.isNotEmpty && !_aadhaarRegex.hasMatch(aad)) return false;
    if (uan.isNotEmpty && uan.length != 12) return false;
    return true;
  }

  bool _canAdvancePay() {
    final ifsc = _bankIfsc.text.trim().toUpperCase();
    if (ifsc.isNotEmpty && !_ifscRegex.hasMatch(ifsc)) return false;
    return true;
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Build a payload from currently-filled fields. When [partial] is true
  /// we omit unfilled optional fields and silently drop optional values that
  /// fail their regex (PAN / Aadhaar / IFSC) rather than failing the save —
  /// the user can fix them later from the same form.
  Map<String, dynamic> _buildPayload({required bool partial}) {
    String? clean(TextEditingController c, {bool upper = false, RegExp? regex}) {
      final v = c.text.trim();
      if (v.isEmpty) return null;
      final shaped = upper ? v.toUpperCase() : v;
      if (regex != null && !regex.hasMatch(shaped)) {
        // In strict mode the canAdvance gate already blocked this; in
        // partial mode we drop invalid fragments so a draft can still save.
        return partial ? null : shaped;
      }
      return shaped;
    }
    final body = <String, dynamic>{
      'employeeCode': _code.text.trim().isEmpty ? null : _code.text.trim(),
      'firstName': _firstName.text.trim(),
      'lastName': clean(_lastName),
      'email': clean(_email),
      'phone': clean(_phone),
      // Draft-saves without a joining date default to today; the server
      // requires the column on create and the user can fix it later.
      'joiningDate': _joiningDate != null
          ? _iso(_joiningDate!)
          : (partial && widget.existing == null ? _iso(DateTime.now()) : null),
      'confirmationDate': _confirmationDate == null ? null : _iso(_confirmationDate!),
      'departmentId': _departmentId,
      'designationId': _designationId,
      'employmentType': _employmentType,
      'reportingToId': _reportingToId,
      'dateOfBirth': _dob == null ? null : _iso(_dob!),
      'gender': _gender,
      'bloodGroup': _bloodGroup,
      'address': clean(_address),
      'pan': clean(_pan, upper: true, regex: _panRegex),
      'aadhaar': clean(_aadhaar, regex: _aadhaarRegex),
      'uan': clean(_uan),
      'pfNumber': clean(_pfNumber),
      'esiNumber': clean(_esiNumber),
      'ctcAnnual': double.tryParse(_ctcAnnual.text.trim()),
      'bankName': clean(_bankName),
      'bankAccountNumber': clean(_bankAcct),
      'bankIfsc': clean(_bankIfsc, upper: true, regex: _ifscRegex),
      if (_employmentType == 'wage' || _employmentType == 'contract') ...{
        'agency': clean(_agency),
        'dailyWageRate': double.tryParse(_dailyWage.text.trim()),
      },
    };
    body.removeWhere((_, v) => v == null);
    return body;
  }

  /// Save now from any step. For create, requires firstName + code; the
  /// joining date defaults to today. For edit, just patches whatever has
  /// been entered. Bypasses step-level canAdvance gating so a single-field
  /// edit doesn't force walking the whole wizard.
  Future<void> _savePartial() async {
    if (_firstName.text.trim().isEmpty ||
        (widget.existing != null && _code.text.trim().isEmpty)) {
      showRunqSnack(
        context,
        widget.existing == null
            ? 'Name is required.'
            : 'Name and employee code are required.',
        kind: SnackKind.error,
      );
      throw StateError('missing-minimum');
    }
    final isCreate = widget.existing == null;
    final body = _buildPayload(partial: true);
    if (isCreate && _joiningDate == null) {
      // Hint that we defaulted joining date so the user can fix it.
      // No-op if they later edit and set a real date.
      showRunqSnack(
        context,
        'Joining date defaulted to today — edit later if needed.',
        kind: SnackKind.info,
      );
    }
    try {
      if (isCreate) {
        await hrRepo.createEmployee(body);
      } else {
        await hrRepo.updateEmployee(widget.existing!.id, body);
      }
      ref.invalidate(hrEmployeesProvider);
      if (widget.existing != null) {
        ref.invalidate(hrEmployeeProvider(widget.existing!.id));
      }
      if (mounted) {
        showRunqSnack(
          context,
          isCreate ? 'Draft saved — finish details anytime.' : 'Changes saved.',
          kind: SnackKind.success,
        );
      }
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
      rethrow;
    }
  }

  /// Full-walk save fired from the wizard's final Continue button. Same
  /// payload shape as the partial save, but strict regex validation has
  /// already gated each step so invalid fragments can't slip through.
  Future<void> _save() async {
    final body = _buildPayload(partial: false);
    try {
      if (widget.existing == null) {
        await hrRepo.createEmployee(body);
      } else {
        await hrRepo.updateEmployee(widget.existing!.id, body);
      }
      ref.invalidate(hrEmployeesProvider);
      if (widget.existing != null) {
        ref.invalidate(hrEmployeeProvider(widget.existing!.id));
      }
      if (mounted) {
        showRunqSnack(
          context,
          widget.existing == null ? 'Employee added' : 'Employee updated',
          kind: SnackKind.success,
        );
      }
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    final deptsAsync = ref.watch(hrDepartmentsProvider);
    final desigsAsync = ref.watch(hrDesignationsProvider);
    final managersAsync = ref.watch(hrEmployeesProvider(const HrEmployeesQuery(status: 'active')));

    final isCreate = widget.existing == null;
    return HrWizard(
      title: isCreate ? 'New employee' : 'Edit employee',
      submitLabel: isCreate ? 'Add employee' : 'Save changes',
      initialStep: widget.initialStep,
      onSubmit: _save,
      // "Save draft" on create lets the user persist a partial record so
      // they don't lose progress when data trickles in. "Save changes" on
      // edit lets them update a single field without walking every step.
      secondaryActionLabel: isCreate ? 'Save draft' : 'Save changes',
      onSecondaryAction: _savePartial,
      secondaryActionEnabled: () => _canAdvanceBasic(),
      steps: [
        HrWizardStep(
          title: 'Basic',
          subtitle: 'Identity and contact for the employee record.',
          canAdvance: _canAdvanceBasic,
          build: (_) => _BasicStep(
            firstName: _firstName,
            lastName: _lastName,
            code: _code,
            suggestedCode: isCreate
                ? ref.watch(hrNextEmployeeCodeProvider).asData?.value
                : null,
            codeRequired: !isCreate,
            email: _email,
            phone: _phone,
            onChanged: () => setState(() {}),
          ),
        ),
        HrWizardStep(
          title: 'Job',
          subtitle: 'Where this employee fits in the org.',
          canAdvance: _canAdvanceJob,
          build: (_) => _JobStep(
            joiningDate: _joiningDate,
            confirmationDate: _confirmationDate,
            departmentId: _departmentId,
            designationId: _designationId,
            employmentType: _employmentType,
            reportingToId: _reportingToId,
            departments: deptsAsync.asData?.value ?? const [],
            designations: desigsAsync.asData?.value ?? const [],
            managers: managersAsync.asData?.value.data ?? const [],
            existingId: widget.existing?.id,
            onJoining: (d) => setState(() => _joiningDate = d),
            onConfirmation: (d) => setState(() => _confirmationDate = d),
            onDepartment: (d) => setState(() => _departmentId = d?.id),
            onDesignation: (d) => setState(() => _designationId = d?.id),
            onEmploymentType: (t) => setState(() => _employmentType = t ?? 'permanent'),
            onReportsTo: (e) => setState(() => _reportingToId = e?.id),
          ),
        ),
        HrWizardStep(
          title: 'Personal',
          subtitle: 'Optional — fill what you have on file.',
          canAdvance: _canAdvancePersonal,
          build: (_) => _PersonalStep(
            dob: _dob,
            gender: _gender,
            bloodGroup: _bloodGroup,
            address: _address,
            onDob: (d) => setState(() => _dob = d),
            onGender: (g) => setState(() => _gender = g),
            onBloodGroup: (b) => setState(() => _bloodGroup = b),
          ),
        ),
        HrWizardStep(
          title: 'Statutory',
          subtitle: 'Indian compliance IDs. Optional — server validates format if filled.',
          canAdvance: _canAdvanceStatutory,
          build: (_) => _StatutoryStep(
            pan: _pan,
            aadhaar: _aadhaar,
            uan: _uan,
            pfNumber: _pfNumber,
            esiNumber: _esiNumber,
            onChanged: () => setState(() {}),
          ),
        ),
        HrWizardStep(
          title: 'Pay + Bank',
          subtitle: 'Compensation and payout account. Skip if not set yet.',
          canAdvance: _canAdvancePay,
          build: (_) => _PayBankStep(
            employmentType: _employmentType,
            ctcAnnual: _ctcAnnual,
            bankName: _bankName,
            bankAcct: _bankAcct,
            bankIfsc: _bankIfsc,
            agency: _agency,
            dailyWage: _dailyWage,
            onChanged: () => setState(() {}),
          ),
        ),
      ],
    );
  }
}

// ─── Step bodies ──────────────────────────────────────────────────────────

class _BasicStep extends StatelessWidget {
  final TextEditingController firstName, lastName, code, email, phone;
  /// Code the server would assign if the field is left blank. Null while
  /// it loads, or on edit where the record already has one.
  final String? suggestedCode;
  /// Only on edit — an existing record can't have its code blanked.
  final bool codeRequired;
  final VoidCallback onChanged;
  const _BasicStep({
    required this.firstName,
    required this.lastName,
    required this.code,
    required this.suggestedCode,
    required this.codeRequired,
    required this.email,
    required this.phone,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return HrFormSection(
      children: [
        HrTextField(
          label: 'First name',
          controller: firstName,
          required: true,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => onChanged(),
        ),
        HrTextField(
          label: 'Last name',
          controller: lastName,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => onChanged(),
        ),
        HrTextField(
          label: 'Employee code',
          hint: suggestedCode == null
              ? 'VD041 / EMP-001'
              : 'Auto: $suggestedCode — or type your own',
          controller: code,
          required: codeRequired,
          textCapitalization: TextCapitalization.characters,
          formatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9\-_]'))],
          onChanged: (_) => onChanged(),
        ),
        HrTextField(
          label: 'Email',
          hint: 'name@example.com',
          controller: email,
          keyboard: TextInputType.emailAddress,
          textCapitalization: TextCapitalization.none,
        ),
        HrTextField(
          label: 'Phone',
          hint: '+91 98765 43210',
          controller: phone,
          keyboard: TextInputType.phone,
          textCapitalization: TextCapitalization.none,
        ),
      ],
    );
  }
}

class _JobStep extends StatelessWidget {
  final DateTime? joiningDate, confirmationDate;
  final String? departmentId, designationId, reportingToId;
  final String employmentType;
  final List<HrDepartment> departments;
  final List<HrDesignation> designations;
  final List<HrEmployee> managers;
  /// Edit mode — the employee being edited shouldn't appear as their own
  /// reports-to candidate.
  final String? existingId;
  final ValueChanged<DateTime?> onJoining, onConfirmation;
  final ValueChanged<HrDepartment?> onDepartment;
  final ValueChanged<HrDesignation?> onDesignation;
  final ValueChanged<String?> onEmploymentType;
  final ValueChanged<HrEmployee?> onReportsTo;

  const _JobStep({
    required this.joiningDate,
    required this.confirmationDate,
    required this.departmentId,
    required this.designationId,
    required this.employmentType,
    required this.reportingToId,
    required this.departments,
    required this.designations,
    required this.managers,
    required this.existingId,
    required this.onJoining,
    required this.onConfirmation,
    required this.onDepartment,
    required this.onDesignation,
    required this.onEmploymentType,
    required this.onReportsTo,
  });

  @override
  Widget build(BuildContext context) {
    HrDepartment? selectedDept;
    for (final d in departments) {
      if (d.id == departmentId) { selectedDept = d; break; }
    }
    HrDesignation? selectedDesig;
    for (final d in designations) {
      if (d.id == designationId) { selectedDesig = d; break; }
    }
    final eligibleManagers = managers.where((e) => e.id != existingId).toList();
    HrEmployee? selectedManager;
    for (final e in eligibleManagers) {
      if (e.id == reportingToId) { selectedManager = e; break; }
    }
    return HrFormSection(
      children: [
        HrDateField(
          label: 'Joining date',
          value: joiningDate,
          required: true,
          onChanged: onJoining,
        ),
        HrDateField(
          label: 'Confirmation date',
          value: confirmationDate,
          onChanged: onConfirmation,
        ),
        HrSelectField<String>(
          label: 'Employment type',
          value: employmentType,
          options: const ['permanent', 'contract', 'intern', 'consultant', 'wage'],
          display: (s) => switch (s) {
            'permanent' => 'Permanent',
            'contract'  => 'Contract',
            'intern'    => 'Intern',
            'consultant'=> 'Consultant',
            'wage'      => 'Wage worker',
            _           => s,
          },
          onChanged: onEmploymentType,
          required: true,
        ),
        HrSelectField<HrDepartment>(
          label: 'Department',
          value: selectedDept,
          options: departments,
          display: (d) => d.name,
          onChanged: onDepartment,
        ),
        HrSelectField<HrDesignation>(
          label: 'Designation',
          value: selectedDesig,
          options: designations,
          display: (d) => d.name,
          onChanged: onDesignation,
        ),
        HrSelectField<HrEmployee>(
          label: 'Reports to',
          value: selectedManager,
          options: eligibleManagers,
          display: (e) => '${e.displayName} · ${e.employeeCode}',
          onChanged: onReportsTo,
        ),
      ],
    );
  }
}

class _PersonalStep extends StatelessWidget {
  final DateTime? dob;
  final String? gender, bloodGroup;
  final TextEditingController address;
  final ValueChanged<DateTime?> onDob;
  final ValueChanged<String?> onGender, onBloodGroup;
  const _PersonalStep({
    required this.dob,
    required this.gender,
    required this.bloodGroup,
    required this.address,
    required this.onDob,
    required this.onGender,
    required this.onBloodGroup,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        HrFormSection(children: [
          HrDateField(
            label: 'Date of birth',
            value: dob,
            firstDate: DateTime(1940),
            lastDate: DateTime.now(),
            onChanged: onDob,
          ),
          HrSelectField<String>(
            label: 'Gender',
            value: gender,
            options: const ['male', 'female', 'other'],
            display: (s) => s[0].toUpperCase() + s.substring(1),
            onChanged: onGender,
          ),
          HrSelectField<String>(
            label: 'Blood group',
            value: bloodGroup,
            options: const ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
            display: (s) => s,
            onChanged: onBloodGroup,
          ),
        ]),
        const SizedBox(height: 12),
        HrFormSection(children: [
          HrTextField(
            label: 'Address',
            controller: address,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),
        ]),
      ],
    );
  }
}

class _StatutoryStep extends StatelessWidget {
  final TextEditingController pan, aadhaar, uan, pfNumber, esiNumber;
  final VoidCallback onChanged;
  const _StatutoryStep({
    required this.pan,
    required this.aadhaar,
    required this.uan,
    required this.pfNumber,
    required this.esiNumber,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return HrFormSection(
      children: [
        HrTextField(
          label: 'PAN',
          hint: 'ABCDE1234F',
          controller: pan,
          textCapitalization: TextCapitalization.characters,
          maxLength: 10,
          formatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]'))],
          onChanged: (_) => onChanged(),
        ),
        HrTextField(
          label: 'Aadhaar',
          hint: '12 digits',
          controller: aadhaar,
          keyboard: TextInputType.number,
          maxLength: 12,
          formatters: [FilteringTextInputFormatter.digitsOnly],
          textCapitalization: TextCapitalization.none,
          onChanged: (_) => onChanged(),
        ),
        HrTextField(
          label: 'UAN (PF)',
          hint: '12 digits',
          controller: uan,
          keyboard: TextInputType.number,
          maxLength: 12,
          formatters: [FilteringTextInputFormatter.digitsOnly],
          textCapitalization: TextCapitalization.none,
          onChanged: (_) => onChanged(),
        ),
        HrTextField(
          label: 'PF number',
          controller: pfNumber,
          textCapitalization: TextCapitalization.characters,
        ),
        HrTextField(
          label: 'ESI number',
          controller: esiNumber,
          textCapitalization: TextCapitalization.characters,
        ),
      ],
    );
  }
}

class _PayBankStep extends StatelessWidget {
  final String employmentType;
  final TextEditingController ctcAnnual, bankName, bankAcct, bankIfsc, agency, dailyWage;
  final VoidCallback onChanged;
  const _PayBankStep({
    required this.employmentType,
    required this.ctcAnnual,
    required this.bankName,
    required this.bankAcct,
    required this.bankIfsc,
    required this.agency,
    required this.dailyWage,
    required this.onChanged,
  });

  bool get _isWageOrContract =>
      employmentType == 'wage' || employmentType == 'contract';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        HrFormSection(
          title: 'Compensation',
          children: [
            HrTextField(
              label: 'Annual CTC (₹)',
              hint: '600000',
              controller: ctcAnnual,
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textCapitalization: TextCapitalization.none,
            ),
            if (_isWageOrContract)
              HrTextField(
                label: 'Daily wage rate (₹)',
                controller: dailyWage,
                keyboard: const TextInputType.numberWithOptions(decimal: true),
                formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                textCapitalization: TextCapitalization.none,
              ),
            if (_isWageOrContract)
              HrTextField(
                label: 'Agency',
                hint: 'Staffing partner name',
                controller: agency,
                textCapitalization: TextCapitalization.words,
              ),
          ],
        ),
        const SizedBox(height: 12),
        HrFormSection(
          title: 'Payout account',
          children: [
            HrTextField(
              label: 'Bank name',
              controller: bankName,
              textCapitalization: TextCapitalization.words,
            ),
            HrTextField(
              label: 'Account number',
              controller: bankAcct,
              keyboard: TextInputType.number,
              formatters: [FilteringTextInputFormatter.digitsOnly],
              textCapitalization: TextCapitalization.none,
            ),
            HrTextField(
              label: 'IFSC',
              hint: 'SBIN0001234',
              controller: bankIfsc,
              textCapitalization: TextCapitalization.characters,
              maxLength: 11,
              formatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]'))],
              onChanged: (_) => onChanged(),
            ),
          ],
        ),
      ],
    );
  }
}
