// The two chip rows on the mark-attendance sheet — pick a status, pick a
// leave type — plus the notice shown when no leave types exist. Pure
// presentation: selection state lives on the sheet.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_attendance_status.dart';
import 'hr_colors.dart';

/// Status chips, coloured with the same palette the calendar cells use so
/// the chip and the day it writes read as the same thing.
class HrStatusChips extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onSelect;
  const HrStatusChips({super.key, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: kHrMarkableStatuses.map((s) {
        final meta = hrStatusMeta(s);
        final pair = hrStatusColors(context, s);
        final on = selected == s;
        return _Chip(
          on: on,
          fill: pair[0],
          accent: pair[1],
          onTap: () => onSelect(s),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(meta.icon, size: 15, color: on ? pair[1] : t.muted),
              const SizedBox(width: 6),
              Text(
                meta.label,
                style: RunqText.caption.copyWith(
                  color: on ? pair[1] : t.ink,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

/// Leave-type chips, each carrying its remaining balance so the picker
/// doubles as the balance check.
class HrLeaveTypeChips extends StatelessWidget {
  final List<HrLeaveType> types;
  final List<HrLeaveBalance> balances;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  const HrLeaveTypeChips({
    super.key,
    required this.types,
    required this.balances,
    required this.selectedId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: types.map((lt) {
        final on = selectedId == lt.id;
        final bal = balances.where((b) => b.leaveTypeId == lt.id).firstOrNull;
        return _Chip(
          on: on,
          fill: HrColors.tealSubtle,
          accent: brand,
          onTap: () => onSelect(lt.id),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(lt.code,
                  style: RunqText.caption.copyWith(
                    color: on ? brand : t.ink,
                    fontWeight: FontWeight.w700,
                  )),
              if (bal != null) ...[
                const SizedBox(width: 6),
                Text(
                  _trimNum(bal.balance),
                  style: RunqText.caption.copyWith(color: on ? brand : t.muted),
                ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }
}

/// Shown in place of the type chips when the tenant has configured none —
/// the mark still lands, it just doesn't touch a balance.
class HrNoLeaveTypesNotice extends StatelessWidget {
  const HrNoLeaveTypesNotice({super.key});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Text(
        'No leave types configured. The day will be marked on the calendar '
        'only — no leave balance will be deducted.',
        style: RunqText.caption.copyWith(color: t.muted),
      ),
    );
  }
}

/// Amber note when part of a leave range would be approved unpaid — the
/// balance is exhausted, or the type's monthly paid-day cap is. Marking leave
/// from this sheet approves it immediately, so this is the only moment the
/// employee (or their manager) can see the shortfall before payroll does.
class HrUnpaidLeaveWarning extends StatelessWidget {
  final HrLeavePreview preview;
  const HrUnpaidLeaveWarning({super.key, required this.preview});

  static String _d(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0x33B45309) : const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: fg.withValues(alpha: 0.35), width: 0.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, size: 16, color: fg),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${_d(preview.paidDays)} paid, ${_d(preview.unpaidDays)} unpaid. '
              'Beyond the paid limit for ${preview.leaveTypeName}, so the extra '
              '${_d(preview.unpaidDays)} day(s) will be loss of pay.',
              style: RunqText.caption.copyWith(color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final bool on;
  final Color fill, accent;
  final VoidCallback onTap;
  final Widget child;
  const _Chip({
    required this.on,
    required this.fill,
    required this.accent,
    required this.onTap,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: on ? fill : t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.chip),
          border: Border.all(
            color: on ? accent : t.hairline,
            width: on ? 1.5 : 0.5,
          ),
        ),
        child: child,
      ),
    );
  }
}

String _trimNum(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 1);
