import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
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
    final l = AppLocalizations.of(context);
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
              decoration: InputDecoration(
                hintText: l.pickerSearchHint,
                prefixIcon: const Icon(DhenuIcons.search),
              ),
            ),
          ),
          Expanded(child: _list(t, l, farmersAsync, scrollController)),
        ]),
      ),
    );
  }

  Widget _list(DhenuTokens t, AppLocalizations l, AsyncValue<List<MpFarmer>> async, ScrollController controller) {
    return async.when(
      loading: () => const DhenuLoadingList(),
      error: (e, _) => Center(
        child: DhenuEmptyState(icon: DhenuIcons.cloudOff, title: l.pickerLoadError, subtitle: '$e'),
      ),
      data: (all) {
        final farmers = _query.isEmpty
            ? all
            : all
                .where((f) => f.name.toLowerCase().contains(_query) || f.code.toLowerCase().contains(_query))
                .toList();
        if (farmers.isEmpty) {
          return Center(
            child: DhenuEmptyState(icon: DhenuIcons.userOff, title: l.pickerNoMatch),
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
            final display = farmerName(context, f);
            return SourceRow(
              title: display,
              subtitle: display != f.name ? f.name : null,
              farmer: f,
              litres: f.code,
              onTap: () => Navigator.of(context).pop(f),
            );
          },
        );
      },
    );
  }
}
