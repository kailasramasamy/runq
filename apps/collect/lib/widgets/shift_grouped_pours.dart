import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'dhenu_card.dart';
import 'quality_badge.dart';
import 'source_row.dart';

/// Renders pours grouped into PM-first then AM shift sections. Each section has
/// a subtotal header (count + total litres + amount) over a card of farmer rows.
/// Shared by Home "Recent entries", Record Collection, and Collection History so
/// the shift grouping reads identically everywhere.
class ShiftGroupedPours extends StatelessWidget {
  const ShiftGroupedPours({
    super.key,
    required this.pours,
    required this.farmersById,
    required this.onTapPour,
    this.maxRowsPerShift,
    this.showDate = false,
    this.singleFarmer = false,
    this.showAvatar = true,
    this.bands,
  });

  final List<MpPour> pours;
  final Map<String, MpFarmer> farmersById;
  final void Function(MpPour pour, MpFarmer? farmer) onTapPour;

  /// Cap on the number of visible rows per shift; the subtotal header still
  /// reflects the whole shift. Null shows every row.
  final int? maxRowsPerShift;

  /// Show the collection date next to the shift label in each group header.
  /// Used by Home "Recent entries"; off where the date is already implied
  /// (Record Collection = today, History = day-grouped).
  final bool showDate;

  /// Single-farmer history mode: the farmer is already implied by the screen,
  /// so the shift header shows the effective rate (₹/L) instead of a
  /// litres·amount subtotal that would just repeat the row below, and each row
  /// leads with its milk type rather than the (redundant) farmer name.
  final bool singleFarmer;

  /// Drops the leading farmer avatar on each row. Used by Record Collection's
  /// "Today's entries" where the farmer name already leads and the avatar adds
  /// nothing. Ignored in [singleFarmer] mode (already avatar-less).
  final bool showAvatar;

  /// When provided, each pour row's quality metrics are colored per-metric by
  /// band level instead of the single grade color. Null → existing behavior.
  final QualityBands? bands;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final am = [for (final p in pours) if (p.shift == Shift.am) p];
    final pm = [for (final p in pours) if (p.shift == Shift.pm) p];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (pm.isNotEmpty) _group(context, t, l, Shift.pm, pm),
      if (am.isNotEmpty && pm.isNotEmpty) const SizedBox(height: DhenuSpacing.md),
      if (am.isNotEmpty) _group(context, t, l, Shift.am, am),
    ]);
  }

  Widget _group(BuildContext context, DhenuTokens t, AppLocalizations l, Shift shift, List<MpPour> shiftPours) {
    final isAm = shift == Shift.am;
    final totalL = shiftPours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalAmt = shiftPours.fold<double>(0, (s, p) => s + p.lineAmount);
    final rows = maxRowsPerShift == null
        ? shiftPours
        : shiftPours.take(maxRowsPerShift!).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.only(
            left: DhenuSpacing.xs, right: DhenuSpacing.xs, bottom: DhenuSpacing.xs),
        child: Row(children: [
          Icon(isAm ? DhenuIcons.sun : DhenuIcons.moon, size: 14, color: t.inkSoft),
          const SizedBox(width: 4),
          Text(
              '${isAm ? l.shiftAm : l.shiftPm}'
              '${showDate ? ' · ${prettyDate(shiftPours.first.collectionDate)}' : ''}'
              ' · ${shiftPours.length}',
              style: DhenuText.label.copyWith(color: t.inkSoft)),
          const Spacer(),
          Text(
              singleFarmer
                  ? (totalL > 0 ? '${rupees(totalAmt / totalL, paise: true)}/L' : '—')
                  : '${litres(totalL, unit: true)} · ${rupees(totalAmt)}',
              style: DhenuText.label.copyWith(color: t.ink)),
        ]),
      ),
      DhenuCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.hairline),
            _row(context, t, l, rows[i]),
          ],
        ]),
      ),
    ]);
  }

  Widget _row(BuildContext context, DhenuTokens t, AppLocalizations l, MpPour p) {
    final farmer = farmersById[p.farmerId];
    final milkType = milkTypeL10n(l, p.milkType);
    final noAvatar = singleFarmer || !showAvatar;
    return SourceRow(
      title: singleFarmer ? milkType : (farmer != null ? farmerName(context, farmer) : l.shiftFarmerFallback),
      hideLeading: noAvatar,
      farmer: noAvatar ? null : farmer,
      litres: litres(p.qtyLitres, unit: true),
      quality: p.fat == null ? null : _qualityLine(context, p, bands),
      amount: rupees(p.lineAmount),
      onTap: () => onTapPour(p, farmer),
    );
  }
}

/// Low-emphasis quality read for list rows: muted "FAT · SNF · W" with only the
/// grade letter (and per-metric values when bands are provided) carrying color.
Widget _qualityLine(BuildContext context, MpPour p, QualityBands? bands) {
  final t = DT(context);
  final muted = DhenuText.caption.copyWith(color: t.inkSoft);
  final hasGrade = p.qualityGrade != Grade.unknown;

  Color metricColor(String metric, double? value) {
    if (bands == null || value == null) return t.inkSoft;
    final level = bands.levelFor(p.milkType, metric, value);
    return level == null ? t.inkSoft : QualityBadge.levelColor(level, t);
  }

  return Text.rich(
    TextSpan(children: [
      if (p.fat != null) TextSpan(
        text: 'FAT ${p.fat!.toStringAsFixed(1)}',
        style: muted.copyWith(color: metricColor('fat', p.fat)),
      ),
      if (p.snf != null) ...[
        TextSpan(text: '  ·  ', style: muted),
        TextSpan(
          text: 'SNF ${p.snf!.toStringAsFixed(1)}',
          style: muted.copyWith(color: metricColor('snf', p.snf)),
        ),
      ],
      if (p.water != null) TextSpan(text: '  ·  W ${p.water!.toStringAsFixed(1)}', style: muted),
      if (hasGrade) ...[
        TextSpan(text: '  ·  ', style: muted),
        TextSpan(
          text: QualityBadge.gradeLetter(p.qualityGrade),
          style: muted.copyWith(
              color: QualityBadge.gradeColor(p.qualityGrade, t),
              fontWeight: FontWeight.w700),
        ),
      ],
    ]),
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
  );
}
