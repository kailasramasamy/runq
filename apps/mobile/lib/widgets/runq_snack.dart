import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

enum SnackKind { success, error, info }

/// Show a runQ-styled toast at the bottom of the screen. Theme-aware:
/// dark ink card on light theme, near-white card on dark theme. Carries a
/// status icon and short message; auto-dismisses.
void showRunqSnack(
  BuildContext context,
  String message, {
  SnackKind kind = SnackKind.info,
  Duration duration = const Duration(seconds: 3),
}) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final surface = isDark ? const Color(0xFFF4F2EE) : const Color(0xFF1A1714);
  final ink = isDark ? const Color(0xFF1A1714) : const Color(0xFFF4F2EE);
  final accent = switch (kind) {
    SnackKind.success => const Color(0xFF10B981),
    SnackKind.error => const Color(0xFFEF4444),
    SnackKind.info => RunqColors.indigo,
  };
  final icon = switch (kind) {
    SnackKind.success => Icons.check_circle_rounded,
    SnackKind.error => Icons.error_rounded,
    SnackKind.info => Icons.info_rounded,
  };

  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      padding: EdgeInsets.zero,
      duration: duration,
      behavior: SnackBarBehavior.floating,
      margin: EdgeInsets.fromLTRB(
        16, 0, 16, 100 + MediaQuery.of(context).padding.bottom,
      ),
      content: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [
            BoxShadow(color: Color(0x33000000), blurRadius: 20, offset: Offset(0, 8)),
            BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 1)),
          ],
        ),
        child: Row(
          children: [
            Icon(icon, color: accent, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: RunqText.bodyStrong.copyWith(color: ink, fontSize: 14, height: 1.3),
                maxLines: 3,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
