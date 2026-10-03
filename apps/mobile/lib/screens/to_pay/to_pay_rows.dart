import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../api/to_pay_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_snack.dart';
import '../recurring/recurring_widgets.dart';
import 'to_pay_milk_sheet.dart';
import 'to_pay_style.dart';

/// One category in the summary card. [month] swaps the trailing figure for
/// pending / Paid and adds a progress bar.
class ToPayCategoryRow extends StatelessWidget {
  final ToPayCategory c;
  final bool selected, month;
  final VoidCallback? onTap;
  const ToPayCategoryRow({
    super.key,
    required this.c,
    required this.selected,
    required this.month,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Container(
        color: selected ? t.brand.withValues(alpha: 0.08) : null,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            ToPayTile(c.key),
            const SizedBox(width: 12),
            Expanded(child: month ? _monthMiddle(context) : _outstandingMiddle(context)),
            const SizedBox(width: 8),
            _trailing(context),
          ],
        ),
      ),
    );
  }

  Widget _label(BuildContext context) =>
      Text(c.label, style: RunqText.bodyStrong.copyWith(color: RT(context).ink));

  Widget _outstandingMiddle(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(context),
        const SizedBox(height: 2),
        Text.rich(
          TextSpan(
            text: countLabel(c.count - c.paidCount),
            children: [
              if (c.overdue > 0)
                TextSpan(
                  text: ' · ${formatINR(c.overdue, compact: true)} overdue',
                  style: TextStyle(color: ink.red),
                ),
            ],
          ),
          style: RunqText.caption.copyWith(color: t.muted),
        ),
      ],
    );
  }

  Widget _monthMiddle(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(context),
        const SizedBox(height: 2),
        Text('${c.paidCount} of ${c.count} paid',
            style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: c.total > 0 ? (c.paid / c.total).clamp(0.0, 1.0) : 0,
            minHeight: 4,
            color: ink.green,
            backgroundColor: t.hairlineSoft,
          ),
        ),
      ],
    );
  }

  Widget _trailing(BuildContext context) {
    final t = RT(context);
    if (month && c.balance <= 0) {
      return RecurringChip('Paid', RecurringInk.of(context).green);
    }
    return Text(formatINR(month ? c.balance : c.total, compact: true),
        style: RunqText.bodyStrong.copyWith(color: t.ink));
  }
}

/// One payment: type tile, title, due caption, amount and a status chip.
class ToPayItemRow extends StatelessWidget {
  final ToPayItem item;
  final String asOf;
  final bool month;
  const ToPayItemRow({super.key, required this.item, required this.asOf, required this.month});

  void _open(BuildContext context) {
    final link = item.mobileLink;
    final cycle = item.milkCycle;
    if (cycle != null) {
      showMilkPayeesSheet(context, item: item, cycleId: cycle.cycleId, vmccNodeId: cycle.vmccNodeId);
    } else if (link == null) {
      RunqSnack.info(context, 'Open runq on the web to pay this');
    } else {
      context.push(link);
    }
  }

  (String, Color) _chip(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    final days = dateOnly(item.dueDate).difference(dateOnly(asOf)).inDays;
    final late = item.balance > 0 && days < 0;
    if (!month) {
      return late ? ('${-days}d overdue', ink.red) : ('Due ${shortDate(item.dueDate)}', t.muted);
    }
    if (item.status == 'paid' || item.balance <= 0) return ('Paid', ink.green);
    if (item.status == 'partial') return ('${formatINR(item.balance, compact: true)} due', ink.amber);
    return late ? ('Overdue', ink.red) : ('Due', ink.red);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (label, color) = _chip(context);
    return InkWell(
      onTap: () => _open(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            ToPayTile(item.category),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(
                      [if (item.subtitle.isNotEmpty) item.subtitle, if (month) 'due ${shortDate(item.dueDate)}']
                          .join(' · '),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(formatINR(month ? item.amount : item.balance, compact: true),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 4),
                RecurringChip(label, color),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
