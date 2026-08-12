// Assign a salary (CTC + optional structure) to an employee. Called from
// the employee detail "…" menu. The server inserts a new
// `employee_salary` row and freezes a snapshot of the chosen structure's
// components — historical edits to the structure won't retro-affect the
// frozen run.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_form.dart';

Future<void> showAssignSalarySheet(BuildContext context, HrEmployee employee) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _AssignSheet(employee: employee),
  );
}

class _AssignSheet extends ConsumerStatefulWidget {
  final HrEmployee employee;
  const _AssignSheet({required this.employee});
  @override
  ConsumerState<_AssignSheet> createState() => _AssignSheetState();
}

class _AssignSheetState extends ConsumerState<_AssignSheet> {
  HrSalaryStructure? _structure;
  DateTime _effectiveFrom = DateTime.now();
  late final TextEditingController _ctc;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _ctc = TextEditingController(
      text: widget.employee.ctcAnnual == null ? '' : widget.employee.ctcAnnual!.toStringAsFixed(0),
    );
  }

  @override
  void dispose() {
    _ctc.dispose();
    super.dispose();
  }

  bool get _canSave {
    final v = double.tryParse(_ctc.text.trim());
    return v != null && v > 0;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final ctc = double.parse(_ctc.text.trim());
    try {
      await hrRepo.assignEmployeeSalary(
        employeeId: widget.employee.id,
        salaryStructureId: _structure?.id,
        ctcAnnual: ctc,
        effectiveFrom: _effectiveFrom,
      );
      // Invalidate any view showing salary numbers on this employee.
      ref.invalidate(hrEmployeeSalariesProvider(widget.employee.id));
      ref.invalidate(hrEmployeeProvider(widget.employee.id));
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Salary assigned', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Assign failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final structuresAsync = ref.watch(hrSalaryStructuresProvider);
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Assign salary', style: RunqText.h4.copyWith(color: t.ink)),
                      const SizedBox(height: 2),
                      Text(widget.employee.displayName,
                          style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              child: Column(
                children: [
                  HrFormSection(children: [
                    HrTextField(
                      label: 'Annual CTC (₹)',
                      hint: '600000',
                      controller: _ctc,
                      required: true,
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                      textCapitalization: TextCapitalization.none,
                      onChanged: (_) => setState(() {}),
                    ),
                    HrDateField(
                      label: 'Effective from',
                      value: _effectiveFrom,
                      required: true,
                      onChanged: (d) => setState(() => _effectiveFrom = d ?? DateTime.now()),
                    ),
                    HrSelectField<HrSalaryStructure>(
                      label: 'Salary structure',
                      hint: 'Optional — picks component split',
                      value: _structure,
                      options: structuresAsync.asData?.value ?? const [],
                      display: (s) => '${s.name} · ${s.components.length} components',
                      onChanged: (s) => setState(() => _structure = s),
                    ),
                  ]),
                  if (_structure != null) ...[
                    const SizedBox(height: 12),
                    HrFormSection(
                      title: 'Components in this structure',
                      children: _structure!.components.map((c) {
                        return Padding(
                          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(c.name ?? c.code ?? '—',
                                    style: RunqText.body.copyWith(color: t.ink)),
                              ),
                              Text(
                                c.calcType == 'fixed'
                                    ? '₹${c.value.toStringAsFixed(0)}'
                                    : '${c.value.toStringAsFixed(c.value % 1 == 0 ? 0 : 2)}%',
                                style: RunqText.bodyStrong.copyWith(color: t.ink),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
                    child: Text(
                      'A snapshot of the structure is frozen on assignment. Future edits to the structure won\'t change this employee\'s frozen package.',
                      style: RunqText.caption.copyWith(color: t.muted2),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: 'Assign salary',
                loading: _saving,
                enabled: _canSave,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
