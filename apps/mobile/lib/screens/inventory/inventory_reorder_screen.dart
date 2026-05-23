// Reorder alerts — items at or below effective reorder level. Field
// view for owner / store-keeper triaging what to buy next.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

class InventoryReorderScreen extends ConsumerWidget {
  const InventoryReorderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invReorderAlertsProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('Reorder alerts', style: RunqText.h3.copyWith(color: t.ink))),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invReorderAlertsProvider);
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 80),
                  Icon(Icons.check_circle_outline, size: 48, color: Colors.green.shade400),
                  Center(child: Text('All stock above reorder level',
                      style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  const SizedBox(height: 4),
                  Center(child: Text('Nothing to reorder right now.',
                      style: RunqText.caption.copyWith(color: t.muted2))),
                ],
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _AlertTile(alert: list[i]),
            );
          },
        ),
      ),
    );
  }
}

class _AlertTile extends StatelessWidget {
  const _AlertTile({required this.alert});
  final InvReorderAlert alert;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final shortColor = alert.shortBy > 0 ? Colors.orange.shade700 : t.muted;
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
          Text(alert.itemName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          if (alert.itemSku != null)
            Text(alert.itemSku!, style: RunqText.caption.copyWith(color: t.muted)),
          Text(alert.warehouseName, style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'On hand',
                  value: '${alert.onHand.toStringAsFixed(3)} ${alert.itemUnit ?? ''}'.trim(),
                  color: t.ink,
                ),
              ),
              Expanded(
                child: _Stat(
                  label: 'Reorder at',
                  value: alert.reorderLevel.toStringAsFixed(3),
                  color: t.ink,
                ),
              ),
              Expanded(
                child: _Stat(
                  label: 'Short by',
                  value: alert.shortBy > 0 ? alert.shortBy.toStringAsFixed(3) : '—',
                  color: shortColor,
                ),
              ),
            ],
          ),
          if (alert.reorderQty > 0) ...[
            const SizedBox(height: 4),
            Text('Suggested order: ${alert.reorderQty.toStringAsFixed(3)} ${alert.itemUnit ?? ''}'.trim(),
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.label.copyWith(color: t.muted)),
        Text(value, style: RunqText.bodyStrong.copyWith(color: color)),
      ],
    );
  }
}
