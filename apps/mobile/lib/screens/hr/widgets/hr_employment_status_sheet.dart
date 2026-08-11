// "Change employment status" — the four states the schema allows, picked
// from a sheet off the employee actions menu. Replaces the old two-state
// Mark active / Mark inactive toggle, which couldn't reach `terminated`
// or `on_leave` at all.
//
// Terminating is the one change with downstream consequences (F&F settles
// against the exit date, accrual and the directory drop the employee), so
// it asks for an exit date and a confirmation. The other three apply on
// the tap — they're all reversible and settle nothing.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';

const _statuses = <String>['active', 'on_leave', 'inactive', 'terminated'];

String employmentStatusLabel(String s) => switch (s) {
      'active' => 'Active',
      'on_leave' => 'On leave',
      'inactive' => 'Inactive',
      'terminated' => 'Terminated',
      _ => s,
    };

String _statusBlurb(String s) => switch (s) {
      'active' => 'On the payroll, accruing leave, listed in the directory.',
      'on_leave' => 'Still employed, but not accruing leave while away.',
      'inactive' => 'Off the directory and payroll runs. Reversible any time.',
      'terminated' => 'Exited. Needs an exit date for F&F to settle against.',
      _ => '',
    };

IconData _statusIcon(String s) => switch (s) {
      'active' => Icons.play_circle_outline,
      'on_leave' => Icons.beach_access_outlined,
      'inactive' => Icons.pause_circle_outline,
      'terminated' => Icons.logout_rounded,
      _ => Icons.circle_outlined,
    };

/// Opens the picker and applies the chosen status. Call with the root
/// navigator's context — the caller's sheet is usually being popped.
Future<void> showEmploymentStatusSheet(
  BuildContext context,
  WidgetRef ref,
  HrEmployee emp,
) async {
  final picked = await showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _StatusSheet(current: emp.status),
  );
  if (picked == null || picked == emp.status) return;

  DateTime? exitDate;
  if (picked == 'terminated') {
    if (!context.mounted) return;
    exitDate = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      // Nobody exits before they joined.
      firstDate: emp.joiningDate ?? DateTime(1960),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: 'Exit date',
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
        ),
        child: child!,
      ),
    );
    // No exit date, no termination — F&F settles against it, so a
    // termination without one is an incomplete record.
    if (exitDate == null) return;
    if (!context.mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Mark terminated?'),
        content: Text(
          '${emp.displayName} will be marked terminated. They stop accruing '
          'leave and leave the active directory. You can set them back to '
          'active later.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: HrColors.teal),
            child: const Text('Mark terminated'),
          ),
        ],
      ),
    );
    if (ok != true) return;
  }

  final body = <String, dynamic>{
    'status': picked,
    // Explicit null when leaving `terminated`: an employee back on the
    // payroll with an exit date still on file would leave F&F a
    // settlement target for someone who never left.
    'exitDate': exitDate == null
        ? null
        : '${exitDate.year.toString().padLeft(4, '0')}-'
            '${exitDate.month.toString().padLeft(2, '0')}-'
            '${exitDate.day.toString().padLeft(2, '0')}',
  };

  try {
    await hrRepo.updateEmployee(emp.id, body);
    ref.invalidate(hrEmployeeProvider(emp.id));
    ref.invalidate(hrEmployeesProvider);
    if (context.mounted) {
      showRunqSnack(context, 'Marked ${employmentStatusLabel(picked).toLowerCase()}',
          kind: SnackKind.success);
    }
  } catch (e) {
    if (context.mounted) {
      showRunqSnack(context, 'Status change failed: $e', kind: SnackKind.error);
    }
  }
}

class _StatusSheet extends StatelessWidget {
  final String current;
  const _StatusSheet({required this.current});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text('Employment status', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 10),
            for (final s in _statuses) _StatusRow(status: s, selected: s == current),
            const SizedBox(height: 4),
            Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                child: Text('Cancel', style: TextStyle(color: t.muted)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final String status;
  final bool selected;
  const _StatusRow({required this.status, required this.selected});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return InkWell(
      onTap: () => Navigator.of(context).pop(status),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_statusIcon(status), size: 20, color: selected ? brand : t.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    employmentStatusLabel(status),
                    style: RunqText.body.copyWith(
                      color: selected ? brand : t.ink,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(_statusBlurb(status), style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            if (selected) Icon(Icons.check_rounded, size: 18, color: brand),
          ],
        ),
      ),
    );
  }
}
