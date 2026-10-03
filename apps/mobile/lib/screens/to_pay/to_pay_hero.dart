import 'package:flutter/material.dart';
import '../../api/to_pay_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'to_pay_style.dart';

/// Gradient summary: what is still owed (outstanding) or the month's ledger.
class ToPayHero extends StatelessWidget {
  final ToPay data;
  const ToPayHero({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final month = data.isMonth;
    final pending = data.items.where((i) => i.balance > 0).length;
    final paidCount = data.categories.fold<int>(0, (s, c) => s + c.paidCount);
    final label = month ? monthTitle(dateOnly(data.month ?? data.asOf)) : 'To pay';
    final big = month ? data.total : data.balance;
    final caption = month
        ? '${formatINR(data.paid, compact: true)} paid · ${formatINR(data.balance, compact: true)} pending'
        : '${countLabel(pending)} · as of ${longDate(data.asOf)}';
    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: const [
          BoxShadow(color: Color(0x331E1B4B), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: RunqText.label.copyWith(color: Colors.white.withValues(alpha: 0.65))),
          const SizedBox(height: 8),
          Text(formatINR(big),
              style: RunqText.display.copyWith(color: Colors.white, height: 1.05)),
          const SizedBox(height: 4),
          Text(caption,
              style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.78))),
          const SizedBox(height: 14),
          Row(
            children: month
                ? _monthChips(paidCount, pending)
                : [
                    _chip('Overdue', data.overdue, countLabel(data.overdueCount)),
                    const SizedBox(width: 10),
                    _chip('This week', data.thisWeek, countLabel(data.thisWeekCount)),
                  ],
          ),
        ],
      ),
    );
  }

  List<Widget> _monthChips(int paidCount, int pending) => [
        _chip('Paid', data.paid, '$paidCount of ${data.items.length} paid'),
        const SizedBox(width: 10),
        _chip(
          'Pending',
          data.balance,
          data.overdue > 0
              ? '${formatINR(data.overdue, compact: true)} overdue'
              : pending == 0
                  ? 'nothing pending'
                  : countLabel(pending),
        ),
      ];

  Widget _chip(String label, double amount, String caption) => Expanded(
        child: _HeroChip(label: label, value: formatINR(amount, compact: true), caption: caption),
      );
}

class _HeroChip extends StatelessWidget {
  final String label, value, caption;
  const _HeroChip({required this.label, required this.value, required this.caption});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.7)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(value, style: RunqText.tabular(size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.78)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
