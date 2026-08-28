import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// A nav item definition for [AppBottomNav].
class DhenuNavItem {
  final IconData icon;
  final String label;

  /// How much outstanding work the tab holds — tankers waiting to be received,
  /// slots waiting to be sent on. Zero shows nothing.
  ///
  /// This used to be a bare dot, on the reasoning that a number needs the
  /// context of the screen that can act on it. In a shift that reasoning is
  /// backwards: "something is waiting" and "four tankers are waiting" are
  /// different days, and the operator decides which tab to open before he can
  /// see either. Counts above [_badgeMax] read as "9+" — past a handful the
  /// exact figure changes nothing about what he does next.
  final int count;

  const DhenuNavItem({required this.icon, required this.label, this.count = 0});

  bool get hasWork => count > 0;
}

/// Above this the badge stops counting and starts saying "a lot".
const int _badgeMax = 9;

/// 5-item Dhenu bottom navigation bar.
/// Active item: brand icon + label + mint underline indicator.
/// Inactive: inkSoft icon + label.
/// Background: DT.card with top hairline.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<DhenuNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  /// Painted height, so anything floating above the nav (toasts) can clear it
  /// without measuring. Mirrors the padding + row height below — keep in step.
  static const double height =
      DhenuSpacing.md + DhenuSpacing.minTap + DhenuSpacing.lg;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.card,
        border: Border(top: BorderSide(color: t.hairline, width: 1)),
      ),
      child: Padding(
        padding: const EdgeInsets.only(top: DhenuSpacing.md, bottom: DhenuSpacing.lg),
        child: SizedBox(
          height: DhenuSpacing.minTap,
          child: Row(
            children: List.generate(items.length, (i) {
              return Expanded(
                child: _NavItem(
                  item: items[i],
                  selected: i == currentIndex,
                  t: t,
                  onTap: () => onTap(i),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

/// Count of outstanding work on a tab. Uses the notification bell's red so the
/// app has one "needs attention" colour.
///
/// A single digit stays a circle; "9+" widens into a pill rather than squashing
/// the glyphs, which is why the width is a minimum and not a fixed size.
class _AlertBadge extends StatelessWidget {
  const _AlertBadge({required this.t, required this.count});
  final DhenuTokens t;
  final int count;

  @override
  Widget build(BuildContext context) {
    final label = count > _badgeMax ? '$_badgeMax+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 19),
      height: 19,
      padding: const EdgeInsets.symmetric(horizontal: 5),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.gradeC,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        // Ringed in the bar's own colour so the badge reads as separate from
        // the icon it sits on rather than merging into a stroke of it.
        border: Border.all(color: t.card, width: 1.5),
      ),
      child: Text(
        label,
        // Tabular so 9 and 11 sit at the same optical weight, and tight so the
        // glyph centres in the circle without the font's own line spacing
        // pushing it off-centre.
        style: DhenuText.number(size: 11, color: Colors.white)
            .copyWith(height: 1.0, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.item,
    required this.selected,
    required this.t,
    required this.onTap,
  });

  final DhenuNavItem item;
  final bool selected;
  final DhenuTokens t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? t.brand : t.inkSoft;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final icon = Icon(item.icon, color: color, size: 22);
    // Frosted-glass chip behind the ACTIVE icon only; inactive keeps the same
    // padding so the icon never shifts on selection. The label is untouched —
    // it just changes colour.
    const radius = BorderRadius.all(Radius.circular(DhenuRadii.button));
    const chipPad = EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs);
    final Widget iconChip = selected
        ? ClipRRect(
            borderRadius: radius,
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
              child: Container(
                padding: chipPad,
                decoration: BoxDecoration(
                  borderRadius: radius,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withValues(alpha: isDark ? 0.12 : 0.45),
                      t.brand.withValues(alpha: isDark ? 0.22 : 0.14),
                    ],
                  ),
                  border: Border.all(color: DhenuColors.accent.withValues(alpha: isDark ? 0.45 : 0.55)),
                  boxShadow: [
                    BoxShadow(color: t.brand.withValues(alpha: 0.10), blurRadius: 8, offset: const Offset(0, 2)),
                  ],
                ),
                child: icon,
              ),
            ),
          )
        : Padding(padding: chipPad, child: icon);

    // Sits on the icon, outside the chip's clip so it isn't cut off when the tab
    // is active. `clipBehavior: none` is what lets it hang over the edge.
    final Widget badged = !item.hasWork
        ? iconChip
        : Stack(clipBehavior: Clip.none, children: [
            iconChip,
            Positioned(right: -4, top: -6, child: _AlertBadge(t: t, count: item.count)),
          ]);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          badged,
          const SizedBox(height: 3),
          Text(
            item.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DhenuText.caption.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}
