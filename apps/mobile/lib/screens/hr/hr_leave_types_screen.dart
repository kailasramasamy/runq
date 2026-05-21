// Leave types management — list every leave type the tenant has defined,
// plus a + FAB to create more. Tap a row → edit sheet. Long-press or
// trailing icon → delete with confirm.
//
// The "Seed defaults" affordance kicks the server's preset seeder for
// tenants who haven't configured any types yet.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../api/api_client.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';

class HrLeaveTypesScreen extends ConsumerWidget {
  const HrLeaveTypesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final typesAsync = ref.watch(hrLeaveTypesProvider);

    Future<void> seedDefaults() async {
      try {
        await apiClient.post('/hr/leave-types/seed-defaults');
        ref.invalidate(hrLeaveTypesProvider);
        if (context.mounted) {
          showRunqSnack(context, 'Default types seeded', kind: SnackKind.success);
        }
      } catch (e) {
        if (context.mounted) {
          showRunqSnack(context, 'Seed failed: $e', kind: SnackKind.error);
        }
      }
    }

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('Leave types', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrLeaveTypesProvider);
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: typesAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                  error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                  data: (rows) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                        children: [
                          Icon(Icons.event_note_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text('No leave types yet',
                              style: RunqText.bodyStrong.copyWith(color: t.ink))),
                          const SizedBox(height: 6),
                          Center(child: Text(
                            'Start with the Indian preset (CL · EL · SL) or add your own.',
                            textAlign: TextAlign.center,
                            style: RunqText.caption.copyWith(color: t.muted),
                          )),
                          const SizedBox(height: 16),
                          Center(
                            child: TextButton(
                              onPressed: seedDefaults,
                              child: const Text('Seed default types'),
                            ),
                          ),
                        ],
                      );
                    }
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                      children: [
                        HrFormSectionList(rows: rows
                            .map((lt) => _LeaveTypeRow(
                                  lt: lt,
                                  onTap: () => _openEditor(context, ref, existing: lt),
                                  onDelete: () => _confirmDelete(context, ref, lt: lt),
                                ))
                            .toList()),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-leave-type',
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: () => _openEditor(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add type'),
      ),
    );
  }
}

/// Convenience that wraps a list of pre-built rows in the same card
/// container used by HrFormSection. Saves the row class from importing
/// the section wrapper directly.
class HrFormSectionList extends StatelessWidget {
  final List<Widget> rows;
  const HrFormSectionList({super.key, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
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
              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          ],
        ],
      ),
    );
  }
}

class _LeaveTypeRow extends StatelessWidget {
  final HrLeaveType lt;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _LeaveTypeRow({required this.lt, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                lt.code,
                style: RunqText.caption.copyWith(
                  color: HrColors.brand(context),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(lt.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      '${lt.daysPerYear.toStringAsFixed(lt.daysPerYear % 1 == 0 ? 0 : 1)} days/yr',
                      if (lt.isPaid) 'paid' else 'unpaid',
                      if (lt.carryForward) 'carry-forward',
                      if (lt.encashable) 'encashable',
                      if (!lt.isActive) 'inactive',
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

// ─── Editor sheet ─────────────────────────────────────────────────────────

Future<void> _openEditor(
  BuildContext context,
  WidgetRef ref, {
  HrLeaveType? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _LeaveTypeEditor(existing: existing),
  );
  ref.invalidate(hrLeaveTypesProvider);
}

class _LeaveTypeEditor extends StatefulWidget {
  final HrLeaveType? existing;
  const _LeaveTypeEditor({this.existing});
  @override
  State<_LeaveTypeEditor> createState() => _LeaveTypeEditorState();
}

class _LeaveTypeEditorState extends State<_LeaveTypeEditor> {
  late final TextEditingController _code;
  late final TextEditingController _name;
  late final TextEditingController _days;
  late final TextEditingController _maxCf;
  late bool _isPaid;
  late bool _carryForward;
  late bool _encashable;
  late bool _isActive;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _code = TextEditingController(text: e?.code ?? '');
    _name = TextEditingController(text: e?.name ?? '');
    _days = TextEditingController(text: e == null ? '' : _fmt(e.daysPerYear));
    _maxCf = TextEditingController(text: e?.maxCarryForward == null ? '' : _fmt(e!.maxCarryForward!));
    _isPaid = e?.isPaid ?? true;
    _carryForward = e?.carryForward ?? false;
    _encashable = e?.encashable ?? false;
    _isActive = e?.isActive ?? true;
  }

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _days.dispose();
    _maxCf.dispose();
    super.dispose();
  }

  String _fmt(double v) => v == v.toInt() ? v.toInt().toString() : v.toStringAsFixed(1);

  bool get _canSave {
    final code = _code.text.trim();
    final name = _name.text.trim();
    final days = double.tryParse(_days.text.trim());
    if (code.isEmpty || name.isEmpty || days == null || days < 0) return false;
    if (widget.existing == null && code.length > 10) return false;
    return true;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final days = double.parse(_days.text.trim());
    final maxCf = double.tryParse(_maxCf.text.trim());
    try {
      if (widget.existing == null) {
        await hrRepo.createLeaveType(
          code: _code.text.trim().toUpperCase(),
          name: _name.text.trim(),
          daysPerYear: days,
          carryForward: _carryForward,
          maxCarryForward: _carryForward ? maxCf : null,
          encashable: _encashable,
          isPaid: _isPaid,
        );
      } else {
        await hrRepo.updateLeaveType(
          widget.existing!.id,
          name: _name.text.trim(),
          daysPerYear: days,
          carryForward: _carryForward,
          maxCarryForward: _carryForward ? maxCf : null,
          encashable: _encashable,
          isPaid: _isPaid,
          isActive: _isActive,
        );
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, widget.existing == null ? 'Type added' : 'Type updated',
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
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
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
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Row(
              children: [
                Text(widget.existing == null ? 'Add leave type' : 'Edit leave type',
                    style: RunqText.h3.copyWith(color: t.ink)),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Column(
                children: [
                  HrFormSection(children: [
                    HrTextField(
                      label: 'Code',
                      hint: 'CL · EL · SL',
                      controller: _code,
                      required: true,
                      maxLength: 10,
                      // Code is immutable post-creation (server unique).
                      textCapitalization: TextCapitalization.characters,
                      formatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]'))],
                      onChanged: (_) => setState(() {}),
                    ),
                    HrTextField(
                      label: 'Name',
                      hint: 'Casual Leave',
                      controller: _name,
                      required: true,
                      textCapitalization: TextCapitalization.words,
                      onChanged: (_) => setState(() {}),
                    ),
                    HrTextField(
                      label: 'Days per year',
                      hint: '12',
                      controller: _days,
                      required: true,
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                      onChanged: (_) => setState(() {}),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  HrFormSection(title: 'Rules', children: [
                    HrToggleField(
                      label: 'Paid leave',
                      sub: 'When off, the day is treated as LOP in payroll.',
                      value: _isPaid,
                      onChanged: (v) => setState(() => _isPaid = v),
                    ),
                    HrToggleField(
                      label: 'Carry forward unused',
                      sub: 'Rollover any remaining balance to next year.',
                      value: _carryForward,
                      onChanged: (v) => setState(() => _carryForward = v),
                    ),
                    if (_carryForward)
                      HrTextField(
                        label: 'Max carry-forward days',
                        controller: _maxCf,
                        keyboard: const TextInputType.numberWithOptions(decimal: true),
                        formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                      ),
                    HrToggleField(
                      label: 'Encashable',
                      sub: 'Remaining balance is paid out on exit.',
                      value: _encashable,
                      onChanged: (v) => setState(() => _encashable = v),
                    ),
                    if (widget.existing != null)
                      HrToggleField(
                        label: 'Active',
                        sub: 'When off, type stays for historical balances but can\'t be applied.',
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v),
                      ),
                  ]),
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
                label: widget.existing == null ? 'Add type' : 'Save changes',
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

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref, {
  required HrLeaveType lt,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text('Delete ${lt.name}?'),
      content: const Text(
          'Server will refuse the delete if any leave requests already exist for this type.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await hrRepo.deleteLeaveType(lt.id);
    ref.invalidate(hrLeaveTypesProvider);
    if (context.mounted) showRunqSnack(context, 'Leave type deleted', kind: SnackKind.success);
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
  }
}
