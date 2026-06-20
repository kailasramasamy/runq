import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// Segmented ☀️ AM / 🌙 PM control.
/// AM selected → amber fill; PM selected → violet fill.
/// Unselected → transparent with inkSoft label.
class ShiftToggle extends StatelessWidget {
  const ShiftToggle({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final Shift value;
  final ValueChanged<Shift> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Container(
      decoration: BoxDecoration(
        color: t.hairline,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: [
          Expanded(
            child: _Segment(
              emoji: '☀️',
              label: l.shiftAm,
              selected: value == Shift.am,
              selectedColor: t.am,
              inkSoft: t.inkSoft,
              ink: t.ink,
              onTap: () => onChanged(Shift.am),
            ),
          ),
          Expanded(
            child: _Segment(
              emoji: '🌙',
              label: l.shiftPm,
              selected: value == Shift.pm,
              selectedColor: t.pm,
              inkSoft: t.inkSoft,
              ink: t.ink,
              onTap: () => onChanged(Shift.pm),
            ),
          ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.emoji,
    required this.label,
    required this.selected,
    required this.selectedColor,
    required this.inkSoft,
    required this.ink,
    required this.onTap,
  });

  final String emoji;
  final String label;
  final bool selected;
  final Color selectedColor;
  final Color inkSoft;
  final Color ink;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textColor = selected ? ink : inkSoft;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minHeight: DhenuSpacing.minTap),
        decoration: BoxDecoration(
          color: selected ? selectedColor.withValues(alpha: 0.18) : Colors.transparent,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: selected
              ? Border.all(color: selectedColor.withValues(alpha: 0.4), width: 1.5)
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: DhenuText.emoji),
            const SizedBox(width: DhenuSpacing.xs),
            Text(
              label,
              style: DhenuText.label.copyWith(
                color: selected ? selectedColor : textColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
