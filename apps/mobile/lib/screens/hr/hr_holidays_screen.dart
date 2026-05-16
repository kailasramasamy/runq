// Holidays management — year-scoped list with full CRUD. Reachable from
// HR Home (upcoming-holidays "see all" or settings) and the HR More tab.
//
// Lays out chronologically with month subheaders so a long year's
// holiday calendar reads top-down. Tap row → edit sheet. Long-press
// → delete (with confirm). + FAB → add sheet.

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

final _yearProvider = StateProvider<int>((_) => DateTime.now().year);

class HrHolidaysScreen extends ConsumerWidget {
  const HrHolidaysScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final year = ref.watch(_yearProvider);
    final holidaysAsync = ref.watch(hrHolidaysByYearProvider(year));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(),
            _YearStrip(
              year: year,
              onChange: (y) => ref.read(_yearProvider.notifier).state = y,
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrHolidaysByYearProvider(year));
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: holidaysAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                  error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                  data: (rows) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                        children: [
                          Center(
                            child: Text('No holidays for $year',
                                style: RunqText.body.copyWith(color: t.muted)),
                          ),
                        ],
                      );
                    }
                    final sorted = [...rows]..sort((a, b) => a.date.compareTo(b.date));
                    return _HolidaysList(rows: sorted, year: year);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-holiday',
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: () => _openEditor(context, ref, year: year),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add holiday'),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Text('Holidays', style: RunqText.h1.copyWith(color: t.ink)),
        ],
      ),
    );
  }
}

class _YearStrip extends StatelessWidget {
  final int year;
  final ValueChanged<int> onChange;
  const _YearStrip({required this.year, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Row(
        children: [
          IconButton(
            onPressed: () => onChange(year - 1),
            icon: const Icon(Icons.chevron_left_rounded),
            visualDensity: VisualDensity.compact,
          ),
          Expanded(
            child: Center(
              child: Text(
                '$year',
                style: TextStyle(color: t.ink, fontSize: 18, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          IconButton(
            onPressed: () => onChange(year + 1),
            icon: const Icon(Icons.chevron_right_rounded),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _HolidaysList extends ConsumerWidget {
  final List<HrHoliday> rows;
  final int year;
  const _HolidaysList({required this.rows, required this.year});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final byMonth = <int, List<HrHoliday>>{};
    for (final h in rows) {
      byMonth.putIfAbsent(h.date.month, () => []).add(h);
    }
    const months = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];
    final keys = byMonth.keys.toList()..sort();
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
      itemCount: keys.length,
      itemBuilder: (_, i) {
        final m = keys[i];
        final items = byMonth[m]!;
        return Padding(
          padding: EdgeInsets.only(top: i == 0 ? 0 : 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
                child: Text(
                  months[m].toUpperCase(),
                  style: TextStyle(
                    color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
                  ),
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
                    for (var j = 0; j < items.length; j++) ...[
                      _HolidayTile(
                        holiday: items[j],
                        onTap: () => _openEditor(context, ref, year: year, existing: items[j]),
                        onDelete: () => _confirmDelete(context, ref, year: year, holiday: items[j]),
                      ),
                      if (j < items.length - 1)
                        Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _HolidayTile extends StatelessWidget {
  final HrHoliday holiday;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _HolidayTile({required this.holiday, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isPast = holiday.date.isBefore(DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day));
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return InkWell(
      onTap: onTap,
      onLongPress: onDelete,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(8),
              ),
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${holiday.date.day}',
                      style: TextStyle(
                        color: HrColors.brand(context),
                        fontSize: 16, fontWeight: FontWeight.w800, height: 1,
                      )),
                  const SizedBox(height: 2),
                  Text(months[holiday.date.month - 1].toUpperCase(),
                      style: TextStyle(
                        color: HrColors.brand(context),
                        fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.4,
                      )),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    holiday.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(
                      color: isPast ? t.muted2 : t.ink,
                      fontSize: 14,
                      decoration: isPast ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      weekdays[holiday.date.weekday - 1],
                      if (holiday.type != null) holiday.type!,
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
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

// ─── Add / edit sheet ─────────────────────────────────────────────────────

Future<void> _openEditor(
  BuildContext context,
  WidgetRef ref, {
  required int year,
  HrHoliday? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _HolidayEditor(year: year, existing: existing),
  );
  ref.invalidate(hrHolidaysByYearProvider(year));
  ref.invalidate(hrHolidaysProvider);
}

class _HolidayEditor extends StatefulWidget {
  final int year;
  final HrHoliday? existing;
  const _HolidayEditor({required this.year, this.existing});

  @override
  State<_HolidayEditor> createState() => _HolidayEditorState();
}

class _HolidayEditorState extends State<_HolidayEditor> {
  late final TextEditingController _name;
  DateTime? _date;
  String? _type;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.existing?.name ?? '');
    _date = widget.existing?.date ?? DateTime(widget.year, DateTime.now().month, DateTime.now().day);
    _type = widget.existing?.type ?? 'public';
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _canSave => _name.text.trim().isNotEmpty && _date != null;

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    try {
      if (widget.existing == null) {
        await hrRepo.createHoliday(name: _name.text.trim(), date: _date!, type: _type);
      } else {
        await hrRepo.updateHoliday(
          widget.existing!.id,
          name: _name.text.trim(),
          date: _date,
          type: _type,
        );
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, widget.existing == null ? 'Holiday added' : 'Holiday updated',
            kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
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
                Text(
                  widget.existing == null ? 'Add holiday' : 'Edit holiday',
                  style: RunqText.h3.copyWith(color: t.ink),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: HrFormSection(
              children: [
                HrTextField(
                  label: 'Name',
                  hint: 'Republic Day',
                  controller: _name,
                  required: true,
                  textCapitalization: TextCapitalization.words,
                  onChanged: (_) => setState(() {}),
                ),
                HrDateField(
                  label: 'Date',
                  value: _date,
                  required: true,
                  firstDate: DateTime(widget.year - 1),
                  lastDate: DateTime(widget.year + 1),
                  onChanged: (d) => setState(() => _date = d),
                ),
                HrSelectField<String>(
                  label: 'Type',
                  value: _type,
                  options: const ['public', 'restricted', 'optional', 'company'],
                  display: (s) => s[0].toUpperCase() + s.substring(1),
                  onChanged: (v) => setState(() => _type = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: widget.existing == null ? 'Add holiday' : 'Save changes',
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
  required int year,
  required HrHoliday holiday,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text('Delete ${holiday.name}?'),
      content: const Text('This holiday will be removed from the calendar. Leave + payroll already computed against this date are not affected.'),
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
    await hrRepo.deleteHoliday(holiday.id);
    ref.invalidate(hrHolidaysByYearProvider(year));
    ref.invalidate(hrHolidaysProvider);
    if (context.mounted) showRunqSnack(context, 'Holiday deleted', kind: SnackKind.success);
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
  }
}
