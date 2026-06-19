import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/source_row.dart';

/// Searchable farmer picker (per feedback_searchable_dropdowns — Combobox, not
/// a plain dropdown). Returns the chosen [MpFarmer], or null if dismissed.
Future<MpFarmer?> showFarmerPicker(BuildContext context, WidgetRef ref, String nodeId) {
  return showModalBottomSheet<MpFarmer>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FarmerPickerSheet(nodeId: nodeId),
  );
}

class _FarmerPickerSheet extends ConsumerStatefulWidget {
  const _FarmerPickerSheet({required this.nodeId});
  final String nodeId;
  @override
  ConsumerState<_FarmerPickerSheet> createState() => _FarmerPickerSheetState();
}

class _FarmerPickerSheetState extends ConsumerState<_FarmerPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final farmersAsync = ref.watch(nodeFarmersProvider(widget.nodeId));
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
            child: TextField(
              autofocus: true,
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: const InputDecoration(
                hintText: 'Search farmer by name or code',
                prefixIcon: Icon(DhenuIcons.search),
              ),
            ),
          ),
          Expanded(child: _list(t, farmersAsync, scrollController)),
        ]),
      ),
    );
  }

  Widget _list(DhenuTokens t, AsyncValue<List<MpFarmer>> async, ScrollController controller) {
    return async.when(
      loading: () => const DhenuLoadingList(),
      error: (e, _) => Center(
        child: DhenuEmptyState(icon: DhenuIcons.cloudOff, title: 'Could not load farmers', subtitle: '$e'),
      ),
      data: (all) {
        final farmers = _query.isEmpty
            ? all
            : all
                .where((f) => f.name.toLowerCase().contains(_query) || f.code.toLowerCase().contains(_query))
                .toList();
        if (farmers.isEmpty) {
          return const Center(
            child: DhenuEmptyState(icon: DhenuIcons.userOff, title: 'No matching farmers'),
          );
        }
        return ListView.separated(
          controller: controller,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(bottom: DhenuSpacing.x4),
          itemCount: farmers.length,
          separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
          itemBuilder: (_, i) {
            final f = farmers[i];
            return SourceRow(
              title: f.name,
              leadingInitials: f.initials,
              litres: f.code,
              onTap: () => Navigator.of(context).pop(f),
            );
          },
        );
      },
    );
  }
}
