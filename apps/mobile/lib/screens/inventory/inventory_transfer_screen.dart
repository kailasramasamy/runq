// Transfer list — phase 2 mobile surface. Create + dispatch + receive
// flows on mobile arrive in a focused round once the godown-floor UX
// patterns settle (scan-driven receive matches the GRN sheet shape).
// Read access keeps managers informed in the field.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

class InventoryTransferScreen extends ConsumerWidget {
  const InventoryTransferScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invTransferListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('Transfers', style: RunqText.h3.copyWith(color: t.ink))),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invTransferListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (list) {
            if (list.isEmpty) return _empty(context, 'No transfers yet', 'Create transfers from the web app for now.');
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _TransferTile(transfer: list[i]),
            );
          },
        ),
      ),
    );
  }
}

class _TransferTile extends StatelessWidget {
  const _TransferTile({required this.transfer});
  final InvTransfer transfer;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (transfer.status) {
      'received' => Colors.green.shade700,
      'in_transit' => Colors.blue.shade700,
      'cancelled' => Colors.red.shade700,
      _ => t.muted,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(transfer.transferNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${transfer.fromWarehouseName} → ${transfer.toWarehouseName}',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('₹${transfer.totalValue.toStringAsFixed(2)}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(transfer.status.toUpperCase().replaceAll('_', ' '),
                  style: RunqText.micro.copyWith(color: statusColor)),
            ],
          ),
        ],
      ),
    );
  }
}

Widget _empty(BuildContext context, String title, String body) {
  final t = RT(context);
  return ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      const SizedBox(height: 80),
      Icon(Icons.alt_route_outlined, size: 48, color: t.muted2),
      Center(child: Text(title, style: RunqText.bodyStrong.copyWith(color: t.muted))),
      const SizedBox(height: 4),
      Center(child: Text(body, style: RunqText.caption.copyWith(color: t.muted2), textAlign: TextAlign.center)),
    ],
  );
}
