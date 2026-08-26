// Stock value split across sites, with a share bar so the dominant warehouse
// is obvious at a glance. Lived on the inventory home page until the home
// screen was trimmed to exceptions + highlights; reached from the Menu now.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class WarehouseValuesScreen extends ConsumerWidget {
  const WarehouseValuesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(invWarehouseValuesProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: const Text('Stock by warehouse')),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () => ref.refresh(invWarehouseValuesProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Could not load warehouses: $e',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ),
            ],
          ),
          data: (rows) {
            // A warehouse holding nothing has no share to show; the page is
            // about how value is distributed, not a site directory.
            final withStock = rows.where((r) => r.totalValue > 0).toList();
            final top = withStock.isEmpty ? 0.0 : withStock.first.totalValue;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
              children: [
                if (withStock.isEmpty)
                  InvCard(
                    child: Text('No warehouse is holding stock yet.',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  )
                else
                  InvCard(
                    child: Column(
                      children: [
                        for (final w in withStock)
                          _WarehouseRow(
                            name: w.name,
                            itemCount: w.itemCount,
                            value: w.totalValue,
                            share: top > 0
                                ? (w.totalValue / top).clamp(0.0, 1.0)
                                : 0.0,
                          ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _WarehouseRow extends StatelessWidget {
  final String name;
  final int itemCount;
  final double value;
  final double share;
  const _WarehouseRow({
    required this.name,
    required this.itemCount,
    required this.value,
    required this.share,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.body.copyWith(color: t.ink)),
            ),
            Text('$itemCount items',
                style: RunqText.micro.copyWith(color: t.muted)),
            const SizedBox(width: 8),
            Text(compactINR(value),
                style: RunqText.body
                    .copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: share,
              minHeight: 4,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation(InvColors.brand(context)),
            ),
          ),
        ],
      ),
    );
  }
}
