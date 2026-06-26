import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'dhenu_toast.dart';
import 'quality_badge.dart';
import 'sheet_grabber.dart';

/// Full detail for a single pour (receipt) — amount, rate/L, quality, slot —
/// plus Modify / Delete actions. [onModify] is invoked (after the sheet closes)
/// so the host screen can open the entry for editing; omit it to hide Modify.
Future<void> showPourDetailSheet(
  BuildContext context, {
  required MpPour pour,
  required MpNode node,
  MpFarmer? farmer,
  VoidCallback? onModify,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _PourDetailSheet(pour: pour, node: node, farmer: farmer, onModify: onModify),
  );
}

class _PourDetailSheet extends ConsumerWidget {
  const _PourDetailSheet({required this.pour, required this.node, this.farmer, this.onModify});
  final MpPour pour;
  final MpNode node;
  final MpFarmer? farmer;
  final VoidCallback? onModify;

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.pourDetailDeleteTitle),
        content: Text(l.pourDetailDeleteContent(
            litres(pour.qtyLitres, unit: true),
            farmer != null ? farmerName(context, farmer!) : l.pourDetailFarmerFallback)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.pourDetailDelete)),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await mpRepo.reversePour(pour.id);
      ref.invalidate(nodeTodayPoursProvider(node.id));
      ref.invalidate(nodeTodaySummaryProvider(node.id));
      ref.invalidate(nodeHistoryPoursProvider(node.id));
      ref.invalidate(farmerHistoryPoursProvider);
      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      if (context.mounted) showDhenuToast(context, '$e', type: DhenuToastType.error);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final reversed = pour.status != 'recorded';
    final bands = ref.watch(qualityBandsProvider(node.id)).asData?.value;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Text(farmer != null ? farmerName(context, farmer!) : l.pourDetailFarmerFallback, style: DhenuText.h2.copyWith(color: t.ink))),
                if (reversed) ...[_reversedTag(t, l), const SizedBox(width: DhenuSpacing.sm)],
                _CloseButton(t: t, onTap: () => Navigator.pop(context)),
              ]),
              if (pour.receiptNo != null)
                Text(pour.receiptNo!, style: DhenuText.caption.copyWith(color: t.inkSoft)),
              const SizedBox(height: DhenuSpacing.lg),
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(rupees(pour.lineAmount), style: DhenuText.number(size: 32, color: t.ink)),
                const SizedBox(width: DhenuSpacing.sm),
                Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: Text(
                    '${litres(pour.qtyLitres)} × ${rupees(pour.ratePerLitre, paise: true)}/L',
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  ),
                ),
              ]),
              if (pour.fat != null) ...[
                const SizedBox(height: DhenuSpacing.md),
                QualityPills(
                  fat: pour.fat, snf: pour.snf, water: pour.water,
                  grade: pour.qualityGrade,
                  bands: bands, milkType: pour.milkType,
                ),
              ],
              const SizedBox(height: DhenuSpacing.lg),
              Divider(height: 1, color: t.hairline),
              ..._detailRows(t, l),
              if (!reversed) ...[
                const SizedBox(height: DhenuSpacing.lg),
                _actions(context, ref, t, l),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _actions(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l) {
    final delete = OutlinedButton.icon(
      onPressed: () => _delete(context, ref),
      style: OutlinedButton.styleFrom(
        foregroundColor: t.gradeC,
        side: BorderSide(color: t.gradeC.withValues(alpha: 0.5)),
        minimumSize: const Size.fromHeight(48),
      ),
      icon: const Icon(DhenuIcons.trash, size: 18),
      label: Text(l.pourDetailDelete),
    );
    if (onModify == null) return delete;
    return Row(children: [
      Expanded(
        child: FilledButton.icon(
          onPressed: () {
            Navigator.pop(context);
            onModify!();
          },
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          icon: const Icon(DhenuIcons.edit, size: 18),
          label: Text(l.pourDetailModify),
        ),
      ),
      const SizedBox(width: DhenuSpacing.md),
      Expanded(child: delete),
    ]);
  }

  List<Widget> _detailRows(DhenuTokens t, AppLocalizations l) {
    final items = <(String, String, bool, IconData?)>[
      (l.pourDetailRatePerLitre, rupees(pour.ratePerLitre, paise: true), false, null),
      (l.pourDetailQuantity, litres(pour.qtyLitres, unit: true), false, null),
      (l.pourDetailMilkType, milkTypeL10n(l, pour.milkType), false, null),
      (l.pourDetailShift, pour.shift == Shift.am ? l.shiftAm : l.shiftPm, false,
          pour.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon),
      (l.pourDetailDate, prettyDate(pour.collectionDate), false, null),
      (l.pourDetailAmount, rupees(pour.lineAmount), true, null),
    ];
    final out = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      out.add(_row(t, items[i].$1, items[i].$2, strong: items[i].$3, icon: items[i].$4));
      if (i < items.length - 1) out.add(Divider(height: 1, color: t.hairline));
    }
    return out;
  }

  Widget _row(DhenuTokens t, String label, String value, {bool strong = false, IconData? icon}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
        child: Row(children: [
          Text(label, style: DhenuText.body.copyWith(color: t.inkSoft)),
          const Spacer(),
          if (icon != null) ...[Icon(icon, size: 15, color: t.ink), const SizedBox(width: 5)],
          Text(value,
              style: strong
                  ? DhenuText.number(size: 16, color: t.brand)
                  : DhenuText.body.copyWith(color: t.ink)),
        ]),
      );

  Widget _reversedTag(DhenuTokens t, AppLocalizations l) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: t.inkSoft.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(l.pourDetailReversed, style: DhenuText.label.copyWith(color: t.inkSoft)),
      );
}

/// Subtle circular close affordance for the sheet's top-right corner.
class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.t, required this.onTap});
  final DhenuTokens t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: t.inkSoft.withValues(alpha: 0.10),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.xs),
            child: Icon(DhenuIcons.close, size: 20, color: t.inkSoft),
          ),
        ),
      );
}
