import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/notifications_repo.dart';
import '../../providers/auth_provider.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../api/manufacturing_models.dart' show WorkOrderListRow;
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_expiry.dart';
import '../../utils/format_qty.dart';
import '../../widgets/module_switcher.dart';
import '../../widgets/profile_avatar_button.dart';
import 'mfg_material_sheet.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_doc_list.dart';
import 'widgets/mfg_primitives.dart';

part '_mfg_home_hero.dart';
part '_mfg_home_materials.dart';

/// Manufacturing home screen.
///
/// Visual rhythm matches `purchase_home_screen.dart` (per /module-ui skill
/// §Step 3 "Home" archetype): top bar with switcher + bell, greeting with
/// date + first name, gradient hero KPI strip, then the two things the floor
/// came for — record production, and what there is to make it out of —
/// followed by the runs logged today.

/// The home card is a glance, not a list — anything past this many rows is
/// reached through "See all" rather than scrolled past on the way to the rest
/// of the page.
const int _recentWoLimit = 10;

class ManufacturingHomeScreen extends ConsumerWidget {
  const ManufacturingHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Phase 3: single dashboard call replaces the 4 list queries.
    final dashAsync = ref.watch(mfgDashboardProvider);
    // Today's runs — what the floor is actually working on. Keyed on activity,
    // not the schedule: a run planned yesterday and closed this morning still
    // belongs to today, and filtering on scheduled_for alone hid exactly that.
    final todayIso = DateTime.now().toIso8601String().substring(0, 10);
    final todayAsync = ref.watch(workOrderListProvider(
      WoListParams(activeOn: todayIso),
    ));
    // Early in a shift "today" is legitimately empty, and an empty card is a
    // dead home screen. Fall back to the latest runs — relabelled, never
    // dressed up as today's — so there is always something to act on.
    final todayIsEmpty = todayAsync.asData?.value.data.isEmpty ?? false;
    final fallbackAsync = todayIsEmpty
        ? ref.watch(workOrderListProvider(const WoListParams()))
        : null;
    final showingFallback = fallbackAsync != null;
    final woAsync = fallbackAsync ?? todayAsync;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: MfgColors.brand(context),
          onRefresh: () async {
            // Await the real refetches. The old version invalidated and then
            // slept 200ms, so the spinner retracted long before any response
            // landed — the data did reload, just after the gesture had visibly
            // "finished", which reads as a refresh that did nothing.
            await Future.wait([
              ref.refresh(mfgDashboardProvider.future),
              ref.refresh(
                  workOrderListProvider(WoListParams(activeOn: todayIso)).future),
              ref.refresh(workOrderListProvider(const WoListParams()).future),
              ref.refresh(
                  workOrderListProvider(const WoListParams(status: 'draft')).future),
              ref.refresh(invOnHandProvider((
                warehouseId: null,
                lowOnly: false,
                itemClassGroup: 'inputs',
              )).future),
              // The bell reads scopedUnreadCountProvider, which derives from
              // this — it was never refreshed before, so the count went stale.
              ref.refresh(notificationsProvider.future),
            ].map(_settled));
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.only(bottom: 120),
            children: [
              const _TopBar(),
              const _Greeting(),
              _HeroCard(dashboard: dashAsync),
              const SizedBox(height: 16),
              const _RecordProductionButton(),
              // What a run can actually consume. Expiry urgency rides these
              // rows rather than sitting in a second card above them: milk is
              // a perishable raw material, and stating it twice in two shapes
              // made one screen answer the same question two ways.
              const _RawMaterialsSection(),
              // "See all" lives on the header, matching Raw materials above.
              // The card used to carry it as a footer, which put the escape
              // hatch ten rows down the page.
              MfgSectionHeader(
                label: showingFallback ? 'Recently made' : 'Made today',
                trailing: (woAsync.valueOrNull?.data.isNotEmpty ?? false)
                    ? TextButton(
                        onPressed: () => context.push('/manufacturing/wos'),
                        child: Text(
                          woAsync.valueOrNull!.total > _recentWoLimit
                              ? 'See all (${woAsync.valueOrNull!.total}) →'
                              : 'See all →',
                          style: RunqText.caption.copyWith(color: MfgColors.brand(context)),
                        ),
                      )
                    : null,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: woAsync.when(
                  loading: () => const _RecentSkeleton(),
                  error: (e, _) => Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Failed to load: $e',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                  data: (res) {
                    if (res.data.isEmpty) {
                      return MfgEmptyState(
                        icon: Icons.event_available_outlined,
                        title: 'Nothing logged yet',
                        description: 'Record what the plant made and it shows up here.',
                        action: MfgPrimaryButton(
                          label: 'Record production',
                          icon: Icons.bolt_rounded,
                          onPressed: () => context.push('/manufacturing/production/new'),
                        ),
                      );
                    }
                    final top = res.data.take(_recentWoLimit).toList();
                    return MfgDividedCard(
                      children: [
                        for (final wo in top)
                          MfgDocListTile(
                            flat: true,
                            icon: Icons.precision_manufacturing_outlined,
                            // The day the run was worked, not the day it was
                            // planned — see _activeDate. Shift is what
                            // separates one run from the next; the date falls
                            // back in only when a run carries no shift.
                            leadingDate: _activeDate(wo),
                            leadingShift: showingFallback ? null : wo.shift,
                            title: wo.outputItemName,
                            subtitle: wo.bomName,
                            status: wo.status,
                            // What came out, once anything has. A run that is
                            // still open has no output yet, so the plan stands
                            // in — but on a closed run the planned figure is
                            // the estimate, not the answer.
                            rightValue: formatItemQty(
                                wo.outputQty > 0 ? wo.outputQty : wo.plannedQty,
                                null,
                                unit: wo.outputUom),
                            rightUnit: wo.outputUom,
                            reference: wo.woNumber,
                            onTap: () => context.push('/manufacturing/wos/${wo.id}'),
                          ),
                      ],
                    );
                  },
                ),
              ),
              // "This week" is a look-back, not something to act on — it sits
              // after the operational sections (what's on hand, what was made
              // today) rather than above them.
              const SizedBox(height: 16),
              dashAsync.whenOrNull(
                    data: (d) => _ThisWeekCard(dashboard: d),
                  ) ??
                  const SizedBox.shrink(),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Top bar ───────────────────────────────────────────────────────────────

class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(
      scopedUnreadCountProvider(const ['wo_', 'manufacturing_']),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
      child: Row(
        children: [
          const ModuleSwitcher(),
          const Spacer(),
          _BellButton(
            unread: unread,
            onTap: () => context.push('/notifications?scope=manufacturing'),
          ),
          const SizedBox(width: 4),
          ProfileAvatarButton(onTap: () => context.push('/manufacturing/more')),
        ],
      ),
    );
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
        child: SizedBox(
          width: 40, height: 40,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Icon(Icons.notifications_outlined, color: t.ink, size: 24),
              if (unread > 0)
                Positioned(
                  right: 4, top: 4,
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: unread > 9 ? 4 : 0),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade600,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: t.bgWarm, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      style: RunqText.micro.copyWith(color: Colors.white, height: 1),
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

// ── Greeting ──────────────────────────────────────────────────────────────

class _Greeting extends ConsumerWidget {
  const _Greeting();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final user = ref.watch(authProvider).user;
    final firstName = _firstName(user?.name) ?? 'there';
    final today = DateTime.now();
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    final dateLabel =
        '${weekdays[today.weekday - 1]}, ${today.day} ${months[today.month - 1]}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(dateLabel, style: RunqText.body.copyWith(color: t.muted)),
          const SizedBox(height: 2),
          Text(
            '${_greeting(today)}, $firstName 👋',
            style: RunqText.h2.copyWith(
              color: t.ink,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }

  static String? _firstName(String? name) {
    if (name == null) return null;
    final trimmed = name.trim();
    if (trimmed.isEmpty) return null;
    return trimmed.split(RegExp(r'\s+')).first;
  }

  static String _greeting(DateTime now) {
    final h = now.hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

/// Completes when [f] does, whether it succeeded or failed.
///
/// Pull-to-refresh awaits every card's fetch at once. A card that fails already
/// renders its own error state from its `AsyncValue`, so the failure must not
/// propagate out of `Future.wait` and leave the gesture hanging on an
/// unhandled error — the await here is only about spinner timing.
Future<void> _settled(Future<Object?> f) => f.then((_) {}, onError: (Object _) {});

class _RecentSkeleton extends StatelessWidget {
  const _RecentSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      children: List.generate(3, (_) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
        ),
      )),
    );
  }
}

/// The day a run was actually worked, falling back to the day it was planned.
///
/// "Today's work orders" filters on `activeOn`, which deliberately matches a
/// run scheduled earlier that was started, finished or closed today — a run
/// planned on the 24th and made this morning belongs to today. Showing
/// `scheduledFor` for those put a days-old date under a "Today's" heading.
///
/// Converted to local time first: the timestamps arrive in UTC and the server
/// buckets them by IST, so a late-evening run would otherwise read as
/// yesterday. A run that has not started yet has no activity date and keeps
/// its schedule.
String _activeDate(WorkOrderListRow wo) {
  final iso = wo.closedAt ?? wo.completedAt ?? wo.startedAt;
  final at = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (at == null) return wo.scheduledFor;
  final mm = at.month.toString().padLeft(2, '0');
  final dd = at.day.toString().padLeft(2, '0');
  return '${at.year}-$mm-$dd';
}
