import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/source_row.dart';

/// Searchable farmer picker (per feedback_searchable_dropdowns — Combobox, not
/// a plain dropdown). Returns the chosen [MpFarmer], or null if dismissed.
///
/// [recordedFarmerIds] are farmers who already have a recorded pour for the
/// active (date, shift) slot — their rows show a "Recorded" tag so an operator
/// doesn't unknowingly re-record the same farmer.
Future<MpFarmer?> showFarmerPicker(
  BuildContext context,
  WidgetRef ref,
  String nodeId, {
  Set<String> recordedFarmerIds = const {},
}) {
  return showModalBottomSheet<MpFarmer>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FarmerPickerSheet(nodeId: nodeId, recordedFarmerIds: recordedFarmerIds),
  );
}

class _FarmerPickerSheet extends ConsumerStatefulWidget {
  const _FarmerPickerSheet({required this.nodeId, required this.recordedFarmerIds});
  final String nodeId;
  final Set<String> recordedFarmerIds;
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
        child: DhenuEmptyState(icon: DhenuIcons.cloudOff, title: l.pickerLoadError, subtitle: friendlyError(context, e)),
      ),
      data: (all) {
        // Operators call farmers by number — order by code (digit runs compared
        // numerically so F-2 sorts before F-10), not alphabetically by name.
        final sorted = [...all]
          ..sort((a, b) => _naturalCompare(a.code.toLowerCase(), b.code.toLowerCase()));
        final farmers = _query.isEmpty
            ? sorted
            : sorted
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
            final recorded = widget.recordedFarmerIds.contains(f.id);
            // Name leads, code sits beneath in small caption text.
            return SourceRow(
              title: farmerName(context, f),
              subtitle: f.code,
              farmer: f,
              litres: '',
              trailingStatus: recorded ? _recordedTag(t, l) : null,
              onTap: () => Navigator.of(context).pop(f),
            );
          },
        );
      },
    );
  }

  /// Small green "✓ Recorded" chip shown on farmers already collected for the
  /// active (date, shift) slot.
  Widget _recordedTag(DhenuTokens t, AppLocalizations l) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(DhenuIcons.check, size: 14, color: t.gradeA),
          const SizedBox(width: 2),
          Text(l.pickerRecorded, style: DhenuText.caption.copyWith(color: t.gradeA)),
        ],
      );
}

/// Natural sort: digit runs compare numerically, everything else lexically.
int _naturalCompare(String a, String b) {
  final chunks = RegExp(r'\d+|\D+');
  final ra = chunks.allMatches(a).map((m) => m.group(0)!).toList();
  final rb = chunks.allMatches(b).map((m) => m.group(0)!).toList();
  for (var i = 0; i < ra.length && i < rb.length; i++) {
    final na = int.tryParse(ra[i]);
    final nb = int.tryParse(rb[i]);
    final c = (na != null && nb != null) ? na.compareTo(nb) : ra[i].compareTo(rb[i]);
    if (c != 0) return c;
  }
  return ra.length.compareTo(rb.length);
}
