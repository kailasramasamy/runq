// "Set low-stock threshold" sheet.
//
// One editor shared by the item detail Stock Level card and the Stock
// Alerts list, so a threshold can be set where the problem is noticed
// rather than only from the item master. Writes items.reorder_level /
// reorder_qty via the item update endpoint.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/inventory_repo.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'inv_colors.dart';

/// Opens the editor. Returns true when a threshold was saved.
Future<bool> showReorderLevelSheet(
  BuildContext context, {
  required String itemId,
  required String itemName,
  String? unit,
  double? currentLevel,
  double? currentQty,
}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ReorderLevelSheet(
      itemId: itemId,
      itemName: itemName,
      unit: unit,
      currentLevel: currentLevel,
      currentQty: currentQty,
    ),
  );
  return saved == true;
}

class _ReorderLevelSheet extends ConsumerStatefulWidget {
  const _ReorderLevelSheet({
    required this.itemId,
    required this.itemName,
    this.unit,
    this.currentLevel,
    this.currentQty,
  });

  final String itemId;
  final String itemName;
  final String? unit;
  final double? currentLevel;
  final double? currentQty;

  @override
  ConsumerState<_ReorderLevelSheet> createState() => _ReorderLevelSheetState();
}

class _ReorderLevelSheetState extends ConsumerState<_ReorderLevelSheet> {
  late final TextEditingController _level;
  late final TextEditingController _qty;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _level = TextEditingController(
      text: widget.currentLevel != null ? _trim(widget.currentLevel!) : '',
    );
    _qty = TextEditingController();
  }

  @override
  void dispose() {
    _level.dispose();
    _qty.dispose();
    super.dispose();
  }

  static String _trim(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  Future<void> _save() async {
    final levelText = _level.text.trim();
    final qtyText = _qty.text.trim();
    // An empty box clears the threshold rather than meaning zero — zero is
    // a real instruction ("warn me only at empty").
    final level = levelText.isEmpty ? null : double.tryParse(levelText);
    final qty = qtyText.isEmpty ? null : double.tryParse(qtyText);
    if (levelText.isNotEmpty && (level == null || level < 0)) {
      showRunqSnack(context, 'Enter a valid threshold', kind: SnackKind.error);
      return;
    }
    if (qtyText.isNotEmpty && (qty == null || qty < 0)) {
      showRunqSnack(context, 'Enter a valid reorder quantity', kind: SnackKind.error);
      return;
    }

    setState(() => _saving = true);
    try {
      await inventoryRepo.updateItem(widget.itemId, {
        'reorderLevel': level,
        'reorderQty': qty,
      });
      // The alert lists are computed live from stock, so invalidating is
      // enough for the new threshold to take effect immediately.
      ref.invalidate(invItemDetailProvider(widget.itemId));
      ref.invalidate(invStockAlertsProvider);
      ref.invalidate(invStockAlertCountsProvider);
      ref.invalidate(invKpisProvider);
      if (!mounted) return;
      showRunqSnack(
        context,
        level == null ? 'Threshold cleared' : 'Low-stock threshold saved',
        kind: SnackKind.success,
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, 'Could not save threshold: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unit = widget.unit ?? '';
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            Text('Low-stock threshold',
                style: RunqText.h4.copyWith(color: t.ink)),
            const SizedBox(height: 2),
            Text(widget.itemName,
                style: RunqText.caption.copyWith(color: t.muted),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            if (widget.currentQty != null) ...[
              const SizedBox(height: 8),
              Text(
                'Currently ${_trim(widget.currentQty!)} $unit on hand'.trim(),
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ],
            const SizedBox(height: 16),
            _Field(
              controller: _level,
              label: 'Alert when on-hand falls to',
              suffix: unit,
              hint: 'Leave blank for no threshold',
              autofocus: true,
            ),
            const SizedBox(height: 12),
            _Field(
              controller: _qty,
              label: 'Reorder quantity (optional)',
              suffix: unit,
              hint: 'How much to order',
            ),
            const SizedBox(height: 8),
            Text(
              'Out-of-stock alerts fire at zero regardless of this setting.',
              style: RunqText.caption.copyWith(color: t.muted2),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: InvColors.brand(context),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text('Save',
                        style: RunqText.bodyStrong.copyWith(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.suffix,
    required this.hint,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String label;
  final String suffix;
  final String hint;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.label.copyWith(color: t.muted)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          autofocus: autofocus,
          // Numeric field — no sentence capitalisation.
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: RunqText.body.copyWith(color: t.ink),
          cursorColor: InvColors.brand(context),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: RunqText.body.copyWith(color: t.muted2),
            suffixText: suffix.isEmpty ? null : suffix,
            suffixStyle: RunqText.caption.copyWith(color: t.muted2),
            filled: true,
            fillColor: t.inputFill,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: t.hairline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: t.hairline),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: InvColors.brand(context)),
            ),
          ),
        ),
      ],
    );
  }
}
