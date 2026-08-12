// Attendance regularizations — employee view of own requests + ability
// to raise a new one. Managers / HR see a second tab with pending
// org-wide requests they can approve / reject.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/hr_phase_next.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_status_date_picker.dart';

class HrRegularizationsScreen extends ConsumerStatefulWidget {
  const HrRegularizationsScreen({super.key});
  @override
  ConsumerState<HrRegularizationsScreen> createState() => _HrRegularizationsScreenState();
}

class _HrRegularizationsScreenState extends ConsumerState<HrRegularizationsScreen> {
  int _tab = 0; // 0 = mine, 1 = pending (manager only)

  @override
  void initState() {
    super.initState();
    // Opening the screen fresh — e.g. from a notification tap about a
    // regularization decision — should show current data, not whatever a
    // prior visit left cached. Deferred a frame: ref.invalidate reads an
    // inherited widget, which is illegal during initState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.invalidate(myRegularizationsProvider);
      ref.invalidate(pendingRegularizationsProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final canApprove = ref.watch(appRoleProvider).canSeeManagerPersona;
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        backgroundColor: t.bgWarm,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Regularizations', style: TextStyle(fontWeight: FontWeight.w700)),
        bottom: canApprove
            ? PreferredSize(
                preferredSize: const Size.fromHeight(56),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: _SegmentTabs(
                    labels: const ['My requests', 'Pending approvals'],
                    active: _tab,
                    onChange: (i) => setState(() => _tab = i),
                  ),
                ),
              )
            : null,
      ),
      body: canApprove
          ? IndexedStack(
              index: _tab,
              children: const [_MineTab(), _PendingTab()],
            )
          : const _MineTab(),
      floatingActionButton: _tab == 0
          ? FloatingActionButton.extended(
              heroTag: 'new-reg',
              backgroundColor: HrColors.teal,
              foregroundColor: Colors.white,
              onPressed: () => _NewRegSheet.show(context, ref),
              icon: const Icon(Icons.add_rounded),
              label: const Text('New request'),
            )
          : null,
    );
  }
}

/// Pill-style segmented tab control. Matches the HR app's other segmented
/// controls (Manager / My View) — soft track, raised active pill, teal
/// accent. Used for a small fixed number of tabs (2–3); for many tabs use
/// a regular TabBar.
class _SegmentTabs extends StatelessWidget {
  final List<String> labels;
  final int active;
  final ValueChanged<int> onChange;
  const _SegmentTabs({required this.labels, required this.active, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final trough = isDark ? Colors.white.withValues(alpha: 0.06) : const Color(0x14000000);
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: trough,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onChange(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: i == active ? HrColors.teal : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: i == active
                        ? const [BoxShadow(color: Color(0x1F000000), blurRadius: 4, offset: Offset(0, 1))]
                        : null,
                  ),
                  child: Center(
                    child: Text(
                      labels[i],
                      style: RunqText.body.copyWith(
                        color: i == active ? Colors.white : t.muted,
                        fontWeight: i == active ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MineTab extends ConsumerWidget {
  const _MineTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(myRegularizationsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async => ref.invalidate(myRegularizationsProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => Center(child: Text('$e', style: TextStyle(color: t.muted))),
        data: (rows) => rows.isEmpty
            ? ListView(physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()), children: [
                Padding(padding: const EdgeInsets.all(48),
                  child: Center(child: Text('No requests yet', style: TextStyle(color: t.muted)))),
              ])
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _RegCard(r: rows[i], canCancel: rows[i].status == 'pending'),
              ),
      ),
    );
  }
}

class _PendingTab extends ConsumerWidget {
  const _PendingTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(pendingRegularizationsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async => ref.invalidate(pendingRegularizationsProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => Center(child: Text('$e', style: TextStyle(color: t.muted))),
        data: (rows) => rows.isEmpty
            ? ListView(physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()), children: [
                Padding(padding: const EdgeInsets.all(48),
                  child: Center(child: Text('Nothing pending', style: TextStyle(color: t.muted)))),
              ])
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _PendingCard(r: rows[i]),
              ),
      ),
    );
  }
}

class _RegCard extends ConsumerWidget {
  const _RegCard({required this.r, required this.canCancel});
  final HrRegularization r;
  final bool canCancel;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final (bg, fg, label) = _chipFor(r.status, Theme.of(context).brightness == Brightness.dark);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(DateFormat('EEE, d MMM y').format(r.date),
                      style: RunqText.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('${r.requestedCheckIn ?? '—'}  →  ${r.requestedCheckOut ?? '—'}',
                      style: RunqText.body.copyWith(color: t.muted)),
                  const SizedBox(height: 6),
                  Text(r.reason, style: RunqText.body.copyWith(color: t.ink)),
                  if (r.status == 'rejected' && (r.rejectionReason ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('Rejection: ${r.rejectionReason}',
                        style: RunqText.caption.copyWith(color: t.muted, fontStyle: FontStyle.italic)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
                  child: Text(label, style: RunqText.label.copyWith(color: fg)),
                ),
                if (canCancel) ...[
                  const SizedBox(height: 6),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                    icon: Icon(Icons.close_rounded, size: 18, color: t.muted),
                    onPressed: () async {
                      await hrPhaseNextRepo.cancelRegularization(r.id);
                      ref.invalidate(myRegularizationsProvider);
                    },
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Status pill palette. Dark mode uses alpha-tinted variants over the
  /// dark surface so the chips read as soft accent badges rather than
  /// bright pastel stickers.
  (Color bg, Color fg, String label) _chipFor(String s, bool dark) {
    switch (s) {
      case 'approved':
        return dark
            ? (const Color(0x3322C55E), const Color(0xFF86EFAC), 'Approved')
            : (const Color(0xFFDCFCE7), const Color(0xFF15803D), 'Approved');
      case 'rejected':
        return dark
            ? (const Color(0x33EF4444), const Color(0xFFFCA5A5), 'Rejected')
            : (const Color(0xFFFEE2E2), const Color(0xFFB91C1C), 'Rejected');
      case 'cancelled':
        return dark
            ? (const Color(0x33FFFFFF), const Color(0xFFCBD5E1), 'Cancelled')
            : (const Color(0x14000000), const Color(0xFF6B7280), 'Cancelled');
      default:
        return dark
            ? (const Color(0x33F59E0B), const Color(0xFFFCD34D), 'Pending')
            : (const Color(0xFFFEF3C7), const Color(0xFFB45309), 'Pending');
    }
  }
}

class _PendingCard extends ConsumerWidget {
  const _PendingCard({required this.r});
  final HrRegularization r;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(DateFormat('EEE, d MMM y').format(r.date),
                style: RunqText.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('${r.requestedCheckIn ?? '—'}  →  ${r.requestedCheckOut ?? '—'}',
                style: RunqText.body.copyWith(color: t.muted)),
            const SizedBox(height: 6),
            Text(r.reason, style: RunqText.body.copyWith(color: t.ink)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Builder(builder: (ctx) {
                    final dark = Theme.of(ctx).brightness == Brightness.dark;
                    return OutlinedButton.icon(
                      onPressed: () async {
                        await hrPhaseNextRepo.reviewRegularization(r.id, approved: false);
                        ref.invalidate(pendingRegularizationsProvider);
                        if (context.mounted) showRunqSnack(context, 'Rejected', kind: SnackKind.info);
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: dark ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C),
                        side: BorderSide(color: dark ? const Color(0x66EF4444) : const Color(0xFFFCA5A5)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: const Icon(Icons.close_rounded, size: 18),
                      label: const Text('Reject'),
                    );
                  }),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () async {
                      await hrPhaseNextRepo.reviewRegularization(r.id, approved: true);
                      ref.invalidate(pendingRegularizationsProvider);
                      if (context.mounted) showRunqSnack(context, 'Approved', kind: SnackKind.success);
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: HrColors.teal,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NewRegSheet extends StatefulWidget {
  /// The requester's own employee record, resolved by the caller. Null for a
  /// user with no linked employee (a CA login, say) — the date picker then
  /// falls back to Material's, since there is no attendance to colour it by.
  final String? employeeId;
  const _NewRegSheet({required this.employeeId});

  static void show(BuildContext context, WidgetRef ref) {
    final employeeId = ref.read(hrMeProvider).asData?.value.employee?.id;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _NewRegSheet(employeeId: employeeId),
      ),
    ).then((_) => ref.invalidate(myRegularizationsProvider));
  }
  @override
  State<_NewRegSheet> createState() => _NewRegSheetState();
}

class _NewRegSheetState extends State<_NewRegSheet> {
  DateTime _date = DateTime.now();
  TimeOfDay? _checkIn;
  TimeOfDay? _checkOut;
  final _reasonCtrl = TextEditingController();
  bool _busy = false;

  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  /// A regularization is raised against a day that went wrong, so the picker
  /// shows each day's status — the absent and not-marked days are the ones
  /// worth picking, and they're now visible without leaving the sheet.
  Future<void> _pickDate() async {
    final now = DateTime.now();
    final first = now.subtract(const Duration(days: 90));
    final employeeId = widget.employeeId;
    final Future<DateTime?> pending = employeeId == null
        ? showDatePicker(
            context: context,
            initialDate: _date,
            firstDate: first,
            lastDate: now,
            builder: (ctx, child) => Theme(
              data: Theme.of(ctx).copyWith(
                colorScheme:
                    Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
              ),
              child: child!,
            ),
          )
        : showHrStatusDatePicker(
            context,
            employeeId: employeeId,
            initialDate: _date,
            firstDate: first,
            lastDate: now,
            title: 'Pick a day',
            subtitle: 'Raise a regularization for a day that was missed or '
                'marked wrong.',
          );
    final picked = await pending;
    if (picked != null && mounted) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Sheet handle
            Center(
              child: Container(
                width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: t.muted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text('New regularization',
                style: RunqText.h3.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            _FieldLabel('Date'),
            InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                decoration: BoxDecoration(
                  border: Border.all(color: t.hairline),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today_rounded, size: 18, color: t.muted),
                    const SizedBox(width: 10),
                    Text(DateFormat('EEE, d MMM y').format(_date),
                        style: RunqText.body),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(child: _TimePickerField(
                  label: 'Check-in',
                  value: _checkIn,
                  onPick: (v) => setState(() => _checkIn = v),
                  defaultTime: const TimeOfDay(hour: 9, minute: 0),
                )),
                const SizedBox(width: 12),
                Expanded(child: _TimePickerField(
                  label: 'Check-out',
                  value: _checkOut,
                  onPick: (v) => setState(() => _checkOut = v),
                  defaultTime: const TimeOfDay(hour: 18, minute: 0),
                )),
              ],
            ),
            const SizedBox(height: 14),
            _FieldLabel('Reason'),
            TextField(
              controller: _reasonCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Why was attendance not marked correctly?',
                hintStyle: RunqText.body.copyWith(color: t.muted),
                filled: true,
                fillColor: t.bgWarm,
                contentPadding: const EdgeInsets.all(12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: HrColors.teal, width: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: HrColors.teal,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Submit', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_reasonCtrl.text.trim().isEmpty) {
      showRunqSnack(context, 'Please provide a reason', kind: SnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.createRegularization(
        date: _date,
        checkIn: _checkIn == null ? null : _fmtTime(_checkIn!),
        checkOut: _checkOut == null ? null : _fmtTime(_checkOut!),
        reason: _reasonCtrl.text.trim(),
      );
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Request raised', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 2),
      child: Text(text, style: RunqText.caption.copyWith(fontWeight: FontWeight.w600, color: t.muted)),
    );
  }
}

/// Tap-to-pick time field. Opens the system time picker themed in HR teal
/// and returns a TimeOfDay. Empty state shows "—" so a missing pick reads
/// the same as "not set" rather than a placeholder that looks editable.
class _TimePickerField extends StatelessWidget {
  final String label;
  final TimeOfDay? value;
  final ValueChanged<TimeOfDay> onPick;
  final TimeOfDay defaultTime;
  const _TimePickerField({
    required this.label,
    required this.value,
    required this.onPick,
    required this.defaultTime,
  });

  String _fmt(TimeOfDay t) {
    final h = t.hourOfPeriod == 0 ? 12 : t.hourOfPeriod;
    final m = t.minute.toString().padLeft(2, '0');
    final p = t.period == DayPeriod.am ? 'AM' : 'PM';
    return '$h:$m $p';
  }

  Future<void> _open(BuildContext context) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: value ?? defaultTime,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
          timePickerTheme: TimePickerThemeData(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) onPick(picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label),
        InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => _open(context),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              color: t.bgWarm,
              border: Border.all(color: t.hairline),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Icon(Icons.access_time_rounded, size: 18, color: t.muted),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    value == null ? '—' : _fmt(value!),
                    style: RunqText.body.copyWith(
                      fontWeight: value == null ? FontWeight.w400 : FontWeight.w600,
                      color: value == null ? t.muted : t.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
