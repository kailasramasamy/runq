// HR Home tab. One screen renders both the Employee and Manager personas
// — the dark gradient header + segmented control stays put, only the body
// swaps. This keeps the persona flip instant (no route change) and lets us
// reuse the header chrome for both flavours.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_phase_next.dart';
import '../../api/notifications_repo.dart';
import '../../providers/app_module_provider.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/hr_persona_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
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
          ref.invalidate(notificationsProvider);
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
            // Direct conditional render — AnimatedSwitcher's Stack-based
            // layoutBuilder was sizing to the larger of (current, previous)
            // and leaving residual whitespace below the shorter body when
            // the persona flipped from Manager → My View. Lost the
            // crossfade animation, gained correct layout sizing.
            if (persona == HrPersona.manager && role.canSeeManagerPersona)
              const _ManagerBody()
            else
              const _EmployeeBody(),
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

class _DarkHeader extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final unread = ref.watch(unreadCountProvider);
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
              _BellButton(unread: unread, onTap: () => context.push('/notifications')),
              const SizedBox(width: 8),
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
          // Quick-search pill — opens an org-wide directory lookup
          // (/hr/directory bypasses HrAccessScope, so an employee can
          // find any colleague, not just their own team).
          const SizedBox(height: 12),
          _SearchPill(onTap: () => context.push('/hr/directory')),
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

class _BellButton extends StatelessWidget {
  const _BellButton({required this.unread, required this.onTap});
  final int unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 40, height: 40,
          alignment: Alignment.center,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(Icons.notifications_outlined, color: t.ink, size: 24),
              if (unread > 0)
                Positioned(
                  right: -2,
                  top: -2,
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: unread > 9 ? 4 : 0, vertical: 0),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade600,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: t.bgWarm, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700, height: 1),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Module switch confirmation sheet ─────────────────────────────────────


// ─── Employee body ────────────────────────────────────────────────────────

class _EmployeeBody extends ConsumerStatefulWidget {
  const _EmployeeBody();

  @override
  ConsumerState<_EmployeeBody> createState() => _EmployeeBodyState();
}

// State machine for the compact check-in strip. Maps cleanly to the row
// states: not-started today, currently in, day complete.
enum _AttState { out, busy, inProgress, done }

class _EmployeeBodyState extends ConsumerState<_EmployeeBody> {
  String _hhmm(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  // Open the geo-fenced check-in screen. The strip's IN/OUT buttons both
  // route here — the screen owns GPS / selfie / fence check. On return,
  // invalidate the punches provider so the strip re-renders with the new
  // status. We never call /attendance stamp directly any more — every
  // punch is auditable via attendance_punches.
  Future<void> _openCheckIn() async {
    await context.push('/hr/check-in');
    if (!mounted) return;
    ref.invalidate(myPunchesProvider);
    ref.invalidate(hrMyAttendanceThisWeekProvider);
  }

  // Derive today's first-IN and last-OUT from the punch trail. Drives the
  // strip's state machine without keeping a parallel copy in setState.
  ({_AttState state, DateTime? checkIn, DateTime? checkOut}) _todayState(
    AsyncValue<List<HrPunch>> async,
  ) {
    final rows = async.asData?.value ?? const <HrPunch>[];
    final today = DateTime.now();
    bool sameDay(DateTime a) =>
        a.year == today.year && a.month == today.month && a.day == today.day;
    DateTime? checkIn, checkOut;
    for (final p in rows) {
      if (!sameDay(p.punchAt)) continue;
      if (p.kind == 'in') {
        if (checkIn == null || p.punchAt.isBefore(checkIn)) checkIn = p.punchAt;
      } else if (p.kind == 'out') {
        if (checkOut == null || p.punchAt.isAfter(checkOut)) checkOut = p.punchAt;
      }
    }
    final state = checkOut != null
        ? _AttState.done
        : checkIn != null
            ? _AttState.inProgress
            : _AttState.out;
    return (state: state, checkIn: checkIn, checkOut: checkOut);
  }

  String _elapsed(DateTime from, DateTime to) {
    final mins = to.difference(from).inMinutes;
    final h = mins ~/ 60;
    final m = mins % 60;
    if (h == 0) return '${m}m';
    return '${h}h ${m.toString().padLeft(2, '0')}m';
  }

  @override
  Widget build(BuildContext context) {
    final balances = ref.watch(hrMyLeaveBalancesProvider);
    final holidays = ref.watch(hrHolidaysProvider);
    final today = _todayState(ref.watch(myPunchesProvider));

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Glanceable attendance status — the buttons route to the
          // geo-fenced check-in screen which owns GPS / selfie / fence
          // checks. State is derived from today's punch trail so the
          // strip stays in sync however the user punched.
          _AttendanceStrip(
            state: today.state,
            checkInAt: today.checkIn,
            checkOutAt: today.checkOut,
            elapsed: today.checkIn == null ? null : _elapsed(today.checkIn!, DateTime.now()),
            onCheckIn: _openCheckIn,
            onCheckOut: _openCheckIn,
            hhmm: _hhmm,
          ),
          const SizedBox(height: 12),
          _QuickActionsGrid(
            items: [
              _QA(Icons.fingerprint_outlined, 'Check in', const Color(0xFF0EA5E9),
                  () => context.push('/hr/check-in')),
              _QA(Icons.event_available_outlined, 'Apply Leave', const Color(0xFF06B6D4),
                  () => context.push('/hr/pay?tab=leave')),
              _QA(Icons.description_outlined, 'My Payslip', const Color(0xFF7C3AED),
                  () => context.push('/hr/pay')),
              _QA(Icons.receipt_outlined, 'Expenses', const Color(0xFFD97706),
                  () => context.push('/hr/pay?tab=expenses')),
              _QA(Icons.account_balance_wallet_outlined, 'Leave Balance', const Color(0xFF16A34A),
                  () => context.push('/hr/pay?tab=leave')),
              _QA(Icons.help_outline, 'Helpdesk', const Color(0xFFEC4899),
                  () => context.push('/hr/helpdesk')),
            ],
          ),
          balances.when(
            data: (rows) {
              if (rows.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 32),
                  _SectionHeader(
                    title: 'Leave balance',
                    onTapAll: () => context.push('/hr/pay?tab=leave'),
                  ),
                  const SizedBox(height: 8),
                  // Take 5 not 4: the 4-cap was silently hiding EL (the
                  // accruing pill) on Ramesh's row of 5 types. Layout
                  // shrinks each pill via Expanded so 5 fits comfortably.
                  _LeaveBalancesRow(balances: rows.take(5).toList()),
                ],
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          holidays.when(
            data: (rows) {
              final upcoming = rows
                  .where((h) => h.date.isAfter(DateTime.now().subtract(const Duration(days: 1))))
                  .take(5)
                  .toList();
              if (upcoming.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 32),
                  _SectionHeader(
                    title: 'Upcoming holidays',
                    onTapAll: () => context.push('/hr/holidays'),
                  ),
                  const SizedBox(height: 8),
                  for (var i = 0; i < upcoming.length; i++) ...[
                    _HolidayRow(holiday: upcoming[i]),
                    if (i < upcoming.length - 1) const SizedBox(height: 6),
                  ],
                ],
              );
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
    // Two-up rows via Column + Row instead of GridView.count. GridView
    // was reserving ~150px of cacheExtent below the visible rows even
    // with shrinkWrap+NeverScrollableScrollPhysics, which showed up as
    // a huge gap between the grid and the Leave balance section.
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final left = items[i];
      final right = i + 1 < items.length ? items[i + 1] : null;
      rows.add(Row(
        children: [
          Expanded(child: _QuickActionCard(qa: left)),
          const SizedBox(width: 10),
          Expanded(child: right == null ? const SizedBox() : _QuickActionCard(qa: right)),
        ],
      ));
      if (i + 2 < items.length) rows.add(const SizedBox(height: 10));
    }
    return Column(children: rows);
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

// Section header with optional "View all →" trailing link. Used for the
// Leave balance and Upcoming holidays sections on Home so each section
// reads as a discrete unit instead of bare cards floating in the column.
class _SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onTapAll;
  const _SectionHeader({required this.title, this.onTapAll});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Row(
        children: [
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
          const Spacer(),
          if (onTapAll != null)
            GestureDetector(
              onTap: onTapAll,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Row(
                  children: [
                    Text('View all',
                        style: RunqText.caption.copyWith(
                            color: HrColors.brand(context),
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(width: 2),
                    Icon(Icons.chevron_right_rounded, size: 16, color: HrColors.brand(context)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// Compact holiday row — date pill on the left, name + day, days-left
// chip on the right. Stacks naturally in lists of 5; the old hero
// gradient card lived for "next single holiday" UX which got crowded
// once we wanted a multi-row list.
class _HolidayRow extends StatelessWidget {
  final HrHoliday holiday;
  const _HolidayRow({required this.holiday});

  static const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  static const _weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final today = DateTime.now();
    final midnightToday = DateTime(today.year, today.month, today.day);
    final daysLeft = holiday.date.difference(midnightToday).inDays;
    final chip = daysLeft == 0
        ? 'Today'
        : daysLeft == 1
            ? 'Tomorrow'
            : daysLeft < 7
                ? 'in $daysLeft days'
                : daysLeft < 30
                    ? 'in ${(daysLeft / 7).round()}w'
                    : 'in ${(daysLeft / 30).round()}mo';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: HrColors.teal.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('${holiday.date.day}',
                    style: TextStyle(
                        color: HrColors.brand(context),
                        fontSize: 16, fontWeight: FontWeight.w800, height: 1.0)),
                Text(_months[holiday.date.month - 1].toUpperCase(),
                    style: TextStyle(
                        color: HrColors.brand(context),
                        fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
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
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(_weekdays[holiday.date.weekday - 1],
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: t.hairlineSoft,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(chip,
                style: RunqText.caption.copyWith(
                    color: t.muted, fontSize: 11, fontWeight: FontWeight.w600)),
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
    final pendingExpenseCount = ref.watch(hrPendingExpenseClaimsProvider)
        .asData?.value.length ?? 0;
    final role = ref.watch(appRoleProvider);

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
          // Unified "needs your attention" banner — folds in pending
          // leaves and submitted expense claims so the manager doesn't
          // miss either bucket. Hidden when both are zero.
          if (pendingCount > 0 || pendingExpenseCount > 0) ...[
            _PendingBanner(
              leaveCount: pendingCount,
              expenseCount: pendingExpenseCount,
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
          // "Needs attention" — payroll status, salary-structures-missing,
          // attendance-not-marked, confirmations-due. Every card here is an
          // HR / admin function (run payroll, assign salary structures,
          // mark attendance org-wide, manage probation). A line manager
          // who only has reports doesn't run any of these flows, so the
          // whole section hides for them — the Quick actions strip +
          // "Needs your attention" banner already cover their loop.
          if (role == AppRole.admin || role == AppRole.hr) ...[
            const SizedBox(height: 28),
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
          ],
          const SizedBox(height: 32),
          // People-context sections — the parts a daily HR manager looks
          // for first (who's out, whose birthday is it, recent moments,
          // attendance pulse, expiring docs). Each renders an empty-state
          // card on quiet days so the surfaces stay discoverable.
          const HrAnnouncementsSection(),
          const HrWhoIsOutSection(),
          const HrCelebrationsSection(),
          // People moments (joiners/exits), document expiries and the
          // statutory calendar are HR / admin loops. A line manager
          // doesn't onboard, off-board, chase expiring KYC docs or
          // track TDS/24Q/PT deadlines — surfacing these to them just
          // adds noise. Hidden behind the same admin-or-HR gate as
          // "Needs attention" above.
          if (role == AppRole.admin || role == AppRole.hr) ...[
            const HrPeopleMomentsSection(),
          ],
          const HrAttendanceTrendSection(),
          if (role == AppRole.admin || role == AppRole.hr) ...[
            const HrExpiringDocsSection(),
          ],
          const HrRecentActivitySection(),
          // Statutory calendar — upcoming compliance deadlines (TDS /
          // 24Q / PT). HR/admin only; hidden when the list is empty
          // so a quiet month doesn't surface an empty section.
          if (role == AppRole.admin || role == AppRole.hr)
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
                    // Mirror the My View pattern — "View all" pushes
                    // the dedicated holidays screen (yearly calendar)
                    // instead of opening a one-off bottom sheet, so
                    // both personas share one surface.
                    _SectionHeader(
                      title: 'Upcoming holidays',
                      onTapAll: canSeeAll ? () => context.push('/hr/holidays') : null,
                    ),
                    const SizedBox(height: 8),
                    // Each _HolidayRow ships its own surface + border,
                    // so the outer card container was doubling the
                    // chrome. Stack them with a small gap instead.
                    for (var i = 0; i < top.length; i++) ...[
                      _HolidayRow(holiday: top[i]),
                      if (i < top.length - 1) const SizedBox(height: 8),
                    ],
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

/// Unified "needs your attention" banner — collapses multiple pending
/// buckets (leaves, expenses, future: attendance corrections, payroll
/// approvals) into a single CTA on Manager Home. Each row is tappable
/// so the manager can jump directly to the matching review queue.
class _PendingBanner extends StatelessWidget {
  final int leaveCount;
  final int expenseCount;
  const _PendingBanner({required this.leaveCount, required this.expenseCount});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const accent = Color(0xFFD97706);
    final rows = <Widget>[];
    if (leaveCount > 0) {
      rows.add(_PendingRow(
        icon: Icons.event_available_outlined,
        label: '$leaveCount leave request${leaveCount == 1 ? '' : 's'}',
        accent: accent,
        ink: t.ink,
        muted: t.muted,
        onTap: () => GoRouter.of(context).push('/hr/pay?tab=approvals'),
      ));
    }
    if (expenseCount > 0) {
      rows.add(_PendingRow(
        icon: Icons.receipt_long_outlined,
        label: '$expenseCount expense claim${expenseCount == 1 ? '' : 's'}',
        accent: accent,
        ink: t.ink,
        muted: t.muted,
        onTap: () => GoRouter.of(context).push('/hr/pay?tab=expenses'),
      ));
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withValues(alpha: 0.32), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
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
              Text('Needs your attention',
                  style: TextStyle(color: t.ink, fontSize: 13.5, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 6),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              Divider(
                height: 1, thickness: 0.5,
                color: accent.withValues(alpha: 0.18),
                indent: 42,
              ),
            rows[i],
          ],
        ],
      ),
    );
  }
}

class _PendingRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color accent, ink, muted;
  final VoidCallback onTap;
  const _PendingRow({
    required this.icon,
    required this.label,
    required this.accent,
    required this.ink,
    required this.muted,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            const SizedBox(width: 42),
            Icon(icon, size: 16, color: accent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  style: TextStyle(color: ink, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
            Icon(Icons.chevron_right_rounded, size: 16, color: muted),
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
    // Tailor the strip to the user's actual role rather than ship one
    // admin-flavoured set for everyone. A line manager (Ramesh: has
    // reports, not owner/HR) doesn't "Add employee" or "Run payroll" —
    // those routes 403 server-side anyway. Their loop is approve →
    // check muster → drill into the team → file the occasional claim.
    final role = ref.watch(appRoleProvider);
    final isAdminOrHr = role == AppRole.admin || role == AppRole.hr;
    final pendingCount = ref.watch(hrPendingLeaveRequestsProvider)
        .asData?.value.length ?? 0;

    final chips = isAdminOrHr
        ? <Widget>[
            _QaChip(
              icon: Icons.person_add_alt_1_outlined, label: 'Add\nemployee',
              onTap: () => context.push('/hr/employees/new'),
            ),
            _QaChip(
              icon: Icons.access_time_rounded, label: 'Mark\nattendance',
              onTap: () => context.push('/hr/time'),
            ),
            _QaChip(
              icon: Icons.event_available_outlined, label: 'Leaves',
              badgeCount: pendingCount,
              onTap: () => context.push('/hr/leaves'),
            ),
            _QaChip(
              icon: Icons.calculate_outlined, label: 'Payroll',
              onTap: () => context.push('/hr/payroll-runs'),
            ),
          ]
        : <Widget>[
            _QaChip(
              icon: Icons.event_available_outlined, label: 'Leaves',
              badgeCount: pendingCount,
              onTap: () => context.push('/hr/leaves'),
            ),
            _QaChip(
              icon: Icons.groups_outlined, label: 'My team',
              onTap: () => context.push('/hr/people'),
            ),
            _QaChip(
              icon: Icons.access_time_rounded, label: 'Team\nattendance',
              onTap: () => context.push('/hr/time'),
            ),
            _QaChip(
              icon: Icons.receipt_long_outlined, label: 'Expenses',
              // Pending count = team's submitted claims awaiting the
              // manager's decision (own excluded). Mirrors the badge
              // pattern on the Leaves chip.
              badgeCount: ref.watch(hrPendingExpenseClaimsProvider)
                  .asData?.value.length ?? 0,
              onTap: () => context.push('/hr/team-expenses'),
            ),
          ];

    // IntrinsicHeight stretches each chip to the tallest sibling so the
    // two-line labels and one-line ones share identical rectangles.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < chips.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: chips[i]),
          ],
        ],
      ),
    );
  }
}

class _QaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  /// Optional pending-count badge over the icon (top-right). Hidden when
  /// zero. Used by Approvals so the manager scans queue depth at a
  /// glance without opening the tab.
  final int badgeCount;
  const _QaChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badgeCount = 0,
  });

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
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(icon, color: HrColors.brand(context), size: 20),
                if (badgeCount > 0)
                  Positioned(
                    right: -8, top: -6,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: t.surface, width: 1),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        badgeCount > 9 ? '9+' : '$badgeCount',
                        style: const TextStyle(
                          color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w800, height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
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

// ─── Compact attendance strip ─────────────────────────────────────────────
// Replaces the big biometric check-in card. ~72px tall, single row:
//   [ icon ] Status line                [ Action button ]
//            Subline (time / duration)
// States are mutually exclusive and mapped to _AttState; the strip never
// disappears so the action is always one tap away.

class _AttendanceStrip extends StatefulWidget {
  final _AttState state;
  final DateTime? checkInAt, checkOutAt;
  /// Pre-formatted "Xh YYm" string. Computed by the parent so the strip
  /// re-renders only when state changes.
  final String? elapsed;
  final VoidCallback onCheckIn, onCheckOut;
  final String Function(DateTime) hhmm;
  const _AttendanceStrip({
    required this.state,
    required this.checkInAt,
    required this.checkOutAt,
    required this.elapsed,
    required this.onCheckIn,
    required this.onCheckOut,
    required this.hhmm,
  });

  @override
  State<_AttendanceStrip> createState() => _AttendanceStripState();
}

class _AttendanceStripState extends State<_AttendanceStrip> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this, duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final t = RT(context);
    final cfg = _config(t);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        // Tapping the whole row triggers the primary action — convenient
        // for thumb reach on small screens. The explicit button on the
        // right still works for keyboard/screen-reader users.
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        onTap: cfg.onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: cfg.iconBg, shape: BoxShape.circle),
                child: Icon(cfg.icon, size: 18, color: cfg.iconInk),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(cfg.title,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(cfg.subtitle,
                        style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (cfg.actionIcon != null) _ActionThumb(
                icon: cfg.actionIcon!,
                tint: cfg.actionBg,
                busy: state == _AttState.busy,
                pulse: _pulse,
                onTap: cfg.onTap,
              ),
            ],
          ),
        ),
      ),
    );
  }

  _StripConfig _config(RunqTokens t) {
    final state = widget.state;
    switch (state) {
      case _AttState.out:
        return _StripConfig(
          icon: Icons.login_rounded,
          iconBg: HrColors.teal.withValues(alpha: 0.14),
          iconInk: HrColors.teal,
          title: 'Not checked in',
          subtitle: 'Tap fingerprint to check in',
          actionIcon: Icons.fingerprint_rounded,
          actionBg: HrColors.teal,
          onTap: widget.onCheckIn,
        );
      case _AttState.busy:
        return _StripConfig(
          icon: Icons.fingerprint_rounded,
          iconBg: HrColors.teal.withValues(alpha: 0.14),
          iconInk: HrColors.teal,
          title: 'Scanning…',
          subtitle: 'Stamping attendance',
          actionIcon: Icons.fingerprint_rounded,
          actionBg: HrColors.teal,
          onTap: null,
        );
      case _AttState.inProgress:
        return _StripConfig(
          icon: Icons.check_rounded,
          iconBg: const Color(0xFF16A34A).withValues(alpha: 0.16),
          iconInk: const Color(0xFF16A34A),
          title: 'Checked in at ${widget.hhmm(widget.checkInAt!)}',
          subtitle: widget.elapsed == null ? 'In progress' : '${widget.elapsed} so far',
          actionIcon: Icons.logout_rounded,
          actionBg: const Color(0xFFEF4444),
          onTap: widget.onCheckOut,
        );
      case _AttState.done:
        return _StripConfig(
          icon: Icons.task_alt_rounded,
          iconBg: t.hairlineSoft,
          iconInk: t.muted,
          title: 'Day complete',
          subtitle: widget.checkInAt == null || widget.checkOutAt == null
              ? 'Logged off'
              : '${widget.hhmm(widget.checkInAt!)} – ${widget.hhmm(widget.checkOutAt!)} · ${widget.elapsed ?? ''}',
          actionIcon: null,
          actionBg: t.surface,
          onTap: null,
        );
    }
  }
}

class _StripConfig {
  final IconData icon;
  final Color iconBg, iconInk;
  final String title, subtitle;
  /// When null the row renders without a trailing action (e.g. day done).
  final IconData? actionIcon;
  final Color actionBg;
  final VoidCallback? onTap;
  _StripConfig({
    required this.icon,
    required this.iconBg,
    required this.iconInk,
    required this.title,
    required this.subtitle,
    required this.actionIcon,
    required this.actionBg,
    required this.onTap,
  });
}

// Round 56px action button. Pulses ring while busy so the user gets
// instant feedback before the API round-trip lands.
class _ActionThumb extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final bool busy;
  final Animation<double> pulse;
  final VoidCallback? onTap;
  const _ActionThumb({
    required this.icon,
    required this.tint,
    required this.busy,
    required this.pulse,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 56, height: 56,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (busy)
            AnimatedBuilder(
              animation: pulse,
              builder: (_, __) {
                final v = pulse.value;
                return Container(
                  width: 48 + 14 * v,
                  height: 48 + 14 * v,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: tint.withValues(alpha: 0.18 * (1 - v)),
                  ),
                );
              },
            ),
          Material(
            color: tint,
            shape: const CircleBorder(),
            elevation: busy ? 0 : 2,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: busy ? null : onTap,
              child: SizedBox(
                width: 52, height: 52,
                child: Icon(icon, color: Colors.white, size: 26),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
