import 'package:flutter/material.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';

/// The containers banked so far for the pour being entered, with the running
/// total. Shown only once a second can exists — a single-can pour is the normal
/// case and needs no extra chrome.
///
/// The total is what will be recorded, so it is the loudest thing here: an
/// operator glancing down mid-queue is checking that number against the milk in
/// front of them, not re-reading the individual cans.
class CanListStrip extends StatelessWidget {
  const CanListStrip({
    super.key,
    required this.cans,
    required this.pending,
    required this.onRemove,
  });

  /// Litres banked via "Add more milk", in the order they were poured.
  final List<double> cans;

  /// Litres still in the qty field — counted in the total but not yet a chip,
  /// so the operator sees the effect of what they're typing before saving.
  final double pending;

  final void Function(int index) onRemove;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final total = cans.fold<double>(0, (s, c) => s + c) + pending;
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.md),
      decoration: BoxDecoration(
        color: t.brand.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        border: Border.all(color: t.brand.withValues(alpha: 0.25)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(
          spacing: DhenuSpacing.sm,
          runSpacing: DhenuSpacing.sm,
          children: [
            for (var i = 0; i < cans.length; i++)
              _CanChip(
                label: l.collectCanN(i + 1, litres(cans[i], unit: true)),
                onRemove: () => onRemove(i),
              ),
          ],
        ),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Text(l.collectCansTotal, style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          Text(litres(total, unit: true), style: DhenuText.number(size: 20, color: t.brand)),
        ]),
      ]),
    );
  }
}

class _CanChip extends StatelessWidget {
  const _CanChip({required this.label, required this.onRemove});
  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.md, DhenuSpacing.xs, DhenuSpacing.xs, DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
        border: Border.all(color: t.brand.withValues(alpha: 0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: DhenuText.label.copyWith(color: t.ink)),
        const SizedBox(width: DhenuSpacing.xs),
        // Wrong can entered is a money error, so removal stays one tap — but the
        // target is padded out to a real touch size for gloved, wet hands.
        InkWell(
          onTap: onRemove,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.xs),
            child: Icon(DhenuIcons.close, size: 16, color: t.inkSoft),
          ),
        ),
      ]),
    );
  }
}
