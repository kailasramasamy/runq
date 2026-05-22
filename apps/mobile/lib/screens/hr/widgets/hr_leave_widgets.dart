// Leave-specific widget kit, shared by HrLeaveScreen's "My leave" and
// "My team" sections. Split out of the screen file so neither exceeds
// the file-size budget. General HR widgets stay in hr_widgets.dart.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_widgets.dart';

const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

String _dateRange(DateTime from, DateTime to) => from == to
    ? '${from.day} ${_months[from.month - 1]}'
    : '${from.day} ${_months[from.month - 1]} → ${to.day} ${_months[to.month - 1]}';

String _days(double d) => d.toStringAsFixed(d % 1 == 0 ? 0 : 1);

String _fullDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

/// Sub-section header ("Active", "History", "Pending approval", …) with
/// an inline count pill.
class HrLeaveSubHeader extends StatelessWidget {
  final String label;
  final int count;
  final RunqTokens t;
  const HrLeaveSubHeader({super.key, required this.label, required this.count, required this.t});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: t.muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text('$count', style: RunqText.micro.copyWith(color: t.muted)),
        ),
      ],
    );
  }
}

/// Per-leave-type colour. Each leave code maps to a colour family with
/// dark-mode-safe [bg, ink] pairs — the same approach as [HrStatusBadge].
/// Unknown / tenant-custom codes hash deterministically into the palette
/// so they still get a stable, distinct colour.
class _LeavePalette {
  // [light bg, light ink, dark bg, dark ink]
  static const _families = <List<Color>>[
    [Color(0xFFDBEAFE), Color(0xFF1E3A8A), Color(0xFF1E3A8A), Color(0xFF93C5FD)], // blue
    [Color(0xFFDCFCE7), Color(0xFF14532D), Color(0xFF14532D), Color(0xFF86EFAC)], // green
    [Color(0xFFFEF3C7), Color(0xFF78350F), Color(0xFF78350F), Color(0xFFFCD34D)], // amber
    [Color(0xFFFEE2E2), Color(0xFF7F1D1D), Color(0xFF7F1D1D), Color(0xFFFCA5A5)], // red
    [Color(0xFFEDE9FE), Color(0xFF5B21B6), Color(0xFF4C1D95), Color(0xFFC4B5FD)], // purple
    [Color(0xFFF1F5F9), Color(0xFF475569), Color(0xFF334155), Color(0xFFCBD5E1)], // slate
  ];

  // Sensible hues for the standard Indian leave codes.
  static const _byCode = <String, int>{
    'CL': 0, 'EL': 1, 'ML': 2, 'SL': 3, 'CO': 4, 'LOP': 5,
  };

  static List<Color> _family(String code) {
    final known = _byCode[code.toUpperCase()];
    if (known != null) return _families[known];
    final h = code.toUpperCase().codeUnits.fold<int>(0, (a, b) => a + b);
    return _families[h % _families.length];
  }

  /// (background, ink) for the given code under the active brightness.
  static (Color, Color) resolve(String code, bool isDark) {
    final f = _family(code);
    return isDark ? (f[2], f[3]) : (f[0], f[1]);
  }
}

/// Compact "CL · Casual Leave" chip — colour-coded per leave type so the
/// legend visually ties back to its balance pill. Names come straight off
/// the balance rows so tenant-custom leave types pick up the legend too.
class HrLeaveLegendChip extends StatelessWidget {
  final String code, name;
  const HrLeaveLegendChip({super.key, required this.code, required this.name});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (bg, ink) = _LeavePalette.resolve(code, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(text: code, style: RunqText.micro.copyWith(color: ink)),
            const TextSpan(text: '  '),
            TextSpan(text: name,
                style: RunqText.caption.copyWith(color: ink.withValues(alpha: 0.82))),
          ],
        ),
      ),
    );
  }
}

/// Row of balance pills (up to 5) plus the legend underneath.
class HrLeaveBalancePills extends StatelessWidget {
  final List<HrLeaveBalance> rows;
  const HrLeaveBalancePills({super.key, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final shown = rows.take(5).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var i = 0; i < shown.length; i++) ...[
              Expanded(child: _pill(shown[i], t, isDark)),
              if (i < shown.length - 1) const SizedBox(width: 8),
            ],
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final b in shown)
              HrLeaveLegendChip(code: b.typeCode, name: b.typeName),
          ],
        ),
      ],
    );
  }

  // The balance number stays neutral for legibility; the type code picks
  // up its leave-type colour so the pill reads against its legend chip.
  Widget _pill(HrLeaveBalance b, RunqTokens t, bool isDark) {
    final (_, ink) = _LeavePalette.resolve(b.typeCode, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          Text(_days(b.balance),
              style: RunqText.tabular(size: 20, w: FontWeight.w700, color: t.ink)),
          Text(b.typeCode, style: RunqText.label.copyWith(color: ink)),
        ],
      ),
    );
  }
}

/// One of the logged-in user's own leave requests — pending rows expose
/// edit + cancel; the server enforces ownership too.
class HrMyLeaveRow extends ConsumerWidget {
  final HrLeaveRequest req;
  const HrMyLeaveRow({super.key, required this.req});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final canCancel = req.status == 'pending';
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(req.typeName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text('${_dateRange(req.fromDate, req.toDate)} · ${_days(req.totalDays)}d',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          HrStatusBadge(status: req.status),
          if (canCancel) ...[
            const SizedBox(width: 2),
            IconButton(
              tooltip: 'Edit request',
              icon: Icon(Icons.edit_outlined, color: t.muted, size: 18),
              visualDensity: VisualDensity.compact,
              onPressed: () => _openEdit(context, ref),
            ),
            IconButton(
              tooltip: 'Cancel request',
              icon: Icon(Icons.close_rounded, color: t.muted, size: 18),
              visualDensity: VisualDensity.compact,
              onPressed: () => _confirmCancel(context, ref),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _openEdit(BuildContext context, WidgetRef ref) async {
    final types = await ref.read(hrMyLeaveTypesProvider.future);
    final tlist = types.map((lt) => (id: lt.id, code: lt.code, name: lt.name)).toList();
    if (!context.mounted) return;
    final res = await showApplyLeaveSheet(
      context,
      leaveTypes: tlist,
      submitLabel: 'Save changes',
      initial: ApplyLeaveResult(
        leaveTypeId: req.leaveTypeId,
        fromDate: req.fromDate,
        toDate: req.toDate,
        halfDay: req.halfDay,
        reason: req.reason,
      ),
    );
    if (res == null) return;
    try {
      await hrRepo.updateLeave(
        id: req.id,
        leaveTypeId: res.leaveTypeId,
        fromDate: res.fromDate,
        toDate: res.toDate,
        halfDay: res.halfDay,
        reason: res.reason ?? '',
      );
      ref.invalidate(hrMyLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveBalancesProvider);
      if (context.mounted) showRunqSnack(context, 'Leave request updated', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    }
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel this leave request?'),
        content: Text('${req.typeName} · ${_days(req.totalDays)} day(s)'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Cancel request'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await hrRepo.cancelLeave(req.id);
      ref.invalidate(hrMyLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveBalancesProvider);
      if (context.mounted) showRunqSnack(context, 'Leave request cancelled', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Could not cancel: $e', kind: SnackKind.error);
    }
  }
}

/// Compact row for an already-decided team leave — employee + dates, no
/// decision buttons; the status chip stands in. Tapping opens the
/// read-only detail sheet.
class HrReviewedLeaveRow extends StatelessWidget {
  final HrLeaveRequest req;
  const HrReviewedLeaveRow({super.key, required this.req});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: InkWell(
        onTap: () => showLeaveDetailSheet(context, req),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(req.employeeName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text(
                      '${req.typeCode} · ${_dateRange(req.fromDate, req.toDate)} · ${_days(req.totalDays)}d',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
              HrStatusBadge(status: req.status),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Read-only detail sheet for a team leave request — opened by tapping a
/// row in the Team tab's "Recent decisions" list.
Future<void> showLeaveDetailSheet(BuildContext context, HrLeaveRequest req) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _LeaveDetailSheet(req: req),
  );
}

class _LeaveDetailSheet extends StatelessWidget {
  final HrLeaveRequest req;
  const _LeaveDetailSheet({required this.req});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final reason = req.reason?.trim();
    final fields = <(String, String)>[
      ('Leave type', '${req.typeName} · ${req.typeCode}'),
      ('Dates', _dateRange(req.fromDate, req.toDate)),
      ('Duration', '${_days(req.totalDays)} day(s)${req.halfDay ? ' · half day' : ''}'),
      if (req.appliedAt != null) ('Applied on', _fullDate(req.appliedAt!)),
      ('Reason', (reason != null && reason.isNotEmpty) ? reason : '—'),
    ];
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.fromLTRB(
        20, 10, 20, 20 + MediaQuery.of(context).viewPadding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 20),
          // Header — who the request belongs to + its outcome.
          Row(
            children: [
              HrAvatar(
                name: req.employeeName,
                photoUrl: req.employeePhotoUrl,
                employeeId: req.employeeId,
                size: 48,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(req.employeeName, style: RunqText.h4.copyWith(color: t.ink)),
                    if (req.employeeCode.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(req.employeeCode, style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ],
                ),
              ),
              HrStatusBadge(status: req.status),
            ],
          ),
          const SizedBox(height: 18),
          // Detail fields grouped into one card so they read as a unit
          // distinct from the header.
          Container(
            decoration: BoxDecoration(
              color: t.bgWarm,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Column(
              children: [
                for (var i = 0; i < fields.length; i++) ...[
                  if (i > 0)
                    Divider(height: 0.5, thickness: 0.5, color: t.hairline),
                  _DetailRow(t: t, label: fields[i].$1, value: fields[i].$2),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One label → value pair inside the detail card. Label is fixed-width on
/// the left so every value starts on the same column.
class _DetailRow extends StatelessWidget {
  final RunqTokens t;
  final String label, value;
  const _DetailRow({required this.t, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(value, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          ),
        ],
      ),
    );
  }
}
