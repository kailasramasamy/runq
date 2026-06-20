import 'package:dhenu/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/source_row.dart';
import 'add_farmer_screen.dart';
import 'farmer_detail_screen.dart';

/// VMCC Farmers tab — searchable list of farmers registered at this node.
class VmccFarmersTab extends ConsumerStatefulWidget {
  const VmccFarmersTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<VmccFarmersTab> createState() => _VmccFarmersTabState();
}

class _VmccFarmersTabState extends ConsumerState<VmccFarmersTab> {
  String _query = '';

  Future<void> _refresh() async {
    ref.invalidate(nodeFarmersProvider(widget.node.id));
    await ref.read(nodeFarmersProvider(widget.node.id).future);
  }

  Future<void> _openAddFarmer() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => AddFarmerScreen(node: widget.node)),
    );
    if (added == true) {
      ref.invalidate(nodeFarmersProvider(widget.node.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final farmersAsync = ref.watch(nodeFarmersProvider(widget.node.id));
    return Stack(
      children: [
        Column(
          children: [
            _searchBar(t, l),
            Expanded(child: _body(t, l, farmersAsync)),
          ],
        ),
        Positioned(
          right: DhenuSpacing.screen,
          bottom: DhenuSpacing.screen,
          child: FloatingActionButton.extended(
            onPressed: _openAddFarmer,
            backgroundColor: t.brand,
            foregroundColor: Colors.white,
            icon: const Icon(DhenuIcons.userPlus),
            label: Text(l.farmersAddFarmer),
          ),
        ),
      ],
    );
  }

  Widget _searchBar(DhenuTokens t, AppLocalizations l) => Padding(
    padding: const EdgeInsets.fromLTRB(
      DhenuSpacing.screen,
      DhenuSpacing.md,
      DhenuSpacing.screen,
      0,
    ),
    child: TextField(
      onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
      decoration: InputDecoration(
        hintText: l.farmersSearchHint,
        prefixIcon: const Icon(DhenuIcons.search),
      ),
    ),
  );

  Widget _body(DhenuTokens t, AppLocalizations l, AsyncValue<List<MpFarmer>> farmersAsync) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: farmersAsync.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff,
          title: l.farmersCouldNotLoad,
          subtitle: '$e',
        ),
        data: (all) => _list(t, l, all),
      ),
    );
  }

  Widget _list(DhenuTokens t, AppLocalizations l, List<MpFarmer> all) {
    final farmers = _query.isEmpty
        ? all
        : all
              .where(
                (f) =>
                    f.name.toLowerCase().contains(_query) ||
                    f.code.toLowerCase().contains(_query),
              )
              .toList();

    if (farmers.isEmpty) {
      return ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          const SizedBox(height: DhenuSpacing.bottomGap),
          DhenuEmptyState(
            icon: DhenuIcons.userOff,
            title: _query.isEmpty
                ? l.farmersEmptyTitle
                : l.farmersNoMatchTitle,
            subtitle: _query.isEmpty
                ? l.farmersEmptySubtitle
                : null,
          ),
        ],
      );
    }

    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(
        top: DhenuSpacing.md,
        bottom: DhenuSpacing.x4,
      ),
      itemCount: farmers.length,
      separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
      itemBuilder: (_, i) {
        final f = farmers[i];
        final display = farmerName(context, f);
        return SourceRow(
          title: display,
          subtitle: display != f.name ? f.name : null,
          farmer: f,
          litres: f.code,
          trailingStatus: Icon(
            DhenuIcons.payments,
            size: 18,
            color: t.inkSoft,
          ),
          onTap: () => Navigator.of(context)
              .push(
                MaterialPageRoute(
                  builder: (_) =>
                      FarmerDetailScreen(node: widget.node, farmer: f),
                ),
              )
              .then((_) => ref.invalidate(nodeFarmersProvider(widget.node.id))),
        );
      },
    );
  }
}
