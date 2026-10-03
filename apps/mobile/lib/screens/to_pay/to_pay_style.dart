import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../theme/runq_tokens.dart';
import '../recurring/recurring_widgets.dart';

/// Tint + icon per to-pay category.
({Color color, IconData icon}) toPayStyle(BuildContext context, String key) {
  final t = RT(context);
  final ink = RecurringInk.of(context);
  return switch (key) {
    'bills' => (color: ink.blue, icon: Icons.receipt_long_outlined),
    'rent_transport' => (color: t.brand, icon: Icons.home_work_outlined),
    'salaries' => (color: ink.green, icon: Icons.groups_outlined),
    'statutory' => (color: ink.amber, icon: Icons.account_balance_outlined),
    'milk' => (color: ink.blue, icon: Icons.water_drop_outlined),
    'claims' => (color: t.muted, icon: Icons.request_quote_outlined),
    _ => (color: t.muted, icon: Icons.payments_outlined),
  };
}

class ToPayTile extends StatelessWidget {
  final String category;
  final double size;
  const ToPayTile(this.category, {super.key, this.size = 38});

  @override
  Widget build(BuildContext context) {
    final s = toPayStyle(context, category);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: s.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(s.icon, size: size / 2 + 1, color: s.color),
    );
  }
}

DateTime dateOnly(String iso) {
  final d = DateTime.tryParse(iso) ?? DateTime.now();
  return DateTime(d.year, d.month, d.day);
}

String shortDate(String iso) => DateFormat('d MMM').format(dateOnly(iso));

String longDate(String iso) => DateFormat('d MMM yyyy').format(dateOnly(iso));

String countLabel(int n) => '$n ${n == 1 ? 'item' : 'items'}';

String monthKey(DateTime m) => DateFormat('yyyy-MM').format(m);

String monthTitle(DateTime m) => DateFormat('MMMM yyyy').format(m);
