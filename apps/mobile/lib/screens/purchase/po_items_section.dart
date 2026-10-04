import 'package:flutter/material.dart';
import '../../api/purchase_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

String _qty(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

/// A PO's lines as one grouped section: header with how many are fully
/// received, a row per line separated by hairlines, and — for a priced PO —
/// the totals at the foot of the same card.
class PoDetailItemsSection extends StatelessWidget {
  final List<PurchaseOrderLine> lines;
  final bool priced;
  final double subtotal, tax, total;
  const PoDetailItemsSection({
    super.key,
    required this.lines,
    required this.priced,
    required this.subtotal,
    required this.tax,
    required this.total,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final received = lines.where((l) => l.qtyOrdered > 0 && l.qtyReceived >= l.qtyOrdered).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Row(
            children: [
              Text('ITEMS', style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
              const SizedBox(width: 8),
              _CountBadge(count: lines.length),
              const Spacer(),
              Text('$received of ${lines.length} received',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.card),
            border: Border.all(color: t.hairline, width: 0.6),
          ),
          child: Column(
            children: [
              for (var i = 0; i < lines.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 0.6, color: t.hairline, indent: 16, endIndent: 16),
                _LineRow(line: lines[i], priced: priced),
              ],
              if (priced) _Totals(subtotal: subtotal, tax: tax, total: total),
            ],
          ),
        ),
      ],
    );
  }
}

class _CountBadge extends StatelessWidget {
  final int count;
  const _CountBadge({required this.count});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
        decoration: BoxDecoration(color: PurColors.violetSubtle, borderRadius: BorderRadius.circular(999)),
        child: Text('$count',
            style: RunqText.micro.copyWith(color: PurColors.brand(context), fontWeight: FontWeight.w700)),
      );
}

/// One line: number tile, description, "received · rate", a receive bar while
/// part-received, tags (tax / HSN / billed); ordered qty + amount on the right.
class _LineRow extends StatelessWidget {
  final PurchaseOrderLine line;
  final bool priced;
  const _LineRow({required this.line, required this.priced});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ordered = line.qtyOrdered;
    final got = line.qtyReceived;
    final full = ordered > 0 && got >= ordered;
    final partial = got > 0 && !full;
    final unit = (line.uom ?? '').isEmpty ? '' : ' ${line.uom}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _NumberTile(n: line.lineNo),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.description, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 3),
                Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: '${_qty(got)} received',
                      style: TextStyle(color: full ? PurColors.success : (partial ? PurColors.orangeAlert : null)),
                    ),
                    if (priced) TextSpan(text: ' · ${indianINR(line.unitRate, decimals: 2)}'),
                  ]),
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
                // Only a part-received line needs the bar; none / all is
                // already said by the coloured "received" text.
                if (partial) ...[
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: (got / ordered).clamp(0.0, 1.0),
                      minHeight: 3,
                      backgroundColor: t.hairlineSoft,
                      valueColor: const AlwaysStoppedAnimation(PurColors.orangeAlert),
                    ),
                  ),
                ],
                ..._tags(t),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${_qty(ordered)}$unit', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              if (priced) ...[
                const SizedBox(height: 2),
                Text(indianINR(line.amount + (line.taxAmount ?? 0), decimals: 2),
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ],
          ),
        ],
      ),
    );
  }

  List<Widget> _tags(RunqTokens t) {
    final tags = [
      if (line.taxRate != null && line.taxRate! > 0) 'Tax ${line.taxRate}%',
      if ((line.hsnSacCode ?? '').isNotEmpty) 'HSN ${line.hsnSacCode}',
      if (line.qtyBilled > 0) 'Billed ${_qty(line.qtyBilled)}',
    ];
    if (tags.isEmpty) return const [];
    return [
      const SizedBox(height: 8),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final tag in tags)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: t.bgWarm,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: t.hairline),
              ),
              child: Text(tag, style: RunqText.micro.copyWith(color: t.muted)),
            ),
        ],
      ),
    ];
  }
}

class _NumberTile extends StatelessWidget {
  final int n;
  const _NumberTile({required this.n});

  @override
  Widget build(BuildContext context) => Container(
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: PurColors.violetSubtle, borderRadius: BorderRadius.circular(8)),
        child: Text('$n',
            style: RunqText.caption.copyWith(color: PurColors.brand(context), fontWeight: FontWeight.w700)),
      );
}

/// Subtotal / tax / total at the foot of the items card.
class _Totals extends StatelessWidget {
  final double subtotal, tax, total;
  const _Totals({required this.subtotal, required this.tax, required this.total});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget row(String label, double v) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(children: [
            Text(label, style: RunqText.body.copyWith(color: t.muted)),
            const Spacer(),
            Text(indianINR(v, decimals: 2), style: RunqText.body.copyWith(color: t.ink)),
          ]),
        );
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border(top: BorderSide(color: t.hairline, width: 0.6)),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(RunqRadii.card)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        children: [
          row('Subtotal', subtotal),
          row('Tax', tax),
          const SizedBox(height: 4),
          Row(children: [
            Text('Total', style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const Spacer(),
            Text(indianINR(total, decimals: 2),
                style: RunqText.h3.copyWith(color: PurColors.brand(context), fontWeight: FontWeight.w800)),
          ]),
        ],
      ),
    );
  }
}
