import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// How a [QualityBadge] renders its label.
///  - full       → "FAT 4.2 · SNF 8.6 · A"
///  - compact     → "4.2 · A"
///  - valueLabel → "4.2 FAT, 8.6 SNF · A"
enum QualityFormat { full, compact, valueLabel }

/// Pill badge showing FAT · SNF · Grade, coloured by grade. Pass [format], or
/// the legacy [compact] shortcut.
class QualityBadge extends StatelessWidget {
  const QualityBadge({
    super.key,
    this.fat,
    this.snf,
    required this.grade,
    this.compact = false,
    this.format,
  });

  final double? fat;
  final double? snf;
  final Grade grade;
  final bool compact;
  final QualityFormat? format;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final gradeColor = _gradeColor(grade, t);
    final fillColor = gradeColor.withValues(alpha: 0.12);
    final label = _buildLabel();

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.md,
        vertical: DhenuSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: fillColor,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
        border: Border.all(color: gradeColor.withValues(alpha: 0.35), width: 1),
      ),
      child: Text(
        label,
        style: DhenuText.caption.copyWith(color: gradeColor),
      ),
    );
  }

  String _buildLabel() {
    // Drop the grade segment entirely when unknown — no dangling "?".
    final hasGrade = grade != Grade.unknown;
    final g = hasGrade ? ' · ${_gradeLetter(grade)}' : '';
    final fatStr = fat != null ? fat!.toStringAsFixed(1) : '—';
    final snfStr = snf != null ? snf!.toStringAsFixed(1) : '—';
    final fmt = format ?? (compact ? QualityFormat.compact : QualityFormat.full);
    switch (fmt) {
      case QualityFormat.compact:
        return hasGrade ? '$fatStr$g' : fatStr;
      case QualityFormat.valueLabel:
        return '$fatStr FAT, $snfStr SNF$g';
      case QualityFormat.full:
        return 'FAT $fatStr · SNF $snfStr$g';
    }
  }

  static String _gradeLetter(Grade g) {
    switch (g) {
      case Grade.a:
        return 'A';
      case Grade.b:
        return 'B';
      case Grade.c:
        return 'C';
      case Grade.unknown:
        return '?';
    }
  }

  static Color gradeColor(Grade g, DhenuTokens t) => _gradeColor(g, t);
  static String gradeLetter(Grade g) => _gradeLetter(g);

  static Color _gradeColor(Grade g, DhenuTokens t) {
    switch (g) {
      case Grade.a:
        return t.gradeA;
      case Grade.b:
        return t.gradeB;
      case Grade.c:
        return t.gradeC;
      case Grade.unknown:
        return t.inkSoft;
    }
  }
}

/// FAT, SNF and grade rendered as three separate chips (vs the single combined
/// [QualityBadge] pill). Used in dense entry rows where each metric reads on its
/// own. Wraps to a second line on narrow rows.
class QualityPills extends StatelessWidget {
  const QualityPills({super.key, this.fat, this.snf, required this.grade});

  final double? fat;
  final double? snf;
  final Grade grade;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final gc = QualityBadge.gradeColor(grade, t);
    final border = gc.withValues(alpha: 0.35);
    final fill = gc.withValues(alpha: 0.12);
    return Wrap(
      spacing: DhenuSpacing.xs,
      runSpacing: DhenuSpacing.xs,
      children: [
        if (fat != null) _pill('FAT ${fat!.toStringAsFixed(1)}', gc, border, fill),
        if (snf != null) _pill('SNF ${snf!.toStringAsFixed(1)}', gc, border, fill),
        if (grade != Grade.unknown) _pill(QualityBadge.gradeLetter(grade), gc, border, fill),
      ],
    );
  }

  Widget _pill(String label, Color fg, Color border, Color fill) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: Border.all(color: border),
        ),
        child: Text(label, style: DhenuText.caption.copyWith(color: fg)),
      );
}
