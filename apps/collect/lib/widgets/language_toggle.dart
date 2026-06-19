import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// Small language pill button for the header (e.g. "EN ▾").
/// Inert placeholder — TTS/locale wired in a later phase.
class LanguageToggle extends StatelessWidget {
  const LanguageToggle({
    super.key,
    required this.currentLabel,
    this.onTap,
  });

  /// Current language code to display, e.g. "EN", "HI".
  final String currentLabel;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.md,
          vertical: DhenuSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: t.brandSubtle,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(
          '$currentLabel ▾',
          style: DhenuText.label.copyWith(color: t.brand),
        ),
      ),
    );
  }
}
