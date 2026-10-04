import 'package:flutter/material.dart';
import '../../api/purchase_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/pur_primitives.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/catalog_picker_screen.dart';
import 'widgets/pur_colors.dart';

/// Rows for items the vendor added on the spot carry this key prefix — they
/// have no PO line yet; the server creates one as part of the receipt.
const extraKeyPrefix = 'extra:';

bool isExtraKey(String key) => key.startsWith(extraKeyPrefix);

/// Pick an item from the vendor's catalog to receive although it isn't on the
/// PO. Returns a stand-in template line (ordered = 0) the receive card can
/// render, or null if nothing usable was picked.
Future<ReceiveTemplateLine?> pickExtraItem(
  BuildContext context, {
  required String vendorId,
  required int nextLineNo,
  required Set<String> taken,
}) async {
  final result = await Navigator.of(context).push<CatalogPickResult>(
    MaterialPageRoute(fullscreenDialog: true, builder: (_) => CatalogPickerScreen(vendorId: vendorId)),
  );
  if (result == null || !context.mounted) return null;
  final e = result.entry;
  if (e == null) {
    showRunqSnack(context, 'Pick an item from the vendor\'s catalog to receive it', kind: SnackKind.info);
    return null;
  }
  if (taken.contains('$extraKeyPrefix${e.id}')) {
    showRunqSnack(context, '${e.description} is already added', kind: SnackKind.info);
    return null;
  }
  return ReceiveTemplateLine(
    poLineId: '$extraKeyPrefix${e.id}',
    lineNo: nextLineNo,
    description: e.description,
    uom: e.defaultUom,
    hsnSacCode: e.hsnSacCode,
    qtyOrdered: 0,
    qtyReceivedSoFar: 0,
    qtyOpen: 0,
    unitRate: e.defaultRate ?? 0,
    catalogItemId: e.id,
    inventoryItemId: e.inventoryItemId,
  );
}

/// "+ Add item not on this PO" — the vendor sent something extra.
class AddExtraItemButton extends StatelessWidget {
  final VoidCallback onTap;
  const AddExtraItemButton({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final brand = PurColors.brand(context);
    return OutlinedButton.icon(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: brand,
        side: BorderSide(color: PurColors.violetHairline),
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: const Icon(Icons.add_rounded, size: 18),
      label: Text('Add item not on this PO', style: RunqText.bodyStrong.copyWith(color: brand)),
    );
  }
}

/// What posting this receipt will do: bill it now (rates on every item — no
/// invoice will follow), or receive only (the vendor's invoice becomes the
/// bill later, via share sheet or web).
class ReceiveBillingNote extends StatelessWidget {
  final bool billing, mixed;
  final double total;
  const ReceiveBillingNote({super.key, required this.billing, required this.mixed, required this.total});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (icon, color, text) = mixed
        ? (Icons.error_outline_rounded, PurColors.orangeAlert,
            'Some items have a rate and some don\'t. Enter all rates to bill now, or clear them to receive only.')
        : billing
            ? (Icons.receipt_long_outlined, PurColors.success,
                'Rates entered — a bill for ${indianINR(total, decimals: 2)} will be created with this receipt.')
            : (Icons.info_outline_rounded, t.muted,
                'No rates — receipt only. Create the bill when the vendor\'s invoice arrives.');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: RunqText.caption.copyWith(color: t.ink2))),
        ],
      ),
    );
  }
}
