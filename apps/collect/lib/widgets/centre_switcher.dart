import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_card.dart';
import 'dhenu_states.dart';
import 'sheet_grabber.dart';

/// Tier label for a node — the "mode" the app runs in for it.
String nodeTierLabel(MpNode n) => n.isPp ? 'PP' : (n.isCc ? 'CC' : 'VMCC');

/// Tier icon, matching each home's iconography (store/snowflake/tanker).
IconData nodeTierIcon(MpNode n) => _iconForType(n.nodeType);

IconData _iconForType(String type) =>
    type == 'pp' ? DhenuIcons.tankers : (type == 'cc' ? DhenuIcons.snowflake : DhenuIcons.store);

String _titleForType(String type) => type == 'pp'
    ? 'Processing plants'
    : (type == 'cc' ? 'Chilling centres' : 'Village collection centres');

/// A slim "tier · name ▾ Switch" bar shown at the top of an admin's shell —
/// the active centre plus a tap target to change it. Only built for admins
/// (owner/accountant/viewer) — a
/// field-operator's single-node shell never gets one.
class CentreSwitcherBar extends ConsumerWidget {
  const CentreSwitcherBar({super.key, required this.node});
  final MpNode node;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Material(
      color: t.brandSubtle,
      child: InkWell(
        onTap: () => showCentreSwitcher(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.screen, vertical: DhenuSpacing.sm),
          child: Row(children: [
            Icon(nodeTierIcon(node), size: 16, color: t.brand),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: Text(
                '${nodeTierLabel(node)} · ${node.name}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: DhenuSpacing.xs),
            Icon(DhenuIcons.chevronDown, size: 18, color: t.brand),
            const SizedBox(width: DhenuSpacing.sm),
            Container(width: 1, height: 18, color: t.hairline),
            // Home: back to the centre picker (main screen) — clearing the
            // active node drops the admin shell back to CentrePickerScreen. Wide
            // padding gives it a comfortable tap target.
            InkWell(
              onTap: () => ref.read(mpActiveNodeProvider.notifier).state = null,
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
            child: Text('Switch centre', style: DhenuText.h2.copyWith(color: t.ink)),
          ),
        ),
        Flexible(
          child: CentrePickerList(
            currentId: current?.id,
            onPick: (n) {
              ref.read(mpActiveNodeProvider.notifier).state = n;
              Navigator.of(context).pop();
            },
          ),
        ),
      ]),
    );
  }
}

/// Short tier abbreviation for a node type — shown in the tier meta line.
String _abbrForType(String type) => type == 'pp' ? 'PP' : (type == 'cc' ? 'CC' : 'VMCC');

/// Count label like "12 centres" / "3 chilling centres" / "1 plant" for a tier.
String _countLabel(String type, int n) {
  final unit = type == 'pp'
      ? (n == 1 ? 'plant' : 'plants')
      : type == 'cc'
          ? (n == 1 ? 'chilling centre' : 'chilling centres')
          : (n == 1 ? 'centre' : 'centres');
  return '$n $unit';
}

/// The centre list as three collapsible tiers — Village Collection Centres /
/// Chilling Centres / Processing Plants. Each tier is a card showing its count;
/// tapping expands it to reveal the centres. Shared by the first-run picker
/// screen and the in-shell switcher sheet.
class CentrePickerList extends ConsumerStatefulWidget {
  const CentrePickerList({super.key, required this.onPick, this.currentId});
  final ValueChanged<MpNode> onPick;
  final String? currentId;

  @override
  ConsumerState<CentrePickerList> createState() => _CentrePickerListState();
}

class _CentrePickerListState extends ConsumerState<CentrePickerList> {
  static const _kNoParent = '__no_parent__';
  final Set<String> _open = {}; // expanded tiers, by node type
  final Set<String> _openParent = {}; // expanded parent groups, by parent id
  bool _seeded = false;

  /// On first load open the tier (and the parent group) holding the current
  /// selection (the in-shell switcher), so the user sees their active centre
  /// ticked. The first-run picker has no selection, so everything starts
  /// collapsed down to the tier headers.
  void _seed(List<MpNode> active, Map<String, MpNode> nodeById) {
    if (_seeded) return;
    _seeded = true;
    final cur = active.where((n) => n.id == widget.currentId);
    if (cur.isEmpty) return;
    final n = cur.first;
    _open.add(n.nodeType);
    _openParent.add(nodeById.containsKey(n.parentNodeId) ? n.parentNodeId! : _kNoParent);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return ref.watch(operatorNodesProvider).when(
          // Scroll-wrapped so the fixed-height skeleton never overflows the
          // bounded Expanded/Flexible this list always sits inside.
          loading: () => const SingleChildScrollView(child: DhenuLoadingList(rows: 3)),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: 'Could not load centres', subtitle: '$e'),
          data: (nodes) {
            final active = nodes.where((n) => n.isActive).toList();
            if (active.isEmpty) {
              return const DhenuEmptyState(
                icon: DhenuIcons.store,
                title: 'No centres yet',
                subtitle: 'Add VMCCs, chilling centres or plants in the web admin first',
              );
            }
            final nodeById = {for (final n in nodes) n.id: n};
            _seed(active, nodeById);
            final types = [
              for (final type in const ['vmcc', 'cc', 'pp'])
                if (active.any((n) => n.nodeType == type)) type,
            ];
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.lg),
              itemCount: types.length,
              separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.md),
              itemBuilder: (_, i) => _tierCard(t, types[i],
                  active.where((n) => n.nodeType == types[i]).toList(), nodeById),
            );
          },
        );
  }

  Widget _tierCard(
      DhenuTokens t, String type, List<MpNode> nodes, Map<String, MpNode> nodeById) {
    final open = _open.contains(type);
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        _tierHeader(t, type, nodes.length, open),
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeInOut,
          alignment: Alignment.topCenter,
          child: open
              ? Column(children: [
                  Divider(height: 1, color: t.hairline),
                  ..._tierBody(t, nodes, nodeById),
                ])
              : const SizedBox(width: double.infinity),
        ),
      ]),
    );
  }

  /// Expanded body: a second accordion level. Centres are grouped under their
  /// parent node (e.g. VMCCs under their chilling centre); only the parent
  /// names show until a parent is tapped to reveal its centres. Falls back to a
  /// flat list when nothing in the tier has a parent (e.g. processing plants).
  List<Widget> _tierBody(DhenuTokens t, List<MpNode> nodes, Map<String, MpNode> nodeById) {
    final groups = <String?, List<MpNode>>{};
    for (final n in nodes) {
      final pid = nodeById.containsKey(n.parentNodeId) ? n.parentNodeId : null;
      groups.putIfAbsent(pid, () => []).add(n);
    }
    if (groups.length == 1 && groups.containsKey(null)) return _rows(t, nodes);

    final parents = groups.keys.whereType<String>().toList()
      ..sort((a, b) => (nodeById[a]?.name ?? '').compareTo(nodeById[b]?.name ?? ''));
    return [
      for (final pid in parents) ..._parentGroup(t, pid, nodeById[pid], groups[pid]!),
      if (groups.containsKey(null)) ..._parentGroup(t, _kNoParent, null, groups[null]!),
    ];
  }

  List<Widget> _parentGroup(DhenuTokens t, String key, MpNode? parent, List<MpNode> nodes) {
    final open = _openParent.contains(key);
    return [
      _groupHeader(t, key, parent, nodes.length, open),
      if (open) ..._rows(t, nodes),
    ];
  }

  List<Widget> _rows(DhenuTokens t, List<MpNode> nodes) => [
        for (var i = 0; i < nodes.length; i++) ...[
          if (i > 0) Divider(height: 1, indent: DhenuSpacing.xxl, color: t.hairline),
          _nodeRow(t, nodes[i]),
        ],
      ];

  Widget _groupHeader(DhenuTokens t, String key, MpNode? parent, int count, bool open) {
    return Material(
      color: t.brandSubtle,
      child: InkWell(
        onTap: () => setState(() => open ? _openParent.remove(key) : _openParent.add(key)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Row(children: [
            Icon(parent != null ? _iconForType(parent.nodeType) : DhenuIcons.cloudOff,
                size: 16, color: t.brand),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: Text(parent?.name ?? 'Not linked to a chilling centre',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
            ),
            Text('$count', style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const SizedBox(width: DhenuSpacing.sm),
            AnimatedRotation(
              turns: open ? 0.5 : 0,
              duration: const Duration(milliseconds: 180),
              child: Icon(DhenuIcons.chevronDown, size: 18, color: t.brand),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _tierHeader(DhenuTokens t, String type, int count, bool open) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => setState(() => open ? _open.remove(type) : _open.add(type)),
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.lg),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration:
                  BoxDecoration(color: t.brand.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Icon(_iconForType(type), size: 22, color: t.brand),
            ),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_titleForType(type),
                    style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${_abbrForType(type)} · ${_countLabel(type, count)}',
                    style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ]),
            ),
            AnimatedRotation(
              turns: open ? 0.5 : 0,
              duration: const Duration(milliseconds: 180),
              child: Icon(DhenuIcons.chevronDown, size: 22, color: t.brand),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _nodeRow(DhenuTokens t, MpNode n) {
    final selected = n.id == widget.currentId;
    return Material(
      color: selected ? t.brand.withValues(alpha: 0.06) : Colors.transparent,
      child: InkWell(
        onTap: () => widget.onPick(n),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Row(children: [
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(n.name,
                    style: DhenuText.body.copyWith(
                        color: t.ink,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w600)),
                const SizedBox(height: 2),
                Text(n.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ]),
            ),
            Icon(selected ? DhenuIcons.check : DhenuIcons.chevronRight,
                size: 20, color: selected ? t.brand : t.inkSoft),
          ]),
        ),
      ),
    );
  }
}
