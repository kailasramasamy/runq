import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../api/api_client.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

/// Severity of a toast. Drives icon, accent colour, on-screen duration and
/// how assertively screen readers announce it.
enum SnackKind { success, error, warning, info }

/// Show a runQ-styled toast at the bottom of the screen. Uses the same
/// surface/ink tokens as the rest of the app so it sits in either theme
/// without looking foreign.
///
/// Duration follows severity rather than a flat timeout: success/info read
/// fast and clear in 4s, warnings get 5s, errors get 8s, and anything long
/// enough to need more reading time stretches (~50ms/char, capped at 10s).
/// An error that carries a recovery action ([onAction]) never auto-dismisses
/// — it stays with an explicit ✕ so the user can't miss the retry.
///
/// Prefer the [RunqSnack] wrappers (`RunqSnack.success(context, '…')`) at
/// call sites; this is the underlying primitive.
void showRunqSnack(
  BuildContext context,
  String message, {
  SnackKind kind = SnackKind.info,
  String? description,
  String? actionLabel,
  VoidCallback? onAction,
  Duration? duration,
}) =>
    _show(ScaffoldMessenger.of(context), context, message,
        kind: kind,
        description: description,
        actionLabel: actionLabel,
        onAction: onAction,
        duration: duration);

/// Same toast, addressed to a messenger captured before an async gap or a
/// `Navigator.pop` — for when the calling widget's own context is gone by the
/// time the result lands.
void showRunqSnackOn(
  ScaffoldMessengerState messenger,
  String message, {
  SnackKind kind = SnackKind.info,
  String? description,
  String? actionLabel,
  VoidCallback? onAction,
  Duration? duration,
}) =>
    _show(messenger, messenger.context, message,
        kind: kind,
        description: description,
        actionLabel: actionLabel,
        onAction: onAction,
        duration: duration);

/// User-facing text for a caught error. [ApiException] (and so
/// [NetworkException]) carries a message written for the user; anything else
/// is plumbing they can't act on, so it gets the generic line and the raw
/// error stays in the logs.
String snackErrorText(Object error,
        {String fallback = 'Something went wrong. Try again.'}) =>
    error is ApiException ? error.message : fallback;

void _show(
  ScaffoldMessengerState messenger,
  BuildContext context,
  String message, {
  required SnackKind kind,
  required String? description,
  required String? actionLabel,
  required VoidCallback? onAction,
  required Duration? duration,
}) {
  final hasAction = actionLabel != null && onAction != null;
  // Two identical toasts back to back (a loop that fails per row, a double
  // tap) should read as one event, not restart the animation N times.
  if (_isDuplicate(kind, message, description)) return;

  final persistent = kind == SnackKind.error && hasAction;
  _announce(context, message, description, kind);

  // Swap instantly rather than waiting out the previous toast's exit —
  // `hide` animates the old one away first, which reads as a stall.
  messenger.removeCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      padding: EdgeInsets.zero,
      duration: duration ?? _durationFor(kind, message, description, hasAction),
      behavior: SnackBarBehavior.floating,
      margin: EdgeInsets.fromLTRB(8, 0, 8, _bottomMarginFor(context)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      // SnackBar clips its content to `shape` by default (Clip.hardEdge),
      // which cuts off the toast's drop shadow. Disable clipping so the
      // shadow can render freely past the bar's bounds.
      clipBehavior: Clip.none,
      dismissDirection: DismissDirection.horizontal,
      content: _SnackCard(
        message: message,
        description: description,
        kind: kind,
        actionLabel: hasAction ? actionLabel : null,
        onAction: hasAction ? onAction : null,
        showClose: persistent,
      ),
    ),
  );
}

/// Severity-named wrappers. These are the preferred call style — they keep
/// the kind and the copy next to each other at the call site.
class RunqSnack {
  const RunqSnack._();

  static void success(BuildContext context, String message,
          {String? description, String? actionLabel, VoidCallback? onAction}) =>
      showRunqSnack(context, message,
          kind: SnackKind.success,
          description: description,
          actionLabel: actionLabel,
          onAction: onAction);

  /// Show a failure. Pass [onAction] with a retry to make the toast wait for
  /// the user instead of timing out. Keep [message] user-facing — log the raw
  /// exception, don't put it on screen.
  static void error(BuildContext context, String message,
          {String? description, String? actionLabel, VoidCallback? onAction}) =>
      showRunqSnack(context, message,
          kind: SnackKind.error,
          description: description,
          actionLabel: actionLabel,
          onAction: onAction);

  static void warning(BuildContext context, String message,
          {String? description, String? actionLabel, VoidCallback? onAction}) =>
      showRunqSnack(context, message,
          kind: SnackKind.warning,
          description: description,
          actionLabel: actionLabel,
          onAction: onAction);

  static void info(BuildContext context, String message,
          {String? description, String? actionLabel, VoidCallback? onAction}) =>
      showRunqSnack(context, message,
          kind: SnackKind.info,
          description: description,
          actionLabel: actionLabel,
          onAction: onAction);

  /// Confirmation of a reversible action, with the reversal attached.
  static void undo(BuildContext context, String message,
          {required VoidCallback onUndo, String label = 'Undo'}) =>
      showRunqSnack(context, message,
          kind: SnackKind.success, actionLabel: label, onAction: onUndo);
}

// ── duration ────────────────────────────────────────────────────────────────

const _persistent = Duration(days: 1);

Duration _durationFor(
    SnackKind kind, String message, String? description, bool hasAction) {
  if (kind == SnackKind.error && hasAction) return _persistent;
  final base = switch (kind) {
    SnackKind.success || SnackKind.info => 4.0,
    SnackKind.warning => 5.0,
    SnackKind.error => 8.0,
  };
  // ~50ms per character, so a long message isn't gone before it's read.
  final read = (message.length + (description?.length ?? 0)) * 0.05;
  var seconds = math.max(base, read);
  if (hasAction) seconds = math.max(seconds, 6.0);
  return Duration(milliseconds: (math.min(seconds, 10.0) * 1000).round());
}

// ── de-duplication ──────────────────────────────────────────────────────────

String? _lastKey;
DateTime? _lastShownAt;

bool _isDuplicate(SnackKind kind, String message, String? description) {
  final key = '${kind.name}|$message|${description ?? ''}';
  final now = DateTime.now();
  final last = _lastShownAt;
  final repeat =
      key == _lastKey && last != null && now.difference(last).inMilliseconds < 1000;
  _lastKey = key;
  _lastShownAt = now;
  return repeat;
}

// ── placement ───────────────────────────────────────────────────────────────

/// SnackBarBehavior.floating already lifts the bar above any
/// Scaffold.bottomNavigationBar slot — those screens (RootShell tab nav,
/// HrFormScreen action bar, etc.) need only a tiny breathing gap. For
/// screens that dock their own action bar inside the body Column instead of
/// the bottomNavigationBar slot, Flutter doesn't know to push the toast — we
/// add an extra inset to clear a typical 60-70px tall docked button bar so
/// the toast doesn't sit under it.
double _bottomMarginFor(BuildContext context) {
  final scaffold = Scaffold.maybeOf(context);
  final hasBottomNav = scaffold?.widget.bottomNavigationBar != null ||
      scaffold?.widget.persistentFooterButtons != null;
  return hasBottomNav ? 12.0 : 80.0;
}

// ── accessibility ───────────────────────────────────────────────────────────

/// Toasts don't take focus, so a screen reader only reads them if we push the
/// text out ourselves. Errors interrupt (assertive); everything else waits its
/// turn (polite). The card is also wrapped in a live region, which is what
/// carries the announcement on Android (where TalkBack ignores announcement
/// events).
void _announce(
    BuildContext context, String message, String? description, SnackKind kind) {
  if (!(MediaQuery.maybeSupportsAnnounceOf(context) ?? false)) return;
  final text = description == null ? message : '$message. $description';
  SemanticsService.sendAnnouncement(
    View.of(context),
    text,
    Directionality.of(context),
    assertiveness:
        kind == SnackKind.error ? Assertiveness.assertive : Assertiveness.polite,
  );
}

// ── card ────────────────────────────────────────────────────────────────────

class _SnackCard extends StatelessWidget {
  const _SnackCard({
    required this.message,
    required this.description,
    required this.kind,
    required this.actionLabel,
    required this.onAction,
    required this.showClose,
  });

  final String message;
  final String? description;
  final SnackKind kind;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool showClose;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: reduceMotion ? 120 : 280),
      curve: Curves.easeOutCubic,
      builder: (context, v, child) => Opacity(
        opacity: v,
        // Reduced motion keeps the fade but drops the travel.
        child: reduceMotion
            ? child
            : Transform.translate(offset: Offset(0, 16 * (1 - v)), child: child),
      ),
      // Inset on each side so the drop shadow has breathing room around the
      // toast. The outer SnackBar margin is reduced to compensate so the
      // toast width still matches.
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        // Cap the width so the toast doesn't stretch edge to edge on a tablet.
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Semantics(liveRegion: true, child: _body(context)),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: const [
          BoxShadow(
              color: Color(0x33000000),
              blurRadius: 28,
              offset: Offset(0, 12),
              spreadRadius: -4),
          BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _badge(context),
          const SizedBox(width: 12),
          Expanded(child: _text(context)),
          ..._trailing(context),
        ],
      ),
    );
  }

  Widget _badge(BuildContext context) {
    final accent = _accentFor(context, kind);
    return Container(
      width: 32,
      height: 32,
      decoration:
          BoxDecoration(color: accent.withValues(alpha: 0.12), shape: BoxShape.circle),
      alignment: Alignment.center,
      // Icon carries the severity alongside colour — colour alone fails for
      // colour-blind users (WCAG 1.4.1).
      child: Icon(_iconFor(kind), color: accent, size: 20),
    );
  }

  Widget _text(BuildContext context) {
    final t = RT(context);
    final desc = description;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: RunqText.bodyStrong.copyWith(color: t.ink, height: 1.3),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (desc != null) ...[
            const SizedBox(height: 2),
            Text(
              desc,
              style: RunqText.caption.copyWith(color: t.muted, height: 1.35),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _trailing(BuildContext context) {
    final label = actionLabel;
    return [
      if (label != null)
        TextButton(
          onPressed: () {
            ScaffoldMessenger.of(context).hideCurrentSnackBar();
            onAction!();
          },
          style: TextButton.styleFrom(
            foregroundColor: _accentFor(context, kind),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            minimumSize: const Size(0, 40),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(label, style: RunqText.bodyStrong),
        ),
      if (showClose)
        IconButton(
          onPressed: () => ScaffoldMessenger.of(context).hideCurrentSnackBar(),
          icon: const Icon(Icons.close_rounded, size: 18),
          color: RT(context).muted,
          tooltip: 'Dismiss',
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints.tightFor(width: 40, height: 40),
        ),
      if (label == null && !showClose) const SizedBox(width: 8),
    ];
  }
}

IconData _iconFor(SnackKind kind) => switch (kind) {
      SnackKind.success => Icons.check_circle_rounded,
      SnackKind.error => Icons.error_rounded,
      SnackKind.warning => Icons.warning_rounded,
      SnackKind.info => Icons.info_rounded,
    };

/// Accents are theme-split: the light-mode status inks are too dark to clear
/// 3:1 against the dark surface, so dark mode uses the lighter twin.
Color _accentFor(BuildContext context, SnackKind kind) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return switch (kind) {
    SnackKind.success =>
      isDark ? const Color(0xFF34D399) : RunqColors.greenInk,
    SnackKind.error => isDark ? const Color(0xFFF87171) : RunqColors.redInk,
    SnackKind.warning => isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk,
    SnackKind.info => RT(context).brand,
  };
}
