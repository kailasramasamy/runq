// Category scrubber down the right edge of the Items list.
//
// The list is sectioned by category, so the rail is the section index made
// touchable: one tick per category, drag to sweep, release to land. It is the
// cheapest possible navigation — no mode to enter, no taps to spend, and it
// costs the list 22 logical pixels of width.
//
// The rail is a single object, not a column of loose letters: it sits on its
// own tinted track, centred vertically, and the list reserves a gutter for
// it so it never floats over a card. Ticks take a fixed slot until there are
// too many to fit, then share the height evenly.
//
// Below [minTargets] categories the rail hides itself — scrolling is already
// shorter than the gesture needed to use it.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

/// One tick: what to draw on the rail, and what to show in the bubble.
typedef ItemJumpTarget = ({String tick, String label});

class ItemJumpRail extends StatefulWidget {
  const ItemJumpRail({
    super.key,
    required this.targets,
    required this.onJump,
    this.minTargets = kMinRailSections,
  });

  final List<ItemJumpTarget> targets;

  /// Called with the index into [targets] as the finger moves, so the list
  /// tracks the drag instead of waiting for the release.
  final ValueChanged<int> onJump;

  /// Below this many sections the rail is not worth its width.
  final int minTargets;

  @override
  State<ItemJumpRail> createState() => _ItemJumpRailState();
}

/// Fewest categories worth a rail. Low enough that a class pill — which
/// leaves only the categories holding that class — still gets one, so the
/// control does not come and go as the filter changes.
const kMinRailSections = 3;

/// Width of the track, and the gutter the list must reserve for it so the
/// ticks never sit over a card.
const kRailWidth = 34.0;
const _preferredSlot = 40.0;

class _ItemJumpRailState extends State<ItemJumpRail> {
  int? _active;

  void _pick(double dy, double height) {
    final n = widget.targets.length;
    if (n == 0 || height <= 0) return;
    final i = ((dy / height) * n).floor().clamp(0, n - 1);
    if (i == _active) return;
    setState(() => _active = i);
    widget.onJump(i);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.targets.length < widget.minTargets) {
      return const SizedBox.shrink();
    }
    final t = RT(context);
    final accent = InvColors.brand(context);
    return LayoutBuilder(
      builder: (context, box) {
        // A fixed slot keeps the ticks reading as a group; only once they
        // outgrow the viewport do they compress to share it.
        final n = widget.targets.length;
        final slot = (box.maxHeight / n).clamp(0.0, _preferredSlot);
        final trackHeight = slot * n;
        return Center(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (d) => _pick(d.localPosition.dy, trackHeight),
            onVerticalDragUpdate: (d) => _pick(d.localPosition.dy, trackHeight),
            onVerticalDragEnd: (_) => setState(() => _active = null),
            onVerticalDragCancel: () => setState(() => _active = null),
            onTapUp: (_) => setState(() => _active = null),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: kRailWidth,
                  height: trackHeight,
                  decoration: BoxDecoration(
                    color: t.bgWarmer,
                    borderRadius: BorderRadius.circular(kRailWidth / 2),
                  ),
                  child: Column(
                    children: [
                      for (var i = 0; i < n; i++)
                        SizedBox(
                          height: slot,
                          child: Center(
                            child: FittedBox(
                              child: Text(
                                widget.targets[i].tick,
                                style: RunqText.caption.copyWith(
                                  color: i == _active ? accent : t.muted2,
                                  fontWeight: i == _active
                                      ? FontWeight.w800
                                      : FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                if (_active != null) _bubble(trackHeight, accent),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Full category name beside the finger — the two-letter tick alone is not
  /// enough to aim with, and the finger covers the tick anyway.
  Widget _bubble(double height, Color accent) {
    final i = _active!;
    final slot = height / widget.targets.length;
    return Positioned(
      right: kRailWidth + 8,
      top: (slot * i + slot / 2 - 15).clamp(0.0, height - 30),
      child: Material(
        color: accent,
        borderRadius: BorderRadius.circular(8),
        elevation: 3,
        child: Container(
          height: 30,
          constraints: const BoxConstraints(maxWidth: 180),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            widget.targets[i].label,
            style: RunqText.bodyStrong.copyWith(color: Colors.white),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}

/// Words that carry no identity in a category name, so they never get to
/// claim a letter on the rail. "Milk & Dairy" must read MD, not M&.
const _tickFiller = {'and', 'or', 'of', 'the', 'for', 'with', 'in'};

/// Two-letter tick for a category name: initials of the first two words that
/// mean something, or the first two letters of a single-word name. Keeps the
/// rail narrow while staying distinguishable — "Dairy" and "Dry Goods" must
/// not both read D.
String jumpTickFor(String label) {
  // Split on anything that is not a letter or digit, which drops "&", "/"
  // and hyphens rather than letting them become an initial.
  final all = label
      .split(RegExp(r'[^A-Za-z0-9]+'))
      .where((w) => w.isNotEmpty)
      .toList();
  final words = all.where((w) => !_tickFiller.contains(w.toLowerCase()));
  // A name made entirely of filler still needs a tick, so fall back to the
  // raw words before giving up.
  final useful = words.isEmpty ? all : words.toList();
  if (useful.isEmpty) return '?';
  if (useful.length == 1) {
    final w = useful.first;
    return (w.length == 1 ? w : w.substring(0, 2)).toUpperCase();
  }
  return '${useful[0][0]}${useful[1][0]}'.toUpperCase();
}
