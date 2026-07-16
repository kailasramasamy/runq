import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';

/// Icon + caption replacement for the old emoji status glyphs (⏳ / ✓).
/// Emoji don't tint with the theme and render differently per platform/OS
/// version; a Lucide icon matches the rest of the design system.
class StatusGlyph extends StatelessWidget {
  const StatusGlyph({
    super.key,
    required this.label,
    required this.color,
    required this.received,
  });

  final String label;
  final Color color;
  final bool received;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(received ? DhenuIcons.check : DhenuIcons.transit, size: 12, color: color),
      const SizedBox(width: 3),
      Text(label, style: DhenuText.caption.copyWith(color: color)),
    ]);
  }
}
