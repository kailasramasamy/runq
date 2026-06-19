import 'package:flutter/material.dart';
import '../services/tts_service.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Speaker affordance next to key figures for read-aloud (TTS, spec §1.6/§7).
/// Pass [speak] to read a phrase aloud on tap (locale-aware); [onTap] runs too.
/// Default: a circular ≥44px button. Pass [label] to render a pill ("Listen")
/// instead — use [iconColor]/[fillColor] to sit it on a coloured surface
/// (e.g. white on the emerald hero).
class AudioPlay extends StatelessWidget {
  const AudioPlay({
    super.key,
    this.onTap,
    this.speak,
    this.size = 24,
    this.label,
    this.iconColor,
    this.fillColor,
  });

  final VoidCallback? onTap;

  /// Phrase to read aloud via [TtsService]. Null → inert (relies on [onTap]).
  final String? speak;

  /// Icon size in logical pixels.
  final double size;

  /// When set, renders as a pill with this trailing label.
  final String? label;
  final Color? iconColor;
  final Color? fillColor;

  void _handleTap() {
    final phrase = speak;
    if (phrase != null && phrase.trim().isNotEmpty) TtsService.instance.speak(phrase);
    onTap?.call();
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final ic = iconColor ?? t.inkSoft;
    final fill = fillColor ?? t.hairline;

    if (label != null) {
      return GestureDetector(
        onTap: _handleTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
          decoration: BoxDecoration(color: fill, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(DhenuIcons.listen, size: size, color: ic),
              const SizedBox(width: DhenuSpacing.xs),
              Text(label!, style: DhenuText.label.copyWith(color: ic)),
            ],
          ),
        ),
      );
    }

    // Circular icon button — ≥44px tap area with padding around the icon.
    const minTap = 44.0;
    final padding = ((minTap - size) / 2).clamp(6.0, 16.0);
    return GestureDetector(
      onTap: _handleTap,
      child: Container(
        padding: EdgeInsets.all(padding),
        decoration: BoxDecoration(shape: BoxShape.circle, color: fill),
        child: Icon(DhenuIcons.listen, size: size, color: ic),
      ),
    );
  }
}
