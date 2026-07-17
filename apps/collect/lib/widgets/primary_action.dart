import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// Full-width, 56px, emerald bottom-anchored primary action button.
/// One per screen max.
class PrimaryAction extends StatelessWidget {
  const PrimaryAction({
    super.key,
    required this.label,
    this.onPressed,
    this.icon = DhenuIcons.add,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    // An unavailable action goes grey: faded emerald under white text still
    // reads as tappable, so operators tapped a dead button and saw nothing
    // happen. Loading keeps the brand fill — that button *is* working.
    final unavailable = !loading && onPressed == null;
    final fg = unavailable ? t.inkSoft : Colors.white;
    return SizedBox(
      width: double.infinity,
      height: DhenuSpacing.minTap,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: t.brand,
          disabledBackgroundColor:
              unavailable ? t.hairline : t.brand.withValues(alpha: 0.6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(DhenuRadii.button),
          ),
        ),
        child: loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: Colors.white,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, color: fg, size: 20),
                    const SizedBox(width: DhenuSpacing.sm),
                  ],
                  Text(
                    label,
                    style: DhenuText.button.copyWith(color: fg),
                  ),
                ],
              ),
      ),
    );
  }
}
