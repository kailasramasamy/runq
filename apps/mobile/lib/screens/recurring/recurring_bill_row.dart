import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../api/recurring_bill_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_card.dart';
import 'recurring_widgets.dart';

/// One agreement in the list: type tile, title, status chip, amounts.
class RecurringBillRow extends StatelessWidget {
  final RecurringBill r;
  const RecurringBillRow({super.key, required this.r});

  @override
  Widget build(BuildContext context) {
    final style = categoryStyle(context, r.category);
    return RunqCard(
      onTap: () => context.push('/recurring-bills/${r.id}'),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: style.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(style.icon, color: style.color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(child: _Middle(r: r)),
          const SizedBox(width: 8),
          _Trailing(r: r),
        ],
      ),
    );
  }
}

class _Middle extends StatelessWidget {
  final RecurringBill r;
  const _Middle({required this.r});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    final (label, color) = !r.isActive
        ? ('Paused', t.muted)
        : r.outstanding > 0
            ? ('Due ${formatINR(r.outstanding, compact: true)}', ink.amber)
            : ('Paid up', ink.green);
    final cadence = r.frequency == 'semi_monthly' ? 'Twice a month' : 'Monthly';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(r.title,
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
        const SizedBox(height: 4),
        Row(
          children: [
            _StatusChip(label, color),
            const SizedBox(width: 8),
            Flexible(
              child: Text('${formatINR(r.amount, compact: true)}/mo · $cadence',
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(r.vendorName,
            style: RunqText.caption.copyWith(color: t.muted2),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusChip(this.label, this.color);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(label,
            style: RunqText.label.copyWith(color: color, fontWeight: FontWeight.w700)),
      );
}

class _Trailing extends StatelessWidget {
  final RecurringBill r;
  const _Trailing({required this.r});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(r.outstanding > 0 ? formatINR(r.outstanding, compact: true) : '—',
            style: RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink)),
        if (r.advanceHeld > 0)
          Text('${formatINR(r.advanceHeld, compact: true)} adv.',
              style: RunqText.caption.copyWith(color: ink.green)),
        const SizedBox(height: 2),
        Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
      ],
    );
  }
}
