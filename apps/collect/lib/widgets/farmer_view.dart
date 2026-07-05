import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_states.dart';
import 'sheet_grabber.dart';
import 'source_row.dart';

/// The header bar shown atop the farmer shell when an admin is "viewing as" a
/// farmer — mirrors the node [CentreSwitcherBar]. Tapping the bar re-opens the
/// farmer picker to switch; the home icon exits back to the centre picker.
class FarmerViewBar extends ConsumerWidget {
  const FarmerViewBar({super.key, required this.farmer});
  final MpFarmer farmer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Material(
      color: t.brandSubtle,
      child: InkWell(
        onTap: () => showFarmerViewPicker(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.screen, vertical: DhenuSpacing.sm),
          child: Row(children: [
            Icon(DhenuIcons.users, size: 16, color: t.brand),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: Text(
                'Farmer · ${farmerName(context, farmer)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: DhenuSpacing.xs),
            Icon(DhenuIcons.chevronDown, size: 18, color: t.brand),
            const SizedBox(width: DhenuSpacing.sm),
            Container(width: 1, height: 18, color: t.hairline),
            // Home: leave farmer view, back to the centre picker. Wide padding
            // gives it a comfortable tap target.
            InkWell(
              onTap: () => ref.read(mpViewAsFarmerProvider.notifier).state = null,
              borderRadius: BorderRadius.circular(DhenuRadii.card),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
                child: Icon(DhenuIcons.home, size: 18, color: t.brand),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Opens the tenant-wide farmer picker. Picking a farmer sets
/// [mpViewAsFarmerProvider] (and clears any active node), dropping the admin into
/// that farmer's shell via the home dispatcher.
Future<void> showFarmerViewPicker(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _FarmerViewPickerSheet(),
  );
}

class _FarmerViewPickerSheet extends ConsumerStatefulWidget {
  const _FarmerViewPickerSheet();
  @override
  ConsumerState<_FarmerViewPickerSheet> createState() => _FarmerViewPickerSheetState();
}

class _FarmerViewPickerSheetState extends ConsumerState<_FarmerViewPickerSheet> {
  String _query = '';

  void _pick(MpFarmer f) {
    // Farmer view takes precedence over a node; clear the node so exiting the
    // farmer view returns to the picker, not into a stale centre shell.
    ref.read(mpActiveNodeProvider.notifier).state = null;
    ref.read(mpViewAsFarmerProvider.notifier).state = f;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final farmersAsync = ref.watch(tenantFarmersProvider);
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

  Widget _list(DhenuTokens t, AppLocalizations l, AsyncValue<List<MpFarmer>> async,
      ScrollController controller) {
    return async.when(
      loading: () => const DhenuLoadingList(),
      error: (e, _) => Center(
        child: DhenuEmptyState(icon: DhenuIcons.cloudOff, title: l.pickerLoadError, subtitle: '$e'),
      ),
      data: (all) {
        final sorted = [...all]
          ..sort((a, b) =>
              farmerName(context, a).toLowerCase().compareTo(farmerName(context, b).toLowerCase()));
        final farmers = _query.isEmpty
            ? sorted
            : sorted
                .where((f) =>
                    f.name.toLowerCase().contains(_query) || f.code.toLowerCase().contains(_query))
                .toList();
        if (farmers.isEmpty) {
          return Center(child: DhenuEmptyState(icon: DhenuIcons.userOff, title: l.pickerNoMatch));
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
              title: farmerName(context, f),
              subtitle: f.primaryNodeName == null ? f.code : '${f.code} · ${f.primaryNodeName}',
              farmer: f,
              litres: '',
              onTap: () => _pick(f),
            );
          },
        );
      },
    );
  }
}
