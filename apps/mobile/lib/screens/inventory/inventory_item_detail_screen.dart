// Inventory item detail — shows on-hand by warehouse for a single item.
// Reached from the Items screen (Phase 2) or by deep link. Phase 1 ships
// the screen + the route so barcode-driven flows in GRN/DN can deep-link
// here when needed.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

class InventoryItemDetailScreen extends ConsumerWidget {
  const InventoryItemDetailScreen({super.key, required this.itemId});
  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final args = (warehouseId: null, lowOnly: false);
    final rowsAsync = ref.watch(invOnHandProvider(args));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('Item stock', style: RunqText.h3.copyWith(color: t.ink))),
      body: rowsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (all) {
          final rows = all.where((r) => r.itemId == itemId).toList();
          if (rows.isEmpty) {
            return Center(
              child: Text('No stock on hand for this item',
                  style: RunqText.body.copyWith(color: t.muted)),
            );
          }
          return ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final r = rows[i];
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
                    Text(r.warehouseName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    if (r.batchNo.isNotEmpty)
                      Text('Batch ${r.batchNo}', style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${r.qty.toStringAsFixed(3)} ${r.itemUnit ?? ''}'.trim(),
                            style: RunqText.h3.copyWith(color: t.ink),
                          ),
                        ),
                        Text('₹${r.value.toStringAsFixed(2)}',
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
