import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
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
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete entry?'),
        content: Text('Reverses ${litres(pour.qtyLitres, unit: true)} for ${farmer?.name ?? 'this farmer'}. '
            'This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await mpRepo.reversePour(pour.id);
      ref.invalidate(nodeTodayPoursProvider(node.id));
      ref.invalidate(nodeTodaySummaryProvider(node.id));
      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      if (context.mounted) showDhenuToast(context, '$e', type: DhenuToastType.error);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final reversed = pour.status != 'recorded';
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
                Expanded(child: Text(farmer?.name ?? 'Farmer', style: DhenuText.h2.copyWith(color: t.ink))),
                if (reversed) ...[_reversedTag(t), const SizedBox(width: DhenuSpacing.sm)],
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
                QualityPills(fat: pour.fat, snf: pour.snf, grade: pour.qualityGrade),
              ],
              const SizedBox(height: DhenuSpacing.lg),
              Divider(height: 1, color: t.hairline),
              ..._detailRows(t),
              if (!reversed) ...[
                const SizedBox(height: DhenuSpacing.lg),
                _actions(context, ref, t),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _actions(BuildContext context, WidgetRef ref, DhenuTokens t) {
    final delete = OutlinedButton.icon(
      onPressed: () => _delete(context, ref),
      style: OutlinedButton.styleFrom(
        foregroundColor: t.gradeC,
        side: BorderSide(color: t.gradeC.withValues(alpha: 0.5)),
        minimumSize: const Size.fromHeight(48),
      ),
      icon: const Icon(DhenuIcons.trash, size: 18),
      label: const Text('Delete'),
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
          label: const Text('Modify'),
        ),
      ),
      const SizedBox(width: DhenuSpacing.md),
      Expanded(child: delete),
    ]);
  }

  List<Widget> _detailRows(DhenuTokens t) {
    final items = <(String, String, bool)>[
      ('Rate / litre', rupees(pour.ratePerLitre, paise: true), false),
      ('Quantity', litres(pour.qtyLitres, unit: true), false),
      ('Milk type', _milkLabel(pour.milkType), false),
      ('Shift', pour.shift == Shift.am ? '☀️ AM' : '🌙 PM', false),
      ('Date', prettyDate(pour.collectionDate), false),
      ('Amount', rupees(pour.lineAmount), true),
    ];
    final out = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      out.add(_row(t, items[i].$1, items[i].$2, strong: items[i].$3));
      if (i < items.length - 1) out.add(Divider(height: 1, color: t.hairline));
    }
    return out;
  }

  Widget _row(DhenuTokens t, String label, String value, {bool strong = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
        child: Row(children: [
          Text(label, style: DhenuText.body.copyWith(color: t.inkSoft)),
          const Spacer(),
          Text(value,
              style: strong
                  ? DhenuText.number(size: 16, color: t.brand)
                  : DhenuText.body.copyWith(color: t.ink)),
        ]),
      );

  Widget _reversedTag(DhenuTokens t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: t.inkSoft.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text('Reversed', style: DhenuText.label.copyWith(color: t.inkSoft)),
      );

  String _milkLabel(MilkType m) => switch (m) {
        MilkType.cow => 'Cow',
        MilkType.buffalo => 'Buffalo',
        MilkType.mixed => 'Mixed',
      };
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
