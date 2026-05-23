// Designations setup — job titles the tenant assigns to employees. An
// optional level (0–20) drives org-chart seniority ordering. Tap a row
// to edit, trailing icon to delete (server refuses if still in use).

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
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_setup_widgets.dart';

class HrDesignationsScreen extends ConsumerWidget {
  const HrDesignationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final desigsAsync = ref.watch(hrDesignationsProvider);

    return HrSetupScaffold(
      title: 'Designations',
      addLabel: 'Add designation',
      heroTag: 'add-designation',
      onAdd: () => _openEditor(context, ref),
      onRefresh: () => ref.invalidate(hrDesignationsProvider),
      body: desigsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => HrSetupError(error: e),
        data: (rows) {
          if (rows.isEmpty) {
            return const HrSetupEmpty(
              icon: Icons.badge_outlined,
              title: 'No designations yet',
              sub: 'Add job titles — Operator, Supervisor, Manager.',
            );
          }
          return HrSetupList(
            rows: rows
                .map((d) => _DesignationRow(
                      desig: d,
                      onTap: () => _openEditor(context, ref, existing: d),
                      onDelete: () => _confirmDelete(context, ref, desig: d),
                    ))
                .toList(),
          );
        },
      ),
    );
  }
}

class _DesignationRow extends StatelessWidget {
  final HrDesignation desig;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _DesignationRow({required this.desig, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final parts = [
      if (desig.level != null) 'Level ${desig.level}',
      if (!desig.isActive) 'inactive',
    ];
    final sub = parts.isEmpty ? 'No level set' : parts.join(' · ');
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
                  Text(desig.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
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
  HrDesignation? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _DesignationEditor(existing: existing),
  );
  ref.invalidate(hrDesignationsProvider);
}

class _DesignationEditor extends StatefulWidget {
  final HrDesignation? existing;
  const _DesignationEditor({this.existing});
  @override
  State<_DesignationEditor> createState() => _DesignationEditorState();
}

class _DesignationEditorState extends State<_DesignationEditor> {
  late final TextEditingController _name;
  late final TextEditingController _level;
  late bool _isActive;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _level = TextEditingController(text: e?.level?.toString() ?? '');
    _isActive = e?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _level.dispose();
    super.dispose();
  }

  bool get _canSave {
    if (_name.text.trim().isEmpty) return false;
    final raw = _level.text.trim();
    if (raw.isEmpty) return true;
    final lvl = int.tryParse(raw);
    return lvl != null && lvl >= 0 && lvl <= 20;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final level = int.tryParse(_level.text.trim());
    try {
      if (widget.existing == null) {
        await hrRepo.createDesignation(name: _name.text.trim(), level: level);
      } else {
        await hrRepo.updateDesignation(
          widget.existing!.id,
          name: _name.text.trim(),
          level: level,
          isActive: _isActive,
        );
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, widget.existing == null ? 'Designation added' : 'Designation updated',
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
      title: widget.existing == null ? 'Add designation' : 'Edit designation',
      saveLabel: widget.existing == null ? 'Add designation' : 'Save changes',
      saving: _saving,
      canSave: _canSave,
      onSave: _save,
      children: [
        HrFormSection(children: [
          HrTextField(
            label: 'Name',
            hint: 'Supervisor',
            controller: _name,
            required: true,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
          ),
          HrTextField(
            label: 'Level',
            hint: '0–20, higher is senior (optional)',
            controller: _level,
            keyboard: TextInputType.number,
            formatters: [FilteringTextInputFormatter.digitsOnly],
            onChanged: (_) => setState(() {}),
          ),
        ]),
        if (widget.existing != null) ...[
          const SizedBox(height: 12),
          HrFormSection(children: [
            HrToggleField(
              label: 'Active',
              sub: 'When off, the designation is hidden from new assignments.',
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
  required HrDesignation desig,
}) async {
  final ok = await showHrDeleteDialog(
    context,
    name: desig.name,
    note: 'Server will refuse the delete if any employees still hold this designation.',
  );
  if (ok != true) return;
  try {
    await hrRepo.deleteDesignation(desig.id);
    ref.invalidate(hrDesignationsProvider);
    if (context.mounted) showRunqSnack(context, 'Designation deleted', kind: SnackKind.success);
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
  }
}
