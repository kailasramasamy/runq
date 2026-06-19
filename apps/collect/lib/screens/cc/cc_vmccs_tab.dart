import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/source_row.dart';

/// CC VMCCs tab — child VMCC nodes feeding this chilling centre.
class CcVmccsTab extends ConsumerStatefulWidget {
  const CcVmccsTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<CcVmccsTab> createState() => _CcVmccsTabState();
}

class _CcVmccsTabState extends ConsumerState<CcVmccsTab> {
  String _query = '';

  Future<void> _refresh() async {
    ref.invalidate(nodesByTypeProvider('vmcc'));
    await ref.read(nodesByTypeProvider('vmcc').future);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final vmccsAsync = ref.watch(nodesByTypeProvider('vmcc'));
    return Column(children: [
      _searchBar(t),
      Expanded(child: _body(t, vmccsAsync)),
    ]);
  }

  Widget _searchBar(DhenuTokens t) => Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, 0),
        child: TextField(
          onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          decoration: const InputDecoration(
            hintText: 'Search VMCCs',
            prefixIcon: Icon(DhenuIcons.search),
          ),
        ),
      );

  Widget _body(DhenuTokens t, AsyncValue<List<MpNode>> vmccsAsync) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: vmccsAsync.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff,
          title: 'Could not load VMCCs',
          subtitle: '$e',
        ),
        data: (all) => _list(t, all),
      ),
    );
  }

  Widget _list(DhenuTokens t, List<MpNode> all) {
    // Prefer child nodes (parentNodeId == this CC's id), fallback to all VMCCs
    final children = all
        .where((n) => n.parentNodeId == widget.node.id)
        .toList();
    final source = children.isNotEmpty ? children : all;

    final filtered = _query.isEmpty
        ? source
        : source
            .where((n) =>
                n.name.toLowerCase().contains(_query) ||
                n.code.toLowerCase().contains(_query))
            .toList();

    if (filtered.isEmpty) {
      return ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          const SizedBox(height: DhenuSpacing.bottomGap),
          DhenuEmptyState(
            icon: DhenuIcons.store,
            title: _query.isEmpty ? 'No VMCCs assigned' : 'No matching VMCCs',
          ),
        ],
      );
    }

    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(
          top: DhenuSpacing.md, bottom: DhenuSpacing.x4),
      itemCount: filtered.length,
      separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
      itemBuilder: (_, i) {
        final n = filtered[i];
        return SourceRow(
          title: n.name,
          leadingInitials: n.name.isNotEmpty ? n.name[0].toUpperCase() : 'V',
          litres: n.code,
        );
      },
    );
  }
}
