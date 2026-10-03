import 'package:flutter/material.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../payment_made_screen.dart' show sheetHandle, sheetTitle;
import 'recurring_form_kit.dart';

/// Pick the day of the next month (1 to 28) a monthly bill is raised on.
Future<int?> showBillDayPicker(BuildContext context, int current) {
  final t = RT(context);
  return showModalBottomSheet<int>(
    context: context,
    backgroundColor: t.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: sheetHandle(t)),
          sheetTitle(t, 'Billed on'),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Text('Day of the following month the bill is raised',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var d = 1; d <= 28; d++) _DayChip(day: d, on: d == current),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _DayChip extends StatelessWidget {
  final int day;
  final bool on;
  const _DayChip({required this.day, required this.on});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: () => Navigator.pop(context, day),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 44,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? t.brandSubtle : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: on ? t.brand : t.hairline, width: on ? 1 : 0.8),
        ),
        child: Text(ordinal(day).replaceAll(RegExp(r'[a-z]'), ''),
            style: RunqText.tabular(size: 14, w: FontWeight.w600, color: on ? t.brand : t.ink)),
      ),
    );
  }
}
