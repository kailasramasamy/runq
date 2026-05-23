// On-hand stock list — filter by warehouse + low-stock toggle.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/warehouse_picker.dart';

class InventoryOnHandScreen extends ConsumerStatefulWidget {
  const InventoryOnHandScreen({super.key});
  @override
  ConsumerState<InventoryOnHandScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryOnHandScreen> {
  String? warehouseId;
  bool lowOnly = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // The WarehousePicker reads the warehouse list itself; nothing else
    // here needs the list, so we don't watch it at the screen level.
    final args = (warehouseId: warehouseId, lowOnly: lowOnly);
    final rows = ref.watch(invOnHandProvider(args));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('On-hand stock', style: RunqText.h3.copyWith(color: t.ink))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: WarehousePicker(
                    value: warehouseId,
                    onChanged: (v) => setState(() => warehouseId = v),
                  ),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text('Low only', style: RunqText.caption),
                  selected: lowOnly,
                  onSelected: (v) => setState(() => lowOnly = v),
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(invOnHandProvider(args));
                await Future<void>.delayed(const Duration(milliseconds: 200));
              },
              child: rows.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text('Failed to load: $e', style: RunqText.body.copyWith(color: t.muted)),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return _Empty();
                  }
                  return ListView.separated(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _OnHandTile(row: list[i]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OnHandTile extends StatelessWidget {
  const _OnHandTile({required this.row});
  final InvOnHandRow row;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(row.itemName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
              if (row.isLow)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text('Low', style: RunqText.micro.copyWith(color: Colors.orange.shade900)),
                ),
            ],
          ),
          if (row.itemSku != null) Text(row.itemSku!, style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text(row.warehouseName, style: RunqText.caption.copyWith(color: t.muted))),
              if (row.batchNo.isNotEmpty)
                Text('Batch ${row.batchNo}', style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${row.qty.toStringAsFixed(3)} ${row.itemUnit ?? ''}'.trim(),
                  style: RunqText.h3.copyWith(color: t.ink),
                ),
              ),
              Text('₹${row.value.toStringAsFixed(2)}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(Icons.inventory_2_outlined, size: 48, color: t.muted2),
        const SizedBox(height: 8),
        Center(child: Text('No stock yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
        const SizedBox(height: 4),
        Center(
          child: Text('Post a GRN to start tracking on-hand stock.',
              style: RunqText.caption.copyWith(color: t.muted2)),
        ),
      ],
    );
  }
}
