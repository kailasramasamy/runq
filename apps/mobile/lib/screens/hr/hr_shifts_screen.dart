// Shifts setup — work-time templates (start/end, break, weekly offs)
// that get assigned to employees for attendance + payroll. Tap a row to
// edit, trailing icon to delete.

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

const _dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class HrShiftsScreen extends ConsumerWidget {
  const HrShiftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shiftsAsync = ref.watch(hrShiftsProvider);

    return HrSetupScaffold(
      title: 'Shifts',
      addLabel: 'Add shift',
      heroTag: 'add-shift',
      onAdd: () => _openEditor(context, ref),
      onRefresh: () => ref.invalidate(hrShiftsProvider),
      body: shiftsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => HrSetupError(error: e),
        data: (rows) {
          if (rows.isEmpty) {
            return const HrSetupEmpty(
              icon: Icons.schedule_outlined,
              title: 'No shifts yet',
              sub: 'Define work timings — General, Morning, Night.',
            );
          }
          return HrSetupList(
            rows: rows
                .map((s) => _ShiftRow(
                      shift: s,
                      onTap: () => _openEditor(context, ref, existing: s),
                      onDelete: () => _confirmDelete(context, ref, shift: s),
                    ))
                .toList(),
          );
        },
      ),
    );
  }
}

String _offDaysLabel(List<int> days) {
  if (days.isEmpty) return 'No weekly off';
  final sorted = [...days]..sort();
  return '${sorted.map((d) => d >= 0 && d < 7 ? _dayLabels[d] : '?').join(', ')} off';
}

class _ShiftRow extends StatelessWidget {
  final HrShift shift;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _ShiftRow({required this.shift, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(
              shift.isNightShift ? Icons.bedtime_outlined : Icons.wb_sunny_outlined,
              size: 18,
              color: HrColors.brand(context),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(shift.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      '${shift.startTime}–${shift.endTime}',
                      if (shift.breakMinutes > 0) '${shift.breakMinutes}m break',
                      _offDaysLabel(shift.weeklyOffDays),
                      if (!shift.isActive) 'inactive',
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
  HrShift? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _ShiftEditor(existing: existing),
  );
  ref.invalidate(hrShiftsProvider);
}

class _ShiftEditor extends StatefulWidget {
  final HrShift? existing;
  const _ShiftEditor({this.existing});
  @override
  State<_ShiftEditor> createState() => _ShiftEditorState();
}

class _ShiftEditorState extends State<_ShiftEditor> {
  late final TextEditingController _name;
  late final TextEditingController _break;
  late String _start;
  late String _end;
  late Set<int> _offDays;
  late bool _isNight;
  late bool _isActive;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _break = TextEditingController(text: (e?.breakMinutes ?? 0) == 0 ? '' : '${e!.breakMinutes}');
    _start = e?.startTime ?? '09:00';
    _end = e?.endTime ?? '18:00';
    _offDays = {...(e?.weeklyOffDays ?? const [0])};
    _isNight = e?.isNightShift ?? false;
    _isActive = e?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _break.dispose();
    super.dispose();
  }

  bool get _canSave => _name.text.trim().isNotEmpty;

  Future<void> _pickTime(bool isStart) async {
    final current = _parse(isStart ? _start : _end);
    final picked = await showTimePicker(
      context: context,
      initialTime: current,
      builder: (ctx, child) => MediaQuery(
        data: MediaQuery.of(ctx).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (picked == null) return;
    final formatted =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    setState(() => isStart ? _start = formatted : _end = formatted);
  }

  TimeOfDay _parse(String hhmm) {
    final parts = hhmm.split(':');
    return TimeOfDay(
      hour: int.tryParse(parts.first) ?? 9,
      minute: parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0,
    );
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final breakMin = int.tryParse(_break.text.trim()) ?? 0;
    final offDays = _offDays.toList()..sort();
    try {
      if (widget.existing == null) {
        await hrRepo.createShift(
          name: _name.text.trim(),
          startTime: _start,
          endTime: _end,
          breakMinutes: breakMin,
          weeklyOffDays: offDays,
          isNightShift: _isNight,
        );
      } else {
        await hrRepo.updateShift(
          widget.existing!.id,
          name: _name.text.trim(),
          startTime: _start,
          endTime: _end,
          breakMinutes: breakMin,
          weeklyOffDays: offDays,
          isNightShift: _isNight,
          isActive: _isActive,
        );
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, widget.existing == null ? 'Shift added' : 'Shift updated',
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
      title: widget.existing == null ? 'Add shift' : 'Edit shift',
      saveLabel: widget.existing == null ? 'Add shift' : 'Save changes',
      saving: _saving,
      canSave: _canSave,
      onSave: _save,
      children: [
        HrFormSection(children: [
          HrTextField(
            label: 'Name',
            hint: 'General',
            controller: _name,
            required: true,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
          ),
          _TimeRow(label: 'Start time', value: _start, onTap: () => _pickTime(true)),
          _TimeRow(label: 'End time', value: _end, onTap: () => _pickTime(false)),
          HrTextField(
            label: 'Break minutes',
            hint: '0',
            controller: _break,
            keyboard: TextInputType.number,
            formatters: [FilteringTextInputFormatter.digitsOnly],
          ),
        ]),
        const SizedBox(height: 12),
        HrFormSection(title: 'Weekly off', children: [
          _OffDayPicker(
            selected: _offDays,
            onToggle: (d) => setState(() {
              _offDays.contains(d) ? _offDays.remove(d) : _offDays.add(d);
            }),
          ),
        ]),
        const SizedBox(height: 12),
        HrFormSection(children: [
          HrToggleField(
            label: 'Night shift',
            sub: 'End time falls on the next calendar day.',
            value: _isNight,
            onChanged: (v) => setState(() => _isNight = v),
          ),
          if (widget.existing != null)
            HrToggleField(
              label: 'Active',
              sub: 'When off, the shift is hidden from new assignments.',
              value: _isActive,
              onChanged: (v) => setState(() => _isActive = v),
            ),
        ]),
      ],
    );
  }
}

/// A tappable form row that opens a time picker.
class _TimeRow extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onTap;
  const _TimeRow({required this.label, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(height: 4),
            Row(
              children: [
                Text(value, style: RunqText.body.copyWith(color: t.ink)),
                const Spacer(),
                Icon(Icons.access_time_rounded, size: 16, color: t.muted2),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Seven day chips — tap to mark a weekday as a weekly off.
class _OffDayPicker extends StatelessWidget {
  final Set<int> selected;
  final ValueChanged<int> onToggle;
  const _OffDayPicker({required this.selected, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: List.generate(7, (d) {
          final on = selected.contains(d);
          return GestureDetector(
            onTap: () => onToggle(d),
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: on ? HrColors.teal : t.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: on ? HrColors.teal : t.hairline,
                  width: 0.5,
                ),
              ),
              child: Text(
                _dayLabels[d],
                style: RunqText.caption.copyWith(
                  color: on ? Colors.white : t.muted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref, {
  required HrShift shift,
}) async {
  final ok = await showHrDeleteDialog(
    context,
    name: shift.name,
    note: 'Server will refuse the delete if this shift is still assigned to employees.',
  );
  if (ok != true) return;
  try {
    await hrRepo.deleteShift(shift.id);
    ref.invalidate(hrShiftsProvider);
    if (context.mounted) showRunqSnack(context, 'Shift deleted', kind: SnackKind.success);
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
  }
}
