// Department-wise directory browser. Reached from the home search pill's
// folder shortcut. The landing screen lists departments (with headcounts)
// plus a search box that flips the body into a flat people search; tapping
// a department drills into its member list. Backed by /hr/org-chart, which
// — like /hr/directory — ignores HrAccessScope, so any employee can browse
// the whole company. Member rows route to the same /hr/directory/:id work
// profile the search screen uses.

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

// ─── Landing: search box + department list ──────────────────────────────────

class HrDirectoryBrowseScreen extends ConsumerStatefulWidget {
  const HrDirectoryBrowseScreen({super.key});

  @override
  ConsumerState<HrDirectoryBrowseScreen> createState() =>
      _HrDirectoryBrowseScreenState();
}

class _HrDirectoryBrowseScreenState
    extends ConsumerState<HrDirectoryBrowseScreen> {
  String _q = '';
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    // Refresh after first frame so a stale roster from a prior visit doesn't
    // flash. No autofocus — department browsing is the primary action here,
    // and a popped-up keyboard would hide the very list the user came for.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.invalidate(hrOrgChartProvider);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final chart = ref.watch(hrOrgChartProvider);
    final query = _q.trim();

    return Scaffold(
      backgroundColor: t.bgWarmer,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _DirSearchHeader(
              controller: _controller,
              focus: _focus,
              query: _q,
              hint: 'Search by name, code, designation',
              onChanged: (v) => setState(() => _q = v),
              onClear: () {
                _controller.clear();
                setState(() => _q = '');
                _focus.requestFocus();
              },
            ),
            Expanded(
              child: chart.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(color: HrColors.teal)),
                error: (e, _) => _MessageBody(message: '$e'),
                data: (list) => query.isEmpty
                    ? _DeptList(employees: list)
                    : _MemberSearchList(employees: list, query: query),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Drill-down: a single department's members ───────────────────────────────

class HrDeptMembersScreen extends ConsumerWidget {
  const HrDeptMembersScreen({
    super.key,
    required this.departmentId,
    required this.title,
  });

  /// Null means the "Unassigned" bucket — employees with no department.
  final String? departmentId;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final chart = ref.watch(hrOrgChartProvider);

    return Scaffold(
      backgroundColor: t.bgWarmer,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _PlainHeader(title: title),
            Expanded(
              child: chart.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(color: HrColors.teal)),
                error: (e, _) => _MessageBody(message: '$e'),
                data: (list) {
                  final members = list
                      .where((e) => departmentId == null
                          ? e.departmentId == null
                          : e.departmentId == departmentId)
                      .toList();
                  if (members.isEmpty) {
                    return const _MessageBody(message: 'No employees here');
                  }
                  return _MemberPanel(
                    countLabel: _people(members.length),
                    members: members,
                    showDept: false,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Department list ─────────────────────────────────────────────────────────

class _DeptList extends StatelessWidget {
  const _DeptList({required this.employees});
  final List<HrEmployee> employees;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final groups = _group(employees);
    if (groups.isEmpty) {
      return const _MessageBody(message: 'No employees yet');
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: groups.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _DeptCard(group: groups[i], tokens: t),
    );
  }
}

class _DeptCard extends StatelessWidget {
  const _DeptCard({required this.group, required this.tokens});
  final _DeptGroup group;
  final RunqTokens tokens;

  @override
  Widget build(BuildContext context) {
    final brand = HrColors.brand(context);
    return Material(
      color: tokens.surface,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          final id = group.id ?? 'none';
          context.push(
              '/hr/directory/browse/$id?name=${Uri.encodeComponent(group.name)}');
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: tokens.hairline, width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(Icons.folder_shared_rounded, color: brand, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(group.name,
                    style: RunqText.bodyStrong.copyWith(color: tokens.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
              Text(_people(group.count),
                  style: RunqText.caption.copyWith(color: tokens.muted)),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, color: tokens.muted2, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Flat people search ──────────────────────────────────────────────────────

class _MemberSearchList extends StatelessWidget {
  const _MemberSearchList({required this.employees, required this.query});
  final List<HrEmployee> employees;
  final String query;

  @override
  Widget build(BuildContext context) {
    final q = query.toLowerCase();
    final matches = employees.where((e) => _matches(e, q)).toList();
    if (matches.isEmpty) {
      return const _MessageBody(message: 'No matches');
    }
    return _MemberPanel(
      countLabel: _people(matches.length),
      members: matches,
      showDept: true,
    );
  }

  static bool _matches(HrEmployee e, String q) {
    bool has(String? s) => s != null && s.toLowerCase().contains(q);
    return has(e.displayName) ||
        has(e.employeeCode) ||
        has(e.designationName) ||
        has(e.departmentName);
  }
}

// A lifted light panel of member rows — shared by the search results and the
// department drill-down so both read as one consistent result set.
class _MemberPanel extends StatelessWidget {
  const _MemberPanel({
    required this.countLabel,
    required this.members,
    required this.showDept,
  });
  final String countLabel;
  final List<HrEmployee> members;
  final bool showDept;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 0),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(countLabel,
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Expanded(
            child: ListView.separated(
              padding: EdgeInsets.zero,
              keyboardDismissBehavior:
                  ScrollViewKeyboardDismissBehavior.onDrag,
              itemCount: members.length,
              separatorBuilder: (_, __) => Divider(
                  height: 1, thickness: 0.5, color: t.hairline, indent: 56),
              itemBuilder: (_, i) =>
                  _MemberTile(e: members[i], showDept: showDept),
            ),
          ),
        ],
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({required this.e, required this.showDept});
  final HrEmployee e;
  final bool showDept;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final parts = <String>[
      e.employeeCode,
      if (e.designationName != null) e.designationName!,
      if (showDept && e.departmentName != null) e.departmentName!,
    ];
    return ListTile(
      leading: HrAvatar(
          name: e.displayName, photoUrl: e.photoUrl, employeeId: e.id, size: 40),
      title: Text(e.displayName,
          style: RunqText.bodyStrong.copyWith(color: t.ink)),
      subtitle: Text(parts.join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: RunqText.caption.copyWith(color: t.muted)),
      trailing: Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
      onTap: () {
        FocusManager.instance.primaryFocus?.unfocus();
        context.push('/hr/directory/${e.id}');
      },
    );
  }
}

// ─── Shared header chrome ────────────────────────────────────────────────────

class _DirSearchHeader extends StatelessWidget {
  const _DirSearchHeader({
    required this.controller,
    required this.focus,
    required this.query,
    required this.hint,
    required this.onChanged,
    required this.onClear,
  });
  final TextEditingController controller;
  final FocusNode focus;
  final String query;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focus,
              textCapitalization: TextCapitalization.none,
              onChanged: onChanged,
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: RunqText.body.copyWith(color: t.muted2),
                prefixIcon:
                    Icon(Icons.search_rounded, size: 18, color: t.muted),
                suffixIcon: query.isEmpty
                    ? null
                    : IconButton(
                        icon: Icon(Icons.close_rounded,
                            size: 18, color: t.muted),
                        onPressed: onClear,
                      ),
                isDense: true,
                filled: true,
                fillColor: t.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: t.hairline, width: 0.5),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                      color: HrColors.teal.withValues(alpha: 0.55),
                      width: 1.5),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PlainHeader extends StatelessWidget {
  const _PlainHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          Expanded(
            child: Text(title,
                style: RunqText.h3.copyWith(color: t.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message,
            textAlign: TextAlign.center,
            style: RunqText.body.copyWith(color: t.muted)),
      ),
    );
  }
}

// ─── Grouping helpers ────────────────────────────────────────────────────────

class _DeptGroup {
  _DeptGroup({required this.id, required this.name});
  final String? id; // null => Unassigned
  final String name;
  int count = 0;
}

/// Buckets employees by department, sorted alphabetically with the
/// "Unassigned" group (no department) always pinned last.
List<_DeptGroup> _group(List<HrEmployee> employees) {
  final byKey = <String, _DeptGroup>{};
  for (final e in employees) {
    final key = e.departmentId ?? '_none';
    final g = byKey.putIfAbsent(
      key,
      () => _DeptGroup(
          id: e.departmentId, name: e.departmentName ?? 'Unassigned'),
    );
    g.count++;
  }
  final list = byKey.values.toList()
    ..sort((a, b) {
      if (a.id == null) return 1;
      if (b.id == null) return -1;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
  return list;
}

String _people(int n) => '$n ${n == 1 ? 'person' : 'people'}';
