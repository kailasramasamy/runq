import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/farmer_view.dart';
import '../../widgets/gradient_hero_card.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/sheet_grabber.dart';
import '../profile_tab.dart';

/// Added-water colour comes from the app-wide descending scale ([waterLevel]),
/// so every screen reads the same number the same way.
Color _waterColor(double w, DhenuTokens t) =>
    QualityBadge.levelColor(waterLevel(w), t);

/// Coloured "FAT x · SNF y · W z" spans. Fat/SNF take their quality-band colour
/// for [milkType] (null when the row mixes types — then they stay neutral);
/// water always uses its own descending scale. Bolded when a colour applies.
List<InlineSpan> _qcSpans(
    DhenuTokens t, QualityBands? bands, MilkType? milkType, double fat, double snf, double water) {
  final base = DhenuText.caption.copyWith(color: t.inkSoft);
  TextStyle v(Color? c) =>
      base.copyWith(color: c ?? t.inkSoft, fontWeight: c != null ? FontWeight.w700 : FontWeight.w400);
  return [
    TextSpan(text: 'FAT ', style: base),
    TextSpan(text: fat.toStringAsFixed(1), style: v(QualityBadge.bandColor(bands, milkType, 'fat', fat, t))),
    TextSpan(text: '  ·  SNF ', style: base),
    TextSpan(text: snf.toStringAsFixed(1), style: v(QualityBadge.bandColor(bands, milkType, 'snf', snf, t))),
    TextSpan(text: '  ·  W ', style: base),
    TextSpan(text: water.toStringAsFixed(1), style: v(_waterColor(water, t))),
  ];
}

const _kUnlinked = '__unlinked__';

IconData _iconForType(String type) =>
    type == 'pp' ? DhenuIcons.tankers : (type == 'cc' ? DhenuIcons.snowflake : DhenuIcons.store);
String _abbrForType(String type) => type == 'pp' ? 'PP' : (type == 'cc' ? 'CC' : 'VMCC');
String _titleForType(AppLocalizations l, String type) => type == 'pp'
    ? l.adminSwitchTitlePp
    : (type == 'cc' ? l.adminSwitchTitleCc : l.adminSwitchTitleVmcc);
int _byName(MpNode a, MpNode b) => a.name.toLowerCase().compareTo(b.name.toLowerCase());

/// First screen an admin (owner/accountant/viewer) sees: pick a centre to
/// operate the app as. Three tier cards (VMCC/CC/PP) sit at the top; picking one
/// drills into that tier below. Selecting a node sets [mpActiveNodeProvider];
/// the home dispatcher then renders that node's VMCC/CC/PP shell.
class CentrePickerScreen extends ConsumerWidget {
  const CentrePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final active =
        ref.watch(operatorNodesProvider).valueOrNull?.where((n) => n.isActive).toList() ?? const [];
    final tiers = [
      for (final ty in const ['vmcc', 'cc', 'pp'])
        if (active.any((n) => n.nodeType == ty)) ty,
    ];
    return Scaffold(
      // Node selection lives in the bottom nav: each tier opens a sheet of its
      // centres. The scroll body is the day's summary (hero + breakdowns).
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: DhenuSpacing.bottomGap),
          children: [
            _GreetingHeader(user: ref.watch(authProvider).user),
            const _TodaySummaryCard(),
            const _Breakdowns(),
          ],
        ),
      ),
      // Standard Dhenu bottom nav; no persistent selection (each tap opens a
      // sheet), so currentIndex is -1. Node tiers first, then a "Farmers" entry
      // that opens the tenant-wide farmer picker ("view as farmer").
      bottomNavigationBar: AppBottomNav(
        currentIndex: -1,
        onTap: (i) => i < tiers.length
            ? _showNodeSheet(context, ref, tiers[i], active)
            : showFarmerViewPicker(context, ref),
        items: [
          for (final ty in tiers)
            DhenuNavItem(icon: _iconForType(ty), label: _abbrForType(ty)),
          DhenuNavItem(icon: DhenuIcons.users, label: l.adminSwitchFarmersNav),
        ],
      ),
    );
  }
}

/// Opens the per-tier centre sheet — the child nodes of [tier]. Picking one sets
/// [mpActiveNodeProvider] (the home dispatcher then renders that node's shell).
Future<void> _showNodeSheet(
    BuildContext context, WidgetRef ref, String tier, List<MpNode> active) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _NodeSheet(
      tier: tier,
      active: active,
      onPick: (n) {
        setActiveNode(ref, n);
        Navigator.of(context).pop();
      },
    ),
  );
}

/// Greeting header at the top of the picker — time-of-day salutation, the
/// admin's name, and a tappable initials avatar that opens their profile
/// (settings + sign out). Mirrors the farmer/operator home chrome.
class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader({required this.user});
  final AuthUser? user;

  String _salutation(AppLocalizations l) {
    final hour = DateTime.now().hour;
    if (hour < 12) return l.farmerHomeGoodMorning;
    if (hour < 17) return l.farmerHomeGoodAfternoon;
    return l.farmerHomeGoodEvening;
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final name = (user?.name?.trim().isNotEmpty ?? false) ? user!.name!.trim() : l.adminSwitchDefaultUserName;
    final initial = name[0].toUpperCase();
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.md),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_salutation(l), style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const SizedBox(height: 2),
            Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.h2.copyWith(color: t.ink)),
          ]),
        ),
        const SizedBox(width: DhenuSpacing.md),
        InkWell(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text(l.navProfile, style: DhenuText.h2.copyWith(color: t.ink))),
              body: const ProfileTab(),
            ),
          )),
          borderRadius: BorderRadius.circular(24),
          child: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: t.brandSubtle, shape: BoxShape.circle),
            child: Text(initial, style: DhenuText.title.copyWith(color: t.brand)),
          ),
        ),
      ]),
    );
  }
}

/// The per-tier centre sheet opened from the bottom nav. Lists the tier's
/// centres to pick from — VMCCs grouped under their chilling centre (a second
/// accordion level), CCs / PPs as a flat list.
class _NodeSheet extends ConsumerStatefulWidget {
  const _NodeSheet({required this.tier, required this.active, required this.onPick});
  final String tier;
  final List<MpNode> active;
  final ValueChanged<MpNode> onPick;

  @override
  ConsumerState<_NodeSheet> createState() => _NodeSheetState();
}

class _NodeSheetState extends ConsumerState<_NodeSheet> {
  String? _ccId; // expanded chilling centre (or _kUnlinked) in the VMCC drill

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
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
            child: Text(_titleForType(l, widget.tier), style: DhenuText.h2.copyWith(color: t.ink)),
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.bottomGap),
            child: widget.tier == 'vmcc' ? _vmccDrill(l, t) : _tierList(t),
          ),
        ),
      ]),
    );
  }

  /// Simple tier (CC or PP): one flat list; tapping a node enters its shell.
  Widget _tierList(DhenuTokens t) {
    final nodes = widget.active.where((n) => n.nodeType == widget.tier).toList()..sort(_byName);
    return _ListCard(children: [
      for (final n in nodes)
        _OptionTile(
          icon: _iconForType(n.nodeType),
          title: n.name,
          subtitle: n.code,
          onTap: () => widget.onPick(n),
        ),
    ]);
  }

  /// VMCC drill: pick a chilling centre, then a VMCC under it.
  Widget _vmccDrill(AppLocalizations l, DhenuTokens t) {
    final byId = {for (final n in widget.active) n.id: n};
    final groups = _vmccGroups(byId);
    final order = groups.keys.toList()
      ..sort((a, b) =>
          _ccName(l, byId, a).toLowerCase().compareTo(_ccName(l, byId, b).toLowerCase()));
    final selVmccs = _ccId == null ? null : groups[_ccId];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _sectionHeader(t, l.adminSwitchTitleCc),
      _ListCard(children: [
        for (final key in order)
          _OptionTile(
            icon: key == _kUnlinked ? DhenuIcons.cloudOff : DhenuIcons.snowflake,
            title: _ccName(l, byId, key),
            trailingCount: groups[key]!.length,
            selected: _ccId == key,
            onTap: () => setState(() => _ccId = _ccId == key ? null : key),
          ),
      ]),
      if (selVmccs != null) ...[
        _sectionHeader(t, _ccId == _kUnlinked
            ? l.adminSwitchUnlinkedVmccs
            : l.adminSwitchVmccsInCc(_ccName(l, byId, _ccId!))),
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

  String _ccName(AppLocalizations l, Map<String, MpNode> byId, String key) => key == _kUnlinked
      ? l.adminSwitchNotLinkedToCc
      : (byId[key]?.name ?? l.adminSwitchCcFallback);
}

/// Today's collection summary card on the admin home — total milk collected
/// across the whole network with qty-weighted avg fat / SNF / water. Reads the
/// tenant-wide (no node scope) summary for today.
class _TodaySummaryCard extends ConsumerWidget {
  const _TodaySummaryCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.md),
      child: GradientHeroCard(
        child: ref.watch(tenantTodaySummaryProvider).when(
              loading: () => const DhenuLoadingList(rows: 2),
              error: (e, _) => Text(l.adminSwitchLoadError,
                  style: DhenuText.caption.copyWith(color: Colors.white)),
              data: (s) => _content(l, s),
            ),
      ),
    );
  }

  Widget _content(AppLocalizations l, MpCollectionSummary? s) {
    final qty = s?.totalQty ?? 0;
    const faint = Color(0xB8FFFFFF); // white @ 72%
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Icon(DhenuIcons.drop, size: 16, color: Colors.white),
        const SizedBox(width: DhenuSpacing.sm),
        Text(l.adminSwitchTodayCollectionLabel,
            style: DhenuText.label
                .copyWith(color: faint, letterSpacing: 0.6, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      Text(litres(qty, unit: true), style: DhenuText.h1.copyWith(color: Colors.white)),
      const SizedBox(height: DhenuSpacing.sm),
      Row(children: [
        _shiftPill(l.shiftAm, s == null ? 0 : s.amQty),
        const SizedBox(width: DhenuSpacing.sm),
        _shiftPill(l.shiftPm, s == null ? 0 : s.pmQty),
      ]),
      const SizedBox(height: DhenuSpacing.md),
      Row(children: [
        _metric('FAT', s == null || qty <= 0 ? '—' : s.avgFat.toStringAsFixed(1)),
        _metric('SNF', s == null || qty <= 0 ? '—' : s.avgSnf.toStringAsFixed(1)),
        _metric('WATER', s == null || qty <= 0 ? '—' : s.avgWater.toStringAsFixed(1)),
      ]),
    ]);
  }

  /// A compact AM/PM chip showing that shift's total litres, on the hero gradient.
  Widget _shiftPill(String label, double qty) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(DhenuRadii.button),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text('$label ',
              style: DhenuText.caption.copyWith(color: const Color(0xB8FFFFFF), fontWeight: FontWeight.w700)),
          Text(litres(qty, unit: true),
              style: DhenuText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
        ]),
      );

  Widget _metric(String label, String value) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: DhenuText.caption.copyWith(color: const Color(0xB8FFFFFF))),
          const SizedBox(height: 2),
          Text(value, style: DhenuText.title.copyWith(color: Colors.white)),
        ]),
      );
}

/// One shift's slice of a breakdown row — its qty and qty-weighted quality.
class _ShiftQc {
  const _ShiftQc(this.qty, this.fat, this.snf, this.water);
  final double qty, fat, snf, water;
}

/// A single breakdown line: a name, today's total qty, the day's qty-weighted
/// avg fat/SNF/water, and a per-shift (AM/PM) qty + quality split. Reused for
/// both the per-milk-type and per-CC sections.
class _Slice {
  const _Slice(this.label, this.qty, this.fat, this.snf, this.water, this.am, this.pm, this.milkType);
  final String label;
  final double qty, fat, snf, water; // day totals / averages
  final _ShiftQc am, pm;
  final MilkType? milkType; // set for per-type rows; null when types are mixed
}

/// Per-CC and per-milk-type collection breakdowns shown in the picker's idle
/// area — today's total qty and qty-weighted avg fat / SNF / water for each.
/// Flows within the screen's outer scroll. Shares the tenant-wide summary
/// provider with [_TodaySummaryCard] (single fetch, cached).
class _Breakdowns extends ConsumerWidget {
  const _Breakdowns();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final async = ref.watch(tenantTodaySummaryProvider);
    if (async.isLoading && !async.hasValue) {
      return const DhenuLoadingList(rows: 3);
    }
    final s = async.valueOrNull;
    final bands = ref.watch(qualityBandsProvider(null)).valueOrNull;
    // Resolve each CC's effective milk type so its mixed FAT/SNF averages get a
    // band colour (bands are per milk type; a CC pools several).
    final nodeById = {for (final n in ref.watch(operatorNodesProvider).valueOrNull ?? const []) n.id: n};
    final types = [
      for (final m in s?.byMilkType ?? const [])
        if (m.totalQty > 0.05)
          _Slice(milkTypeLabel(m.milkType), m.totalQty, m.avgFat, m.avgSnf, m.avgWater,
              _ShiftQc(m.amQty, m.amFat, m.amSnf, m.amWater),
              _ShiftQc(m.pmQty, m.pmFat, m.pmSnf, m.pmWater), m.milkType),
    ]..sort((a, b) => b.qty.compareTo(a.qty));
    final ccs = [
      for (final c in s?.byCc ?? const [])
        if (c.totalQty > 0.05)
          _Slice(c.nodeName, c.totalQty, c.avgFat, c.avgSnf, c.avgWater,
              _ShiftQc(c.amQty, c.amFat, c.amSnf, c.amWater),
              _ShiftQc(c.pmQty, c.pmFat, c.pmSnf, c.pmWater),
              nodeById[c.nodeId]?.effectiveMilkType),
    ]..sort((a, b) => b.qty.compareTo(a.qty));

    if (types.isEmpty && ccs.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.lg),
        child: DhenuEmptyState(
          icon: DhenuIcons.drop,
          title: l.adminSwitchNoCollectionTitle,
          subtitle: l.adminSwitchNoCollectionSubtitle,
        ),
      );
    }

    return Column(mainAxisSize: MainAxisSize.min, children: [
      if (ccs.isNotEmpty) _card(context, l.adminSwitchByChillingCentre, ccs, bands),
      if (types.isNotEmpty) _card(context, l.adminSwitchByMilkType, types, bands),
    ]);
  }

  Widget _card(BuildContext context, String title, List<_Slice> rows, QualityBands? bands) {
    final t = DT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.xs, DhenuSpacing.sm, DhenuSpacing.xs, DhenuSpacing.sm),
          child: Text(title,
              style: DhenuText.label.copyWith(
                  color: t.inkSoft, letterSpacing: 0.6, fontWeight: FontWeight.w700)),
        ),
        for (final s in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
            child: _EntryCard(slice: s, bands: bands),
          ),
      ]),
    );
  }
}

/// One breakdown entry as a collapsible card: collapsed shows name + day total;
/// tapping expands to the AM / PM shift split (qty + colour-coded quality).
class _EntryCard extends StatefulWidget {
  const _EntryCard({required this.slice, required this.bands});
  final _Slice slice;
  final QualityBands? bands;

  @override
  State<_EntryCard> createState() => _EntryCardState();
}

class _EntryCardState extends State<_EntryCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final s = widget.slice;
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: () => setState(() => _open = !_open),
            borderRadius: BorderRadius.circular(DhenuRadii.card),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    // Day (both-shift) qty-weighted averages, colour-coded.
                    RichText(
                      text: TextSpan(children: _qcSpans(t, widget.bands, s.milkType, s.fat, s.snf, s.water)),
                    ),
                  ]),
                ),
                const SizedBox(width: DhenuSpacing.sm),
                Text(litres(s.qty, unit: true), style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(width: DhenuSpacing.sm),
                AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: const Duration(milliseconds: 180),
                  child: Icon(DhenuIcons.chevronDown, size: 18, color: t.inkSoft),
                ),
              ]),
            ),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeInOut,
          alignment: Alignment.topCenter,
          child: _open
              ? Column(children: [
                  Divider(height: 1, indent: DhenuSpacing.lg, endIndent: DhenuSpacing.lg, color: t.hairline),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                        DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.lg),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      _shiftBlock(l, t, widget.bands, s.milkType, l.shiftAm, DhenuIcons.sun, s.am),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
                        child: Divider(height: 1, color: t.hairline),
                      ),
                      _shiftBlock(l, t, widget.bands, s.milkType, l.shiftPm, DhenuIcons.moon, s.pm),
                    ]),
                  ),
                ])
              : const SizedBox(width: double.infinity),
        ),
      ]),
    );
  }
}

/// One shift's full-width block: a header (☀ AM · 236.0 L) over a three-column
/// FAT / SNF / WATER row in larger, colour-coded fonts. Reads "no collection"
/// when that shift is empty.
Widget _shiftBlock(AppLocalizations l,
    DhenuTokens t, QualityBands? bands, MilkType? mt, String label, IconData icon, _ShiftQc qc) {
  final empty = qc.qty <= 0.05;
  final header = Row(children: [
    Icon(icon, size: 18, color: empty ? t.inkSoft : t.brand),
    const SizedBox(width: DhenuSpacing.sm),
    Text(label, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
    Text(empty ? l.adminSwitchNoCollectionSuffix : ' · ${litres(qc.qty, unit: true)}',
        style: DhenuText.body.copyWith(color: t.inkSoft)),
  ]);
  if (empty) return header;
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    header,
    const SizedBox(height: DhenuSpacing.sm),
    Row(children: [
      _metricCell(t, 'FAT', qc.fat.toStringAsFixed(1),
          QualityBadge.bandColor(bands, mt, 'fat', qc.fat, t)),
      _metricCell(t, 'SNF', qc.snf.toStringAsFixed(1),
          QualityBadge.bandColor(bands, mt, 'snf', qc.snf, t)),
      _metricCell(t, 'WATER', qc.water.toStringAsFixed(1), _waterColor(qc.water, t)),
    ]),
  ]);
}

/// A labelled metric cell (equal-width) — small caption label over a large,
/// colour-coded value. Used in the expanded shift block.
Widget _metricCell(DhenuTokens t, String label, String value, Color? color) => Expanded(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: 2),
        Text(value, style: DhenuText.h2.copyWith(color: color ?? t.ink)),
      ]),
    );

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

