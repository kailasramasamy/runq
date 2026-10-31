import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

/// How far back the picker reaches — three calendar years covers the
/// current and previous Indian FY.
const _yearsBack = 2;

/// Picks one calendar month; resolves to its first day, or null if dismissed.
Future<DateTime?> showMonthPickerSheet(BuildContext context, {DateTime? selected}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _MonthPickerSheet(selected: selected),
  );
}

class _MonthPickerSheet extends StatelessWidget {
  final DateTime? selected;
  const _MonthPickerSheet({this.selected});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final now = DateTime.now();
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      child: SafeArea(
        top: false,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 12),
          Text('Pick a month', style: RunqText.h3.copyWith(color: t.ink)),
          for (var y = now.year; y >= now.year - _yearsBack; y--) _YearGrid(year: y, now: now, selected: selected),
        ]),
      ),
    );
  }
}

class _YearGrid extends StatelessWidget {
  final int year;
  final DateTime now;
  final DateTime? selected;
  const _YearGrid({required this.year, required this.now, required this.selected});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fmt = DateFormat('MMM');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 14),
      Text('$year', style: RunqText.label.copyWith(color: t.muted)),
      const SizedBox(height: 8),
      GridView.count(
        crossAxisCount: 6,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 1.4,
        children: [
          for (var m = 1; m <= 12; m++)
            _MonthCell(
              label: fmt.format(DateTime(year, m)),
              active: selected?.year == year && selected?.month == m,
              enabled: DateTime(year, m).isBefore(DateTime(now.year, now.month + 1)),
              onTap: () => Navigator.of(context).pop(DateTime(year, m)),
            ),
        ],
      ),
    ]);
  }
}

class _MonthCell extends StatelessWidget {
  final String label;
  final bool active;
  final bool enabled;
  final VoidCallback onTap;
  const _MonthCell({required this.label, required this.active, required this.enabled, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: active ? RunqColors.indigo : t.bgWarmer,
      borderRadius: BorderRadius.circular(RunqRadii.chip),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(RunqRadii.chip),
        child: Center(
          child: Text(label,
              style: RunqText.body.copyWith(
                  color: active ? Colors.white : enabled ? t.ink : t.muted2)),
        ),
      ),
    );
  }
}
