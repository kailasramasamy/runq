// Departments setup — list every department the tenant has defined, with
// a + FAB to create more. Tap a row → edit sheet. Trailing icon → delete
// (server refuses if employees are still assigned).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_setup_widgets.dart';

class HrDepartmentsScreen extends ConsumerWidget {
  const HrDepartmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deptsAsync = ref.watch(hrDepartmentsProvider);

    return HrSetupScaffold(
      title: 'Departments',
      addLabel: 'Add department',
      heroTag: 'add-department',
      onAdd: () => _openEditor(context, ref),
      onRefresh: () => ref.invalidate(hrDepartmentsProvider),
      body: deptsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => HrSetupError(error: e),
        data: (rows) {
          if (rows.isEmpty) {
            return const HrSetupEmpty(
              icon: Icons.apartment_outlined,
              title: 'No departments yet',
              sub: 'Group employees by team — Sales, Production, Accounts.',
            );
          }
          return HrSetupList(
            rows: rows
                .map((d) => _DepartmentRow(
                      dept: d,
                      onTap: () => _openEditor(context, ref, existing: d),
                      onDelete: () => _confirmDelete(context, ref, dept: d),
                    ))
                .toList(),
          );
        },
      ),
    );
  }
}

class _DepartmentRow extends StatelessWidget {
  final HrDepartment dept;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _DepartmentRow({required this.dept, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final count = dept.employeeCount ?? 0;
    final hasCode = dept.code != null && dept.code!.isNotEmpty;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(dept.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (hasCode) dept.code!,
                      count == 1 ? '1 employee' : '$count employees',
                      if (!dept.isActive) 'inactive',
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(Icons.delete_outline_rounded, color: t.muted2, size: 18),
              visualDensity: VisualDensity.compact,
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _openEditor(
  BuildContext context,
  WidgetRef ref, {
  HrDepartment? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _DepartmentEditor(existing: existing),
  );
  ref.invalidate(hrDepartmentsProvider);
}

class _DepartmentEditor extends StatefulWidget {
  final HrDepartment? existing;
  const _DepartmentEditor({this.existing});
  @override
  State<_DepartmentEditor> createState() => _DepartmentEditorState();
}

class _DepartmentEditorState extends State<_DepartmentEditor> {
  late final TextEditingController _name;
  late final TextEditingController _code;
  late bool _isActive;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _code = TextEditingController(text: e?.code ?? '');
    _isActive = e?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _canSave => _name.text.trim().isNotEmpty;

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    try {
      if (widget.existing == null) {
        await hrRepo.createDepartment(name: _name.text.trim(), code: _code.text.trim());
      } else {
        await hrRepo.updateDepartment(
          widget.existing!.id,
          name: _name.text.trim(),
          code: _code.text.trim(),
          isActive: _isActive,
        );
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, widget.existing == null ? 'Department added' : 'Department updated',
            kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return HrEditorSheet(
      title: widget.existing == null ? 'Add department' : 'Edit department',
      saveLabel: widget.existing == null ? 'Add department' : 'Save changes',
      saving: _saving,
      canSave: _canSave,
      onSave: _save,
      children: [
        HrFormSection(children: [
          HrTextField(
            label: 'Name',
            hint: 'Production',
            controller: _name,
            required: true,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
          ),
          HrTextField(
            label: 'Code',
            hint: 'PROD (optional)',
            controller: _code,
            maxLength: 20,
            textCapitalization: TextCapitalization.characters,
          ),
        ]),
        if (widget.existing != null) ...[
          const SizedBox(height: 12),
          HrFormSection(children: [
            HrToggleField(
              label: 'Active',
              sub: 'When off, the department is hidden from new assignments.',
              value: _isActive,
              onChanged: (v) => setState(() => _isActive = v),
            ),
          ]),
        ],
      ],
    );
  }
}

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref, {
  required HrDepartment dept,
}) async {
  final ok = await showHrDeleteDialog(
    context,
    name: dept.name,
    note: 'Server will refuse the delete if any employees are still assigned to this department.',
  );
  if (ok != true) return;
  try {
    await hrRepo.deleteDepartment(dept.id);
    ref.invalidate(hrDepartmentsProvider);
    if (context.mounted) showRunqSnack(context, 'Department deleted', kind: SnackKind.success);
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
  }
}
