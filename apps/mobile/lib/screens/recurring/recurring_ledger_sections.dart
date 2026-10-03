import 'package:flutter/material.dart';
import '../../api/recurring_bill_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_card.dart';
import 'recurring_widgets.dart';

/// A titled, card-grouped list with hairline separators between rows.
class LedgerSection extends StatelessWidget {
  final String title, summary, emptyText;
  final List<Widget> rows;
  const LedgerSection({
    super.key,
    required this.title,
    required this.summary,
    required this.emptyText,
    required this.rows,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(title.toUpperCase(),
                    style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
              ),
              if (rows.isNotEmpty) Text(summary, style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ),
        RunqCard(
          padding: EdgeInsets.zero,
          child: rows.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(emptyText, style: RunqText.body.copyWith(color: t.muted)),
                )
              : Column(
                  children: [
                    for (var i = 0; i < rows.length; i++) ...[
                      if (i > 0)
                        Divider(height: 1, thickness: 0.6, color: t.hairline, indent: 16, endIndent: 16),
                      rows[i],
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

Widget _tile(IconData icon, Color c) => Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, size: 19, color: c),
    );

/// One billed period: label, bill no. + date, amount and its paid state.
class LedgerMonthRow extends StatelessWidget {
  final RecurringMonth m;
  const LedgerMonthRow({super.key, required this.m});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    final (label, color) = switch (m.status) {
      'paid' => ('Paid', ink.green),
      'partially_paid' => ('${formatINR(m.balance)} due', ink.amber),
      _ => ('Due', ink.red),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          _tile(Icons.receipt_long_outlined, color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text('${m.invoiceNumber} · billed ${dayLabel(m.invoiceDate)}',
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
              Text(formatINR(m.total), style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              RecurringChip(label, color),
            ],
          ),
        ],
      ),
    );
  }
}

/// One payment: date, the periods it settled, UTR and any advance left over.
class LedgerPaymentRow extends StatelessWidget {
  final RecurringPaymentRow p;
  final VoidCallback onCancel;
  const LedgerPaymentRow({super.key, required this.p, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    final utr = p.reference;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 4, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _tile(Icons.north_east_rounded, RunqColors.indigo),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dayLabel(p.date), style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                for (final f in p.paidFor)
                  Text('For ${f.label}', style: RunqText.caption.copyWith(color: t.ink2)),
                if (utr != null && utr.isNotEmpty)
                  Text('UTR $utr', style: RunqText.caption.copyWith(color: t.muted)),
                if (p.status == 'pending')
                  Text('Awaiting approval', style: RunqText.caption.copyWith(color: ink.amber)),
                if (p.unapplied > 0)
                  Text('${formatINR(p.unapplied)} held as advance',
                      style: RunqText.caption.copyWith(color: ink.green)),
              ],
            ),
          ),
          Text(formatINR(p.amount), style: RunqText.bodyStrong.copyWith(color: t.ink)),
          IconButton(
            tooltip: 'Cancel payment',
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.undo_rounded, size: 18, color: t.muted),
            onPressed: onCancel,
          ),
        ],
      ),
    );
  }
}
