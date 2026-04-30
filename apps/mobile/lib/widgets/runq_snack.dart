import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

enum SnackKind { success, error, info }

/// Show a runQ-styled toast at the bottom of the screen. Uses the same
/// surface/ink tokens as the rest of the app so it sits in either theme
/// without looking foreign. Carries a status icon and short message;
/// auto-dismisses.
void showRunqSnack(
  BuildContext context,
  String message, {
  SnackKind kind = SnackKind.info,
  Duration duration = const Duration(seconds: 3),
}) {
  final t = RT(context);
  final surface = t.surface;
  final ink = t.ink;
  final border = t.hairline;
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

  // Floating SnackBars already stack above the bottomNavigationBar — we just
  // need a small breathing gap so the toast doesn't kiss the nav pill.
  const bottomMargin = 12.0;

  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      padding: EdgeInsets.zero,
      duration: duration,
      behavior: SnackBarBehavior.floating,
      margin: EdgeInsets.fromLTRB(8, 0, 8, bottomMargin),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      content: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeInOut,
        builder: (context, v, child) => Opacity(
          opacity: v,
          child: Transform.translate(
            offset: Offset(0, 12 * (1 - v)),
            child: child,
          ),
        ),
        // Inset by 12px on each side so the drop shadow has room to render
        // inside the SnackBar's clipping bounds. The outer SnackBar margin
        // is already reduced to compensate so the toast width still matches.
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border, width: 0.5),
            boxShadow: const [
              BoxShadow(color: Color(0x33000000), blurRadius: 28, offset: Offset(0, 12), spreadRadius: -4),
              BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 2)),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Icon(icon, color: accent, size: 20),
              ),
              const SizedBox(width: 12),
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
    ),
  );
}
