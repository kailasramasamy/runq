import 'package:flutter/material.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

class GstStatusChip extends StatelessWidget {
  final String status;
  const GstStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (Color bg, Color ink, String label) = switch (status) {
      'filed' => (RunqColors.greenBg, RunqColors.greenInk, 'Filed'),
      'uploaded' => (RunqColors.amberBg, RunqColors.amberInk, 'Uploaded'),
      'validated' => (RunqColors.amberBg, RunqColors.amberInk, 'Validated'),
      'error' => (RunqColors.redBg, RunqColors.redInk, 'Error'),
      _ => (
          RunqColors.indigo.withValues(alpha: isDark ? 0.22 : 0.10),
          RunqColors.indigo,
          'Draft',
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: RunqText.micro.copyWith(color: ink)),
    );
  }
}
