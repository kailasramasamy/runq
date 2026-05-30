// Ad-hoc consumption tile + bottom sheet for items not in the WO BOM.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../services/wo_run_queue.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Tile that opens the ad-hoc consumption sheet.
class WoRunAdHocTile extends StatelessWidget {
  final WorkOrder wo;
  final VoidCallback onMutated;

  const WoRunAdHocTile({super.key, required this.wo, required this.onMutated});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: () => _openSheet(context),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline),
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: MfgColors.roseSubtle,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.add_rounded, color: MfgColors.brand(context), size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ad-hoc consumption', style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  Text('Item not in BOM — enter with reason',
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted),
          ],
        ),
      ),
    );
  }

  Future<void> _openSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AdHocConsumeSheet(wo: wo, onSubmitted: onMutated),
    );
  }
}

class _AdHocConsumeSheet extends ConsumerStatefulWidget {
  final WorkOrder wo;
  final VoidCallback onSubmitted;

  const _AdHocConsumeSheet({required this.wo, required this.onSubmitted});

  @override
  ConsumerState<_AdHocConsumeSheet> createState() => _AdHocConsumeSheetState();
}

class _AdHocConsumeSheetState extends ConsumerState<_AdHocConsumeSheet> {
  MfgItemRow? _selectedItem;
  final _batchCtl = TextEditingController();
  final _qtyCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  bool _busy = false;
  List<MfgItemRow> _items = [];
  bool _loadingItems = false;

  @override
  void initState() {
    super.initState();
    _loadItems('');
  }

  @override
  void dispose() {
    _batchCtl.dispose();
    _qtyCtl.dispose();
    _notesCtl.dispose();
    super.dispose();
  }

  Future<void> _loadItems(String q) async {
    setState(() => _loadingItems = true);
    try {
      final items = await manufacturingRepo.searchItems(q);
      if (mounted) setState(() => _items = items);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingItems = false);
    }
  }

  Future<void> _submit() async {
    if (_selectedItem == null) {
      showRunqSnack(context, 'Select an item', kind: SnackKind.error);
      return;
    }
    final qty = double.tryParse(_qtyCtl.text.trim()) ?? 0;
    if (qty <= 0) {
      showRunqSnack(context, 'Enter a valid qty > 0', kind: SnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      final outcome = await manufacturingRepo.addConsumption(
        widget.wo.id,
        inputItemId: _selectedItem!.id,
        batchNo: _batchCtl.text.trim().isEmpty ? null : _batchCtl.text.trim(),
        warehouseId: widget.wo.warehouseId,
        qty: qty,
        uom: _selectedItem!.uom,
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
      );
      ref.invalidate(woConsumptionProvider(widget.wo.id));
      ref.invalidate(woPreviewProvider(widget.wo.id));
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        if (outcome == EnqueueOutcome.queued) {
          showRunqSnack(context, 'Saved offline — will sync when online', kind: SnackKind.info);
        }
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Text('Ad-hoc Consumption', style: RunqText.h2.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text('Item not in BOM. Add a reason in notes.',
                style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(height: 14),
            TextField(
              textCapitalization: TextCapitalization.none,
              onChanged: _loadItems,
              decoration: InputDecoration(
                labelText: 'Search item',
                prefixIcon: const Icon(Icons.search_rounded, size: 18),
                filled: true,
                fillColor: t.bgWarm,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_loadingItems)
              const LinearProgressIndicator()
            else if (_selectedItem != null)
              _ItemChip(item: _selectedItem!, onRemove: () => setState(() => _selectedItem = null))
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 160),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: _items.length,
                  separatorBuilder: (_, __) => Divider(height: 1, color: t.hairline),
                  itemBuilder: (_, i) {
                    final item = _items[i];
                    return ListTile(
                      dense: true,
                      title: Text(item.name, style: RunqText.body.copyWith(color: t.ink)),
                      subtitle: Text(item.sku, style: RunqText.caption.copyWith(color: t.muted)),
                      onTap: () => setState(() => _selectedItem = item),
                    );
                  },
                ),
              ),
            const SizedBox(height: 12),
            if (_selectedItem != null) ...[
              _buildBatchField(t, brand),
              const SizedBox(height: 10),
              _buildQtyField(t, brand),
              const SizedBox(height: 10),
              _buildNotesField(t),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: MfgPrimaryButton(
                  label: 'Record',
                  loading: _busy,
                  onPressed: _busy ? null : _submit,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildBatchField(RunqTokens t, Color brand) => TextField(
        controller: _batchCtl,
        textCapitalization: TextCapitalization.none,
        style: RunqText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          labelText: 'Batch no (optional)',
          filled: true,
          fillColor: t.bgWarm,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: t.hairline),
          ),
        ),
      );

  Widget _buildQtyField(RunqTokens t, Color brand) => TextField(
        controller: _qtyCtl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
        style: RunqText.h2.copyWith(color: t.ink),
        decoration: InputDecoration(
          labelText: 'Qty (${_selectedItem!.uom})',
          filled: true,
          fillColor: t.bgWarm,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: t.hairline),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: brand, width: 1.4),
          ),
        ),
      );

  Widget _buildNotesField(RunqTokens t) => TextField(
        controller: _notesCtl,
        textCapitalization: TextCapitalization.sentences,
        maxLines: 2,
        style: RunqText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          labelText: 'Reason / notes (recommended)',
          filled: true,
          fillColor: t.bgWarm,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: t.hairline),
          ),
        ),
      );
}

class _ItemChip extends StatelessWidget {
  final MfgItemRow item;
  final VoidCallback onRemove;

  const _ItemChip({required this.item, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: MfgColors.roseSubtle,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: MfgColors.brand(context).withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${item.sku} · ${item.uom}',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded, size: 18),
            onPressed: onRemove,
            color: t.muted,
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}
