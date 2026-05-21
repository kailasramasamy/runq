import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

class DateRangeResult {
  final DateTime? from;
  final DateTime? to;
  const DateRangeResult({this.from, this.to});

  bool get isEmpty => from == null && to == null;
}

/// Shows a bottom-sheet date-range picker with quick presets and a custom
/// range option. Returns the picked range, or `null` if dismissed.
Future<DateRangeResult?> showDateRangeSheet(
  BuildContext context, {
  DateTime? initialFrom,
  DateTime? initialTo,
}) {
  return showModalBottomSheet<DateRangeResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _DateRangeSheet(initialFrom: initialFrom, initialTo: initialTo),
  );
}

class _DateRangeSheet extends StatefulWidget {
  final DateTime? initialFrom;
  final DateTime? initialTo;
  const _DateRangeSheet({this.initialFrom, this.initialTo});

  @override
  State<_DateRangeSheet> createState() => _DateRangeSheetState();
}

class _DateRangeSheetState extends State<_DateRangeSheet> {
  late DateTime? _from = widget.initialFrom;
  late DateTime? _to = widget.initialTo;

  String _label(DateTime? f, DateTime? t) {
    String fmt(DateTime d) {
      const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${d.day} ${m[d.month - 1]} ${d.year}';
    }
    if (f == null && t == null) return 'All time';
    if (f != null && t != null) return '${fmt(f)} → ${fmt(t)}';
    if (f != null) return 'After ${fmt(f)}';
    return 'Until ${fmt(t!)}';
  }

  void _setRange(DateTime? f, DateTime? t) => setState(() { _from = f; _to = t; });

  Future<void> _pickCustom() async {
    final today = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(today.year - 5),
      lastDate: DateTime(today.year + 1),
      initialDateRange: _from != null && _to != null
          ? DateTimeRange(start: _from!, end: _to!)
          : null,
      saveText: 'Apply',
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: RunqColors.indigo),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    _setRange(picked.start, picked.end);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final today = DateTime.now();
    final presets = [
      _Preset('All time', null, null),
      _Preset('Last 7 days', today.subtract(const Duration(days: 7)), today),
      _Preset('Last 30 days', today.subtract(const Duration(days: 30)), today),
      _Preset('This month', DateTime(today.year, today.month, 1), today),
      _Preset(
        'Last month',
        DateTime(today.year, today.month - 1, 1),
        DateTime(today.year, today.month, 0),
      ),
    ];
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Text('Date range', style: RunqText.h3.copyWith(color: t.ink)),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 12),
              child: Text(_label(_from, _to), style: RunqText.caption.copyWith(color: t.muted)),
            ),
            Flexible(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final p in presets)
                      _PresetTile(preset: p, active: p.matches(_from, _to), onTap: () => _setRange(p.from, p.to)),
                    _PresetTile(
                      preset: const _Preset.custom(),
                      active: _from != null && _to != null && !presets.any((p) => p.matches(_from, _to)),
                      onTap: _pickCustom,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 46,
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context, const DateRangeResult()),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: t.hairline, width: 0.5),
                        foregroundColor: t.ink,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Clear'),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 46,
                    child: FilledButton(
                      onPressed: () => Navigator.pop(context, DateRangeResult(from: _from, to: _to)),
                      child: const Text('Apply'),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Preset {
  final String label;
  final DateTime? from;
  final DateTime? to;
  final bool isCustom;
  const _Preset(this.label, this.from, this.to) : isCustom = false;
  const _Preset.custom()
      : label = 'Custom range',
        from = null,
        to = null,
        isCustom = true;

  bool matches(DateTime? f, DateTime? t) {
    if (isCustom) return false;
    if (from == null && to == null) return f == null && t == null;
    return f != null && t != null && from != null && to != null &&
        _sameDay(f, from!) && _sameDay(t, to!);
  }
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

class _PresetTile extends StatelessWidget {
  final _Preset preset;
  final bool active;
  final VoidCallback onTap;
  const _PresetTile({required this.preset, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        child: Row(
          children: [
            Icon(preset.isCustom ? Icons.date_range_rounded : Icons.event_outlined,
                size: 18, color: t.muted),
            const SizedBox(width: 12),
            Expanded(child: Text(preset.label, style: RunqText.bodyStrong.copyWith(color: t.ink))),
            if (active)
              const Icon(Icons.check_rounded, color: RunqColors.indigo, size: 20),
          ],
        ),
      ),
    );
  }
}
