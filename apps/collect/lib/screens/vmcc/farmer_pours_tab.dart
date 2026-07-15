import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/quality_badge.dart';
import 'farmer_statement_share.dart';
import 'record_collection.dart';

/// Operator view of one farmer's pours (Pours tab). Day-grouped list where each
/// pour is a self-contained card: shift + grade in the header, volume & amount
/// as the heroes, and quality metrics neutral unless a value is out of spec.
class FarmerPoursTab extends ConsumerWidget {
  const FarmerPoursTab({super.key, required this.node, required this.farmer});

  final MpNode node;
  final MpFarmer farmer;

  void _openPour(BuildContext context, MpPour p) => showPourDetailSheet(
        context,
        pour: p,
        node: node,
        farmer: farmer,
        onModify: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) =>
                RecordCollectionScreen(node: node, seedPour: p, seedFarmer: farmer),
          ),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final poursAsync = ref.watch(
      farmerHistoryPoursProvider((nodeId: node.id, farmerId: farmer.id)),
    );
    return poursAsync.when(
      loading: () => const DhenuLoadingList(rows: 6),
      error: (e, _) => DhenuEmptyState(
        icon: DhenuIcons.cloudOff,
        title: l.farmerPoursLoadError,
        subtitle: '$e',
      ),
      data: (mine) =>
          _body(context, mine, ref.watch(qualityBandsProvider(node.id)).valueOrNull),
    );
  }

  Widget _body(BuildContext context, List<MpPour> mine, QualityBands? bands) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    if (mine.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        children: [
          ShareStatementButton(farmer: farmer),
          const SizedBox(height: DhenuSpacing.xl),
          DhenuEmptyState(
            icon: DhenuIcons.history,
            title: l.farmerPoursEmptyTitle,
            subtitle: l.farmerPoursEmptySubtitle,
          ),
        ],
      );
    }
    final groups = <String, List<MpPour>>{};
    for (final p in mine) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final dates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    for (final d in dates) {
      // PM before AM within a day, so the reading order matches the app.
      groups[d]!.sort((a, b) =>
          a.shift == b.shift ? 0 : (a.shift == Shift.pm ? -1 : 1));
    }
    final totalL = mine.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalAmt = mine.fold<double>(0, (s, p) => s + p.lineAmount);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _summaryCard(t, l, totalL, totalAmt, mine.length),
        const SizedBox(height: DhenuSpacing.md),
        ShareStatementButton(farmer: farmer),
        for (final d in dates) ...[
          _dayHeader(t, d, groups[d]!),
          for (final p in groups[d]!) ...[
            _PourCard(pour: p, bands: bands, onTap: () => _openPour(context, p)),
            const SizedBox(height: 9),
          ],
        ],
      ],
    );
  }

  Widget _summaryCard(
      DhenuTokens t, AppLocalizations l, double totalL, double totalAmt, int count) {
    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
      child: Row(children: [
        Expanded(
          child: _summaryCol(t, l.farmerPoursCount(count), value: [
            TextSpan(
                text: litres(totalL),
                style: DhenuText.number(size: 23, w: FontWeight.w800, color: t.ink)),
            TextSpan(
                text: ' L',
                style: DhenuText.caption
                    .copyWith(fontSize: 13, color: t.inkSoft, fontWeight: FontWeight.w600)),
          ]),
        ),
        Container(width: 1, height: 40, color: t.hairline),
        Expanded(
          child: _summaryCol(t, l.farmerPours30DayTotal, value: [
            TextSpan(
                text: rupees(totalAmt),
                style: DhenuText.number(size: 23, w: FontWeight.w800, color: t.ink)),
          ]),
        ),
      ]),
    );
  }

  Widget _summaryCol(DhenuTokens t, String label, {required List<InlineSpan> value}) {
    return Column(children: [
      Text.rich(TextSpan(children: value), textAlign: TextAlign.center),
      const SizedBox(height: 5),
      Text(label,
          style: DhenuText.caption.copyWith(color: t.inkSoft), textAlign: TextAlign.center),
    ]);
  }

  Widget _dayHeader(DhenuTokens t, String date, List<MpPour> dayPours) {
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = dayPours.fold<double>(0, (a, p) => a + p.lineAmount);
    return Padding(
      padding: const EdgeInsets.only(left: 2, right: 2, top: 20, bottom: 11),
      child: Row(children: [
        Text(prettyDate(date),
            style: DhenuText.title
                .copyWith(fontWeight: FontWeight.w800, color: t.ink, letterSpacing: -0.15)),
        const Spacer(),
        Text.rich(TextSpan(children: [
          TextSpan(
              text: litres(qty, unit: true),
              style: DhenuText.number(size: 14, w: FontWeight.w600, color: t.inkSoft)),
          TextSpan(text: '  ·  ', style: DhenuText.label.copyWith(color: t.inkSoft)),
          TextSpan(
              text: rupees(amt),
              style: DhenuText.number(size: 14, w: FontWeight.w700, color: t.ink)),
        ])),
      ]),
    );
  }
}

/// One pour as a self-contained card: shift chip + grade pill + volume, a
/// species/rate caption, then a metrics row (neutral, red only when out of
/// spec) with the line amount.
class _PourCard extends StatelessWidget {
  const _PourCard({required this.pour, required this.bands, required this.onTap});

  final MpPour pour;
  final QualityBands? bands;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            color: t.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: t.hairline),
            boxShadow: DhenuShadows.card,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              _shiftChip(t, l),
              if (pour.qualityGrade != Grade.unknown) ...[
                const SizedBox(width: 7),
                _gradePill(t, l),
              ],
              const Spacer(),
              _volume(t),
            ]),
            const SizedBox(height: 7),
            Text('${milkTypeL10n(l, pour.milkType)} · @ ${rupees(pour.ratePerLitre, paise: true)}/L',
                style: DhenuText.label.copyWith(color: t.inkSoft, fontWeight: FontWeight.w500)),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 11),
              child: _Hairline(),
            ),
            Row(children: [
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: FittedBox(
                      fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: _metrics(t)),
                ),
              ),
              const SizedBox(width: DhenuSpacing.sm),
              Text(rupees(pour.lineAmount),
                  style: DhenuText.number(size: 18, w: FontWeight.w800, color: t.gradeA)),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _shiftChip(DhenuTokens t, AppLocalizations l) {
    final isAm = pour.shift == Shift.am;
    final fg = isAm ? t.amText : t.pm;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
          color: (isAm ? t.am : t.pm).withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(DhenuRadii.pill)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(isAm ? DhenuIcons.sun : DhenuIcons.moon, size: 15, color: fg),
        const SizedBox(width: 5),
        Text(isAm ? l.shiftAm : l.shiftPm,
            style: DhenuText.label.copyWith(
                fontWeight: FontWeight.w700, color: fg, letterSpacing: 0.2)),
      ]),
    );
  }

  Widget _gradePill(DhenuTokens t, AppLocalizations l) {
    final gc = QualityBadge.gradeColor(pour.qualityGrade, t);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: gc.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(7)),
      child: Text(l.farmerPoursGradeLabel(QualityBadge.gradeLetter(pour.qualityGrade)),
          style: DhenuText.label.copyWith(fontWeight: FontWeight.w800, color: gc)),
    );
  }

  Widget _volume(DhenuTokens t) => Text.rich(TextSpan(children: [
        TextSpan(
            text: litres(pour.qtyLitres),
            style: DhenuText.number(size: 22, w: FontWeight.w800, color: t.ink)),
        TextSpan(
            text: ' L',
            style: DhenuText.label.copyWith(color: t.inkSoft, fontWeight: FontWeight.w600)),
      ]));

  /// Metrics read neutral by default; only a value that falls in the `low` band
  /// for its milk type turns red (weight 700). Water carries no band.
  Widget _metrics(DhenuTokens t) {
    final cells = <Widget>[];
    void add(String metric, String label, double? value, {bool banded = true}) {
      if (value == null) return;
      final low = banded &&
          bands != null &&
          bands!.levelFor(pour.milkType, metric, value) == QualityLevel.low;
      if (cells.isNotEmpty) cells.add(_dot(t));
      cells.add(Text('$label ${value.toStringAsFixed(1)}',
          style: DhenuText.number(
              size: 14,
              w: low ? FontWeight.w700 : FontWeight.w600,
              color: low ? t.gradeC : t.inkSoft)));
    }

    add('fat', 'FAT', pour.fat);
    add('snf', 'SNF', pour.snf);
    add('clr', 'CLR', pour.clr);
    add('water', 'W', pour.water, banded: false);
    return Row(mainAxisSize: MainAxisSize.min, children: cells);
  }

  Widget _dot(DhenuTokens t) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 5),
        child: Container(
            width: 3, height: 3, decoration: BoxDecoration(color: t.hairline, shape: BoxShape.circle)),
      );
}

class _Hairline extends StatelessWidget {
  const _Hairline();
  @override
  Widget build(BuildContext context) => Container(height: 1, color: DT(context).hairline);
}
