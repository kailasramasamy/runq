import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../api/mp_models.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';
import 'farmer_avatar.dart';

/// The list atom — farmer at VMCC, VMCC at CC, etc.
/// Row height ≥56; hairline divider handled by caller.
class SourceRow extends StatelessWidget {
  const SourceRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leadingInitials,
    this.farmer,
    required this.litres,
    this.quality,
    this.amount,
    this.onTap,
    this.trailingStatus,
    this.amountFirst = false,
  });

  /// Display name.
  final String title;

  /// Optional small secondary line under the title (e.g. full consignment id).
  final String? subtitle;

  /// When provided, renders [FarmerAvatar] (photo + initials fallback) instead
  /// of the plain initials circle. Takes precedence over [leadingInitials].
  final MpFarmer? farmer;

  /// Two-letter initials for the circular avatar. If null, shows a generic icon.
  /// Ignored when [farmer] is set.
  final String? leadingInitials;

  /// Liters string (e.g. "7.5L"), rendered tabular.
  final String litres;

  /// Optional compact QualityBadge slot.
  final Widget? quality;

  /// Amount string (e.g. "₹360"), tabular, brand-coloured.
  final String? amount;

  final VoidCallback? onTap;

  /// Trailing status widget (e.g. "✓ received" / "⏳ transit").
  final Widget? trailingStatus;

  /// When true (and [amount] is set), the amount takes the primary (top, larger
  /// ink) slot and litres drops to the secondary (smaller, brand) slot — used on
  /// the payout cycle where the ₹ figure leads. Default keeps litres primary.
  final bool amountFirst;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: DhenuSpacing.minTap),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.screen,
            vertical: DhenuSpacing.md,
          ),
          child: Row(
            children: [
              _Avatar(initials: leadingInitials, farmer: farmer, t: t),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: DhenuText.title.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: DhenuSpacing.xs),
                      Text(
                        subtitle!,
                        style: DhenuText.caption.copyWith(color: t.inkSoft),
                      ),
                    ],
                    if (quality != null) ...[
                      const SizedBox(height: DhenuSpacing.xs),
                      quality!,
                    ],
                  ],
                ),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Primary number — litres by default, or amount when amountFirst.
                  Text(
                    amountFirst && amount != null ? amount! : litres,
                    style: DhenuText.number(size: 16, color: t.ink),
                  ),
                  if (amount != null) ...[
                    const SizedBox(height: DhenuSpacing.xs),
                    Text(
                      amountFirst ? litres : amount!,
                      style: DhenuText.number(size: 14, color: t.brand),
                    ),
                  ],
                  if (trailingStatus != null) ...[
                    const SizedBox(height: DhenuSpacing.xs),
                    trailingStatus!,
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials, required this.t, this.farmer});

  final String? initials;
  final DhenuTokens t;
  final MpFarmer? farmer;

  @override
  Widget build(BuildContext context) {
    const radius = DhenuSpacing.x4 / 2; // 20px → 40px diameter
    if (farmer != null) {
      return FarmerAvatar(farmer: farmer!, radius: radius);
    }
    if (initials == null || initials!.isEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: t.brandSubtle,
        child: Icon(DhenuIcons.user, size: 20, color: t.brand),
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: t.brandSubtle,
      child: Text(
        initials!,
        style: DhenuText.label.copyWith(color: t.brand),
      ),
    );
  }
}

/// Convenience wrapper that takes an [MpFarmer] and forwards to [SourceRow].
class FarmerRow extends StatelessWidget {
  const FarmerRow({
    super.key,
    required this.farmer,
    required this.litres,
    this.quality,
    this.amount,
    this.onTap,
    this.trailingStatus,
  });

  final MpFarmer farmer;
  final String litres;
  final Widget? quality;
  final String? amount;
  final VoidCallback? onTap;
  final Widget? trailingStatus;

  @override
  Widget build(BuildContext context) {
    return SourceRow(
      title: farmerName(context, farmer),
      farmer: farmer,
      litres: litres,
      quality: quality,
      amount: amount,
      onTap: onTap,
      trailingStatus: trailingStatus,
    );
  }
}
