// Pricing card for the Inventory Item Detail screen — the sell-side and
// buy-side rates from the item master, the cost build-up behind the cost
// price, and the net profit per unit derived from the two.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';
import 'item_detail_primitives.dart';

// ── Pricing ──────────────────────────────────────────────────────────────

/// Sell-side and buy-side rates from the item master. Product items carry
/// the full MRP → margin → basic → landing chain; services only ever have
/// a selling price, cost and GST rate, so the empty rows drop out.
class ItemPricingCard extends StatefulWidget {
  const ItemPricingCard({super.key, required this.item});
  final InvItemDetail item;

  static bool hasData(InvItemDetail i) =>
      i.mrp != null ||
      i.defaultSellingPrice != null ||
      i.basicPrice != null ||
      i.gstRate != null ||
      i.gstValue != null ||
      i.costPrice != null ||
      i.margin != null ||
      i.defaultPurchasePrice != null;

  @override
  State<ItemPricingCard> createState() => _ItemPricingCardState();
}

class _ItemPricingCardState extends State<ItemPricingCard> {
  bool _showCogm = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isService = item.type == 'service';
    final rows = <Widget>[
      if (item.mrp != null)
        ItemKvRow(label: 'MRP (consumer)', value: indianINR(item.mrp!, decimals: 2)),
      if (item.margin != null)
        ItemKvRow(
          label: 'Seller margin',
          value: '${item.margin!.toStringAsFixed(2)}%',
        ),
      if (item.basicPrice != null)
        ItemKvRow(
          label: 'Basic price (excl GST)',
          value: indianINR(item.basicPrice!, decimals: 2),
        ),
      if (item.gstRate != null)
        ItemKvRow(
          label: 'GST rate',
          value: '${fmtQty(item.gstRate!)}%',
        ),
      if (item.gstValue != null)
        ItemKvRow(label: 'GST amount', value: indianINR(item.gstValue!, decimals: 2)),
      if (item.defaultSellingPrice != null)
        ItemKvRow(
          label: isService ? 'Selling price' : 'Landing price (incl GST)',
          value: indianINR(item.defaultSellingPrice!, decimals: 2),
          emphasis: true,
        ),
      if (item.costPrice != null)
        ItemKvRow(
          label: 'Cost price',
          value: indianINR(item.costPrice!, decimals: 2),
          // Only offer the disclosure when there is a split to show —
          // a chevron that opens an empty list is worse than no chevron.
          expanded: item.cogmBreakdown.isEmpty ? null : _showCogm,
          onToggle: item.cogmBreakdown.isEmpty
              ? null
              : () => setState(() => _showCogm = !_showCogm),
        ),
      if (item.costPrice != null && _showCogm)
        ItemCogmBreakdown(components: item.cogmBreakdown, total: item.costPrice!),
      if (item.defaultPurchasePrice != null)
        ItemKvRow(
          label: 'Default purchase rate',
          value: indianINR(item.defaultPurchasePrice!, decimals: 2),
        ),
    ];
    final profit = netProfitPerUnit(item);
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ItemKvList(rows: rows),
          if (profit != null) ...[
            const SizedBox(height: 10),
            _NetProfitRow(profit: profit, unit: item.unit),
          ],
        ],
      ),
    );
  }
}

/// Taxable revenue minus cost, per unit sold — the same figure the web
/// item form previews as "Profit / unit". Uses the stored basic price when
/// there is one, else derives it from the GST-inclusive selling price;
/// returns null when either side of the subtraction is missing, since a
/// zero would read as break-even rather than "not known".
({double amount, double marginPct})? netProfitPerUnit(InvItemDetail item) {
  final cost = item.costPrice;
  if (cost == null) return null;
  var basic = item.basicPrice;
  if (basic == null && item.defaultSellingPrice != null && item.gstRate != null) {
    basic = item.defaultSellingPrice! / (1 + item.gstRate! / 100);
  }
  if (basic == null || basic <= 0) return null;
  final amount = basic - cost;
  return (amount: amount, marginPct: amount / basic * 100);
}

/// Emphasised footer on the pricing card. Colour-coded the way the web
/// form tones its preview strip: loss red, thin (<5%) amber, healthy green.
class _NetProfitRow extends StatelessWidget {
  const _NetProfitRow({required this.profit, required this.unit});
  final ({double amount, double marginPct}) profit;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tone = profit.amount < 0
        ? InvColors.error
        : profit.marginPct < 5
            ? InvColors.orangeAlert
            : InvColors.success;
    final bg = profit.amount < 0
        ? InvColors.errorBg
        : profit.marginPct < 5
            ? InvColors.orangeAlertBg
            : InvColors.successBg;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profit.amount < 0 ? 'Net loss per unit' : 'Net profit per unit',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
                const SizedBox(height: 2),
                Text(
                  'Basic price less cost${unit == null ? '' : ', per ${unit!}'}',
                  style: RunqText.micro.copyWith(color: t.muted2),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                indianINR(profit.amount, decimals: 2),
                style: RunqText.h4.copyWith(color: tone),
              ),
              Text(
                '${profit.marginPct.toStringAsFixed(2)}% margin',
                style: RunqText.micro.copyWith(color: tone),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Expanded cost build-up under the Cost price row. Shows each component
/// and flags any gap between the components and the stored cost, so a
/// half-maintained breakdown doesn't read as the whole story.
class ItemCogmBreakdown extends StatelessWidget {
  const ItemCogmBreakdown({super.key, required this.components, required this.total});
  final List<InvCogmComponent> components;
  final double total;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final sum = components.fold<double>(0, (a, c) => a + c.amount);
    final gap = total - sum;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final c in components)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.label,
                          style: RunqText.caption.copyWith(color: t.ink),
                        ),
                        if ((c.note ?? '').isNotEmpty)
                          Text(
                            c.note!,
                            style: RunqText.micro.copyWith(color: t.muted2),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    indianINR(c.amount, decimals: 2),
                    style: RunqText.caption.copyWith(color: t.ink),
                  ),
                ],
              ),
            ),
          // Sub-rupee drift is just rounding; anything larger means the
          // breakdown doesn't account for the full cost.
          if (gap.abs() >= 0.01)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      gap > 0 ? 'Unallocated' : 'Over-allocated',
                      style: RunqText.caption.copyWith(color: InvColors.orangeAlert),
                    ),
                  ),
                  Text(
                    indianINR(gap, decimals: 2),
                    style: RunqText.caption.copyWith(color: InvColors.orangeAlert),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
