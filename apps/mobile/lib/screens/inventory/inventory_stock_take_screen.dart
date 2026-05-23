// Stock take session list — phase 2 mobile surface. Scan-driven count
// flow ships in a focused round (it's the screen the godown floor actually
// uses during counting; warrants its own design pass).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

class InventoryStockTakeScreen extends ConsumerWidget {
  const InventoryStockTakeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invStockTakeListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('Stock take', style: RunqText.h3.copyWith(color: t.ink))),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invStockTakeListProvider(null));
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
                  Icon(Icons.checklist_outlined, size: 48, color: t.muted2),
                  Center(child: Text('No sessions yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  const SizedBox(height: 4),
                  Center(child: Text('Start a stock-take session from the web app.',
                      style: RunqText.caption.copyWith(color: t.muted2), textAlign: TextAlign.center)),
                ],
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _StTile(st: list[i]),
            );
          },
        ),
      ),
    );
  }
}

class _StTile extends StatelessWidget {
  const _StTile({required this.st});
  final InvStockTake st;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (st.status) {
      'posted' => Colors.green.shade700,
      'in_progress' => Colors.blue.shade700,
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
                Text(st.stNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${st.warehouseName} · ${st.scope}',
                    style: RunqText.caption.copyWith(color: t.muted)),
                if (st.startedAt.isNotEmpty)
                  Text(st.startedAt.substring(0, st.startedAt.length >= 16 ? 16 : st.startedAt.length).replaceAll('T', ' '),
                      style: RunqText.caption.copyWith(color: t.muted2)),
              ],
            ),
          ),
          Text(st.status.toUpperCase().replaceAll('_', ' '),
              style: RunqText.micro.copyWith(color: statusColor)),
        ],
      ),
    );
  }
}
