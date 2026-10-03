import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

/// Month + year picker. Resolves to the first day of the chosen month.
Future<DateTime?> showMonthPicker(BuildContext context, DateTime initial) {
  return showModalBottomSheet<DateTime>(
    context: context,
    backgroundColor: RT(context).surface,
    builder: (_) => _MonthSheet(initial: initial),
  );
}

class _MonthSheet extends StatefulWidget {
  final DateTime initial;
  const _MonthSheet({required this.initial});

  @override
  State<_MonthSheet> createState() => _MonthSheetState();
}

class _MonthSheetState extends State<_MonthSheet> {
  late int _year = widget.initial.year;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () => setState(() => _year--),
                ),
                Text('$_year', style: RunqText.h4.copyWith(color: t.ink)),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () => setState(() => _year++),
                ),
              ],
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var m = 1; m <= 12; m++) _monthChip(t, m),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _monthChip(RunqTokens t, int m) {
    final selected = _year == widget.initial.year && m == widget.initial.month;
    return ChoiceChip(
      label: Text(DateFormat('MMM').format(DateTime(_year, m)),
          style: RunqText.body.copyWith(color: selected ? Colors.white : t.ink)),
      selected: selected,
      selectedColor: RunqColors.indigo,
      showCheckmark: false,
      onSelected: (_) => Navigator.pop(context, DateTime(_year, m)),
    );
  }
}
