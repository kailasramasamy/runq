import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';

/// How a [QualityBadge] renders its label.
///  - full       → "FAT 4.2 · SNF 8.6 · W 2.0 · A"
///  - compact     → "4.2 · A"
///  - valueLabel → "4.2 FAT, 8.6 SNF · A"
enum QualityFormat { full, compact, valueLabel }

/// Pill badge showing FAT · SNF · Water · Grade, coloured by grade. Pass
/// [format], or the legacy [compact] shortcut. Water % is omitted when null.
class QualityBadge extends StatelessWidget {
  const QualityBadge({
    super.key,
    this.fat,
    this.snf,
    this.water,
    required this.grade,
    this.compact = false,
    this.format,
    this.bands,
    this.milkType,
    this.showGrade = true,
  });

  final double? fat;
  final double? snf;
  final double? water;
  final Grade grade;
  final bool compact;
  final QualityFormat? format;

  /// When false, the trailing grade letter is omitted (e.g. rows that show only
  /// the FAT/SNF/W values).
  final bool showGrade;

  /// When both [bands] and [milkType] are set, the pill is coloured by the worst
  /// band across FAT/SNF (a single quality colour for aggregate rows); otherwise
  /// it falls back to the grade colour.
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final muted = DhenuText.caption.copyWith(color: t.inkSoft);
    return Text.rich(
      TextSpan(children: _spans(t, muted)),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }

  // Band colour for one metric (falls back to muted when no band / no value).
  Color _metricColor(String metric, double? value, DhenuTokens t) {
    if (bands == null || milkType == null || value == null) return t.inkSoft;
    final level = bands!.levelFor(milkType!, metric, value);
    return level == null ? t.inkSoft : levelColor(level, t);
  }

  /// Low-emphasis spans: muted "FAT · SNF · W", FAT/SNF in their own band colour
  /// and the grade letter coloured — no filled pill (see record-collection rows).
  List<TextSpan> _spans(DhenuTokens t, TextStyle muted) {
    final hasGrade = showGrade && grade != Grade.unknown;
    final fatStr = fat != null ? fat!.toStringAsFixed(1) : '—';
    final snfStr = snf != null ? snf!.toStringAsFixed(1) : '—';
    final fatC = muted.copyWith(color: _metricColor('fat', fat, t));
    final snfC = muted.copyWith(color: _metricColor('snf', snf, t));
    final sep = TextSpan(text: '  ·  ', style: muted);
    final gradeSpan = TextSpan(
      text: _gradeLetter(grade),
      style: muted.copyWith(color: _gradeColor(grade, t), fontWeight: FontWeight.w700),
    );
    final fmt = format ?? (compact ? QualityFormat.compact : QualityFormat.full);
    if (fmt == QualityFormat.compact) {
      return [TextSpan(text: fatStr, style: fatC), if (hasGrade) ...[sep, gradeSpan]];
    }
    final valueFirst = fmt == QualityFormat.valueLabel;
    return [
      TextSpan(text: valueFirst ? '$fatStr FAT' : 'FAT $fatStr', style: fatC),
      sep,
      TextSpan(text: valueFirst ? '$snfStr SNF' : 'SNF $snfStr', style: snfC),
      if (water != null)
        TextSpan(
          text: valueFirst ? '  ·  ${water!.toStringAsFixed(1)} W' : '  ·  W ${water!.toStringAsFixed(1)}',
          style: muted,
        ),
      if (hasGrade) ...[sep, gradeSpan],
    ];
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

  /// Maps a [QualityLevel] to the semantic grade token (dark-mode safe).
  static Color levelColor(QualityLevel level, DhenuTokens t) => switch (level) {
    QualityLevel.good => t.gradeA,
    QualityLevel.watch => t.gradeB,
    QualityLevel.low => t.gradeC,
  };

  /// True when any of the given metrics falls outside its "good" band.
  ///
  /// For surfaces where band COLOUR cannot be used. On the brand hero
  /// gradient every band step fails contrast — worst 1.06:1, and even a 65%
  /// black scrim leaves the red at 4.08:1 — so the hero signals a breach with
  /// an icon and keeps its text white, which reads at 5:1 on the same scrim.
  static bool anyOutOfBand(
    QualityBands? bands,
    MilkType? milkType,
    Map<String, double?> metrics,
  ) {
    if (bands == null || milkType == null) return false;
    for (final e in metrics.entries) {
      if (e.value == null) continue;
      final level = bands.levelFor(milkType, e.key, e.value!);
      if (level != null && level != QualityLevel.good) return true;
    }
    return false;
  }

  /// Band colour for one metric value as plain text — null when no band applies
  /// (caller keeps its default colour). Used where FAT/SNF render as raw text.
  static Color? bandColor(
    QualityBands? bands,
    MilkType? milkType,
    String metric,
    double? value,
    DhenuTokens t,
  ) {
    if (bands == null || milkType == null || value == null) return null;
    final level = bands.levelFor(milkType, metric, value);
    return level == null ? null : levelColor(level, t);
  }

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
///
/// When both [bands] and [milkType] are provided, each metric pill is colored by
/// its own [QualityLevel]; otherwise all pills use the grade color (existing
/// behavior, all existing call sites compile unchanged).
class QualityPills extends StatelessWidget {
  const QualityPills({
    super.key,
    this.fat,
    this.snf,
    this.water,
    required this.grade,
    this.bands,
    this.milkType,
  });

  final double? fat;
  final double? snf;
  final double? water;
  final Grade grade;
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final gc = QualityBadge.gradeColor(grade, t);

    Color metricColor(String metric, double? value) {
      if (bands == null || milkType == null || value == null) return gc;
      final level = bands!.levelFor(milkType!, metric, value);
      return level == null ? gc : QualityBadge.levelColor(level, t);
    }

    return Wrap(
      spacing: DhenuSpacing.xs,
      runSpacing: DhenuSpacing.xs,
      children: [
        if (fat != null) _pill('FAT ${fat!.toStringAsFixed(1)}', metricColor('fat', fat), t),
        if (snf != null) _pill('SNF ${snf!.toStringAsFixed(1)}', metricColor('snf', snf), t),
        if (water != null) _pill('W ${water!.toStringAsFixed(1)}', gc, t),
        if (grade != Grade.unknown) _pill(QualityBadge.gradeLetter(grade), gc, t),
      ],
    );
  }

  Widget _pill(String label, Color fg, DhenuTokens t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
        decoration: BoxDecoration(
          color: fg.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: Border.all(color: fg.withValues(alpha: 0.35)),
        ),
        child: Text(label, style: DhenuText.caption.copyWith(color: fg)),
      );
}

/// Small milk-type tag for a pour row. Only shown when a farmer supplies more
/// than one type — otherwise every row would carry the same redundant word.
class MilkTypePill extends StatelessWidget {
  const MilkTypePill({super.key, required this.milkType});

  final MilkType milkType;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: t.brand.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.brand.withValues(alpha: 0.28)),
      ),
      child: Text(
        milkTypeL10n(AppLocalizations.of(context), milkType),
        // Labels like "Cow A1 (regular)" outrun a narrow list column; ellipsise
        // rather than overflow the row the pill sits in.
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: DhenuText.caption.copyWith(color: t.brand, fontWeight: FontWeight.w700),
      ),
    );
  }
}
