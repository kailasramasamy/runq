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
