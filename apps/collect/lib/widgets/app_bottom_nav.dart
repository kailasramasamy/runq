import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// A nav item definition for [AppBottomNav].
class DhenuNavItem {
  final IconData icon;
  final String label;
  const DhenuNavItem({required this.icon, required this.label});
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

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          iconChip,
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
