import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_icons.dart';
import '../providers/auth_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_card.dart';
import 'dhenu_states.dart';
import 'farmer_view.dart';
import 'sheet_grabber.dart';

/// Tier label for a node — the "mode" the app runs in for it.
String nodeTierLabel(MpNode n) => n.isPp ? 'PP' : (n.isCc ? 'CC' : 'VMCC');

/// Tier icon, matching each home's iconography (store/snowflake/tanker).
IconData nodeTierIcon(MpNode n) => _iconForType(n.nodeType);

IconData _iconForType(String type) =>
    type == 'pp' ? DhenuIcons.tankers : (type == 'cc' ? DhenuIcons.snowflake : DhenuIcons.store);

/// The chevron beside a centre's name that reopens the switcher.
///
/// Replaces the full-width switcher bar that used to sit above every tab: it
/// restated the centre name the home title already carries, and cost a strip of
/// screen on all four tabs to do it. The bar's home button is gone with it —
/// the switcher sheet reaches every centre directly, so a trip back to the
/// picker was a longer route to the same place.
///
/// Renders nothing for an operator: their centres come from their assignments
/// and are switched by [OperatorSwitcherBar], so a chevron here would open a
/// sheet listing centres they cannot run.
class CentreSwitcherButton extends ConsumerWidget {
  const CentreSwitcherButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(authProvider).persona != Persona.admin) {
      return const SizedBox.shrink();
    }
    final t = DT(context);
    return InkWell(
      onTap: () => showCentreSwitcher(context, ref),
      borderRadius: BorderRadius.circular(DhenuRadii.pill),
      child: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.xs),
        child: Icon(DhenuIcons.chevronDown, size: 22, color: t.brand),
      ),
    );
  }
}

/// Opens the centre switcher — every centre grouped by tier, current one ticked.
/// Picking one sets [mpActiveNodeProvider] and pops.
Future<void> showCentreSwitcher(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _CentreSwitcherSheet(),
  );
}

class _CentreSwitcherSheet extends ConsumerWidget {
  const _CentreSwitcherSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final current = ref.watch(mpActiveNodeProvider);
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.78),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SheetGrabber(),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.sm),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(l.adminSwitchSheetTitle, style: DhenuText.h2.copyWith(color: t.ink)),
          ),
        ),
        Flexible(
          child: CentrePickerList(
            currentId: current?.id,
            onPick: (n) {
              setActiveNode(ref, n);
              Navigator.of(context).pop();
            },
            // Farmer mode is reachable from the picker screen's bottom nav but
            // was missing here, so an admin already inside a centre had no way
            // into it without backing out. Pops first: the farmer picker is its
            // own sheet, not a list this one can host.
            onPickFarmer: () {
              Navigator.of(context).pop();
              showFarmerViewPicker(context, ref);
            },
          ),
        ),
      ]),
    );
  }
}

/// Short tier abbreviation for a node type — shown in the tier meta line.
String _abbrForType(String type) => type == 'pp' ? 'PP' : (type == 'cc' ? 'CC' : 'VMCC');

/// The centre list as a tier tab-bar over a flat list — VMCC / CC / PP across
/// the top, that tier's centres beneath, the active one ticked.
///
/// Was a two-level accordion: expand the tier, expand the parent chilling
/// centre, then pick. Reaching a VMCC took four taps including opening the
/// sheet, and the two collapsed levels hid the very names being chosen between.
/// Tabs cost one tap to change tier and none at all to stay in it, so the
/// common switch — another centre of the same kind — is a single tap.
///
/// A tier with more than [_searchAbove] centres also gets a filter field; below
/// that the whole list is on screen and a search box is just another thing to
/// skip past.
class CentrePickerList extends ConsumerStatefulWidget {
  const CentrePickerList(
      {super.key, required this.onPick, this.currentId, this.onPickFarmer});
  final ValueChanged<MpNode> onPick;
  final String? currentId;

  /// When set, a "Farmers" tab sits after the tier tabs — tapping it hands off
  /// to the tenant-wide farmer picker ("view as farmer") instead of switching
  /// the list. Omitted where farmer view doesn't apply.
  final VoidCallback? onPickFarmer;

  @override
  ConsumerState<CentrePickerList> createState() => _CentrePickerListState();
}

class _CentrePickerListState extends ConsumerState<CentrePickerList> {
  static const _searchAbove = 8;

  String? _tier;
  String _query = '';

  /// Open on the tier holding the active centre, so switching to a sibling is
  /// one tap and the current selection is visible without hunting for it.
  String _tierFor(List<MpNode> active, List<String> tiers) {
    if (_tier != null && tiers.contains(_tier)) return _tier!;
    final cur = active.where((n) => n.id == widget.currentId);
    final seeded = cur.isNotEmpty ? cur.first.nodeType : tiers.first;
    return tiers.contains(seeded) ? seeded : tiers.first;
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return ref.watch(operatorNodesProvider).when(
          // Scroll-wrapped so the fixed-height skeleton never overflows the
          // bounded Expanded/Flexible this list always sits inside.
          loading: () => const SingleChildScrollView(child: DhenuLoadingList(rows: 3)),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: l.adminSwitchLoadCentresError, subtitle: '$e'),
          data: (nodes) {
            final active = nodes.where((n) => n.isActive).toList();
            if (active.isEmpty) {
              return DhenuEmptyState(
                icon: DhenuIcons.store,
                title: l.adminSwitchNoCentresTitle,
                subtitle: l.adminSwitchNoCentresSubtitle,
              );
            }
            final nodeById = {for (final n in nodes) n.id: n};
            final tiers = [
              for (final type in const ['vmcc', 'cc', 'pp'])
                if (active.any((n) => n.nodeType == type)) type,
            ];
            final tier = _tierFor(active, tiers);
            // The centre in use sits first, above the alphabetical run: the
            // sheet opens on its tier, so it is on screen without scrolling —
            // both a confirmation of where you are and the row to leave alone.
            final inTier = active.where((n) => n.nodeType == tier).toList()
              ..sort((a, b) {
                if (a.id == widget.currentId) return -1;
                if (b.id == widget.currentId) return 1;
                return a.name.compareTo(b.name);
              });
            final rows = _query.isEmpty
                ? inTier
                : inTier.where((n) =>
                    n.name.toLowerCase().contains(_query) ||
                    n.code.toLowerCase().contains(_query)).toList();
            return Column(children: [
              Padding(
                padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
                child: _tabs(l, t, tiers, tier, active),
              ),
              if (inTier.length > _searchAbove)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                      DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.md),
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
                    decoration: InputDecoration(
                      hintText: l.nodePickerSearchHint,
                      prefixIcon: const Icon(DhenuIcons.search),
                      isDense: true,
                    ),
                  ),
                ),
              Expanded(
                child: rows.isEmpty
                    ? DhenuEmptyState(
                        icon: DhenuIcons.store, title: l.adminSwitchNoCentresTitle)
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(DhenuSpacing.screen, 0,
                            DhenuSpacing.screen, DhenuSpacing.lg),
                        itemCount: rows.length,
                        separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.sm),
                        itemBuilder: (_, i) => _nodeRow(t, rows[i], nodeById),
                      ),
              ),
            ]);
          },
        );
  }

  /// Tier tabs, each carrying its own count so the operator can see where the
  /// centres are before switching to look.
  ///
  /// Scrolls horizontally rather than dividing the width evenly: with the
  /// Farmers tab added, four equal columns squeezed every label to the point of
  /// eliding. Each pill now takes the width its own text needs.
  Widget _tabs(AppLocalizations l, DhenuTokens t, List<String> tiers, String current,
      List<MpNode> active) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
      child: Row(children: [
        for (final ty in tiers) ...[
          if (ty != tiers.first) const SizedBox(width: DhenuSpacing.sm),
          _tab(t, _iconForType(ty),
              '${_abbrForType(ty)} ${active.where((n) => n.nodeType == ty).length}',
              selected: current == ty,
              onTap: () => setState(() { _tier = ty; _query = ''; })),
        ],
        if (widget.onPickFarmer != null) ...[
          const SizedBox(width: DhenuSpacing.sm),
          _tab(t, DhenuIcons.users, l.adminSwitchFarmersNav,
              selected: false, onTap: widget.onPickFarmer!),
        ],
      ]),
    );
  }

  Widget _tab(DhenuTokens t, IconData icon, String label,
          {required bool selected, required VoidCallback onTap}) =>
      Material(
        color: selected ? t.brand : t.inputFill,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
        child: InkWell(
          onTap: selected ? null : onTap,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.sm),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 15, color: selected ? Colors.white : t.inkSoft),
              const SizedBox(width: DhenuSpacing.xs),
              Text(label,
                  maxLines: 1,
                  style: DhenuText.label.copyWith(
                      color: selected ? Colors.white : t.ink,
                      fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      );

  /// One centre. The subtitle names its parent — which chilling centre a VMCC
  /// feeds is what tells two similarly-named villages apart — falling back to
  /// the code for a node with no parent.
  Widget _nodeRow(DhenuTokens t, MpNode n, Map<String, MpNode> nodeById) {
    final selected = n.id == widget.currentId;
    final parent = nodeById[n.parentNodeId];
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      selected: selected,
      onTap: () => widget.onPick(n),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(n.name,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: DhenuText.body.copyWith(
                    color: t.ink,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600)),
            const SizedBox(height: 2),
            Text(parent?.name ?? n.code,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ),
        Icon(selected ? DhenuIcons.check : DhenuIcons.chevronRight,
            size: 20, color: selected ? t.brand : t.inkSoft),
      ]),
    );
  }
}
