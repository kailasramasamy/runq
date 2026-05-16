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
  const HrEmployeeFormScreen({super.key, this.existing});

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
    return _firstName.text.trim().isNotEmpty && _code.text.trim().isNotEmpty;
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

  Future<void> _save() async {
    final body = <String, dynamic>{
      'employeeCode': _code.text.trim(),
      'firstName': _firstName.text.trim(),
      'lastName': _str(_lastName),
      'email': _str(_email),
      'phone': _str(_phone),
      'joiningDate': _iso(_joiningDate!),
      'confirmationDate': _confirmationDate == null ? null : _iso(_confirmationDate!),
      'departmentId': _departmentId,
      'designationId': _designationId,
      'employmentType': _employmentType,
      'reportingToId': _reportingToId,
      'dateOfBirth': _dob == null ? null : _iso(_dob!),
      'gender': _gender,
      'bloodGroup': _str(_bloodGroup == null ? null : TextEditingController(text: _bloodGroup!)),
      'address': _str(_address),
      'pan': _str(_pan, upper: true),
      'aadhaar': _str(_aadhaar),
      'uan': _str(_uan),
      'pfNumber': _str(_pfNumber),
      'esiNumber': _str(_esiNumber),
      'ctcAnnual': double.tryParse(_ctcAnnual.text.trim()),
      'bankName': _str(_bankName),
      'bankAccountNumber': _str(_bankAcct),
      'bankIfsc': _str(_bankIfsc, upper: true),
      if (_employmentType == 'wage' || _employmentType == 'contract') ...{
        'agency': _str(_agency),
        'dailyWageRate': double.tryParse(_dailyWage.text.trim()),
      },
    };
    // Strip nulls so the server doesn't overwrite untouched columns to
    // null on edit. (Schema treats absent ≠ null.)
    body.removeWhere((_, v) => v == null);

    try {
      if (widget.existing == null) {
        await hrRepo.createEmployee(body);
      } else {
        await hrRepo.updateEmployee(widget.existing!.id, body);
      }
      // Invalidate the cached list + detail so the change is visible.
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

  /// Pull a non-empty trimmed string from a controller, optionally upper.
  /// Returns null when blank so the server's "ignore absent" semantics
  /// pick the right behaviour on edit.
  String? _str(dynamic c, {bool upper = false}) {
    final raw = c is TextEditingController
        ? c.text.trim()
        : (c is String ? c.trim() : '');
    if (raw.isEmpty) return null;
    return upper ? raw.toUpperCase() : raw;
  }

  @override
  Widget build(BuildContext context) {
    final deptsAsync = ref.watch(hrDepartmentsProvider);
    final desigsAsync = ref.watch(hrDesignationsProvider);
    final managersAsync = ref.watch(hrEmployeesProvider(const HrEmployeesQuery(status: 'active')));

    return HrWizard(
      title: widget.existing == null ? 'New employee' : 'Edit employee',
      submitLabel: widget.existing == null ? 'Add employee' : 'Save changes',
      onSubmit: _save,
      steps: [
        HrWizardStep(
          title: 'Basic',
          subtitle: 'Identity and contact for the employee record.',
          canAdvance: _canAdvanceBasic,
          build: (_) => _BasicStep(
            firstName: _firstName,
            lastName: _lastName,
            code: _code,
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
  final VoidCallback onChanged;
  const _BasicStep({
    required this.firstName,
    required this.lastName,
    required this.code,
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
          hint: 'VD041 / EMP-001',
          controller: code,
          required: true,
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
