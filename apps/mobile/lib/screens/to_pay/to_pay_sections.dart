import 'package:flutter/material.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../api/to_pay_models.dart';
import '../../utils/format_inr.dart';
import '../recurring/recurring_ledger_sections.dart';
import 'to_pay_rows.dart';
import 'to_pay_style.dart';

double _sum(Iterable<ToPayItem> items, double Function(ToPayItem) f) =>
    items.fold<double>(0, (s, i) => s + f(i));

/// Item sections: by due window when outstanding, by category for a month.
List<Widget> toPaySections(ToPay data, String? category) {
  final groups = data.isMonth ? _byCategory(data) : _byWindow(data, category);
  return [
    for (var i = 0; i < groups.length; i++) ...[
      if (i > 0) const SizedBox(height: 24),
      LedgerSection(
        title: groups[i].title,
        summary: groups[i].summary,
        emptyText: '',
        rows: data.isMonth
            ? _monthRows(groups[i].items, data.asOf)
            : [for (final item in groups[i].items) ToPayItemRow(item: item, asOf: data.asOf, month: false)],
      ),
    ],
  ];
}

typedef _Group = ({String title, String summary, List<ToPayItem> items});

List<_Group> _byWindow(ToPay data, String? category) {
  final today = dateOnly(data.asOf);
  final shown = category == null
      ? data.items
      : data.items.where((i) => i.category == category).toList();
  int days(ToPayItem i) => dateOnly(i.dueDate).difference(today).inDays;
  final windows = [
    ('Overdue', shown.where((i) => days(i) < 0).toList()),
    ('Due this week', shown.where((i) => days(i) >= 0 && days(i) <= 6).toList()),
    ('Later', shown.where((i) => days(i) > 6).toList()),
  ];
  return [
    for (final (title, items) in windows)
      if (items.isNotEmpty)
        (
          title: title,
          summary: formatINR(_sum(items, (i) => i.balance), compact: true),
          items: items,
        ),
  ];
}

List<_Group> _byCategory(ToPay data) {
  return [
    for (final c in data.categories)
      (
        title: c.label,
        summary: '${formatINR(c.paid, compact: true)} / ${formatINR(c.total, compact: true)}',
        items: data.items.where((i) => i.category == c.key).toList(),
      ),
  ].where((g) => g.items.isNotEmpty).toList();
}

/// A month's rows for one category. Items covering part of the month (milk
/// cycles, twice-monthly rent) sit under a header per period, in date order;
/// whole-month items follow without one.
List<Widget> _monthRows(List<ToPayItem> items, String asOf) {
  Widget row(ToPayItem i) => ToPayItemRow(item: i, asOf: asOf, month: true);
  final parts = <String, List<ToPayItem>>{};
  for (final i in items.where((i) => i.subPeriod != null)) {
    parts.putIfAbsent(i.subPeriodStart ?? i.subPeriod!, () => []).add(i);
  }
  if (parts.isEmpty) return [for (final i in items) row(i)];
  final keys = parts.keys.toList()..sort();
  return [
    for (final k in keys) ...[
      _SubPeriodHeader(items: parts[k]!),
      for (final i in parts[k]!) row(i),
    ],
    for (final i in items.where((i) => i.subPeriod == null)) row(i),
  ];
}

class _SubPeriodHeader extends StatelessWidget {
  final List<ToPayItem> items;
  const _SubPeriodHeader({required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final paid = _sum(items, (i) => i.paid);
    final total = _sum(items, (i) => i.amount);
    return Container(
      color: t.bgWarm,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Row(
        children: [
          Icon(Icons.date_range_outlined, size: 15, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(items.first.subPeriod!,
                style: RunqText.bodyStrong.copyWith(color: t.ink2)),
          ),
          Text(
            paid >= total
                ? '${formatINR(total, compact: true)} · paid'
                : '${formatINR(paid, compact: true)} of ${formatINR(total, compact: true)} paid',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }
}
