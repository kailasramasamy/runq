import 'package:flutter/material.dart';

import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';

/// AM / PM / Pooled in that slot's own colour.
///
/// A slot must read identically wherever a load appears — the CC's receive
/// list, the plant's, and the plant's tanker list all describe the same
/// physical can, and an operator matching one against another shouldn't have to
/// re-learn the colours. It lived twice as a private copy before this.
class SlotPill extends StatelessWidget {
  const SlotPill({super.key, required this.shift});

  final Shift? shift;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final color = switch (shift) {
      Shift.am => t.amText,
      Shift.pm => t.pm,
      null => t.inkSoft,
    };
    final icon = switch (shift) {
      Shift.am => DhenuIcons.sun,
      Shift.pm => DhenuIcons.moon,
      null => DhenuIcons.calendar,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Text(consignmentSlotL10n(l, shift), style: DhenuText.label.copyWith(color: color)),
      ]),
    );
  }
}

/// "16 Aug" for this year, full "16 Aug 2025" once the year differs — a
/// back-dated load from last season must not read as a recent one.
String slotDateLabel(String iso) {
  final d = DateTime.tryParse(iso);
  return d != null && d.year == DateTime.now().year ? shortDate(iso) : prettyDate(iso);
}
