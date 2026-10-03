import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

/// Semantic ink colours that stay legible on both light and dark surfaces.
class RecurringInk {
  final Color green, amber, red, blue;
  const RecurringInk._(this.green, this.amber, this.red, this.blue);

  factory RecurringInk.of(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark
        ? const RecurringInk._(Color(0xFF6EE7B7), Color(0xFFFCD34D), Color(0xFFFCA5A5), Color(0xFF93C5FD))
        : const RecurringInk._(RunqColors.greenInk, RunqColors.amberInk, RunqColors.redInk, RunqColors.blueInk);
  }
}

/// Tint + icon for an agreement type, used by the list rows.
({Color color, IconData icon}) categoryStyle(BuildContext context, String c) {
  final t = RT(context);
  return switch (c) {
    'rent' => (color: t.brand, icon: Icons.home_work_outlined),
    'transport' => (color: RecurringInk.of(context).blue, icon: Icons.local_shipping_outlined),
    _ => (color: t.muted, icon: Icons.receipt_long_outlined),
  };
}

String categoryLabel(String c) => switch (c) {
      'rent' => 'Rent',
      'transport' => 'Transport',
      _ => 'Other',
    };

DateTime? parseIso(String s) => DateTime.tryParse(s);

String monthLabel(String iso) {
  final d = parseIso(iso);
  return d == null ? iso : DateFormat('MMM yyyy').format(d);
}

String dayLabel(String iso) {
  final d = parseIso(iso);
  return d == null ? iso : DateFormat('d MMM yyyy').format(d);
}

class RecurringChip extends StatelessWidget {
  final String label;
  final Color color;
  const RecurringChip(this.label, this.color, {super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(label, style: RunqText.caption.copyWith(color: color)),
      );
}

class RecurringStat extends StatelessWidget {
  final String label, value;
  final Color? color;
  const RecurringStat({super.key, required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        Text(value, style: RunqText.bodyStrong.copyWith(color: color ?? t.ink)),
      ],
    );
  }
}
