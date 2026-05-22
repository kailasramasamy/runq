// Org chart — drill-down focus view. Phone screens can't show a wide
// boxes-and-lines tree, so this centres on one person at a time: their
// manager above (tap to go up), their direct reports below (tap to drill
// down). Search jumps the focus to anyone in the company. Backed by
// /hr/org-chart, which is org-wide — every employee sees the full tree.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_widgets.dart';

/// In-memory reporting index built once per data load. Roots are anyone
/// with no resolvable manager (the CEO, plus orphans whose manager is
/// inactive or absent from the active set).
class _OrgIndex {
  final Map<String, HrEmployee> byId;
  final Map<String, List<HrEmployee>> childrenByManager;
  final List<HrEmployee> roots;
  const _OrgIndex(this.byId, this.childrenByManager, this.roots);

  factory _OrgIndex.build(List<HrEmployee> rows) {
    final byId = {for (final e in rows) e.id: e};
    final children = <String, List<HrEmployee>>{};
    final roots = <HrEmployee>[];
    for (final e in rows) {
      final mgr = e.reportingToId;
      if (mgr != null && byId.containsKey(mgr)) {
        children.putIfAbsent(mgr, () => []).add(e);
      } else {
        roots.add(e);
      }
    }
    // Oldest joiners first (reads as seniority); fall back to name.
    int cmp(HrEmployee a, HrEmployee b) {
      final ad = a.joiningDate, bd = b.joiningDate;
      if (ad != null && bd != null && ad != bd) return ad.compareTo(bd);
      return a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase());
    }
    for (final list in children.values) {
      list.sort(cmp);
    }
    roots.sort(cmp);
    return _OrgIndex(byId, children, roots);
  }

  List<HrEmployee> reportsOf(String id) => childrenByManager[id] ?? const [];
  int directCount(String id) => childrenByManager[id]?.length ?? 0;
}

class HrOrgChartScreen extends ConsumerStatefulWidget {
  const HrOrgChartScreen({super.key});

  @override
  ConsumerState<HrOrgChartScreen> createState() => _HrOrgChartScreenState();
}

class _HrOrgChartScreenState extends ConsumerState<HrOrgChartScreen> {
  /// The focused employee. Null = show the first root (top of the org).
  String? _focusId;
  String _q = '';
  final _searchCtl = TextEditingController();
  final _scrollCtl = ScrollController();

  @override
  void initState() {
    super.initState();
    // Refresh after the first frame so a stale cache from a prior visit
    // doesn't show; ref.invalidate touches inherited widgets, illegal in
    // initState proper.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.invalidate(hrOrgChartProvider);
    });
  }

  @override
  void dispose() {
    _searchCtl.dispose();
    _scrollCtl.dispose();
    super.dispose();
  }

  /// Re-centre the chart on [id]; clears any active search and scrolls the
  /// focus view back to the top so the new hero card is in view.
  void _focusOn(String id) {
    setState(() {
      _focusId = id;
      _q = '';
      _searchCtl.clear();
    });
    FocusScope.of(context).unfocus();
    if (_scrollCtl.hasClients) _scrollCtl.jumpTo(0);
  }

  /// Clears the manual focus — the chart falls back to its default node
  /// (the logged-in user's own spot in the tree).
  void _resetFocus() {
    setState(() {
      _focusId = null;
      _q = '';
      _searchCtl.clear();
    });
    if (_scrollCtl.hasClients) _scrollCtl.jumpTo(0);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(hrOrgChartProvider);
    // Open the chart on the logged-in user's own node when it resolves.
    final myEmpId = ref.watch(hrMeProvider).asData?.value.employee?.id;

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Org chart'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          if (_focusId != null)
            IconButton(
              tooltip: 'Back to me',
              icon: const Icon(Icons.my_location_rounded),
              onPressed: _resetFocus,
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            _searchField(t),
            Expanded(
              child: async.when(
                loading: () => const Center(
                  child: CircularProgressIndicator(color: HrColors.teal),
                ),
                error: (e, _) => _message(t, '$e'),
                data: (rows) {
                  if (rows.isEmpty) return _message(t, 'No employees yet.');
                  final index = _OrgIndex.build(rows);
                  return _q.trim().isEmpty
                      ? _focusView(t, index, myEmpId)
                      : _searchResults(t, index);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _searchField(RunqTokens t) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: TextField(
        controller: _searchCtl,
        textCapitalization: TextCapitalization.none,
        onChanged: (v) => setState(() => _q = v),
        style: RunqText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          hintText: 'Find anyone in the company',
          hintStyle: RunqText.body.copyWith(color: t.muted2),
          prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
          suffixIcon: _q.isEmpty
              ? null
              : IconButton(
                  icon: Icon(Icons.close_rounded, size: 18, color: t.muted),
                  onPressed: () {
                    _searchCtl.clear();
                    setState(() => _q = '');
                  },
                ),
          isDense: true,
          filled: true,
          fillColor: t.surface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: t.hairline, width: 0.5),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: t.hairline, width: 0.5),
          ),
        ),
      ),
    );
  }

  Widget _message(RunqTokens t, String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text,
              textAlign: TextAlign.center,
              style: RunqText.body.copyWith(color: t.muted)),
        ),
      );

  Widget _focusView(RunqTokens t, _OrgIndex index, String? myEmpId) {
    // Default focus is the logged-in user's own node; fall back to the org's
    // top node, then any node, when that can't be resolved.
    final focusId = _focusId ?? myEmpId;
    final focus = (focusId != null && index.byId.containsKey(focusId))
        ? index.byId[focusId]!
        : (index.roots.isNotEmpty ? index.roots.first : index.byId.values.first);
    final managerId = focus.reportingToId;
    final manager = managerId != null ? index.byId[managerId] : null;
    final reports = index.reportsOf(focus.id);

    return RefreshIndicator(
      color: HrColors.teal,
      onRefresh: () async {
        ref.invalidate(hrOrgChartProvider);
        await ref.read(hrOrgChartProvider.future);
      },
      child: ListView(
        controller: _scrollCtl,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          if (manager != null) ...[
            _ManagerChip(manager: manager, onTap: () => _focusOn(manager.id)),
            _connector(t),
          ],
          _HeroCard(
            employee: focus,
            onTap: () => context.push('/hr/directory/${focus.id}'),
          ),
          const SizedBox(height: 18),
          _sectionHeader(
            t,
            reports.isEmpty ? 'Direct reports' : 'Direct reports · ${reports.length}',
          ),
          const SizedBox(height: 8),
          if (reports.isEmpty)
            _noReports(t)
          else
            for (final r in reports) ...[
              _ReportCard(
                employee: r,
                reportCount: index.directCount(r.id),
                onTap: () => _focusOn(r.id),
              ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }

  Widget _searchResults(RunqTokens t, _OrgIndex index) {
    final needle = _q.trim().toLowerCase();
    final hits = index.byId.values.where((e) {
      return e.displayName.toLowerCase().contains(needle) ||
          e.employeeCode.toLowerCase().contains(needle) ||
          (e.designationName ?? '').toLowerCase().contains(needle);
    }).toList()
      ..sort((a, b) =>
          a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));

    if (hits.isEmpty) return _message(t, 'No one matches “${_q.trim()}”.');

    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      itemCount: hits.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _ReportCard(
        employee: hits[i],
        reportCount: index.directCount(hits[i].id),
        onTap: () => _focusOn(hits[i].id),
      ),
    );
  }

  Widget _connector(RunqTokens t) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(child: Container(width: 2, height: 14, color: t.hairline)),
      );

  Widget _sectionHeader(RunqTokens t, String text) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Text(text.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
      );

  Widget _noReports(RunqTokens t) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 24),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Column(
          children: [
            Icon(Icons.person_outline_rounded, color: t.muted2, size: 28),
            const SizedBox(height: 6),
            Text('No direct reports',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
      );
}

/// Tappable "reports to" card above the hero — the one-tap way up the tree.
class _ManagerChip extends StatelessWidget {
  final HrEmployee manager;
  final VoidCallback onTap;
  const _ManagerChip({required this.manager, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Row(
            children: [
              Icon(Icons.arrow_upward_rounded, size: 16, color: brand),
              const SizedBox(width: 8),
              HrAvatar(
                name: manager.displayName,
                photoUrl: manager.photoUrl,
                employeeId: manager.id,
                size: 34,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('REPORTS TO',
                        style: RunqText.micro.copyWith(color: brand)),
                    const SizedBox(height: 1),
                    Text(manager.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

/// The focused person — emphasised with a brand-coloured border. Tapping
/// opens their full HR profile (reports/manager are tapped to navigate).
class _HeroCard extends StatelessWidget {
  final HrEmployee employee;
  final VoidCallback onTap;
  const _HeroCard({required this.employee, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    final e = employee;
    final sub = [
      if (e.designationName != null && e.designationName!.isNotEmpty)
        e.designationName!,
      if (e.departmentName != null && e.departmentName!.isNotEmpty)
        e.departmentName!,
    ].join(' · ');

    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.card),
      child: InkWell(
        borderRadius: BorderRadius.circular(RunqRadii.card),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.card),
            border: Border.all(color: brand, width: 1.5),
          ),
          child: Row(
            children: [
              HrAvatar(
                name: e.displayName,
                photoUrl: e.photoUrl,
                employeeId: e.id,
                size: 60,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.displayName, style: RunqText.h3.copyWith(color: t.ink)),
                    if (sub.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.badge_outlined, size: 13, color: t.muted2),
                        const SizedBox(width: 4),
                        Text(e.employeeCode,
                            style: RunqText.caption.copyWith(color: t.muted2)),
                        const SizedBox(width: 10),
                        Icon(Icons.contact_page_outlined, size: 12, color: brand),
                        const SizedBox(width: 3),
                        Text('Details',
                            style: RunqText.caption.copyWith(color: brand)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A direct-report row. Tapping re-centres the chart on this person; a
/// teal pill shows their own direct-report count when they manage anyone.
class _ReportCard extends StatelessWidget {
  final HrEmployee employee;
  final int reportCount;
  final VoidCallback onTap;
  const _ReportCard({
    required this.employee,
    required this.reportCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final e = employee;
    final sub = [
      if (e.designationName != null && e.designationName!.isNotEmpty)
        e.designationName!,
      if (e.departmentName != null && e.departmentName!.isNotEmpty)
        e.departmentName!,
    ].join(' · ');

    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Row(
            children: [
              HrAvatar(
                name: e.displayName,
                photoUrl: e.photoUrl,
                employeeId: e.id,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    if (sub.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(sub,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ],
                ),
              ),
              if (reportCount > 0) ...[
                _CountPill(count: reportCount),
                const SizedBox(width: 6),
              ],
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  final int count;
  const _CountPill({required this.count});

  @override
  Widget build(BuildContext context) {
    final brand = HrColors.brand(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.groups_outlined, size: 12, color: brand),
          const SizedBox(width: 3),
          Text('$count', style: RunqText.micro.copyWith(color: brand)),
        ],
      ),
    );
  }
}
