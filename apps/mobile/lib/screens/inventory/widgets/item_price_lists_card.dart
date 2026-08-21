// "Price Lists" section on the item detail screen — who has a negotiated
// price for this item and what it is.
//
// Lines arrive most-specific-scope-first (named party → group → catch-all),
// matching the order the price resolver walks when it prices an invoice
// line, so reading top-down tells you which price actually wins.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';
import 'item_detail_primitives.dart';

/// One card per price list, with a row per quantity tier.
class ItemPriceListsCard extends StatelessWidget {
  const ItemPriceListsCard({super.key, required this.lines, required this.unit});
  final List<InvItemPriceLine> lines;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    // Group tiers under their list — a 3-tier volume price is one
    // negotiated deal, not three unrelated prices.
    final groups = <String, List<InvItemPriceLine>>{};
    for (final l in lines) {
      groups.putIfAbsent(l.priceListId, () => []).add(l);
    }
    return Column(
      children: [
        for (final entry in groups.entries) ...[
          _PriceListGroup(lines: entry.value, unit: unit),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _PriceListGroup extends StatelessWidget {
  const _PriceListGroup({required this.lines, required this.unit});
  final List<InvItemPriceLine> lines;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final head = lines.first;
    final buying = head.type == 'buying';
    // A list that is switched off or out of its validity window still shows
    // — hiding it would leave the user wondering where a price went — but
    // it reads as inert rather than as the live price.
    final inert = !head.isActive || head.isExpired;
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: buying ? InvColors.infoBg : InvColors.amberSubtle,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  _scopeIcon(head.applyTo),
                  size: 16,
                  color: buying ? InvColors.info : InvColors.brand(context),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      head.scopeLabel,
                      style: RunqText.bodyStrong.copyWith(
                        color: inert ? t.muted : t.ink,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      head.priceListName,
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              ItemBadge(
                label: buying ? 'Buying' : 'Selling',
                bg: buying ? InvColors.infoBg : InvColors.amberSubtle,
                fg: buying ? InvColors.info : InvColors.amberDeep,
              ),
              if (!head.isActive)
                ItemBadge(
                  label: 'Inactive',
                  bg: InvColors.errorBg,
                  fg: InvColors.error,
                ),
              if (head.isExpired)
                ItemBadge(
                  label: _validityLabel(head),
                  bg: InvColors.orangeAlertBg,
                  fg: InvColors.orangeAlert,
                )
              else if (head.validTo != null)
                ItemBadge(
                  label: 'Till ${head.validTo}',
                  bg: t.bgWarmer,
                  fg: t.muted,
                ),
            ],
          ),
          const SizedBox(height: 4),
          for (final l in lines) _TierRow(line: l, unit: unit, inert: inert),
        ],
      ),
    );
  }

  static IconData _scopeIcon(String applyTo) {
    switch (applyTo) {
      case 'customer':
      case 'vendor':
        return Icons.person_outline;
      case 'customer_group':
      case 'vendor_group':
        return Icons.groups_outlined;
      default:
        return Icons.public;
    }
  }

  static String _validityLabel(InvItemPriceLine l) {
    // Expired covers both ends of the window — a list that hasn't started
    // yet is just as inapplicable as one that has lapsed.
    if (l.validTo != null) return 'Expired ${l.validTo}';
    if (l.validFrom != null) return 'Starts ${l.validFrom}';
    return 'Not in effect';
  }
}

/// One quantity tier, broken out line by line: what the party is charged
/// before tax, the tax on it, and the all-in price — plus the margin and
/// MRP the rate was derived from, so the number can be checked rather than
/// just trusted.
class _TierRow extends StatelessWidget {
  const _TierRow({required this.line, required this.unit, required this.inert});
  final InvItemPriceLine line;
  final String? unit;
  final bool inert;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final discounted =
        line.discountPercent != null && line.effectiveRate != line.derivedRate;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  line.minQuantity > 0
                      ? '${fmtQty(line.minQuantity)}${unit == null ? '' : ' ${unit!}'}+'
                      : 'Base tier',
                  style: RunqText.label.copyWith(color: t.muted),
                ),
              ),
              if (line.rate != null)
                Text(
                  'Fixed rate',
                  style: RunqText.micro.copyWith(color: t.muted2),
                ),
            ],
          ),
          const SizedBox(height: 4),
          // Inputs first — these are what the rate was computed from.
          if (line.mrp != null)
            _BreakupRow(
              label: 'MRP',
              value: indianINR(line.mrp!, decimals: 2),
            ),
          if (line.effectiveMarginPct != null)
            _BreakupRow(
              label: 'Seller margin',
              value: '${trimPct(line.effectiveMarginPct!)}%',
            ),
          if (discounted)
            _BreakupRow(
              label: 'List rate',
              value: indianINR(line.derivedRate, decimals: 2),
              strike: true,
            ),
          if (line.discountPercent != null)
            _BreakupRow(
              label: 'Discount',
              value: '${trimPct(line.discountPercent!)}%',
              tone: InvColors.success,
            ),
          // Then the money, in the order it stacks up.
          _BreakupRow(
            label: 'Basic rate (excl GST)',
            value: indianINR(line.effectiveRate, decimals: 2),
          ),
          _BreakupRow(
            label: 'GST @ ${trimPct(line.gstRatePct)}%',
            value: indianINR(line.gstAmount, decimals: 2),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Landing rate (incl GST)',
                    style: RunqText.bodyStrong.copyWith(
                      color: inert ? t.muted : t.ink,
                      fontSize: 13,
                    ),
                  ),
                ),
                Text(
                  indianINR(line.landingRate, decimals: 2),
                  style: RunqText.h4.copyWith(
                    color: inert ? t.muted : InvColors.brand(context),
                  ),
                ),
              ],
            ),
          ),
          if (line.netProfitPerUnit != null)
            _ProfitRow(
              profit: line.netProfitPerUnit!,
              marginPct: line.netMarginPct ?? 0,
              inert: inert,
            ),
        ],
      ),
    );
  }
}

/// What this tier leaves us per unit. Sits below the landing rate because
/// it answers the question the rest of the breakup sets up: at this price,
/// do we make money? Absent entirely when the item has no cost price —
/// showing ₹0 would read as break-even rather than "we don't know".
class _ProfitRow extends StatelessWidget {
  const _ProfitRow({
    required this.profit,
    required this.marginPct,
    required this.inert,
  });
  final double profit;
  final double marginPct;
  final bool inert;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tone = inert
        ? t.muted
        : profit < 0
            ? InvColors.error
            : marginPct < 5
                ? InvColors.orangeAlert
                : InvColors.success;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              profit < 0 ? 'Net loss / unit' : 'Net profit / unit',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ),
          Text(
            indianINR(profit, decimals: 2),
            style: RunqText.bodyStrong.copyWith(color: tone, fontSize: 13),
          ),
          const SizedBox(width: 6),
          Text(
            '(${marginPct.toStringAsFixed(1)}%)',
            style: RunqText.micro.copyWith(color: tone),
          ),
        ],
      ),
    );
  }
}

/// One `label ····· value` line inside a tier's breakup.
class _BreakupRow extends StatelessWidget {
  const _BreakupRow({
    required this.label,
    required this.value,
    this.strike = false,
    this.tone,
  });
  final String label;
  final String value;
  final bool strike;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: RunqText.caption.copyWith(color: tone ?? t.muted),
            ),
          ),
          Text(
            value,
            style: RunqText.caption.copyWith(
              color: tone ?? (strike ? t.muted2 : t.ink),
              decoration: strike ? TextDecoration.lineThrough : null,
            ),
          ),
        ],
      ),
    );
  }
}

/// `20.00` → `20`, `12.50` → `12.5` — percentages read better without the
/// trailing zeros the API's decimal columns carry.
String trimPct(double v) {
  final s = v.toStringAsFixed(2);
  return s.endsWith('.00')
      ? s.substring(0, s.length - 3)
      : (s.endsWith('0') ? s.substring(0, s.length - 1) : s);
}
