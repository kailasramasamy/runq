import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/quality_badge.dart';

/// Day detail — AM and PM pours for one day with FAT/SNF and line values.
class FarmerCollectionDetail extends ConsumerWidget {
  const FarmerCollectionDetail({
    super.key,
    required this.date,
    required this.pours,
  });

  final String date;
  final List<MpPour> pours;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final am = pours.where((p) => p.shift == Shift.am).toList();
    final pm = pours.where((p) => p.shift == Shift.pm).toList();
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);
    final bands = ref.watch(qualityBandsProvider(null)).valueOrNull;

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        leading: IconButton(
          icon: Icon(DhenuIcons.chevronLeft, color: t.ink),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(prettyDate(date), style: DhenuText.h2.copyWith(color: t.ink)),
        backgroundColor: t.surface,
        foregroundColor: t.ink,
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen,
          DhenuSpacing.md,
          DhenuSpacing.screen,
          DhenuSpacing.x4,
        ),
        children: [
          _summaryCard(context, t, l, totalL, totalRs),
          const SizedBox(height: DhenuSpacing.xxl),
          _shiftSection(context, t, l, isAm: true, pours: am, bands: bands),
          const SizedBox(height: DhenuSpacing.lg),
          _shiftSection(context, t, l, isAm: false, pours: pm, bands: bands),
        ],
      ),
    );
  }

  // ── Summary card ────────────────────────────────────────────────────────
  Widget _summaryCard(
      BuildContext context, DhenuTokens t, AppLocalizations l, double totalL, double totalRs) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.xl,
        vertical: DhenuSpacing.lg,
      ),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
        border: Border.all(color: t.hairline),
        boxShadow: DhenuShadows.card,
      ),
      child: Row(
        children: [
          Expanded(
              child: _summaryColumn(t, l.farmerCollectionDetailTotal, '${litres(totalL)} L', t.ink)),
          Container(width: 1, height: 52, color: t.hairline),
          Expanded(
              child: _summaryColumn(t, l.farmerCollectionDetailGross, rupees(totalRs), t.gradeA,
                  right: true)),
        ],
      ),
    );
  }

  Widget _summaryColumn(DhenuTokens t, String eyebrow, String value, Color valueColor,
      {bool right = false}) {
    return Padding(
      padding: EdgeInsets.only(
        left: right ? DhenuSpacing.lg : 0,
        right: right ? 0 : DhenuSpacing.lg,
      ),
      child: Column(
        crossAxisAlignment: right ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            eyebrow,
            style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 1.1),
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            value,
            style: DhenuText.number(size: 30, w: FontWeight.w800, color: valueColor),
          ),
        ],
      ),
    );
  }

  // ── Shift section ────────────────────────────────────────────────────────
  Widget _shiftSection(BuildContext context, DhenuTokens t, AppLocalizations l,
      {required bool isAm, required List<MpPour> pours, QualityBands? bands}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _shiftHeading(t, l, isAm: isAm),
        const SizedBox(height: DhenuSpacing.sm),
        if (pours.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.lg),
            child: Text(
              l.farmerCollectionDetailNoCollection,
              style: DhenuText.body.copyWith(color: t.inkSoft),
            ),
          )
        else
          DhenuCard(
            padding: EdgeInsets.zero,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < pours.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: t.hairline),
                  _pourRow(t, l, pours[i], bands),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Widget _shiftHeading(DhenuTokens t, AppLocalizations l, {required bool isAm}) {
    final color = isAm ? t.amText : t.pm;
    final fillColor = isAm ? t.am.withValues(alpha: 0.12) : t.pm.withValues(alpha: 0.10);
    final icon = isAm ? DhenuIcons.sun : DhenuIcons.moon;
    final shiftLabel = isAm ? l.shiftAm : l.shiftPm;

    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: BorderRadius.circular(DhenuRadii.input),
          ),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: DhenuSpacing.sm),
        Text(
          shiftLabel,
          style: DhenuText.label.copyWith(color: color, fontWeight: FontWeight.w700),
        ),
        const SizedBox(width: DhenuSpacing.xs),
        Text(
          l.farmerCollectionDetailShift,
          style: DhenuText.label.copyWith(color: t.inkSoft),
        ),
      ],
    );
  }

  // ── Pour row ─────────────────────────────────────────────────────────────
  Widget _pourRow(DhenuTokens t, AppLocalizations l, MpPour p, QualityBands? bands) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.lg,
        vertical: DhenuSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(child: _pourLeft(t, p, bands)),
          const SizedBox(width: DhenuSpacing.md),
          _pourRight(t, l, p),
        ],
      ),
    );
  }

  Widget _pourLeft(DhenuTokens t, MpPour p, QualityBands? bands) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          litres(p.qtyLitres, unit: true),
          style: DhenuText.number(size: 18, w: FontWeight.w700, color: t.ink),
        ),
        const SizedBox(height: DhenuSpacing.xs),
        QualityPills(
          fat: p.fat, snf: p.snf, water: p.water,
          grade: p.qualityGrade, bands: bands, milkType: p.milkType,
        ),
      ],
    );
  }

  Widget _pourRight(DhenuTokens t, AppLocalizations l, MpPour p) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          rupees(p.lineAmount),
          style: DhenuText.number(size: 18, w: FontWeight.w800, color: t.gradeA),
        ),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          l.farmerCollectionDetailRatePerLitre(rupees(p.ratePerLitre, paise: true)),
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
      ],
    );
  }
}
