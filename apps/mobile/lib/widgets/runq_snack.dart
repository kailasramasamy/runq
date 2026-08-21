import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../api/api_client.dart';
import '../theme/runq_theme.dart';

/// Severity of a toast. Drives icon, accent colour, on-screen duration and
/// how assertively screen readers announce it.
enum SnackKind { success, error, warning, info }

/// Deliberately NOT themed. On the light theme the toast used `t.surface` —
/// a white card on a white page, separated by a half-pixel hairline, which is
/// barely visible. A charcoal slab reads instantly against either theme and
/// gives the toast one identity across modes instead of two.
const _kSnackSurface = Color(0xFF23262B);
const _kSnackInk = Color(0xFFF3F4F6);
const _kSnackInkSoft = Color(0xFF9CA3AF);

/// Show a runQ-styled toast at the bottom of the screen: a dark card that
/// slides up from the bottom edge and slides back down.
///
/// Hosted in the root overlay rather than [ScaffoldMessenger]. Flutter's
/// floating SnackBar only cross-FADES (snack_bar.dart → `snackBarTransition`),
/// which is why the old toast appeared in place instead of arriving, and it
/// paints below a modal sheet so a toast fired from one was invisible.
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
    _show(null, context, message,
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
    _show(null, messenger.context, message,
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

/// The toast on screen, if any. One at a time: a second replaces the first
/// instantly rather than queueing behind its exit, which reads as a stall.
OverlayEntry? _current;

void _show(
  ScaffoldMessengerState? messenger,
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

  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _current?.remove();
  _current = null;

  // Snapshot everything that depends on the caller's context BEFORE the
  // entry is created. The builder runs lazily — by then the caller may
  // have popped (a common pattern is "toast, then pop"), and looking up an
  // ancestor from a deactivated element throws.
  final bottomInset = _bottomInsetFor(context);
  final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _SnackHost(
      bottomInset: bottomInset,
      reduceMotion: reduceMotion,
      duration:
          duration ?? _durationFor(kind, message, description, hasAction),
      persistent: persistent && duration == null,
      onGone: () {
        if (_current == entry) _current = null;
        entry.remove();
      },
      builder: (dismiss) => _SnackCard(
        message: message,
        description: description,
        kind: kind,
        actionLabel: hasAction ? actionLabel : null,
        onAction: hasAction ? onAction : null,
        showClose: persistent,
        onDismiss: dismiss,
      ),
    ),
  );
  _current = entry;
  overlay.insert(entry);
}

/// Positions, animates and times out one toast.
class _SnackHost extends StatefulWidget {
  const _SnackHost({
    required this.bottomInset,
    required this.reduceMotion,
    required this.duration,
    required this.persistent,
    required this.onGone,
    required this.builder,
  });

  final double bottomInset;
  final bool reduceMotion;
  final Duration duration;
  final bool persistent;
  final VoidCallback onGone;
  final Widget Function(VoidCallback dismiss) builder;

  @override
  State<_SnackHost> createState() => _SnackHostState();
}

class _SnackHostState extends State<_SnackHost>
    with SingleTickerProviderStateMixin {
  // Unhurried in, a little quicker out: arriving should feel considered,
  // leaving should get out of the way without being abrupt.
  late final AnimationController _controller;
  late final Animation<Offset> _slide;
  late final Animation<double> _fade;
  Timer? _timer;
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    final reduceMotion = widget.reduceMotion;
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: reduceMotion ? 120 : 440),
      reverseDuration: Duration(milliseconds: reduceMotion ? 100 : 320),
    );
    _slide = Tween<Offset>(
      // A full card-height below its resting place, so it rises from the
      // bottom edge rather than popping into position. Reduced motion keeps
      // the fade and drops the travel.
      begin: reduceMotion ? Offset.zero : const Offset(0, 1.4),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    ));
    // Fade finishes well before the slide does: a card still fading once it
    // has settled reads as lag.
    _fade = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0, 0.55, curve: Curves.easeOut),
      reverseCurve: const Interval(0.35, 1, curve: Curves.easeIn),
    );
    _controller.forward();
    // An actionable error waits for the user; everything else times out.
    if (!widget.persistent) _timer = Timer(widget.duration, _dismiss);
  }

  Future<void> _dismiss() async {
    if (_leaving) return;
    _leaving = true;
    _timer?.cancel();
    if (!mounted) return;
    await _controller.reverse();
    if (mounted) widget.onGone();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 8,
      right: 8,
      bottom: widget.bottomInset,
      child: SlideTransition(
        position: _slide,
        child: FadeTransition(
          opacity: _fade,
          child: Material(
            color: Colors.transparent,
            child: widget.builder(_dismiss),
          ),
        ),
      ),
    );
  }
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

/// Where the toast rests, measured rather than guessed.
///
/// The overlay spans the whole screen, so unlike a floating SnackBar nothing
/// lifts the toast above a bottom bar for us. runQ has many different ones
/// (the RootShell nav pill, HrFormScreen's action bar, GstActionBar…), so a
/// single constant would be wrong for most of them. [ScaffoldGeometry]
/// reports where the bottom bar's top edge actually is — the same figure
/// Flutter itself uses to place floating snack bars.
///
/// Screens that dock their own action bar inside the body Column instead of
/// the bottomNavigationBar slot are invisible to that geometry, so they keep
/// the old allowance for a typical 60-70px docked button bar.
double _bottomInsetFor(BuildContext context) {
  const gap = 12.0;
  final scaffold = Scaffold.maybeOf(context);
  if (scaffold == null) {
    return MediaQuery.of(context).viewPadding.bottom + gap;
  }
  final hasBottomBar = scaffold.widget.bottomNavigationBar != null ||
      scaffold.widget.persistentFooterButtons != null;
  if (!hasBottomBar) return 80.0;

  final geometry = Scaffold.geometryOf(context).value;
  final navTop = geometry.bottomNavigationBarTop;
  final screenHeight = MediaQuery.of(context).size.height;
  // Null before the first layout pass, and nonsense if the scaffold isn't
  // full-screen; fall back to a gap that at least clears the safe area.
  if (navTop == null || navTop <= 0 || navTop >= screenHeight) {
    return MediaQuery.of(context).viewPadding.bottom + gap;
  }
  return screenHeight - navTop + gap;
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
    required this.onDismiss,
  });

  final String message;
  final String? description;
  final SnackKind kind;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool showClose;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    // Motion lives in _SnackHost now, which owns the exit as well as the
    // entrance — this card only has to lay itself out.
    return Padding(
      // Breathing room for the drop shadow on every side.
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Center(
        child: ConstrainedBox(
          // Hug the text: "Saved" should be a small card, not a bar spanning
          // the screen. The cap keeps a long message from running edge to
          // edge on a tablet.
          constraints: const BoxConstraints(maxWidth: 440),
          child: Semantics(liveRegion: true, child: _body(context)),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, _hasTrailing ? 8 : 16, 12),
      decoration: BoxDecoration(
        color: _kSnackSurface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(
              color: Color(0x40000000),
              blurRadius: 28,
              offset: Offset(0, 12),
              spreadRadius: -4),
          BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        // Shrink-wrap the text so the card is as wide as its content and no
        // wider; Flexible still lets a long message wrap within the cap.
        mainAxisSize: MainAxisSize.min,
        children: [
          _badge(context),
          const SizedBox(width: 12),
          Flexible(child: _text(context)),
          ..._trailing(context),
        ],
      ),
    );
  }

  bool get _hasTrailing => actionLabel != null || showClose;

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
    final desc = description;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: RunqText.bodyStrong.copyWith(color: _kSnackInk, height: 1.3),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (desc != null) ...[
            const SizedBox(height: 2),
            Text(
              desc,
              style: RunqText.caption.copyWith(color: _kSnackInkSoft, height: 1.35),
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
            onDismiss();
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
          onPressed: onDismiss,
          icon: const Icon(Icons.close_rounded, size: 18),
          color: _kSnackInkSoft,
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

/// The toast surface is dark in BOTH themes, so accents are always the lighter
/// twins — the light-mode status inks are tuned for a white card and can't
/// clear 3:1 against charcoal.
Color _accentFor(BuildContext context, SnackKind kind) => switch (kind) {
      SnackKind.success => const Color(0xFF34D399),
      SnackKind.error => const Color(0xFFF87171),
      SnackKind.warning => const Color(0xFFFBBF24),
      SnackKind.info => const Color(0xFF7DD3FC),
    };
