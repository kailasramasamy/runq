// HR Home tab. One screen renders both the Employee and Manager personas
// — the dark gradient header + segmented control stays put, only the body
// swaps. This keeps the persona flip instant (no route change) and lets us
// reuse the header chrome for both flavours.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/app_module_provider.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/hr_persona_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_dashboard_sections.dart';
import 'widgets/hr_feed_sections.dart';
import 'widgets/hr_widgets.dart';

class HrHomeScreen extends ConsumerStatefulWidget {
  const HrHomeScreen({super.key});

  @override
  ConsumerState<HrHomeScreen> createState() => _HrHomeScreenState();
}

class _HrHomeScreenState extends ConsumerState<HrHomeScreen> {
  @override
  void initState() {
    super.initState();
    // Seed the persona once on first frame using whatever role we have at
    // mount time (defaults to `employee` while /hr/me is still loading,
    // which the notifier treats as a no-op until role upgrades).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(hrPersonaProvider.notifier).seedFromRole(ref.read(appRoleProvider));
    });
  }

  @override
  Widget build(BuildContext context) {
    // Re-seed whenever role changes (e.g. /hr/me resolves after first
    // paint, or the user re-signs in as a different role). The notifier's
    // `seedFromRole` is idempotent — no-op once a user has explicitly
    // toggled, hard-floor for the employee role.
    ref.listen<AppRole>(appRoleProvider, (prev, next) {
      if (prev != next) {
        ref.read(hrPersonaProvider.notifier).seedFromRole(next);
      }
    });

    final meAsync = ref.watch(hrMeProvider);
    final persona = ref.watch(hrPersonaProvider);
    final role = ref.watch(appRoleProvider);
    final t = RT(context);

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
        color: HrColors.brand(context),
        onRefresh: () async {
          ref.invalidate(hrMeProvider);
          ref.invalidate(hrDashboardProvider);
          ref.invalidate(hrMusterTodayProvider);
          ref.invalidate(hrHeadcountProvider);
          ref.invalidate(hrStatutoryCalendarProvider);
          ref.invalidate(hrMyLeaveBalancesProvider);
          ref.invalidate(hrPendingLeaveRequestsProvider);
          ref.invalidate(hrHolidaysProvider);
          ref.invalidate(hrMyAttendanceThisWeekProvider);
          await Future<void>.delayed(const Duration(milliseconds: 250));
        },
        child: ListView(
          padding: EdgeInsets.zero,
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          children: [
            _DarkHeader(
              me: meAsync.asData?.value,
              persona: persona,
              canSwitchPersona: role.canSeeManagerPersona,
              canSwitchModule: role.canSwitchModule,
              onPersonaChange: (p) => ref.read(hrPersonaProvider.notifier).setPersona(p),
              onSwitchModule: () => _switchToFinance(context, ref),
              onAvatarTap: () => context.push('/hr/more'),
            ),
            const SizedBox(height: 14),
            // Soft crossfade + tiny slide when the persona flips so the
            // two views feel like the same surface, not a route swap.
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              layoutBuilder: (current, previous) => Stack(
                alignment: Alignment.topCenter,
                children: [...previous, if (current != null) current],
              ),
              transitionBuilder: (child, anim) {
                final slide = Tween<Offset>(
                  begin: const Offset(0, 0.02),
                  end: Offset.zero,
                ).animate(anim);
                return FadeTransition(
                  opacity: anim,
                  child: SlideTransition(position: slide, child: child),
                );
              },
              child: (persona == HrPersona.manager && role.canSeeManagerPersona)
                  ? const KeyedSubtree(key: ValueKey('manager'), child: _ManagerBody())
                  : const KeyedSubtree(key: ValueKey('employee'), child: _EmployeeBody()),
            ),
            const SizedBox(height: 140),
          ],
        ),
        ),
      ),
    );
  }

  /// Instant module flip — pill is the switcher, no confirmation sheet.
  /// Sets the module so RootShell paints Finance tabs, then routes to the
  /// Finance home so the user lands on a meaningful page rather than the
  /// HR-tab equivalent of /home.
  Future<void> _switchToFinance(BuildContext context, WidgetRef ref) async {
    await ref.read(appModuleProvider.notifier).setModule(AppModule.finance);
    if (context.mounted) context.go('/home');
  }
}

// ─── Dark gradient header ─────────────────────────────────────────────────

class _DarkHeader extends StatelessWidget {
  final HrMe? me;
  final HrPersona persona;
  final bool canSwitchPersona;
  /// Admins see the module pill; managers/employees don't have a Finance
  /// module to flip into. Hidden entirely (rather than disabled) so the
  /// header stays clean.
  final bool canSwitchModule;
  final ValueChanged<HrPersona> onPersonaChange;
  final VoidCallback onSwitchModule;
  final VoidCallback onAvatarTap;
  const _DarkHeader({
    required this.me,
    required this.persona,
    required this.canSwitchPersona,
    required this.canSwitchModule,
    required this.onPersonaChange,
    required this.onSwitchModule,
    required this.onAvatarTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    final today = DateTime.now();
    final dateLabel = '${_weekday(today.weekday)}, ${today.day} ${months[today.month - 1]}';
    final greeting = hrGreeting(today);
    final firstName = me?.firstName ?? 'there';

    // Light scaffold treatment — mirrors the Finance dashboard header so
    // both modules share the same visual language. The wrapping SafeArea
    // in the screen body handles the status-bar inset.
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (canSwitchModule)
                HrModulePill(
                  moduleLabel: 'HR',
                  targetLabel: 'Finance',
                  onDarkSurface: false,
                  onTap: onSwitchModule,
                )
              else
                Text('HR & Payroll',
                    style: TextStyle(
                      color: t.muted,
                      fontSize: 12, fontWeight: FontWeight.w600,
                    )),
              const Spacer(),
              GestureDetector(
                onTap: onAvatarTap,
                child: HrAvatar(
                  name: me?.displayName ?? '?',
                  size: 40,
                  photoUrl: me?.employee?.photoUrl,
                  employeeId: me?.employee?.id,
                  useGradient: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(dateLabel,
              style: TextStyle(color: t.muted, fontSize: 13)),
          const SizedBox(height: 2),
          Text('$greeting, $firstName 👋',
              style: TextStyle(
                color: t.ink,
                fontSize: 22, fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              )),
          const SizedBox(height: 12),
          // Quick-search pill — opens an in-app spotlight that searches
          // employees by name / code / phone / email. Lives in every
          // persona since employees may want to find a colleague too.
          _SearchPill(onTap: () => _openEmployeeSearch(context)),
          if (canSwitchPersona) ...[
            const SizedBox(height: 14),
            HrRoleSegment(
              managerActive: persona == HrPersona.manager,
              onChange: (m) => onPersonaChange(m ? HrPersona.manager : HrPersona.employee),
            ),
          ],
        ],
      ),
    );
  }

  static String _weekday(int wd) {
    const labels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return labels[wd - 1];
  }
}

// ─── Module switch confirmation sheet ─────────────────────────────────────


// ─── Employee body ────────────────────────────────────────────────────────

class _EmployeeBody extends ConsumerStatefulWidget {
  const _EmployeeBody();

  @override
  ConsumerState<_EmployeeBody> createState() => _EmployeeBodyState();
}

class _EmployeeBodyState extends ConsumerState<_EmployeeBody> {
  BiometricState _bio = BiometricState.idle;
  String? _checkInTime;

  Future<void> _checkIn() async {
    final me = ref.read(hrMeProvider).asData?.value;
    final empId = me?.employee?.id;
    if (empId == null) {
      showRunqSnack(context, 'No employee record linked to your account', kind: SnackKind.error);
      return;
    }
    setState(() => _bio = BiometricState.scanning);
    // Visual scan duration matches the design's biometric animation — fires
    // alongside the network call so the UX never blocks longer than the
    // animation itself.
    final scan = sleep(1800);
    final now = DateTime.now();
    final hh = now.hour.toString().padLeft(2, '0');
    final mm = now.minute.toString().padLeft(2, '0');
    try {
      await hrRepo.stampAttendance(
        employeeId: empId,
        date: now,
        checkIn: '$hh:$mm',
        status: 'present',
        source: 'biometric',
      );
      await scan;
      if (!mounted) return;
      _checkInTime = '$hh:$mm';
      setState(() => _bio = BiometricState.success);
      ref.invalidate(hrMyAttendanceThisWeekProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() => _bio = BiometricState.idle);
      showRunqSnack(context, 'Could not check in', kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final balances = ref.watch(hrMyLeaveBalancesProvider);
    final holidays = ref.watch(hrHolidaysProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Attendance card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.card,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Text('Today\'s attendance',
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                    const Spacer(),
                    if (_bio == BiometricState.success)
                      const HrStatusBadge(status: 'active', label: 'Checked in'),
                  ],
                ),
                const SizedBox(height: 32),
                Center(
                  child: HrBiometricButton(
                    state: _bio,
                    onTap: _checkIn,
                    successCaption: _checkInTime == null
                        ? null
                        : '$_checkInTime · Office',
                  ),
                ),
                const SizedBox(height: 10),
                if (_bio == BiometricState.success)
                  OutlinedButton(
                    onPressed: () => setState(() => _bio = BiometricState.idle),
                    style: OutlinedButton.styleFrom(
                      // `HrColors.brand(context)` is the theme-aware indigo — lighter in dark
                      // mode so the outline + label keep AA contrast on the
                      // dark scaffold.
                      side: BorderSide(color: HrColors.brand(context)),
                      foregroundColor: HrColors.brand(context),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Check out'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _QuickActionsGrid(
            items: [
              _QA(Icons.event_available_outlined, 'Apply Leave', const Color(0xFF06B6D4),
                  () => context.push('/hr/pay?tab=leave')),
              _QA(Icons.description_outlined, 'My Payslip', const Color(0xFF7C3AED),
                  () => context.push('/hr/pay')),
              _QA(Icons.receipt_outlined, 'Expenses', const Color(0xFFD97706),
                  () => context.push('/expenses')),
              _QA(Icons.account_balance_wallet_outlined, 'Leave Balance', const Color(0xFF16A34A),
                  () => context.push('/hr/pay?tab=leave')),
            ],
          ),
          const SizedBox(height: 12),
          balances.when(
            data: (rows) => rows.isEmpty
                ? const SizedBox.shrink()
                : _LeaveBalancesRow(balances: rows.take(4).toList()),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 12),
          holidays.when(
            data: (rows) {
              final upcoming = rows.where((h) => h.date.isAfter(DateTime.now().subtract(const Duration(days: 1)))).take(1).toList();
              if (upcoming.isEmpty) return const SizedBox.shrink();
              return _HolidayCard(holiday: upcoming.first);
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _QA {
  final IconData icon;
  final String label;
  final Color tint;
  final VoidCallback onTap;
  const _QA(this.icon, this.label, this.tint, this.onTap);
}

class _QuickActionsGrid extends StatelessWidget {
  final List<_QA> items;
  const _QuickActionsGrid({required this.items});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.5,
      children: items.map((qa) => _QuickActionCard(qa: qa)).toList(),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final _QA qa;
  const _QuickActionCard({required this.qa});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: qa.onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: qa.tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(qa.icon, color: qa.tint, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(qa.label,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }
}

class _LeaveBalancesRow extends StatelessWidget {
  final List<HrLeaveBalance> balances;
  const _LeaveBalancesRow({required this.balances});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        for (var i = 0; i < balances.length; i++) ...[
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: t.hairline, width: 0.5),
                boxShadow: RunqShadows.card,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    balances[i].balance.toStringAsFixed(balances[i].balance % 1 == 0 ? 0 : 1),
                    style: TextStyle(color: t.ink, fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    balances[i].typeCode,
                    style: TextStyle(
                      color: t.muted, fontSize: 10, fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (i < balances.length - 1) const SizedBox(width: 8),
        ],
      ],
    );
  }
}

class _HolidayCard extends StatelessWidget {
  final HrHoliday holiday;
  const _HolidayCard({required this.holiday});

  @override
  Widget build(BuildContext context) {
    final daysLeft = holiday.date.difference(DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day)).inDays;
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF0E7490), Color(0xFF06B6D4)],
        ),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        boxShadow: RunqShadows.card,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Upcoming holiday',
                    style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
                const SizedBox(height: 4),
                Text(holiday.name,
                    style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${holiday.date.day} ${m[holiday.date.month - 1]} ${holiday.date.year}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                daysLeft <= 0 ? 'TODAY' : '$daysLeft',
                style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800),
              ),
              if (daysLeft > 0)
                const Text('days left', style: TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Manager body ─────────────────────────────────────────────────────────

class _ManagerBody extends ConsumerWidget {
  const _ManagerBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final musterAsync = ref.watch(hrMusterTodayProvider);
    final dashAsync = ref.watch(hrDashboardProvider);
    final pendingAsync = ref.watch(hrPendingLeaveRequestsProvider);
    final statutoryAsync = ref.watch(hrStatutoryCalendarProvider);
    final holidaysAsync = ref.watch(hrHolidaysProvider);

    final muster = musterAsync.asData?.value;
    final dash = dashAsync.asData?.value;
    final pendingCount = pendingAsync.asData?.value.length ?? 0;

    final me = ref.watch(hrMeProvider).asData?.value;
    // "Showing your team (N)" pill for scoped users; quiet for admins/HR.
    final scopeLabel = me == null ? null
        : me.scopeKind == 'subset' && me.visibleCount != null
            ? 'Showing your team · ${me.visibleCount} people'
            : null;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (scopeLabel != null) ...[
            _ScopePill(label: scopeLabel),
            const SizedBox(height: 12),
          ],
          // Quick actions strip — top-of-page chips for the manager's
          // daily four-action loop. Replaces the multi-tap "more →
          // module" navigation for the most-frequent destinations.
          const _QuickActionsStrip(),
          const SizedBox(height: 14),
          // Pending leave banner — only when there's something to act on.
          // The headline counts that used to sit above this row are folded
          // into the muster grid below (no duplication).
          if (pendingCount > 0) ...[
            _PendingBanner(
              count: pendingCount,
              onTap: () => context.push('/hr/pay?tab=approvals'),
            ),
            const SizedBox(height: 28),
          ],
          // Today's muster — 6 semantic tiles in a 2-row grid (Present /
          // Half day / Leave on top; Absent / Holiday / Week-off below).
          _SectionLabel('Today\'s muster'),
          const SizedBox(height: 8),
          // Hand-laid Column-of-Rows instead of GridView.count — the grid
          // was reserving its row height by aspect ratio, leaving a big
          // empty band beneath the tiles even though each tile only
          // needed ~70pt. Rows + Expanded keep the layout intrinsic.
          Row(
            children: [
              Expanded(child: HrMusterTile(label: 'Present', value: muster?.present ?? 0, kind: MusterKind.present)),
              const SizedBox(width: 8),
              Expanded(child: HrMusterTile(label: 'Half day', value: muster?.halfDay ?? 0, kind: MusterKind.halfday)),
              const SizedBox(width: 8),
              Expanded(child: HrMusterTile(label: 'Leave', value: muster?.leave ?? 0, kind: MusterKind.leave)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: HrMusterTile(label: 'Absent', value: muster?.absent ?? 0, kind: MusterKind.absent)),
              const SizedBox(width: 8),
              Expanded(child: HrMusterTile(label: 'Holiday', value: muster?.holiday ?? 0, kind: MusterKind.holiday)),
              const SizedBox(width: 8),
              Expanded(child: HrMusterTile(label: 'W/Off', value: muster?.weekOff ?? 0, kind: MusterKind.weekoff)),
            ],
          ),
          const SizedBox(height: 28),
          // "Needs attention" action cards — exact set the web HR
          // dashboard surfaces above the fold.
          _SectionLabel('Needs attention'),
          const SizedBox(height: 8),
          _ActionCard(
            icon: Icons.calculate_outlined,
            label: '${_monthLabel(dash?.payrollMonth ?? DateTime.now().month)} ${dash?.payrollYear ?? DateTime.now().year} payroll',
            value: _payrollValue(dash),
            sub: _payrollSub(dash),
            tone: _payrollTone(dash),
            onTap: () => context.push('/hr/payroll-runs'),
          ),
          if (dash != null && dash.employeesWithoutSalary > 0) ...[
            const SizedBox(height: 8),
            _ActionCard(
              icon: Icons.account_balance_wallet_outlined,
              label: 'Salary structures',
              value: '${dash.employeesWithoutSalary} missing',
              sub: 'Assign before running payroll',
              tone: _ActionTone.attention,
              onTap: () => context.push('/hr/people'),
            ),
          ],
          if (dash != null && dash.attendanceNotMarkedToday > 0) ...[
            const SizedBox(height: 8),
            _ActionCard(
              icon: Icons.access_time_rounded,
              label: 'Attendance today',
              value: '${dash.attendanceNotMarkedToday} not marked',
              sub: 'Mark today\'s muster',
              tone: _ActionTone.attention,
              onTap: () => context.push('/hr/time'),
            ),
          ],
          if (dash != null && dash.confirmationsDue > 0) ...[
            const SizedBox(height: 8),
            _ActionCard(
              icon: Icons.verified_outlined,
              label: 'Confirmations due',
              value: '${dash.confirmationsDue} pending',
              sub: 'Probation periods ending soon',
              tone: _ActionTone.attention,
              onTap: () => context.push('/hr/people'),
            ),
          ],
          const SizedBox(height: 32),
          // People-context sections — the parts a daily HR manager looks
          // for first (who's out, whose birthday is it, recent moments,
          // attendance pulse, expiring docs). Each renders an empty-state
          // card on quiet days so the surfaces stay discoverable.
          const HrAnnouncementsSection(),
          const HrWhoIsOutSection(),
          const HrCelebrationsSection(),
          const HrPeopleMomentsSection(),
          const HrAttendanceTrendSection(),
          const HrExpiringDocsSection(),
          const HrRecentActivitySection(),
          // Statutory calendar — upcoming compliance deadlines (TDS /
          // 24Q / PT). Hidden when the list is empty so a quiet month
          // doesn't surface an empty section.
          statutoryAsync.when(
            data: (rows) {
              if (rows.isEmpty) return const SizedBox.shrink();
              final top = rows.take(5).toList();
              return Padding(
                padding: const EdgeInsets.only(top: 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _SectionLabel('Statutory calendar'),
                    const SizedBox(height: 8),
                    Container(
                      decoration: BoxDecoration(
                        color: t.surface,
                        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                        border: Border.all(color: t.hairline, width: 0.5),
                        boxShadow: RunqShadows.card,
                      ),
                      child: Column(
                        children: [
                          for (var i = 0; i < top.length; i++) ...[
                            _StatutoryRow(item: top[i]),
                            if (i < top.length - 1)
                              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 50),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          // Upcoming holidays — next 5, "See all" links to the holidays
          // surface (web for now; mobile holidays screen is a follow-up).
          holidaysAsync.when(
            data: (rows) {
              final today = DateTime.now();
              final cutoff = DateTime(today.year, today.month, today.day);
              final upcoming = rows
                  .where((h) => !h.date.isBefore(cutoff))
                  .toList()
                ..sort((a, b) => a.date.compareTo(b.date));
              if (upcoming.isEmpty) return const SizedBox.shrink();
              final top = upcoming.take(5).toList();
              final canSeeAll = upcoming.length > 5;
              return Padding(
                padding: const EdgeInsets.only(top: 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        _SectionLabel('Upcoming holidays'),
                        const Spacer(),
                        if (canSeeAll)
                          TextButton.icon(
                            onPressed: () => _showHolidaysSheet(context, upcoming),
                            style: TextButton.styleFrom(
                              foregroundColor: HrColors.brand(context),
                              padding: EdgeInsets.zero,
                              visualDensity: VisualDensity.compact,
                            ),
                            icon: const Icon(Icons.calendar_today_outlined, size: 14),
                            label: Text('See all (${upcoming.length})'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Container(
                      decoration: BoxDecoration(
                        color: t.surface,
                        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                        border: Border.all(color: t.hairline, width: 0.5),
                        boxShadow: RunqShadows.card,
                      ),
                      child: Column(
                        children: [
                          for (var i = 0; i < top.length; i++) ...[
                            _HolidayRow(holiday: top[i]),
                            if (i < top.length - 1)
                              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 50),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          // Surface dashboard load errors at the bottom so the screen
          // still renders something useful even when the API is down.
          if (dashAsync.hasError) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                border: Border.all(color: t.hairline, width: 0.5),
              ),
              child: Text('Dashboard unavailable',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
          ],
        ],
      ),
    );
  }

  /// Bottom sheet listing every upcoming holiday in the year. Opened from
  /// the "See all" link when there are more than 5 to show.
  Future<void> _showHolidaysSheet(BuildContext context, List<HrHoliday> all) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetCtx) {
        final t = RT(sheetCtx);
        return Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(sheetCtx).size.height * 0.7,
          ),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    Text('All upcoming holidays',
                        style: RunqText.h3.copyWith(color: t.ink, fontSize: 16)),
                  ],
                ),
              ),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Container(
                    decoration: BoxDecoration(
                      color: t.surface,
                      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                      border: Border.all(color: t.hairline, width: 0.5),
                    ),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: all.length,
                      separatorBuilder: (_, __) =>
                          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 50),
                      itemBuilder: (_, i) => _HolidayRow(holiday: all[i]),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _monthLabel(int m) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (m < 1 || m > 12) return '—';
    return months[m - 1];
  }

  static String _payrollValue(HrDashboard? d) {
    if (d == null) return '—';
    if (d.payrollRunId == null) return 'Not started';
    return switch (d.payrollStatus) {
      'draft' => 'Draft',
      'processed' => 'Processed',
      'approved' => 'Approved',
      'closed' => 'Closed',
      _ => 'In progress',
    };
  }

  static String _payrollSub(HrDashboard? d) {
    if (d == null || d.payrollTotalNet <= 0) return 'Open the payroll workspace';
    return 'Net ${hrFormatINR(d.payrollTotalNet)}';
  }

  static _ActionTone _payrollTone(HrDashboard? d) {
    if (d == null) return _ActionTone.info;
    if (d.payrollRunId == null) return _ActionTone.attention;
    return switch (d.payrollStatus) {
      'closed' || 'approved' => _ActionTone.good,
      _ => _ActionTone.info,
    };
  }

}

class _SectionLabel extends StatelessWidget {
  final String label;
  // Implicit positional constructor so the call sites stay terse.
  // ignore: prefer_const_constructors_in_immutables
  _SectionLabel(this.label);
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
        ),
      ),
    );
  }
}

enum _ActionTone { good, attention, urgent, info }

/// Row for the Statutory calendar card — left icon tile, label + sublabel,
/// right-aligned days-left chip that flips tone based on urgency.
class _StatutoryRow extends StatelessWidget {
  final HrStatutoryDeadline item;
  const _StatutoryRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final days = item.daysLeft;
    final (chipBg, chipInk, chipText) = _chip(days);
    final icon = _iconFor(item.kind);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 16, color: HrColors.brand(context)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.label,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                if (item.sublabel.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(item.sublabel,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(999)),
            child: Text(chipText,
                style: TextStyle(color: chipInk, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  static IconData _iconFor(String kind) => switch (kind) {
        'tds_deposit' => Icons.account_balance_outlined,
        'tds_24q'     => Icons.description_outlined,
        'pt'          => Icons.assignment_outlined,
        _             => Icons.gavel_outlined,
      };

  /// Tone the days-left chip by urgency:
  ///   < 0 → overdue (red), ≤ 5 → urgent (red), ≤ 12 → soon (amber),
  ///   else → relaxed (slate). Theme-aware so dark mode stays legible.
  static (Color bg, Color ink, String text) _chip(int days) {
    if (days < 0) return (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D), '${days.abs()}d overdue');
    if (days == 0) return (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D), 'Today');
    if (days <= 5) return (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D), '$days days');
    if (days <= 12) return (const Color(0xFFFEF3C7), const Color(0xFF78350F), '$days days');
    return (const Color(0xFFF1F5F9), const Color(0xFF475569), '$days days');
  }
}

/// Row for the Upcoming holidays card — date "tile" (day + month) on the
/// left, name + relative caption on the right.
class _HolidayRow extends StatelessWidget {
  final HrHoliday holiday;
  const _HolidayRow({required this.holiday});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = holiday.date.difference(today).inDays;
    final rel = days == 0
        ? 'Today'
        : days == 1
            ? 'Tomorrow'
            : days < 7
                ? '$days days · ${_weekday(holiday.date.weekday)}'
                : _weekday(holiday.date.weekday);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 36,
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${holiday.date.day}',
                    style: TextStyle(
                      color: HrColors.brand(context),
                      fontSize: 15, fontWeight: FontWeight.w800, height: 1,
                    )),
                const SizedBox(height: 2),
                Text(months[holiday.date.month - 1].toUpperCase(),
                    style: TextStyle(
                      color: HrColors.brand(context),
                      fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.4,
                    )),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(holiday.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                const SizedBox(height: 2),
                Text(rel,
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _weekday(int wd) {
    const labels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return labels[wd - 1];
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String label, value, sub;
  final _ActionTone tone;
  final VoidCallback onTap;
  const _ActionCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.sub,
    required this.tone,
    required this.onTap,
  });

  Color get _accent => switch (tone) {
        _ActionTone.good      => const Color(0xFF16A34A),
        _ActionTone.attention => const Color(0xFFD97706),
        _ActionTone.urgent    => const Color(0xFFDC2626),
        _ActionTone.info      => HrColors.teal,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _accent.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _accent.withValues(alpha: 0.18), width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: _accent.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: _accent, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label.toUpperCase(),
                      style: TextStyle(
                        color: t.muted2, fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.4,
                      )),
                  const SizedBox(height: 4),
                  Text(value,
                      style: TextStyle(color: _accent, fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(sub, style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class _PendingBanner extends StatelessWidget {
  final int count;
  final VoidCallback onTap;
  const _PendingBanner({required this.count, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const accent = Color(0xFFD97706);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.09),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: accent.withValues(alpha: 0.32), width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.notifications_active_outlined, color: accent, size: 16),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$count leave request${count == 1 ? '' : 's'} awaiting approval',
                    style: TextStyle(color: t.ink, fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 1),
                  Text('Tap to review',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 16, color: t.muted),
          ],
        ),
      ),
    );
  }
}


// ─── Quick actions strip (manager) ────────────────────────────────────────

/// Small teal pill telling scoped managers what they're looking at.
/// Quiet for org-wide scopes — admins don't need a reminder.
class _ScopePill extends StatelessWidget {
  final String label;
  const _ScopePill({required this.label});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: HrColors.tealSubtle,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.people_alt_outlined, size: 12, color: HrColors.brand(context)),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                  color: HrColors.brand(context),
                  fontSize: 11, fontWeight: FontWeight.w700,
                )),
          ],
        ),
      ),
    );
  }
}

class _QuickActionsStrip extends ConsumerWidget {
  const _QuickActionsStrip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Four daily-loop actions, ordered by frequency the manager would
    // tap them on a typical morning. Each routes via push so back returns
    // to Home (consistent with the HR drill-down nav model).
    // IntrinsicHeight stretches each chip to the tallest sibling so
    // two-line labels ("Add\nemployee", "Mark\nattendance") and one-line
    // ones ("Approvals", "Payroll") sit in identical rectangles.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: _QaChip(
            icon: Icons.person_add_alt_1_outlined, label: 'Add\nemployee',
            onTap: () => context.push('/hr/employees/new'),
          )),
          const SizedBox(width: 8),
          Expanded(child: _QaChip(
            icon: Icons.access_time_rounded, label: 'Mark\nattendance',
            onTap: () => context.push('/hr/time'),
          )),
          const SizedBox(width: 8),
          Expanded(child: _QaChip(
            icon: Icons.fact_check_outlined, label: 'Approvals',
            onTap: () => context.push('/hr/pay?tab=approvals'),
          )),
          const SizedBox(width: 8),
          Expanded(child: _QaChip(
            icon: Icons.calculate_outlined, label: 'Payroll',
            onTap: () => context.push('/hr/payroll-runs'),
          )),
        ],
      ),
    );
  }
}

class _QaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QaChip({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        // Center content vertically so single-line labels don't float to
        // the top while two-line siblings fill the chip.
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: HrColors.brand(context), size: 20),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: t.ink, fontSize: 11.5, fontWeight: FontWeight.w600, height: 1.15,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Employee quick-search ────────────────────────────────────────────────

class _SearchPill extends StatelessWidget {
  final VoidCallback onTap;
  const _SearchPill({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: Row(
          children: [
            Icon(Icons.search_rounded, color: t.muted, size: 18),
            const SizedBox(width: 8),
            Text('Search employees',
                style: TextStyle(color: t.muted, fontSize: 13, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

Future<void> _openEmployeeSearch(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _EmployeeSearchSheet(),
  );
}

class _EmployeeSearchSheet extends ConsumerStatefulWidget {
  const _EmployeeSearchSheet();
  @override
  ConsumerState<_EmployeeSearchSheet> createState() => _EmployeeSearchSheetState();
}

class _EmployeeSearchSheetState extends ConsumerState<_EmployeeSearchSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final query = HrEmployeesQuery(search: _q.trim().isEmpty ? null : _q.trim());
    final results = ref.watch(hrEmployeesProvider(query));
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 12 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              autofocus: true,
              textCapitalization: TextCapitalization.none,
              onChanged: (v) => setState(() => _q = v),
              decoration: InputDecoration(
                hintText: 'Search by name, code, phone, email',
                hintStyle: TextStyle(color: t.muted2, fontSize: 14),
                prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                isDense: true,
                filled: true,
                fillColor: t.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: t.hairline, width: 0.5),
                ),
              ),
            ),
          ),
          Flexible(
            child: results.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
              ),
              data: (page) {
                if (page.data.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 28),
                    child: Center(child: Text(
                      _q.isEmpty ? 'Start typing to search' : 'No matches',
                      style: RunqText.body.copyWith(color: t.muted),
                    )),
                  );
                }
                return ListView.separated(
                  shrinkWrap: true,
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: page.data.length,
                  separatorBuilder: (_, __) =>
                      Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
                  itemBuilder: (_, i) {
                    final e = page.data[i];
                    return ListTile(
                      dense: true,
                      leading: HrAvatar(
                        name: e.displayName, photoUrl: e.photoUrl, employeeId: e.id, size: 36,
                      ),
                      title: Text(e.displayName,
                          style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                      subtitle: Text(
                        [
                          e.employeeCode,
                          if (e.designationName != null) e.designationName!,
                          if (e.departmentName != null) e.departmentName!,
                        ].join(' · '),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
                      ),
                      trailing: Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
                      onTap: () {
                        Navigator.of(context).pop();
                        context.push('/hr/people/${e.id}');
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
