// Full-feed view for inventory recent activity. "See all →" on the Home
// recent-activity card pushes here so the user can scroll the complete
// stock-ledger slice the dashboard returns (up to N latest rows). Renders
// each entry through the same `InvActivityRow` chrome the Home card uses.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class InventoryActivityScreen extends ConsumerWidget {
  const InventoryActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invRecentActivityProvider);
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Recent Activity',
        onBack: () => context.pop(),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invRecentActivityProvider);
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _error(context, '$e'),
          data: (rows) => rows.isEmpty
              ? const InvEmptyState(
                  icon: Icons.history_rounded,
                  title: 'No movements yet',
                  subtitle:
                      'Receive or dispatch stock to see entries here.',
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
                  children: [
                    InvCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 4,
                      ),
                      child: Column(
                        children: [
                          for (var i = 0; i < rows.length; i++) ...[
                            _row(rows[i]),
                            if (i < rows.length - 1)
                              Divider(
                                height: 1, thickness: 0.5,
                                color: t.hairlineSoft,
                              ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _error(BuildContext context, String msg) {
    final t = RT(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Failed to load activity: $msg',
          style: RunqText.caption.copyWith(color: t.muted),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _row(InvActivity a) => InvActivityRow(
        type: a.iconKey,
        refLabel: a.itemName,
        description: '${_src(a.movementType)} · ${a.warehouseName}',
        amount: _qty(a),
        time: _rel(a.movedAt),
      );

  static String _src(String m) => switch (m) {
        'grn' => 'GRN',
        'dn' => 'Delivery',
        'transfer_in' => 'Transfer in',
        'transfer_out' => 'Transfer out',
        'adjustment' => 'Adjustment',
        'stock_take' => 'Stock take',
        _ => m,
      };

  static String _qty(InvActivity a) {
    final q = a.signedQty;
    final unit = a.itemUnit == null || a.itemUnit!.isEmpty ? '' : ' ${a.itemUnit}';
    final mag = q.abs();
    final s = mag == mag.roundToDouble() ? mag.toStringAsFixed(0)
                                         : mag.toStringAsFixed(2);
    if (q > 0) return '+$s$unit';
    if (q < 0) return '-$s$unit';
    return s + unit;
  }

  static String _rel(DateTime when) {
    final d = DateTime.now().difference(when);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m';
    if (d.inHours < 24)   return '${d.inHours}h';
    if (d.inDays < 7)     return '${d.inDays}d';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${when.day} ${months[when.month - 1]}';
  }
}
