import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'dhenu_card.dart';
import 'shift_grouped_pours.dart';
import 'source_row.dart';

/// One card of milk a VMCC supplied that no farmer pour records — the receiving
/// CC entered it by hand, so these rows are the operator's only account of
/// their own day. A row per shift (PM first, as everywhere else) and milk type,
/// carrying litres, the qty-weighted QC the CC measured, and what it priced at.
///
/// The card leads with where the figure came from: an operator who never
/// touches this data in the app needs to be told a person at the CC keyed it,
/// otherwise a number they can't trace is worse than no number.
class SuppliedShiftRows extends StatelessWidget {
  const SuppliedShiftRows({
    super.key,
    required this.node,
    required this.lines,
    this.bands,
  });

  final MpNode node;
  final List<MpSuppliedLine> lines;
  final QualityBands? bands;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final rows = [
      for (final s in lines) if (s.shift == Shift.pm) s,
      for (final s in lines) if (s.shift != Shift.pm) s,
    ];
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.md),
          child: Row(children: [
            Icon(DhenuIcons.info, size: 14, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.xs),
            Expanded(
              child: Text(_source(l), style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ),
          ]),
        ),
        for (final s in rows) ...[
          Divider(height: 1, color: t.hairline),
          _row(context, t, l, s),
        ],
      ]),
    );
  }

  /// Names the CC when the server resolved it; a VMCC operator can't look their
  /// own parent centre up, so the fallback stays generic rather than blank.
  String _source(AppLocalizations l) {
    final cc = lines.map((s) => s.toNodeName).firstWhere((n) => n != null, orElse: () => null);
    return cc == null ? l.suppliedRecordedAtCc : l.suppliedRecordedAtNamedCc(cc);
  }

  Widget _row(BuildContext context, DhenuTokens t, AppLocalizations l, MpSuppliedLine s) {
    // A pooled VMCC sends its whole window as one tanker, so its receipt carries
    // no shift — labelling it AM would name a slot the milk never sat in.
    final label = node.isPooledDispatch
        ? l.suppliedWholeDay
        : (s.shift == Shift.am ? l.shiftAm : l.shiftPm);
    final type = milkTypeL10n(l, s.milkType);
    final rate = s.ratePerLitre == null
        ? l.suppliedNotPriced
        : '${rupees(s.ratePerLitre!, paise: true)}/L';
    final priced = s.ratePerLitre != null;
    return SourceRow(
      titleIcon: node.isPooledDispatch
          ? DhenuIcons.drop
          : (s.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon),
      title: _mixedTypes ? '$label  ·  $type' : label,
      subtitle: rate,
      hideLeading: true,
      litres: litres(s.qtyLitres, unit: true),
      quality: s.fat == null
          ? null
          : qualityMetricsLine(context,
              milkType: s.milkType, fat: s.fat, snf: s.snf,
              // Receipts store an unmeasured water share as 0, not null, and a
              // "W 0.0" on every row is noise the reports tab already drops.
              water: (s.water ?? 0) > 0 ? s.water : null,
              bands: bands),
      // An unpriced line shows no amount at all: ₹0 reads as "worth nothing"
      // when it means "no rate chart matched".
      amount: priced ? rupees(s.amount) : null,
    );
  }

  bool get _mixedTypes => hasMixedMilkTypes(lines.map((s) => s.milkType));
}

/// Total litres across [lines] — the day header's figure.
double suppliedLitres(Iterable<MpSuppliedLine> lines) =>
    lines.fold<double>(0, (a, s) => a + s.qtyLitres);

/// Total value across [lines]. Unpriced lines contribute nothing, so this is a
/// floor, not a claim about the whole day.
double suppliedAmount(Iterable<MpSuppliedLine> lines) =>
    lines.fold<double>(0, (a, s) => a + s.amount);

/// Litres in one shift — pooled receipts carry no shift and count as the day.
double suppliedShiftLitres(Iterable<MpSuppliedLine> lines, Shift shift) =>
    suppliedLitres(lines.where((s) => s.shift == shift));
