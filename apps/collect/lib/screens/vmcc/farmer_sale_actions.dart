import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/sheet_grabber.dart';

/// What the operator chose to do with a recorded sale.
enum FarmerSaleAction { edit, delete }

/// Tap a sale → this sheet. Mirrors the pour detail sheet's Modify / Delete
/// pair, so a row's actions are visible rather than hidden behind a long-press
/// nobody discovers.
Future<FarmerSaleAction?> showFarmerSaleActions(
    BuildContext context, MpFarmerSale sale) {
  return showModalBottomSheet<FarmerSaleAction>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _ActionsSheet(sale: sale),
  );
}

class _ActionsSheet extends StatelessWidget {
  const _ActionsSheet({required this.sale});
  final MpFarmerSale sale;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final what = sale.itemName ??
        (sale.milkType == null ? '' : milkTypeL10n(l, sale.milkType!));
    final qty = sale.qty % 1 == 0
        ? sale.qty.toStringAsFixed(0)
        : sale.qty.toStringAsFixed(1);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.x4),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SheetGrabber(),
        // Restates the sale so a mis-tap on a dense list is caught here, before
        // the destructive action rather than after it.
        Text('$qty${sale.isMilk ? ' ' : ' × '}${sale.unit} $what',
            style: DhenuText.h2.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          '${prettyDate(sale.saleDate)}'
          '${sale.shift == null ? '' : ' · ${sale.shift == 'am' ? l.shiftAm : l.shiftPm}'}'
          ' · ${rupees(sale.amount)}',
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: () =>
                  Navigator.of(context).pop(FarmerSaleAction.edit),
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48)),
              icon: const Icon(DhenuIcons.edit, size: 18),
              label: Text(l.farmerSaleEdit),
            ),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () =>
                  Navigator.of(context).pop(FarmerSaleAction.delete),
              style: OutlinedButton.styleFrom(
                foregroundColor: t.gradeC,
                side: BorderSide(color: t.gradeC.withValues(alpha: 0.5)),
                minimumSize: const Size.fromHeight(48),
              ),
              icon: const Icon(DhenuIcons.trash, size: 18),
              label: Text(l.farmerSaleDelete),
            ),
          ),
        ]),
      ]),
    );
  }
}
