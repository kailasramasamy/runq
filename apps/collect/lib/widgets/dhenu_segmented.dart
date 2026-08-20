import 'package:flutter/material.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// The Dhenu segmented control: a row of options over a single brand pill that
/// slides to the selection, so switching reads as one mark moving rather than
/// two flashing. Options carry an optional leading glyph (shift sun/moon, etc).
///
/// Shared by Collection History's view/shift switches and the farmer Payments
/// hub — it was a private copy in the first, and the second made two.
class DhenuSegmented<E> extends StatelessWidget {
  const DhenuSegmented({
    super.key,
    required this.current,
    required this.options,
    required this.onSelect,
  });

  final E current;

  /// (value, label, optional leading icon), left to right.
  final List<(E, String, IconData?)> options;

  final void Function(E value) onSelect;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final n = options.length;
    final idx = options.indexWhere((o) => o.$1 == current);
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
      ),
      child: Stack(children: [
        if (idx >= 0)
          Positioned.fill(
            child: AnimatedAlign(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              alignment: Alignment(n == 1 ? 0 : -1 + 2 * idx / (n - 1), 0),
              child: FractionallySizedBox(
                widthFactor: 1 / n,
                heightFactor: 1,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: t.brandSubtle,
                    borderRadius: BorderRadius.circular(DhenuRadii.input - 2),
                    border: Border.all(color: t.brand),
                  ),
                ),
              ),
            ),
          ),
        Row(children: [
          for (final (val, label, icon) in options)
            Expanded(
              child: _Item(
                label: label,
                icon: icon,
                selected: current == val,
                onTap: () => onSelect(val),
              ),
            ),
        ]),
      ]),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final fg = selected ? t.brand : t.inkSoft;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: fg),
              const SizedBox(width: 4),
            ],
            // Flexible + ellipsis: segments share the width equally, so a
            // three-up control on a narrow phone can hand a label less room
            // than its natural size. Overflowing is worse than eliding.
            Flexible(
              child: AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                style: DhenuText.label.copyWith(color: fg),
                child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
