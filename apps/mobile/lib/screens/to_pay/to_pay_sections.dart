import 'package:flutter/material.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../api/to_pay_models.dart';
import '../../utils/format_inr.dart';
import '../recurring/recurring_ledger_sections.dart';
import '../recurring/recurring_widgets.dart';
import 'to_pay_rows.dart';
import 'to_pay_style.dart';

double _sum(Iterable<ToPayItem> items, double Function(ToPayItem) f) =>
    items.fold<double>(0, (s, i) => s + f(i));

/// Item sections: by due window when outstanding, by category for a month.
/// In month view each section is keyed by [sectionKey] so the category list
/// can scroll straight to it.
List<Widget> toPaySections(ToPay data, String? category, GlobalKey Function(String) sectionKey) {
  final groups = data.isMonth ? _byCategory(data) : _byWindow(data, category);
  return [
    for (var i = 0; i < groups.length; i++) ...[
      if (i > 0) const SizedBox(height: 24),
      KeyedSubtree(
        key: data.isMonth ? sectionKey(groups[i].key) : null,
        child: LedgerSection(
          title: groups[i].title,
          summary: groups[i].summary,
          emptyText: '',
          rows: data.isMonth
              ? _monthRows(groups[i].items, data.asOf, collapse: groups[i].key == 'milk')
              : [for (final item in groups[i].items) ToPayItemRow(item: item, asOf: data.asOf, month: false)],
        ),
      ),
    ],
  ];
}

typedef _Group = ({String key, String title, String summary, List<ToPayItem> items});

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
          key: title,
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
        key: c.key,
        title: c.label,
        summary: '${formatINR(c.paid, compact: true)} / ${formatINR(c.total, compact: true)}',
        items: data.items.where((i) => i.category == c.key).toList(),
      ),
  ].where((g) => g.items.isNotEmpty).toList();
}

/// A month's rows for one category. Items covering part of the month (milk
/// cycles, twice-monthly rent) sit under a header per period, in date order;
/// whole-month items follow without one.
/// With [collapse] (milk, where a period holds dozens of lines) each period
/// shows as one summary row that expands on tap.
List<Widget> _monthRows(List<ToPayItem> items, String asOf, {bool collapse = false}) {
  Widget row(ToPayItem i) => ToPayItemRow(item: i, asOf: asOf, month: true);
  final parts = <String, List<ToPayItem>>{};
  for (final i in items.where((i) => i.subPeriod != null)) {
    parts.putIfAbsent(i.subPeriodStart ?? i.subPeriod!, () => []).add(i);
  }
  if (parts.isEmpty) return [for (final i in items) row(i)];
  final keys = parts.keys.toList()..sort();
  return [
    for (final k in keys)
      if (collapse)
        _CollapsiblePeriod(key: ValueKey(k), items: parts[k]!, rowBuilder: row)
      else ...[
        _SubPeriodHeader(items: parts[k]!),
        for (final i in parts[k]!) row(i),
      ],
    for (final i in items.where((i) => i.subPeriod == null)) row(i),
  ];
}

/// One period as a summary row (count, paid of total, chevron); tap to show
/// its payments underneath.
class _CollapsiblePeriod extends StatefulWidget {
  final List<ToPayItem> items;
  final Widget Function(ToPayItem) rowBuilder;
  const _CollapsiblePeriod({super.key, required this.items, required this.rowBuilder});

  @override
  State<_CollapsiblePeriod> createState() => _CollapsiblePeriodState();
}

class _CollapsiblePeriodState extends State<_CollapsiblePeriod> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final items = widget.items;
    final paid = _sum(items, (i) => i.paid);
    final total = _sum(items, (i) => i.amount);
    final ink = RecurringInk.of(context);
    return Column(
      children: [
        InkWell(
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            child: Row(
              children: [
                _periodTile(paid >= total ? ink.green : ink.amber),
                const SizedBox(width: 12),
                Expanded(child: _periodText(t, items, paid, total)),
                AnimatedRotation(
                  turns: _open ? 0.25 : 0,
                  duration: const Duration(milliseconds: 180),
                  child: Icon(Icons.chevron_right_rounded, color: t.muted2),
                ),
              ],
            ),
          ),
        ),
        if (_open)
          for (final i in items) ...[
            Divider(height: 1, thickness: 0.6, color: t.hairline, indent: 16, endIndent: 16),
            widget.rowBuilder(i),
          ],
      ],
    );
  }

  Widget _periodTile(Color c) => Container(
        width: 38,
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Icon(Icons.date_range_outlined, size: 19, color: c),
      );

  Widget _periodText(RunqTokens t, List<ToPayItem> items, double paid, double total) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(items.first.subPeriod!, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text(
            '${items.where((i) => i.status == 'paid').length} of ${items.length} paid · '
            '${paid >= total ? formatINR(total, compact: true) : '${formatINR(paid, compact: true)} of ${formatINR(total, compact: true)}'}',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      );
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
