import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'app_bottom_nav.dart';

/// Visual intent of a toast — picks the accent colour and default icon.
enum DhenuToastType { success, error, info }

/// Deliberately NOT a themed token: a white card on the warm milk-white app
/// background all but vanished in light mode. A charcoal slab reads instantly
/// against either theme — the same call WhatsApp makes — and keeps one toast
/// identity across modes instead of two.
const _kToastSurface = Color(0xFF23261F);
const _kToastInk = Color(0xFFF4F5F0);

/// The toast currently on screen, if any. One at a time: a second toast
/// replaces the first rather than stacking, which is what an operator tapping
/// quickly through a list expects.
OverlayEntry? _current;

/// App-wide toast: a floating card that slides up from the bottom edge and
/// slides back down, WhatsApp-style. Use this instead of a raw [SnackBar]
/// everywhere so every toast shares one look and one motion.
///
/// Built on an overlay rather than [ScaffoldMessenger] because SnackBar's
/// floating variant fades more than it slides, and its position had to be
/// guessed with a hardcoded margin that cleared a bottom action button whether
/// or not one existed. Here the resting position is derived: above the bottom
/// nav when the screen has one, above the home indicator when it doesn't.
void showDhenuToast(
  BuildContext context,
  String message, {
  DhenuToastType type = DhenuToastType.info,
  IconData? icon,
  Duration? duration,
}) {
  // The toast surface is dark in BOTH themes (see _kToastSurface), so accents
  // are always the dark-mode variants — the light-mode green and red are tuned
  // for a white card and go muddy here.
  final (accent, defaultIcon, fallback) = switch (type) {
    DhenuToastType.success => (
        DhenuColors.gradeADark, DhenuIcons.checkCircle, const Duration(milliseconds: 2200)),
    DhenuToastType.error => (
        DhenuColors.gradeCDark, DhenuIcons.error, const Duration(milliseconds: 3200)),
    DhenuToastType.info => (
        DhenuColors.brandDark, DhenuIcons.info, const Duration(milliseconds: 2400)),
  };

  // A screen with a bottom nav must not be covered by its own confirmation.
  // Scaffold keeps the nav out of the body's coordinate space, so the height is
  // read from the nav itself rather than measured off the overlay.
  final hasNav = Scaffold.maybeOf(context)?.widget.bottomNavigationBar != null;
  final bottomInset = (hasNav ? AppBottomNav.height : 0) +
      (hasNav ? 0 : MediaQuery.of(context).viewPadding.bottom) +
      DhenuSpacing.md;

  _current?.remove();
  _current = null;
  final overlay = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _DhenuToast(
      message: message,
      icon: icon ?? defaultIcon,
      accent: accent,
      bottomInset: bottomInset,
      duration: duration ?? fallback,
      onGone: () {
        if (_current == entry) _current = null;
        entry.remove();
      },
    ),
  );
  _current = entry;
  overlay.insert(entry);
}

class _DhenuToast extends StatefulWidget {
  const _DhenuToast({
    required this.message,
    required this.icon,
    required this.accent,
    required this.bottomInset,
    required this.duration,
    required this.onGone,
  });

  final String message;
  final IconData icon;
  final Color accent;
  final double bottomInset;
  final Duration duration;
  final VoidCallback onGone;

  @override
  State<_DhenuToast> createState() => _DhenuToastState();
}

class _DhenuToastState extends State<_DhenuToast>
    with SingleTickerProviderStateMixin {
  // Unhurried on the way in, a little quicker on the way out: arriving should
  // feel considered, leaving should get out of the way without being abrupt.
  late final _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 440),
    reverseDuration: const Duration(milliseconds: 320),
  );
  late final _slide = Tween<Offset>(
    // One full card-height below its resting place, so it rises from the very
    // bottom edge of the screen rather than popping into place.
    begin: const Offset(0, 1.4),
    end: Offset.zero,
  ).animate(CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
    reverseCurve: Curves.easeInCubic,
  ));
  // Fade completes well before the slide does, so the card is fully solid while
  // it is still travelling — a card that is still fading at rest reads as lag.
  late final _fade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.55, curve: Curves.easeOut),
    reverseCurve: const Interval(0.35, 1, curve: Curves.easeIn),
  );
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _controller.forward();
    _timer = Timer(widget.duration, _dismiss);
  }

  Future<void> _dismiss() async {
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
      // Stretched edge-to-edge only as a layout box; the card inside hugs its
      // text and centres, so "Saved" is a pill and a long error still wraps
      // inside the screen rather than running off it.
      left: DhenuSpacing.md,
      right: DhenuSpacing.md,
      bottom: widget.bottomInset,
      child: SlideTransition(
        position: _slide,
        child: FadeTransition(
          opacity: _fade,
          // Material for the shadow + ink, transparent so the card's own
          // rounded surface is what shows.
          child: Align(
            child: Material(
              color: Colors.transparent,
              child: GestureDetector(
                // Tap to dismiss early — the same escape a WhatsApp toast gives.
                onTap: _dismiss,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
                  decoration: BoxDecoration(
                    color: _kToastSurface,
                    borderRadius: BorderRadius.circular(DhenuRadii.pill),
                    boxShadow: DhenuShadows.sheet,
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(widget.icon, color: widget.accent, size: 20),
                    const SizedBox(width: DhenuSpacing.sm),
                    Flexible(
                      child: Text(widget.message,
                          style: DhenuText.label.copyWith(color: _kToastInk)),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
