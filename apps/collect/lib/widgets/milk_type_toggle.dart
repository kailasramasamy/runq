import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Segmented pill switching between the milk types a farmer supplies. Renders
/// nothing for a single type — most farmers supply one, and a toggle with one
/// option is just noise. Scrolls horizontally so three-plus types never overflow.
class MilkTypeToggle extends StatelessWidget {
  const MilkTypeToggle({
    super.key,
    required this.types,
    required this.value,
    required this.onChanged,
  });

  final List<MilkType> types;
  final MilkType value;
  final ValueChanged<MilkType> onChanged;

  @override
  Widget build(BuildContext context) {
    if (types.length < 2) return const SizedBox.shrink();
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Container(
        decoration: BoxDecoration(
          color: t.hairline,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        padding: const EdgeInsets.all(3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final type in types)
              _Segment(
                label: milkTypeL10n(l, type),
                selected: type == value,
                t: t,
                onTap: () => onChanged(type),
              ),
          ],
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.t,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final DhenuTokens t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minWidth: 96, minHeight: 40),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: selected ? t.brand.withValues(alpha: 0.18) : Colors.transparent,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: selected
              ? Border.all(color: t.brand.withValues(alpha: 0.4), width: 1.5)
              : null,
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: DhenuText.label.copyWith(
            color: selected ? t.ink : t.inkSoft,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
