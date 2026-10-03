import 'package:flutter/material.dart';
import '../../api/recurring_bill_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';

/// Gradient summary over all agreements: what is owed, the monthly
/// commitment, and advances still held.
class RecurringBillsHero extends StatelessWidget {
  final List<RecurringBill> rows;
  const RecurringBillsHero({super.key, required this.rows});

  double _sum(Iterable<RecurringBill> r, double Function(RecurringBill) f) =>
      r.fold<double>(0, (s, x) => s + f(x));

  @override
  Widget build(BuildContext context) {
    final active = rows.where((r) => r.isActive).toList();
    // Money owed is owed even on a paused agreement — count every row.
    final owing = rows.where((r) => r.outstanding > 0).toList();
    final due = _sum(owing, (r) => r.outstanding);
    final commit = _sum(active, (r) => r.amount);
    final rent = _sum(active.where((r) => r.category == 'rent'), (r) => r.amount);
    final transport = _sum(active.where((r) => r.category == 'transport'), (r) => r.amount);
    final adv = _sum(rows, (r) => r.advanceHeld);
    final white70 = Colors.white.withValues(alpha: 0.78);
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
          Text('OUTSTANDING',
              style: RunqText.label.copyWith(color: Colors.white.withValues(alpha: 0.65))),
          const SizedBox(height: 8),
          Text(formatINR(due),
              style: RunqText.display.copyWith(color: Colors.white, height: 1.05)),
          const SizedBox(height: 4),
          Text(
            due <= 0
                ? 'All paid up'
                : 'across ${owing.length} ${owing.length == 1 ? 'agreement' : 'agreements'}',
            style: RunqText.caption.copyWith(color: white70),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _HeroChip(
                  label: 'Monthly commitment',
                  value: formatINR(commit, compact: true),
                  caption: 'rent ${formatINR(rent, compact: true)}'
                      ' · transport ${formatINR(transport, compact: true)}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _HeroChip(
                  label: 'Advance held',
                  value: formatINR(adv, compact: true),
                  caption: adv > 0 ? 'to be used by next bills' : 'none',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
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
          Text(value,
              style: RunqText.tabular(size: 18, w: FontWeight.w700, color: Colors.white)),
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
