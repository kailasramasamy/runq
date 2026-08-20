import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/sheet_grabber.dart';

/// Searchable product picker for the sell-to-farmer sheet (per
/// feedback_searchable_dropdowns). Returns the chosen item, or null.
///
/// A dairy's catalogue runs to dozens of SKUs whose names repeat across pack
/// sizes — three "Groundnut Oil", two "A2 Desi Cow Ghee" — so the pack is part
/// of the identity, not a detail: it rides the row and the search text.
Future<MpSellableItem?> showProductPicker(BuildContext context) {
  return showModalBottomSheet<MpSellableItem>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _ProductPickerSheet(),
  );
}

class _ProductPickerSheet extends ConsumerStatefulWidget {
  const _ProductPickerSheet();
  @override
  ConsumerState<_ProductPickerSheet> createState() => _ProductPickerSheetState();
}

class _ProductPickerSheetState extends ConsumerState<_ProductPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final itemsAsync = ref.watch(sellableItemsProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
            child: TextField(
              autofocus: true,
              textCapitalization: TextCapitalization.none,
              onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: l.farmerSaleProductHint,
                prefixIcon: const Icon(DhenuIcons.search),
              ),
            ),
          ),
          // The sheet and the list share one controller, so a drag near the top
          // resizes the SHEET rather than scrolling the list — and the list's own
          // onDrag never fires. Listening for any user-driven scroll catches
          // both paths, so the keyboard gets out of the way whichever one moves.
          Expanded(
            child: NotificationListener<ScrollStartNotification>(
              onNotification: (n) {
                if (n.dragDetails != null) FocusScope.of(context).unfocus();
                return false;
              },
              child: _list(t, l, itemsAsync, scrollController),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _list(DhenuTokens t, AppLocalizations l,
      AsyncValue<List<MpSellableItem>> async, ScrollController controller) {
    return async.when(
      loading: () => const DhenuLoadingList(),
      error: (e, _) => Center(
        child: DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: l.productPickerLoadError,
            subtitle: friendlyError(context, e)),
      ),
      data: (all) {
        final items = _query.isEmpty
            ? all
            : all
                .where((i) =>
                    i.name.toLowerCase().contains(_query) ||
                    (i.unit ?? '').toLowerCase().contains(_query) ||
                    (i.sku ?? '').toLowerCase().contains(_query))
                .toList();
        if (items.isEmpty) {
          return Center(
            child: DhenuEmptyState(
                icon: DhenuIcons.package, title: l.productPickerNoMatch),
          );
        }
        return ListView.separated(
          controller: controller,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          // onDrag alone only fires when there is something to scroll: filter to
          // "ghee" and the seven rows fit the sheet, so the drag was ignored and
          // the keyboard stayed up over the results.
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: DhenuSpacing.x4),
          itemCount: items.length,
          separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
          itemBuilder: (_, i) => _row(t, items[i]),
        );
      },
    );
  }

  Widget _row(DhenuTokens t, MpSellableItem item) => InkWell(
        onTap: () => Navigator.of(context).pop(item),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Row(children: [
            Expanded(
              child:
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Bold: the name is what the operator scans down the list
                // for, and the pack beneath it reads as the qualifier.
                Text(item.name,
                    style: DhenuText.body
                        .copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                if ((item.unit ?? '').isNotEmpty) ...[
                  const SizedBox(height: DhenuSpacing.xs),
                  Text(item.unit!,
                      style: DhenuText.caption.copyWith(color: t.inkSoft)),
                ],
              ]),
            ),
            if (item.defaultSellingPrice != null)
              Text(rupees(item.defaultSellingPrice!),
                  style: DhenuText.number(size: 15, color: t.inkSoft)),
          ]),
        ),
      );
}
