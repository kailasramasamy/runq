// People tab — list of employees with search, status chips, and stat
// pills. Tapping a row pushes the detail screen with a gradient profile
// header + Info / Leave / Pay tabs.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'hr_profile_checklist.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_widgets.dart';

final _peopleSearchProvider = StateProvider<String>((_) => '');
final _peopleStatusProvider = StateProvider<String?>((_) => null);

/// Drops the viewer's own employee row — the directory lists colleagues.
List<HrEmployee> _withoutSelf(List<HrEmployee> rows, String? meId) =>
    meId == null ? rows : rows.where((e) => e.id != meId).toList();

class HrPeopleScreen extends ConsumerWidget {
  const HrPeopleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final search = ref.watch(_peopleSearchProvider);
    final status = ref.watch(_peopleStatusProvider);
    final query = HrEmployeesQuery(search: search.isEmpty ? null : search, status: status);
    final pageAsync = ref.watch(hrEmployeesProvider(query));
    // Creating an employee row is an admin/HR-only action; managers and
    // employees see the directory but not the add button.
    final canAdd = ref.watch(appRoleProvider).canManageHrSetup;
    // The directory lists colleagues — drop the viewer's own row.
    final meId = ref.watch(hrMeProvider).asData?.value.employee?.id;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: HrColors.brand(context),
          onRefresh: () async {
            ref.invalidate(hrEmployeesProvider(query));
            await Future<void>.delayed(const Duration(milliseconds: 250));
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 12, 20, 4),
                  child: Row(
                    children: [
                      // Back arrow — People is now a drill-down from
                      // Home, not a peer tab in the bot nav.
                      IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                      ),
                      const SizedBox(width: 4),
                      Text('People', style: RunqText.h1.copyWith(color: t.ink)),
                      const Spacer(),
                      if (canAdd)
                        IconButton(
                          onPressed: () => context.push('/hr/employees/new'),
                          icon: Icon(Icons.add_rounded, color: HrColors.teal, size: 28),
                        ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: _SearchField(
                    initial: search,
                    onChanged: (v) => ref.read(_peopleSearchProvider.notifier).state = v,
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
              SliverToBoxAdapter(
                child: _FilterChips(
                  active: status,
                  onChange: (s) => ref.read(_peopleStatusProvider.notifier).state = s,
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
              SliverToBoxAdapter(
                child: pageAsync.when(
                  data: (p) {
                    final rows = _withoutSelf(p.data, meId);
                    return _StatsRow(total: p.total - (p.data.length - rows.length), rows: rows);
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                sliver: pageAsync.when(
                  data: (p) {
                    final rows = _withoutSelf(p.data, meId);
                    if (rows.isEmpty) {
                      return SliverToBoxAdapter(child: _Empty(label: search.isEmpty ? 'No employees yet' : 'No matches for "$search"'));
                    }
                    return SliverList.builder(
                      itemCount: rows.length,
                      itemBuilder: (_, i) => _EmployeeRow(
                        employee: rows[i],
                        onTap: () => context.push('/hr/people/${rows[i].id}'),
                      ),
                    );
                  },
                  loading: () => const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 32),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
                  error: (e, __) => SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 32),
                      child: Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                    ),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 140)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  final String initial;
  final ValueChanged<String> onChanged;
  const _SearchField({required this.initial, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0x1F767680),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 18, color: t.muted),
          const SizedBox(width: 6),
          Expanded(
            child: TextField(
              controller: TextEditingController(text: initial)..selection = TextSelection.collapsed(offset: initial.length),
              onChanged: onChanged,
              textCapitalization: TextCapitalization.none,
              style: RunqText.body.copyWith(color: t.ink),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: EdgeInsets.zero,
                border: InputBorder.none,
                hintText: 'Search name, code, email',
                hintStyle: RunqText.body.copyWith(color: t.muted),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChips extends StatelessWidget {
  final String? active;
  final ValueChanged<String?> onChange;
  const _FilterChips({required this.active, required this.onChange});

  static const _opts = [
    (null, 'All'),
    ('active', 'Active'),
    ('on_leave', 'On Leave'),
    ('inactive', 'Inactive'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _opts.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final o = _opts[i];
          final selected = o.$1 == active;
          return GestureDetector(
            onTap: () => onChange(o.$1),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: selected ? HrColors.teal : t.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: selected ? HrColors.teal : t.hairline,
                  width: selected ? 1.0 : 0.5,
                ),
              ),
              child: Text(
                o.$2,
                style: RunqText.caption.copyWith(
                  color: selected ? Colors.white : t.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final int total;
  final List<HrEmployee> rows;
  const _StatsRow({required this.total, required this.rows});

  @override
  Widget build(BuildContext context) {
    final active = rows.where((e) => e.status == 'active').length;
    final onLeave = rows.where((e) => e.status == 'on_leave').length;
    final depts = rows.map((e) => e.departmentId).whereType<String>().toSet().length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Row(
        children: [
          Expanded(child: _Pill('Total', '$total', HrColors.teal)),
          const SizedBox(width: 8),
          Expanded(child: _Pill('Active', '$active', const Color(0xFF16A34A))),
          const SizedBox(width: 8),
          Expanded(child: _Pill('Leave', '$onLeave', const Color(0xFFD97706))),
          const SizedBox(width: 8),
          Expanded(child: _Pill('Depts', '$depts', const Color(0xFF475569))),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label, value;
  final Color tint;
  const _Pill(this.label, this.value, this.tint);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(value, style: RunqText.tabular(size: 16, w: FontWeight.w700, color: tint)),
          Text(label.toUpperCase(),
              style: RunqText.micro.copyWith(color: tint, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
        ],
      ),
    );
  }
}

class _EmployeeRow extends StatelessWidget {
  final HrEmployee employee;
  final VoidCallback onTap;
  const _EmployeeRow({required this.employee, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final dotColor = employee.status == 'on_leave'
        ? const Color(0xFFD97706)
        : (employee.status == 'active' ? const Color(0xFF16A34A) : const Color(0xFF94A3B8));
    final setup = employeeCompleteness(employee);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              HrAvatar(
                name: employee.displayName,
                photoUrl: employee.photoUrl,
                employeeId: employee.id,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(employee.displayName,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (employee.designationName != null) employee.designationName!,
                        if (employee.departmentName != null) employee.departmentName!,
                      ].join(' · '),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                    // Setup progress — shown only while the profile is
                    // incomplete, so finished rows stay clean.
                    if (!setup.isComplete) ...[
                      const SizedBox(height: 7),
                      _SetupBar(setup: setup),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(width: 7, height: 7, decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text(_statusLabel(employee.status),
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ),
      ),
    );
  }

  static String _statusLabel(String s) => switch (s) {
        'active' => 'Active',
        'on_leave' => 'On leave',
        'inactive' => 'Inactive',
        'terminated' => 'Left',
        _ => s,
      };
}

/// Thin setup-progress line on an employee card. Red when critical items are
/// missing (blocks payroll), amber when only recommended items remain.
class _SetupBar extends StatelessWidget {
  final ProfileCompleteness setup;
  const _SetupBar({required this.setup});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final crit = setup.criticalMissing;
    final accent =
        crit > 0 ? const Color(0xFFDC2626) : const Color(0xFFD97706);
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: setup.fraction,
              minHeight: 4,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation<Color>(accent),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          crit > 0 ? '${setup.percent}% · $crit critical' : '${setup.percent}%',
          style: RunqText.caption.copyWith(
            color: crit > 0 ? accent : t.muted,
            fontWeight: crit > 0 ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  final String label;
  const _Empty({required this.label});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36),
      child: Center(child: Text(label, style: RunqText.body.copyWith(color: t.muted))),
    );
  }
}
