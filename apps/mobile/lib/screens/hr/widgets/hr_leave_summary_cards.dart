// Leave balance / request cards, shared by the employee-detail Time tab
// and the dedicated Attendance & leave screen.
//
// Lifted verbatim out of `hr_employee_detail_screen.dart` (where they were
// private `_BalanceCard` / `_LeaveRequestRow`) so both surfaces render the
// same card instead of drifting apart.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_widgets.dart';

class HrLeaveBalanceCard extends StatelessWidget {
  final HrLeaveBalance b;
  const HrLeaveBalanceCard({super.key, required this.b});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final available = b.opening + b.accrued;
    final usedPct = available <= 0 ? 0.0 : (b.used / available).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(b.typeCode,
                    style: RunqText.label.copyWith(color: HrColors.brand(context))),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(b.typeName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
              Text(
                b.balance.toStringAsFixed(b.balance % 1 == 0 ? 0 : 1),
                style: RunqText.tabular(size: 20, w: FontWeight.w800, color: t.ink),
              ),
              const SizedBox(width: 4),
              Text('days', style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: usedPct,
              minHeight: 6,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation<Color>(HrColors.brand(context)),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _meta(context, 'Opening', b.opening),
              _meta(context, 'Accrued', b.accrued),
              _meta(context, 'Used', b.used),
            ],
          ),
        ],
      ),
    );
  }

  Widget _meta(BuildContext context, String label, double v) {
    final t = RT(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
          const SizedBox(height: 2),
          Text(v.toStringAsFixed(v % 1 == 0 ? 0 : 1),
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
        ],
      ),
    );
  }
}

class HrLeaveRequestRow extends StatelessWidget {
  final HrLeaveRequest r;
  const HrLeaveRequestRow({super.key, required this.r});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(r.typeCode,
                style: RunqText.label.copyWith(color: HrColors.brand(context))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(hrLeaveRange(r.fromDate, r.toDate),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(
                  '${hrLeaveDays(r.totalDays)}${r.halfDay ? ' · half day' : ''}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          HrStatusBadge(status: r.status),
        ],
      ),
    );
  }
}

const _kMon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

String _dayMon(DateTime d) => '${d.day} ${_kMon[d.month - 1]}';

String hrLeaveRange(DateTime a, DateTime b) {
  final sameDay = a.year == b.year && a.month == b.month && a.day == b.day;
  if (sameDay) return '${a.day} ${_kMon[a.month - 1]} ${a.year}';
  return '${_dayMon(a)} – ${_dayMon(b)} ${b.year}';
}

String hrLeaveDays(double v) {
  final s = v.toStringAsFixed(v % 1 == 0 ? 0 : 1);
  return '$s ${v == 1 ? 'day' : 'days'}';
}
