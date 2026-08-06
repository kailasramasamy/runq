import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// A nav item definition for [AppBottomNav].
class DhenuNavItem {
  final IconData icon;
  final String label;
  /// Count shown on the icon when > 0 — outstanding work waiting on this tab.
  final int badge;
  const DhenuNavItem({required this.icon, required this.label, this.badge = 0});
}

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

/// Count pill on a nav icon. Amber, not red: this is work waiting, not a fault.
/// Ringed in the bar's own colour so it stays legible over the active chip.
class _Badge extends StatelessWidget {
  const _Badge({required this.count, required this.t});
  final int count;
  final DhenuTokens t;

  @override
  Widget build(BuildContext context) {
    final label = count > 9 ? '9+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 16),
      height: 16,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.am,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
        border: Border.all(color: t.card, width: 1.5),
      ),
      child: Text(label,
          style: DhenuText.caption.copyWith(
              color: Colors.white, fontWeight: FontWeight.w700, height: 1.0)),
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
    final Widget badged = item.badge <= 0
        ? iconChip
        : Stack(clipBehavior: Clip.none, children: [
            iconChip,
            Positioned(right: 2, top: -2, child: _Badge(count: item.badge, t: t)),
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
