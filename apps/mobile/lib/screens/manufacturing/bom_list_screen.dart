import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_doc_list.dart';
import 'widgets/mfg_primitives.dart';

const _bomTabs = <({bool? isActive, String label})>[
  (isActive: null, label: 'All'),
  (isActive: true, label: 'Active'),
  (isActive: false, label: 'Inactive'),
];

class BomListScreen extends ConsumerStatefulWidget {
  const BomListScreen({super.key});

  @override
  ConsumerState<BomListScreen> createState() => _BomListScreenState();
}

class _BomListScreenState extends ConsumerState<BomListScreen> {
  final _searchCtl = TextEditingController();
  bool? _isActive;
  String _search = '';

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final params = BomListParams(
      isActive: _isActive,
      search: _search.isEmpty ? null : _search,
    );
    final listAsync = ref.watch(bomListProvider(params));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: Column(
          children: [
            MfgPlainAppBar(
              title: 'Bills of Materials',
              showBack: false,
              actions: [],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: MfgSearchBar(
                controller: _searchCtl,
                placeholder: 'Search BOM code or item…',
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _bomTabs.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) => MfgFilterPill(
                  label: _bomTabs[i].label,
                  active: _isActive == _bomTabs[i].isActive,
                  onTap: () => setState(() => _isActive = _bomTabs[i].isActive),
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
                    return MfgEmptyState(
                      icon: Icons.add_chart_outlined,
                      title: 'No BOMs yet',
                      description: 'Create your first Bill of Materials.',
                    );
                  }
                  // One card, hairline-separated rows — same treatment as the
                  // work-order list. A floating card per BOM turned a plain
                  // list into a stack of objects to parse one at a time.
                  return RefreshIndicator(
                    onRefresh: () async => ref.invalidate(bomListProvider(params)),
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
                      children: [
                        MfgDividedCard(
                          children: [
                            for (final bom in res.data) _BomTile(bom: bom),
                          ],
                        ),
                      ],
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

class _BomTile extends StatelessWidget {
  final BomListRow bom;
  const _BomTile({required this.bom});

  @override
  Widget build(BuildContext context) {
    return MfgDocListTile(
      flat: true,
      icon: Icons.add_chart_outlined,
      title: bom.bomCode,
      subtitle: bom.outputItemName,
      bomIsActive: bom.isActive,
      meta: [
        MfgDocMeta(
          icon: Icons.scale_outlined,
          label: '${_qty(bom.outputQty)} x ${bom.outputUom}',
        ),
        MfgDocMeta(
          icon: Icons.format_list_numbered_rounded,
          label: '${bom.lineCount} input${bom.lineCount == 1 ? '' : 's'}',
        ),
        MfgDocMeta(
          icon: Icons.history_rounded,
          label: 'v${bom.version}',
        ),
      ],
      onTap: () => context.push('/manufacturing/boms/${bom.id}'),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}
