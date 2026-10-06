import 'package:flutter/material.dart';

import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import 'variance_widgets.dart';

/// The variance screen's hero: the net in rupees, set against what was sent,
/// with loss and gain side by side — never only the net, since a plant that
/// nets to zero because one CC leaks and another over-reads is not fine.
class VarianceSummaryCard extends StatelessWidget {
  const VarianceSummaryCard({
    super.key,
    required this.totals,
    required this.periodLabel,
    required this.movedLoads,
    required this.sharing,
    required this.onShare,
  });

  final MpVarianceTally totals;
  final String periodLabel;
  final int movedLoads;
  final bool sharing;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final s = totals;
    // A zero rupee net can still carry litres (all unpriced), so fall back to them.
    final loss = s.netValue != 0 ? s.netValue < 0 : s.netQty < 0;
    return DhenuCard(
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _header(t, l, loss),
          Text(
            rupees(s.netValue.abs()),
            style: DhenuText.number(size: 32, color: loss ? t.gradeC : t.gradeA),
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            l.varianceNetContext(
              signedLitres(s.netQty, unit: true),
              '${s.netPct.abs().toStringAsFixed(1)}%',
              litres(s.dispatchedQty, unit: true),
            ),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
          const SizedBox(height: DhenuSpacing.lg),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _VarianceTile(
                    icon: DhenuIcons.trendDown,
                    label: l.varianceShortLabel,
                    qty: s.shortQty,
                    value: s.shortValue,
                    loads: s.shortLoads,
                    color: t.gradeC,
                  ),
                ),
                const SizedBox(width: DhenuSpacing.sm),
                Expanded(
                  child: _VarianceTile(
                    icon: DhenuIcons.trendUp,
                    label: l.varianceGainedLabel,
                    qty: s.gainQty,
                    value: s.gainValue,
                    loads: s.gainLoads,
                    color: t.gradeA,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: DhenuSpacing.md),
          Divider(height: 1, color: t.hairline),
          const SizedBox(height: DhenuSpacing.md),
          _note(t, DhenuIcons.warning, s.flaggedLoads > 0 ? t.gradeC : t.inkSoft,
              l.varianceFlaggedCaption(s.flaggedLoads, movedLoads)),
          if (s.unpricedQty > 0) ...[
            const SizedBox(height: DhenuSpacing.sm),
            _note(t, DhenuIcons.info, t.inkSoft,
                l.varianceUnpricedCaption(litres(s.unpricedQty, unit: true))),
          ],
        ],
      ),
    );
  }

  /// "NET LOSS · 1–15 Oct" with the share action; the icon turns into a
  /// spinner while the server renders the PDF.
  Widget _header(DhenuTokens t, AppLocalizations l, bool loss) => Row(
    children: [
      Expanded(
        child: Text(
          '${(loss ? l.varianceNetLoss : l.varianceNetGain).toUpperCase()} · $periodLabel',
          style: DhenuText.label.copyWith(color: t.inkSoft),
          overflow: TextOverflow.ellipsis,
        ),
      ),
      IconButton(
        icon: sharing
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(DhenuIcons.share, size: 18, color: t.brand),
        tooltip: l.varianceShare,
        visualDensity: VisualDensity.compact,
        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
        padding: EdgeInsets.zero,
        onPressed: sharing ? null : onShare,
      ),
    ],
  );

  Widget _note(DhenuTokens t, IconData icon, Color iconColor, String text) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(top: 1),
        child: Icon(icon, size: 14, color: iconColor),
      ),
      const SizedBox(width: DhenuSpacing.sm),
      Expanded(
        child: Text(text, style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ),
    ],
  );
}

/// One side of the split: litres, rupees and how many loads, on a faint wash
/// of its colour. Muted when nothing moved that way, so an empty side recedes.
class _VarianceTile extends StatelessWidget {
  const _VarianceTile({
    required this.icon,
    required this.label,
    required this.qty,
    required this.value,
    required this.loads,
    required this.color,
  });

  final IconData icon;
  final String label;
  final double qty, value;
  final int loads;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final c = loads == 0 ? t.inkSoft : color;
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.md),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: c),
              const SizedBox(width: DhenuSpacing.xs),
              Flexible(
                child: Text(
                  label.toUpperCase(),
                  style: DhenuText.caption.copyWith(color: c, fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: DhenuSpacing.sm),
          Text(litres(qty, unit: true), style: DhenuText.number(size: 18, color: t.ink)),
          const SizedBox(height: 2),
          Text(rupees(value), style: DhenuText.label.copyWith(color: c)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(l.varianceLoadCount(loads), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ),
    );
  }
}
