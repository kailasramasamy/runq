import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Visual intent of a toast — picks the accent colour and default icon.
enum DhenuToastType { success, error, info }

/// App-wide toast. A floating surface card with a hairline border and a type
/// icon, lifted clear of the bottom nav / bottom action bar. Use this instead
/// of a raw [SnackBar] everywhere so every toast shares one look and feel.
void showDhenuToast(
  BuildContext context,
  String message, {
  DhenuToastType type = DhenuToastType.info,
  IconData? icon,
  Duration? duration,
}) {
  final t = DT(context);
  final (accent, defaultIcon, fallback) = switch (type) {
    DhenuToastType.success => (t.gradeA, DhenuIcons.checkCircle, const Duration(milliseconds: 1600)),
    DhenuToastType.error => (t.gradeC, DhenuIcons.error, const Duration(milliseconds: 2600)),
    DhenuToastType.info => (t.brand, DhenuIcons.info, const Duration(milliseconds: 1800)),
  };
  final messenger = ScaffoldMessenger.of(context)..clearSnackBars();
  messenger.showSnackBar(SnackBar(
    behavior: SnackBarBehavior.floating,
    backgroundColor: t.card,
    elevation: 6,
    duration: duration ?? fallback,
    // Clear the bottom nav and any bottom-anchored action button (56px button +
    // 20px screen padding top & bottom) so the toast never overlaps them.
    margin: const EdgeInsets.only(
      left: DhenuSpacing.md,
      right: DhenuSpacing.md,
      bottom: DhenuSpacing.minTap + DhenuSpacing.screen * 2 + DhenuSpacing.sm,
    ),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(DhenuRadii.button),
      side: BorderSide(color: t.hairline, width: 1),
    ),
    content: Row(children: [
      Icon(icon ?? defaultIcon, color: accent, size: 22),
      const SizedBox(width: DhenuSpacing.sm),
      Expanded(child: Text(message, style: DhenuText.label.copyWith(color: t.ink))),
    ]),
  ));
}
