// AP Pattern-B "Items received into stock" section.
// Spec: docs/ap-pattern-b-spec.md §3.
//
// Shared between the bill edit screen (post-create amendments) and the
// bill extract screen (scan → review → commit). Owned state is supplied
// by the caller via the [GoodsReceivedState] interface so each screen
// can manage disposal alongside its own controllers.
//
// Layout follows the /module-ui skill: RunqCard + RunqText typography,
// theme tokens for ink/muted/hairline (dark-mode safe), bottom-sheet
// pickers for item + warehouse, onDrag keyboard dismiss on scrollables.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/inventory_models.dart';
import '../api/inventory_repo.dart';
import '../screens/inventory/widgets/warehouse_picker.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'runq_card.dart';

/// State contract for the section's owner. Implementers expose mutable
/// fields; the section calls [onChange] after mutating any of them.
abstract class GoodsReceivedState {
  String? get warehouseId;
  set warehouseId(String? v);
  bool get goodsReceived;
  set goodsReceived(bool v);
  List<ReceivedRow> get receivedItems;
}

/// One row in the items-received sub-form. Mirrors the web shape.
/// Serial numbers are newline-separated in the textarea; parsed on toJson.
class ReceivedRow {
  String? inventoryItemId;
  String? itemName;
  final TextEditingController qty;
  final TextEditingController unitCost;
  final TextEditingController batchNo;
  final TextEditingController expiryDate;
  final TextEditingController serialNos;

  ReceivedRow({String defaultUnitCost = ''})
      : qty = TextEditingController(),
        unitCost = TextEditingController(text: defaultUnitCost),
        batchNo = TextEditingController(),
        expiryDate = TextEditingController(),
        serialNos = TextEditingController();

  Map<String, dynamic> toJson() {
    final serials = serialNos.text
        .split(RegExp(r'\r?\n'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    return {
      'inventoryItemId': inventoryItemId,
      'qty': double.tryParse(qty.text) ?? 0,
      'unitCost': double.tryParse(unitCost.text) ?? 0,
      if (batchNo.text.trim().isNotEmpty) 'batchNo': batchNo.text.trim(),
      if (expiryDate.text.trim().isNotEmpty) 'expiryDate': expiryDate.text.trim(),
      if (serials.isNotEmpty) 'serialNos': serials,
    };
  }

  void dispose() {
    qty.dispose();
    unitCost.dispose();
    batchNo.dispose();
    expiryDate.dispose();
    serialNos.dispose();
  }
}

/// "ITEMS RECEIVED INTO STOCK" card. Off by default — service-only bills
/// see a single toggle and no extra friction. On expands a warehouse
/// picker (required) plus the sub-form rows.
///
/// [defaultUnitCostHint] is consulted by Add-row to pre-fill unit cost
/// (caller passes the dominant per-unit price from bill lines, if any).
class GoodsReceivedSection extends ConsumerWidget {
  final GoodsReceivedState state;
  final VoidCallback onChange;
  final double Function()? defaultUnitCostHint;
  const GoodsReceivedSection({
    super.key,
    required this.state,
    required this.onChange,
    this.defaultUnitCostHint,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ITEMS RECEIVED INTO STOCK', style: RunqText.label),
          const SizedBox(height: 8),
          InkWell(
            onTap: () {
              final next = !state.goodsReceived;
              state.goodsReceived = next;
              if (next && state.receivedItems.isEmpty) {
                state.receivedItems.add(ReceivedRow());
              }
              onChange();
            },
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Checkbox(
                    value: state.goodsReceived,
                    onChanged: (v) {
                      state.goodsReceived = v ?? false;
                      if (state.goodsReceived && state.receivedItems.isEmpty) {
                        state.receivedItems.add(ReceivedRow());
                      }
                      onChange();
                    },
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Record goods received against this bill',
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                        const SizedBox(height: 2),
                        Text(
                          'Only for tracked inventory (raw material, packaging). Adds stock movements and routes the JE through Inventory accounts.',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (state.goodsReceived) ...[
            const SizedBox(height: 12),
            WarehousePicker(
              value: state.warehouseId,
              allowAll: false,
              label: 'Default warehouse',
              onChanged: (v) { state.warehouseId = v; onChange(); },
            ),
            const SizedBox(height: 12),
            ...List.generate(state.receivedItems.length, (i) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _RowEditor(
                  row: state.receivedItems[i],
                  onPickItem: () async {
                    final picked = await _pickInventoryItem(context);
                    if (picked != null) {
                      state.receivedItems[i].inventoryItemId = picked.id;
                      state.receivedItems[i].itemName = picked.name;
                      onChange();
                    }
                  },
                  onRemove: () {
                    state.receivedItems[i].dispose();
                    state.receivedItems.removeAt(i);
                    onChange();
                  },
                  onChange: onChange,
                ),
              );
            }),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () {
                  final hint = defaultUnitCostHint?.call() ?? 0;
                  state.receivedItems.add(ReceivedRow(
                    defaultUnitCost: hint > 0 ? hint.toString() : '',
                  ));
                  onChange();
                },
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add item to stock'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<InvItem?> _pickInventoryItem(BuildContext context) {
    return showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => const _ItemPickerSheet(),
    );
  }
}

class _RowEditor extends StatelessWidget {
  final ReceivedRow row;
  final VoidCallback onPickItem;
  final VoidCallback onRemove;
  final VoidCallback onChange;
  const _RowEditor({
    required this.row,
    required this.onPickItem,
    required this.onRemove,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: t.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: onPickItem,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                    child: Row(
                      children: [
                        Icon(Icons.inventory_2_outlined, size: 18, color: t.muted),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            row.itemName ?? 'Pick an item…',
                            style: RunqText.bodyStrong.copyWith(
                              color: row.itemName == null ? t.muted : t.ink,
                            ),
                          ),
                        ),
                        Icon(Icons.chevron_right_rounded, color: t.muted2),
                      ],
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: onRemove,
                icon: Icon(Icons.delete_outline_rounded, color: RunqColors.redInk, size: 20),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(child: _LabeledField(
                label: 'Qty',
                controller: row.qty,
                onChange: onChange,
                keyboard: const TextInputType.numberWithOptions(decimal: true),
              )),
              const SizedBox(width: 8),
              Expanded(child: _LabeledField(
                label: 'Unit cost',
                controller: row.unitCost,
                onChange: onChange,
                keyboard: const TextInputType.numberWithOptions(decimal: true),
              )),
            ],
          ),
          Row(
            children: [
              Expanded(child: _LabeledField(
                label: 'Batch (if tracked)',
                controller: row.batchNo,
                onChange: onChange,
              )),
              const SizedBox(width: 8),
              Expanded(child: _LabeledField(
                label: 'Expiry YYYY-MM-DD',
                controller: row.expiryDate,
                onChange: onChange,
              )),
            ],
          ),
          _LabeledField(
            label: 'Serials (one per line, if tracked)',
            controller: row.serialNos,
            onChange: onChange,
          ),
        ],
      ),
    );
  }
}

/// Compact labeled TextField. Local to this widget — kept simple so the
/// section doesn't depend on screen-private input widgets.
class _LabeledField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final VoidCallback onChange;
  final TextInputType? keyboard;
  const _LabeledField({
    required this.label,
    required this.controller,
    required this.onChange,
    this.keyboard,
  });

  @override
  Widget build(BuildContext context) {
    final isNumeric = keyboard?.toString().contains('numberWithOptions') == true;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: RunqText.micro),
          const SizedBox(height: 2),
          TextField(
            controller: controller,
            keyboardType: keyboard,
            textCapitalization: isNumeric ? TextCapitalization.none : TextCapitalization.sentences,
            onChanged: (_) => onChange(),
            decoration: const InputDecoration(
              isDense: true,
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemPickerSheet extends StatefulWidget {
  const _ItemPickerSheet();

  @override
  State<_ItemPickerSheet> createState() => _ItemPickerSheetState();
}

class _ItemPickerSheetState extends State<_ItemPickerSheet> {
  final _ctl = TextEditingController();
  List<InvItem> _results = [];
  bool _loading = false;
  String _lastQuery = '';

  @override
  void initState() {
    super.initState();
    _search('');
  }

  Future<void> _search(String q) async {
    setState(() { _loading = true; _lastQuery = q; });
    try {
      final res = await inventoryRepo.searchItems(q, limit: 30);
      if (!mounted || _lastQuery != q) return;
      setState(() => _results = res);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtl) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            Container(
              width: 40, height: 4, margin: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                controller: _ctl,
                autofocus: true,
                onChanged: _search,
                textCapitalization: TextCapitalization.none,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search items by name or SKU…',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _results.isEmpty
                  ? Center(child: Text('No items', style: RunqText.caption.copyWith(color: t.muted)))
                  : ListView.separated(
                      controller: scrollCtl,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      itemCount: _results.length,
                      separatorBuilder: (_, __) => Divider(height: 1, color: t.hairline),
                      itemBuilder: (_, i) {
                        final item = _results[i];
                        return ListTile(
                          title: Text(item.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                          subtitle: item.sku != null
                              ? Text(item.sku!, style: RunqText.caption.copyWith(color: t.muted))
                              : null,
                          onTap: () => Navigator.pop(context, item),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
