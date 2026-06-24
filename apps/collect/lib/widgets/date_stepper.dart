import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';

/// A compact day selector: ◀ [tap-to-pick date] ▶. The right arrow is disabled
/// at today (no future dates). Tapping the centre opens a calendar. Shared by the
/// VMCC and CC report screens.
class DateStepper extends StatelessWidget {
  const DateStepper({
    super.key,
    required this.date,
    required this.onChanged,
    this.todayLabel = 'Today',
    this.firstDate,
  });

  /// Selected date as ISO `yyyy-MM-dd`.
  final String date;
  final ValueChanged<String> onChanged;

  /// Localised "Today" suffix shown when [date] is today.
  final String todayLabel;

  /// Earliest selectable date (defaults to one year back).
  final DateTime? firstDate;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final isToday = date == todayIso();
    final current = DateTime.tryParse(date) ?? DateTime.now();
    final label = isToday ? '${prettyDate(date)} · $todayLabel' : prettyDate(date);
    return Container(
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        border: Border.all(color: t.hairline),
      ),
      child: Row(children: [
        IconButton(
          icon: Icon(DhenuIcons.chevronLeft, color: t.brand),
          onPressed: () => onChanged(isoDate(current.subtract(const Duration(days: 1)))),
        ),
        Expanded(
          child: InkWell(
            onTap: () => _pick(context, current),
            borderRadius: BorderRadius.circular(DhenuRadii.input),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(DhenuIcons.calendar, size: 18, color: t.brand),
                const SizedBox(width: DhenuSpacing.sm),
                Text(label,
                    style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        ),
        IconButton(
          // No future: the right arrow is inert once we're at today.
          icon: Icon(DhenuIcons.chevronRight, color: isToday ? t.inkSoft : t.brand),
          onPressed:
              isToday ? null : () => onChanged(isoDate(current.add(const Duration(days: 1)))),
        ),
      ]),
    );
  }

  Future<void> _pick(BuildContext context, DateTime current) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: firstDate ?? DateTime(now.year - 1),
      lastDate: now,
    );
    if (picked != null) onChanged(isoDate(picked));
  }
}
