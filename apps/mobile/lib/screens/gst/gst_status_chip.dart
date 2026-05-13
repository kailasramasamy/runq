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
      'filed' => (
          isDark ? const Color(0xFF0D2620) : RunqColors.greenBg,
          isDark ? const Color(0xFF34D399) : RunqColors.greenInk,
          'Filed',
        ),
      'uploaded' => (
          isDark ? const Color(0xFF3A2410) : RunqColors.amberBg,
          isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk,
          'Uploaded',
        ),
      'validated' => (
          isDark ? const Color(0xFF3A2410) : RunqColors.amberBg,
          isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk,
          'Validated',
        ),
      'error' => (
          isDark ? const Color(0xFF3B1018) : RunqColors.redBg,
          isDark ? const Color(0xFFF87171) : RunqColors.redInk,
          'Error',
        ),
      _ => (
          RunqColors.indigo.withValues(alpha: isDark ? 0.22 : 0.10),
          isDark ? const Color(0xFFA5B4FC) : RunqColors.indigo,
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
