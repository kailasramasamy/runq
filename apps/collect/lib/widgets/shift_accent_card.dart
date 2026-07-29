import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../l10n/app_localizations.dart';

/// Today's AM / PM pour summary card: white surface with a 4px left accent bar
/// (AM amber / PM violet), a sun/moon icon chip + shift label, the litres, and
/// a quality pill — or "Not recorded" when empty.
class ShiftAccentCard extends StatelessWidget {
  const ShiftAccentCard({
    super.key,
    required this.isAm,
    required this.litresLabel,
    this.quality,
    this.empty = false,
    this.onTap,
  });

  final bool isAm;
  final String litresLabel;
  final Widget? quality; // a compact QualityBadge
  final bool empty;

  /// Opens the shift's per-pour breakup (Home → Collections). Null leaves the
  /// card inert — an empty shift has nothing to drill into.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final accent = isAm ? t.am : t.pm;
    final accentText = isAm ? t.amText : t.pm;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        border: Border.all(color: t.hairline),
        boxShadow: DhenuShadows.card,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: accent),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(DhenuSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: accent.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(DhenuRadii.input),
                          ),
                          child: Icon(isAm ? DhenuIcons.sun : DhenuIcons.moon, size: 15, color: accent),
                        ),
                        const SizedBox(width: DhenuSpacing.sm),
                        Text(isAm ? AppLocalizations.of(context).shiftAm : AppLocalizations.of(context).shiftPm, style: DhenuText.label.copyWith(color: accentText)),
                        if (onTap != null) ...[
                          const Spacer(),
                          Icon(DhenuIcons.chevronRight, size: 16, color: t.inkSoft),
                        ],
                      ],
                    ),
                    const SizedBox(height: DhenuSpacing.sm),
                    Text(
                      empty ? '—' : litresLabel,
                      style: DhenuText.number(size: 28, w: FontWeight.w800).copyWith(color: t.ink),
                    ),
                    const SizedBox(height: DhenuSpacing.sm),
                    if (empty)
                      Text(AppLocalizations.of(context).shiftNotRecorded, style: DhenuText.caption.copyWith(color: t.inkSoft))
                    else if (quality != null)
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: quality,
                      ),
                  ],
                ),
              ),
            ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
