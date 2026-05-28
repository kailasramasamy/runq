import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/purchase_models.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

const _statusTabs = <({String key, String label})>[
  (key: '', label: 'All'),
  (key: 'draft', label: 'Draft'),
  (key: 'sent,partially_received', label: 'Open'),
  (key: 'received', label: 'Received'),
  (key: 'closed', label: 'Closed'),
  (key: 'cancelled', label: 'Cancelled'),
];

class PurchaseOrderListScreen extends ConsumerStatefulWidget {
  const PurchaseOrderListScreen({super.key});

  @override
  ConsumerState<PurchaseOrderListScreen> createState() => _PurchaseOrderListScreenState();
}

class _PurchaseOrderListScreenState extends ConsumerState<PurchaseOrderListScreen> {
  final _searchCtl = TextEditingController();
  String _statusKey = '';
  String _search = '';

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final params = POListParams(
      status: _statusKey.isEmpty ? null : _statusKey,
      search: _search.isEmpty ? null : _search,
    );
    final listAsync = ref.watch(purchaseOrderListProvider(params));

    return Scaffold(
      backgroundColor: t.bgWarm,
      floatingActionButton: FloatingActionButton(
        backgroundColor: PurColors.brand(context),
        onPressed: () => context.push('/purchase/pos/new'),
        child: const Icon(Icons.add_rounded, color: Colors.white),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Tab-level screen — no back arrow; the bot nav handles
            // module-level navigation. Brings up the module switcher
            // chip via the shell so the user can pivot.
            const PurPlainAppBar(title: 'Purchase Orders', showBack: false),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: PurSearchBar(
                controller: _searchCtl,
                placeholder: 'Search PO # or vendor…',
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _statusTabs.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) => PurFilterPill(
                  label: _statusTabs[i].label,
                  active: _statusKey == _statusTabs[i].key,
                  onTap: () => setState(() => _statusKey = _statusTabs[i].key),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: listAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('Failed to load: $e', style: RunqText.body)),
                data: (res) {
                  if (res.data.isEmpty) {
                    return PurEmptyState(
                      icon: Icons.shopping_cart_outlined,
                      title: 'No purchase orders yet',
                      description: 'Create your first PO to commit to a vendor.',
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async => ref.invalidate(purchaseOrderListProvider(params)),
                    child: ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
                      itemCount: res.data.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _PoTile(po: res.data[i]),
                    ),
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

class _PoTile extends StatelessWidget {
  final PurchaseOrder po;
  const _PoTile({required this.po});

  @override
  Widget build(BuildContext context) {
    return PurDocListTile(
      icon: Icons.shopping_cart_outlined,
      title: po.poNumber,
      subtitle: po.vendorName,
      status: po.status,
      rightValue: indianINR(po.total),
      meta: [
        PurDocMeta(icon: Icons.event_outlined, label: prettyShortDate(po.poDate)),
        if (po.expectedDate != null)
          PurDocMeta(icon: Icons.local_shipping_outlined, label: 'Exp', value: prettyShortDate(po.expectedDate!)),
        PurDocMeta(icon: Icons.list_alt_rounded, label: '${po.lineCount} line${po.lineCount == 1 ? '' : 's'}'),
      ],
      onTap: () => context.push('/purchase/pos/${po.id}'),
    );
  }
}
