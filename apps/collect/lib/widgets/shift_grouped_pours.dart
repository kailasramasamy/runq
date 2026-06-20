import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
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
          Text(
              '${isAm ? '☀️ ${l.shiftAm}' : '🌙 ${l.shiftPm}'}'
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
    return SourceRow(
      title: singleFarmer ? milkType : (farmer != null ? farmerName(context, farmer) : l.shiftFarmerFallback),
      // In single-farmer mode, the farmer avatar is not meaningful (milk type
      // is the lead), so fall back to a plain initial.
      leadingInitials: singleFarmer ? milkType.substring(0, 1) : null,
      farmer: singleFarmer ? null : farmer,
      litres: litres(p.qtyLitres, unit: true),
      quality: p.fat == null
          ? null
          : QualityPills(fat: p.fat, snf: p.snf, grade: p.qualityGrade),
      amount: rupees(p.lineAmount),
      onTap: () => onTapPour(p, farmer),
    );
  }
}
