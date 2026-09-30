import 'package:flutter/material.dart';

import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';

/// Pieces shared by the receipt-variance screen and its share message, so a
/// load and a source's pattern read the same wherever they show up.

/// Loads inside this band are noise (meter and dip-rod tolerance), not loss —
/// the same ±0.5% the API counts as "matched". Used to mute day-level figures.
const double varianceTolerancePct = 0.5;

String _sign(num v) => v < 0 ? '−' : (v > 0 ? '+' : '');

/// "−1.4%" / "+0.3%" — a real minus sign, and no sign on an exact zero.
String signedPct(double v) => '${_sign(v)}${v.abs().toStringAsFixed(1)}%';

/// "−30.0 L" / "+12.5 L".
String signedLitres(double v, {bool unit = false}) =>
    '${_sign(v)}${litres(v.abs(), unit: unit)}';

/// "−₹ 1,120" / "+₹ 450".
String signedRupees(double v) => '${_sign(v)}${rupees(v.abs())}';

/// Loss colour below zero, gain above, muted when the figure is within
/// tolerance (or exactly zero) so only real movement draws the eye.
Color varianceColor(DhenuTokens t, double qty, {bool muted = false}) {
  if (muted || qty == 0) return t.inkSoft;
  return qty < 0 ? t.gradeC : t.gradeA;
}

/// One received load: sender, what was sent vs measured, and the signed result.
class VarianceLoadRow extends StatelessWidget {
  const VarianceLoadRow({super.key, required this.line});

  final MpReceiptVarianceLine line;

  /// "593.1 → 583.1 L · −1.7%", then milk type and shift when the load has them.
  String _detail(AppLocalizations l) {
    final v = line;
    return [
      '${litres(v.dispatchedQty)} → ${litres(v.measuredQty, unit: true)} · ${signedPct(v.variancePct)}',
      if (v.milkType != null) milkTypeL10n(l, milkTypeFrom(v.milkType)),
      if (v.shift != null) v.shift == 'pm' ? l.shiftPm : l.shiftAm,
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final v = line;
    final color = varianceColor(t, v.varianceQty, muted: v.withinTolerance);
    final value = v.varianceValue;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      v.fromNodeName,
                      style: DhenuText.body.copyWith(
                        color: t.ink,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (v.flagged) ...[
                    const SizedBox(width: DhenuSpacing.xs),
                    Icon(DhenuIcons.warning, size: 14, color: t.gradeC),
                  ],
                ],
              ),
              const SizedBox(height: 2),
              Text(
                _detail(l),
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
            ],
          ),
        ),
        const SizedBox(width: DhenuSpacing.sm),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              signedLitres(v.varianceQty, unit: true),
              style: DhenuText.number(size: 15, color: color),
            ),
            const SizedBox(height: 2),
            Text(
              value == null ? '—' : signedRupees(value),
              style: DhenuText.caption.copyWith(
                color: v.withinTolerance ? t.inkSoft : color,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Loads stacked in one card with hairlines between them.
class VarianceLoadList extends StatelessWidget {
  const VarianceLoadList({super.key, required this.lines, this.framed = true});

  final List<MpReceiptVarianceLine> lines;

  /// Wrap in a [DhenuCard]; off when the list already sits inside one.
  final bool framed;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final column = Column(
      children: [
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) ...[
            const SizedBox(height: DhenuSpacing.md),
            Divider(height: 1, color: t.hairline),
            const SizedBox(height: DhenuSpacing.md),
          ],
          VarianceLoadRow(line: lines[i]),
        ],
      ],
    );
    return framed ? DhenuCard(child: column) : column;
  }
}
