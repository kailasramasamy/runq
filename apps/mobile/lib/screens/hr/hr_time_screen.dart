// Time tab — attendance. Employee view shows a week strip, stat pills,
// a check-in card, and the recent history. Manager view shows a date
// chip, 6-tile muster grid, and a team muster list. Persona is the same
// global toggle as the Home tab.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_persona_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_punch_card.dart';
import 'widgets/hr_widgets.dart';

class HrTimeScreen extends ConsumerWidget {
  const HrTimeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final persona = ref.watch(hrPersonaProvider);
    final me = ref.watch(hrMeProvider).asData?.value;
    final isManager = me?.isManager ?? false;
    final showManager = isManager && persona == HrPersona.manager;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: showManager ? const _ManagerTime() : const _EmployeeTime(),
      ),
    );
  }
}

// ─── Employee view ────────────────────────────────────────────────────────

class _EmployeeTime extends ConsumerStatefulWidget {
  const _EmployeeTime();
  @override
  ConsumerState<_EmployeeTime> createState() => _EmployeeTimeState();
}

class _EmployeeTimeState extends ConsumerState<_EmployeeTime> {
  DateTime _selected = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final attendance = ref.watch(hrMyAttendanceThisWeekProvider);
    final statusByDay = <int, String>{
      for (final r in attendance.asData?.value ?? const []) r.date.day: _mapStatus(r.status),
    };
    final hoursTotal = (attendance.asData?.value ?? const [])
        .fold<double>(0, (s, r) => s + (r.hoursWorked ?? 0));
    final daysIn = (attendance.asData?.value ?? const [])
        .where((r) => r.status == 'present').length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () => Navigator.of(context).maybePop(),
              icon: Icon(Icons.arrow_back_rounded, color: t.ink),
            ),
            const SizedBox(width: 4),
            Text('Time', style: RunqText.h1.copyWith(color: t.ink)),
            const Spacer(),
            _myCalendarButton(),
          ],
        ),
        const SizedBox(height: 14),
        HrWeekStrip(
          selected: _selected,
          statusByDay: statusByDay,
          onSelect: (d) => setState(() => _selected = d),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _StatPill(label: 'Days In', value: '$daysIn', tint: const Color(0xFF16A34A))),
            const SizedBox(width: 8),
            Expanded(child: _StatPill(label: 'Hours', value: hoursTotal.toStringAsFixed(1), tint: HrColors.teal)),
            const SizedBox(width: 8),
            Expanded(child: _StatPill(label: 'This Week', value: '${attendance.asData?.value.length ?? 0}', tint: const Color(0xFF0E7490))),
          ],
        ),
        const SizedBox(height: 12),
        const HrPunchCard(),
        const SizedBox(height: 14),
        Text('Recent', style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(height: 6),
        attendance.when(
          loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
          error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
          data: (rows) {
            if (rows.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('No attendance this week', style: RunqText.body.copyWith(color: t.muted))),
              );
            }
            final sorted = [...rows]..sort((a, b) => b.date.compareTo(a.date));
            return Column(
              children: [
                for (final r in sorted) _AttRow(row: r),
              ],
            );
          },
        ),
      ],
    );
  }

  /// Opens the employee's own month calendar. Hidden until `/hr/me`
  /// resolves an employee record — a user with no linked employee (a CA
  /// login, say) has no attendance to show.
  Widget _myCalendarButton() {
    final me = ref.watch(hrMeProvider).asData?.value;
    final empId = me?.employee?.id;
    if (empId == null) return const SizedBox.shrink();
    return TextButton.icon(
      // Opens the employee-detail Time tab — the single place attendance and
      // leave are viewed and managed. There is no separate calendar screen.
      onPressed: () => context.push('/hr/people/$empId?tab=time'),
      icon: const Icon(Icons.calendar_month_outlined, size: 18),
      label: Text('Calendar',
          style: RunqText.caption.copyWith(
              color: HrColors.brand(context), fontWeight: FontWeight.w700)),
      style: TextButton.styleFrom(foregroundColor: HrColors.brand(context)),
    );
  }

  static String _mapStatus(String s) => switch (s) {
        'present' => 'present',
        'absent' => 'absent',
        'leave' || 'paid_leave' || 'unpaid_leave' => 'leave',
        'half_day' => 'half_day',
        'week_off' || 'holiday' => 'weekoff',
        _ => 'none',
      };
}

class _StatPill extends StatelessWidget {
  final String label, value;
  final Color tint;
  const _StatPill({required this.label, required this.value, required this.tint});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(value, style: RunqText.h3.copyWith(color: tint, fontWeight: FontWeight.w700)),
          Text(label.toUpperCase(),
              style: RunqText.micro.copyWith(color: tint)),
        ],
      ),
    );
  }
}

class _AttRow extends StatelessWidget {
  final HrAttendanceRow row;
  const _AttRow({required this.row});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pair = _pair(row.status, isDark);
    final timeRange = row.checkIn == null
        ? row.status.replaceAll('_', ' ')
        : '${row.checkIn}${row.checkOut == null ? '' : ' → ${row.checkOut}'}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: pair[0], borderRadius: BorderRadius.circular(10)),
            child: Icon(_icon(row.status), color: pair[1], size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_dateLabel(row.date),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(timeRange, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          HrStatusBadge(status: row.status),
        ],
      ),
    );
  }

  static List<Color> _pair(String s, bool isDark) {
    if (isDark) {
      return switch (s) {
        'present'  => const [Color(0xFF14532D), Color(0xFF86EFAC)],
        'leave' || 'paid_leave' || 'unpaid_leave' => const [Color(0xFF78350F), Color(0xFFFCD34D)],
        'absent'   => const [Color(0xFF7F1D1D), Color(0xFFFCA5A5)],
        'half_day' => const [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
        _          => const [Color(0xFF334155), Color(0xFFCBD5E1)],
      };
    }
    return switch (s) {
      'present'  => const [Color(0xFFDCFCE7), Color(0xFF14532D)],
      'leave' || 'paid_leave' || 'unpaid_leave' => const [Color(0xFFFEF3C7), Color(0xFF78350F)],
      'absent'   => const [Color(0xFFFEE2E2), Color(0xFF7F1D1D)],
      'half_day' => const [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
      _          => const [Color(0xFFF1F5F9), Color(0xFF475569)],
    };
  }
  static IconData _icon(String s) => switch (s) {
        'present' => Icons.check_rounded,
        'leave' || 'paid_leave' || 'unpaid_leave' => Icons.event_busy_rounded,
        'absent'  => Icons.close_rounded,
        'half_day'=> Icons.timelapse_rounded,
        _         => Icons.do_disturb_alt_outlined,
      };
  static String _dateLabel(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final today = DateTime.now();
    if (d.year == today.year && d.month == today.month && d.day == today.day) {
      return 'Today · ${d.day} ${m[d.month - 1]}';
    }
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

// ─── Manager view ────────────────────────────────────────────────────────

class _ManagerTime extends ConsumerStatefulWidget {
  const _ManagerTime();
  @override
  ConsumerState<_ManagerTime> createState() => _ManagerTimeState();
}

class _ManagerTimeState extends ConsumerState<_ManagerTime> {
  DateTime _date = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Swapped from hrDashboardProvider (which now carries payroll +
    // attention signals, not muster counts) to the dedicated muster
    // provider — same six buckets the manager Home tile grid uses.
    final muster = ref.watch(hrMusterTodayProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () => Navigator.of(context).maybePop(),
              icon: Icon(Icons.arrow_back_rounded, color: t.ink),
            ),
            const SizedBox(width: 4),
            Text('Team time', style: RunqText.h1.copyWith(color: t.ink)),
            const Spacer(),
            GestureDetector(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime.now().subtract(const Duration(days: 90)),
                  lastDate: DateTime.now(),
                  builder: (ctx, child) => Theme(
                    data: Theme.of(ctx).copyWith(
                      colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
                    ),
                    child: child!,
                  ),
                );
                if (picked != null) setState(() => _date = picked);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: t.surface,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: t.hairline, width: 0.5),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today_outlined, size: 14, color: t.muted),
                    const SizedBox(width: 6),
                    Text(_fmtDate(_date), style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        muster.when(
          data: (m) => GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.5,
            children: [
              HrMusterTile(label: 'Present', value: m.present, kind: MusterKind.present),
              HrMusterTile(label: 'Half Day', value: m.halfDay, kind: MusterKind.halfday),
              HrMusterTile(label: 'Leave', value: m.leave, kind: MusterKind.leave),
              HrMusterTile(label: 'Absent', value: m.absent, kind: MusterKind.absent),
              HrMusterTile(label: 'Holiday', value: m.holiday, kind: MusterKind.holiday),
              HrMusterTile(label: 'W/Off', value: m.weekOff, kind: MusterKind.weekoff),
            ],
          ),
          loading: () => const SizedBox(height: 100, child: Center(child: CircularProgressIndicator())),
          error: (_, __) => Text('Could not load muster', style: RunqText.body.copyWith(color: t.muted)),
        ),
        const SizedBox(height: 16),
        FutureBuilder<_TeamMusterData>(
          // Single future combines marked attendance + the full active
          // employee list so we can render unmarked rows too. Re-fired by
          // bumping `_dataKey` from inside edit/bulk actions.
          future: _loadMuster(),
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snap.hasError) {
              return Text('${snap.error}', style: RunqText.body.copyWith(color: t.muted));
            }
            final data = snap.data!;
            final unmarkedCount = data.unmarked.length;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Text('Team muster', style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const Spacer(),
                    if (unmarkedCount > 0)
                      TextButton.icon(
                        onPressed: () => _bulkMarkPresent(context, data.unmarked),
                        style: TextButton.styleFrom(
                          foregroundColor: HrColors.brand(context),
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                        ),
                        icon: const Icon(Icons.check_circle_outline_rounded, size: 16),
                        label: Text('Mark $unmarkedCount present'),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                if (data.marked.isEmpty && data.unmarked.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: Text('No employees', style: RunqText.body.copyWith(color: t.muted))),
                  )
                else ...[
                  for (final r in data.marked)
                    _TeamRow(
                      row: r,
                      onTap: () => _openEditSheet(context,
                          employeeId: r.employeeId,
                          employeeName: r.employeeName,
                          existing: r),
                    ),
                  for (final u in data.unmarked)
                    _UnmarkedRow(
                      employee: u,
                      date: _date,
                      onTap: () => _openEditSheet(context,
                          employeeId: u.id,
                          employeeName: u.displayName),
                    ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }

  /// Bumped after every successful edit / bulk action so the FutureBuilder
  /// re-fires (the future identity changes ⇒ Flutter rebuilds the subtree).
  int _dataKey = 0;

  Future<_TeamMusterData> _loadMuster() async {
    // Touch the key so the analyzer doesn't drop it as unused; the future
    // identity changes when _dataKey changes since we re-create the
    // closure on each build.
    _dataKey;
    final results = await Future.wait([
      hrRepo.attendance(from: _date, to: _date),
      hrRepo.employees(status: 'active', limit: 200),
    ]);
    final marked = results[0] as List<HrAttendanceRow>;
    final page = results[1] as HrEmployeeListPage;
    final markedIds = marked.map((r) => r.employeeId).toSet();
    final unmarked = page.data.where((e) => !markedIds.contains(e.id)).toList()
      ..sort((a, b) => a.employeeCode.compareTo(b.employeeCode));
    // Sort marked by code too for consistency.
    final sortedMarked = [...marked]..sort((a, b) => a.employeeCode.compareTo(b.employeeCode));
    return _TeamMusterData(marked: sortedMarked, unmarked: unmarked);
  }

  Future<void> _bulkMarkPresent(BuildContext context, List<HrEmployee> unmarked) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Mark ${unmarked.length} as present?'),
        content: Text('All ${unmarked.length} unmarked employees will be set to Present on ${_fmtDate(_date)}.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: HrColors.teal),
            child: const Text('Mark present'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final records = unmarked.map((e) => {
          'employeeId': e.id,
          'date':
              '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}',
          'status': 'present',
          'source': 'mobile',
        }).toList();
    try {
      final n = await hrRepo.bulkStampAttendance(records);
      if (mounted) {
        setState(() => _dataKey += 1);
        ref.invalidate(hrMusterTodayProvider);
        ref.invalidate(hrDashboardProvider);
        showRunqSnack(context, 'Marked $n employees present', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Bulk mark failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _openEditSheet(
    BuildContext context, {
    required String employeeId,
    required String employeeName,
    HrAttendanceRow? existing,
  }) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AttendanceEditSheet(
        employeeId: employeeId,
        employeeName: employeeName,
        date: _date,
        existing: existing,
      ),
    );
    if (saved == true && mounted) {
      setState(() => _dataKey += 1);
      ref.invalidate(hrMusterTodayProvider);
    }
  }

  static String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }
}

class _TeamMusterData {
  final List<HrAttendanceRow> marked;
  final List<HrEmployee> unmarked;
  _TeamMusterData({required this.marked, required this.unmarked});
}

class _TeamRow extends StatelessWidget {
  final HrAttendanceRow row;
  final VoidCallback onTap;
  const _TeamRow({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      child: Row(
        children: [
          HrAvatar(name: row.employeeName, photoUrl: row.employeePhotoUrl, employeeId: row.employeeId, size: 36),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.employeeName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(
                  row.checkIn == null ? '—' : '${row.checkIn}${row.checkOut == null ? ' →' : ' → ${row.checkOut}'}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          HrStatusBadge(status: row.status),
        ],
      ),
        ),
      ),
    );
  }
}

class _UnmarkedRow extends StatelessWidget {
  final HrEmployee employee;
  final DateTime date;
  final VoidCallback onTap;
  const _UnmarkedRow({required this.employee, required this.date, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        // Dashed-ish hairline via a slightly lighter border so unmarked
        // rows read as "needs action" without going full red/warning.
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              HrAvatar(
                name: employee.displayName,
                photoUrl: employee.photoUrl,
                employeeId: employee.id,
                size: 36,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(employee.displayName,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text('${employee.employeeCode} · Not marked',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Icon(Icons.add_circle_outline_rounded, color: HrColors.brand(context), size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Edit sheet — per-row attendance ──────────────────────────────────────

class _AttendanceEditSheet extends StatefulWidget {
  final String employeeId;
  final String employeeName;
  final DateTime date;
  final HrAttendanceRow? existing;
  const _AttendanceEditSheet({
    required this.employeeId,
    required this.employeeName,
    required this.date,
    this.existing,
  });

  @override
  State<_AttendanceEditSheet> createState() => _AttendanceEditSheetState();
}

class _AttendanceEditSheetState extends State<_AttendanceEditSheet> {
  late String _status;
  late TextEditingController _notes;
  TimeOfDay? _checkIn;
  TimeOfDay? _checkOut;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _status = e?.status ?? 'present';
    _notes = TextEditingController();
    _checkIn = _parseTime(e?.checkIn);
    _checkOut = _parseTime(e?.checkOut);
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  static TimeOfDay? _parseTime(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final parts = raw.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  static String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickTime(bool isCheckIn) async {
    final init = (isCheckIn ? _checkIn : _checkOut) ?? const TimeOfDay(hour: 9, minute: 0);
    final picked = await showTimePicker(context: context, initialTime: init);
    if (picked == null) return;
    setState(() {
      if (isCheckIn) {
        _checkIn = picked;
      } else {
        _checkOut = picked;
      }
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await hrRepo.stampAttendance(
        employeeId: widget.employeeId,
        date: widget.date,
        status: _status,
        source: 'mobile',
        checkIn: _checkIn == null ? null : _fmtTime(_checkIn!),
        checkOut: _checkOut == null ? null : _fmtTime(_checkOut!),
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );
      if (mounted) {
        Navigator.of(context).pop(true);
        showRunqSnack(context, 'Attendance updated', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
    }
  }

  static const _statusOptions = [
    'present', 'half_day', 'leave', 'absent', 'holiday', 'week_off',
  ];

  static String _statusLabel(String s) => switch (s) {
        'present'  => 'Present',
        'half_day' => 'Half day',
        'leave'    => 'Leave',
        'absent'   => 'Absent',
        'holiday'  => 'Holiday',
        'week_off' => 'Week off',
        _          => s,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final dateLabel = '${widget.date.day} ${m[widget.date.month - 1]} ${widget.date.year}';
    final needsTimes = _status == 'present' || _status == 'half_day';
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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.employeeName,
                          style: RunqText.h4.copyWith(color: t.ink)),
                      const SizedBox(height: 2),
                      Text(dateLabel, style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Column(
                children: [
                  HrFormSection(children: [
                    HrSelectField<String>(
                      label: 'Status',
                      value: _status,
                      options: _statusOptions,
                      display: _statusLabel,
                      onChanged: (s) => setState(() => _status = s ?? 'present'),
                      required: true,
                    ),
                    if (needsTimes) ...[
                      _TimeRow(
                        label: 'Check in',
                        value: _checkIn,
                        onTap: () => _pickTime(true),
                        onClear: _checkIn == null ? null : () => setState(() => _checkIn = null),
                      ),
                      _TimeRow(
                        label: 'Check out',
                        value: _checkOut,
                        onTap: () => _pickTime(false),
                        onClear: _checkOut == null ? null : () => setState(() => _checkOut = null),
                      ),
                    ],
                    HrTextField(
                      label: 'Notes',
                      controller: _notes,
                      maxLines: 2,
                      hint: 'Optional comment',
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
                label: widget.existing == null ? 'Save attendance' : 'Save changes',
                loading: _saving,
                enabled: true,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimeRow extends StatelessWidget {
  final String label;
  final TimeOfDay? value;
  final VoidCallback onTap;
  final VoidCallback? onClear;
  const _TimeRow({required this.label, required this.value, required this.onTap, this.onClear});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: RunqText.caption.copyWith(color: t.muted)),
                  const SizedBox(height: 2),
                  Text(
                    value == null
                        ? 'Select time'
                        : '${value!.hour.toString().padLeft(2, '0')}:${value!.minute.toString().padLeft(2, '0')}',
                    style: RunqText.body.copyWith(
                      color: value == null ? t.muted2 : t.ink,
                    ),
                  ),
                ],
              ),
            ),
            if (onClear != null)
              IconButton(
                icon: Icon(Icons.close_rounded, color: t.muted2, size: 16),
                visualDensity: VisualDensity.compact,
                onPressed: onClear,
              ),
            Icon(Icons.access_time_outlined, color: t.muted, size: 16),
          ],
        ),
      ),
    );
  }
}
