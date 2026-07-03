import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';

const _kUnlinked = '__unlinked__';

IconData _iconForType(String type) =>
    type == 'pp' ? DhenuIcons.tankers : (type == 'cc' ? DhenuIcons.snowflake : DhenuIcons.store);
String _abbrForType(String type) => type == 'pp' ? 'PP' : (type == 'cc' ? 'CC' : 'VMCC');
String _titleForType(String type) => type == 'pp'
    ? 'Processing plants'
    : (type == 'cc' ? 'Chilling centres' : 'Village collection centres');
int _byName(MpNode a, MpNode b) => a.name.toLowerCase().compareTo(b.name.toLowerCase());

/// First screen an admin (owner/accountant/viewer) sees: pick a centre to
/// operate the app as. Three tier cards (VMCC/CC/PP) sit at the top; picking one
/// drills into that tier below. Selecting a node sets [mpActiveNodeProvider];
/// the home dispatcher then renders that node's VMCC/CC/PP shell.
class CentrePickerScreen extends ConsumerWidget {
  const CentrePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('Choose a centre', style: DhenuText.h2.copyWith(color: t.ink)),
        actions: [
          IconButton(
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(DhenuIcons.logout),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: ref.watch(operatorNodesProvider).when(
              loading: () => const SingleChildScrollView(child: DhenuLoadingList(rows: 4)),
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
                return _PickerBody(
                  active: active,
                  onPick: (n) => ref.read(mpActiveNodeProvider.notifier).state = n,
                );
              },
            ),
      ),
    );
  }
}

class _PickerBody extends StatefulWidget {
  const _PickerBody({required this.active, required this.onPick});
  final List<MpNode> active;
  final ValueChanged<MpNode> onPick;

  @override
  State<_PickerBody> createState() => _PickerBodyState();
}

class _PickerBodyState extends State<_PickerBody> {
  late String _tier;
  String? _ccId; // selected chilling centre (or _kUnlinked) in the VMCC drill

  List<String> get _tiers => [
        for (final ty in const ['vmcc', 'cc', 'pp'])
          if (widget.active.any((n) => n.nodeType == ty)) ty,
      ];

  @override
  void initState() {
    super.initState();
    _tier = _tiers.first;
  }

  void _selectTier(String ty) => setState(() {
        _tier = ty;
        _ccId = null;
      });

  @override
  Widget build(BuildContext context) {
    final tiers = _tiers;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
        child: Row(children: [
          for (var i = 0; i < tiers.length; i++) ...[
            if (i > 0) const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: _TierCard(
                type: tiers[i],
                count: widget.active.where((n) => n.nodeType == tiers[i]).length,
                selected: _tier == tiers[i],
                onTap: () => _selectTier(tiers[i]),
              ),
            ),
          ],
        ]),
      ),
      Expanded(child: _tier == 'vmcc' ? _vmccDrill() : _tierList()),
    ]);
  }

  /// Simple tier (CC or PP): one flat list; tapping a node enters its shell.
  Widget _tierList() {
    final t = DT(context);
    final nodes = widget.active.where((n) => n.nodeType == _tier).toList()..sort(_byName);
    return _Scroll(children: [
      _sectionHeader(t, _titleForType(_tier)),
      _ListCard(children: [
        for (final n in nodes)
          _OptionTile(
            icon: _iconForType(n.nodeType),
            title: n.name,
            subtitle: n.code,
            onTap: () => widget.onPick(n),
          ),
      ]),
    ]);
  }

  /// VMCC drill: pick a chilling centre, then a VMCC under it.
  Widget _vmccDrill() {
    final t = DT(context);
    final byId = {for (final n in widget.active) n.id: n};
    final groups = _vmccGroups(byId);
    final order = groups.keys.toList()
      ..sort((a, b) => _ccName(byId, a).toLowerCase().compareTo(_ccName(byId, b).toLowerCase()));
    final selVmccs = _ccId == null ? null : groups[_ccId];
    return _Scroll(children: [
      _sectionHeader(t, 'Chilling centres'),
      _ListCard(children: [
        for (final key in order)
          _OptionTile(
            icon: key == _kUnlinked ? DhenuIcons.cloudOff : DhenuIcons.snowflake,
            title: _ccName(byId, key),
            trailingCount: groups[key]!.length,
            selected: _ccId == key,
            onTap: () => setState(() => _ccId = _ccId == key ? null : key),
          ),
      ]),
      if (selVmccs != null) ...[
        _sectionHeader(t, _ccId == _kUnlinked ? 'Unlinked VMCCs' : 'VMCCs in ${_ccName(byId, _ccId!)}'),
        _ListCard(children: [
          for (final n in selVmccs)
            _OptionTile(
              icon: DhenuIcons.store,
              title: n.name,
              subtitle: n.code,
              onTap: () => widget.onPick(n),
            ),
        ]),
      ],
    ]);
  }

  Map<String, List<MpNode>> _vmccGroups(Map<String, MpNode> byId) {
    final g = <String, List<MpNode>>{};
    for (final n in widget.active.where((n) => n.isVmcc)) {
      final p = byId[n.parentNodeId];
      g.putIfAbsent(p != null && p.isCc ? p.id : _kUnlinked, () => []).add(n);
    }
    for (final l in g.values) {
      l.sort(_byName);
    }
    return g;
  }

  String _ccName(Map<String, MpNode> byId, String key) =>
      key == _kUnlinked ? 'Not linked to a chilling centre' : (byId[key]?.name ?? 'Chilling centre');
}

/// A tappable tier card (VMCC/CC/PP) — icon badge, abbreviation and count.
/// Selected state fills the badge and outlines the card in the brand colour.
class _TierCard extends StatelessWidget {
  const _TierCard(
      {required this.type, required this.count, required this.selected, required this.onTap});
  final String type;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Material(
      color: selected ? t.brand.withValues(alpha: 0.12) : t.card,
      borderRadius: BorderRadius.circular(DhenuRadii.card),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(DhenuRadii.card),
            border: Border.all(color: selected ? t.brand : t.hairline, width: selected ? 1.5 : 1),
          ),
          padding: const EdgeInsets.symmetric(
              vertical: DhenuSpacing.lg, horizontal: DhenuSpacing.sm),
          child: Column(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                  color: selected ? t.brand : t.brand.withValues(alpha: 0.12),
                  shape: BoxShape.circle),
              child: Icon(_iconForType(type),
                  size: 22, color: selected ? Colors.white : t.brand),
            ),
            const SizedBox(height: DhenuSpacing.sm),
            Text(_abbrForType(type),
                style: DhenuText.label
                    .copyWith(color: selected ? t.brand : t.ink, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text('$count', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ),
      ),
    );
  }
}

/// A single selectable row inside a list card — leading icon, title/subtitle,
/// and either a running count, a tick (selected) or a chevron.
class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.selected = false,
    this.trailingCount,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool selected;
  final int? trailingCount;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Material(
      color: selected ? t.brand.withValues(alpha: 0.08) : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Row(children: [
            Icon(icon, size: 18, color: selected ? t.brand : t.inkSoft),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: DhenuText.body.copyWith(
                        color: t.ink, fontWeight: selected ? FontWeight.w700 : FontWeight.w600)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                ],
              ]),
            ),
            if (trailingCount != null) ...[
              Text('$trailingCount', style: DhenuText.caption.copyWith(color: t.inkSoft)),
              const SizedBox(width: DhenuSpacing.sm),
            ],
            Icon(selected ? DhenuIcons.check : DhenuIcons.chevronRight,
                size: 20, color: selected ? t.brand : t.inkSoft),
          ]),
        ),
      ),
    );
  }
}

/// A card wrapping a column of [_OptionTile]s with hairline dividers between.
class _ListCard extends StatelessWidget {
  const _ListCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) Divider(height: 1, indent: DhenuSpacing.xxl, color: t.hairline),
          children[i],
        ],
      ]),
    );
  }
}

Widget _sectionHeader(DhenuTokens t, String text) => Padding(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.xs, DhenuSpacing.lg, DhenuSpacing.xs, DhenuSpacing.sm),
      child: Text(text.toUpperCase(),
          style: DhenuText.caption
              .copyWith(color: t.inkSoft, letterSpacing: 0.6, fontWeight: FontWeight.w700)),
    );

class _Scroll extends StatelessWidget {
  const _Scroll({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.bottomGap),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
}
