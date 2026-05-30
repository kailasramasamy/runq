import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/notifications_repo.dart';
import '../../providers/auth_provider.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/module_switcher.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

part '_mfg_home_hero.dart';

/// Manufacturing home screen.
///
/// Visual rhythm matches `purchase_home_screen.dart` (per /module-ui skill
/// §Step 3 "Home" archetype): top bar with switcher + bell, greeting with
/// date + first name, gradient hero KPI strip, 2×3 quick-action grid,
/// recent work orders card.
class ManufacturingHomeScreen extends ConsumerWidget {
  const ManufacturingHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Phase 3: single dashboard call replaces the 4 list queries.
    final dashAsync = ref.watch(mfgDashboardProvider);
    // Recent WOs — all statuses, server-ordered by createdAt desc.
    final recentAsync = ref.watch(
      workOrderListProvider(const WoListParams()),
    );

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: MfgColors.brand(context),
          onRefresh: () async {
            ref.invalidate(mfgDashboardProvider);
            ref.invalidate(workOrderListProvider);
            await Future<void>.delayed(const Duration(milliseconds: 200));
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
              // "This week" analytics card — shown below hero when dashboard loads.
              dashAsync.whenOrNull(
                data: (d) => _ThisWeekCard(dashboard: d),
              ) ?? const SizedBox.shrink(),
              const SizedBox(height: 8),
              MfgSectionHeader(label: 'Quick actions'),
              const _QuickActionsGrid(),
              const SizedBox(height: 16),
              MfgSectionHeader(
                label: 'Recent work orders',
                trailing: TextButton(
                  onPressed: () => context.push('/manufacturing/wos'),
                  child: Text(
                    'See all →',
                    style: RunqText.caption.copyWith(color: MfgColors.brand(context)),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: recentAsync.when(
                  loading: () => const _RecentSkeleton(),
                  error: (e, _) => Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Failed to load: $e',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                  data: (res) {
                    if (res.data.isEmpty) {
                      return MfgEmptyState(
                        icon: Icons.precision_manufacturing_outlined,
                        title: 'No work orders yet',
                        description: 'Create your first WO to schedule a production run.',
                        action: MfgPrimaryButton(
                          label: 'New WO',
                          icon: Icons.add_rounded,
                          onPressed: () => context.push('/manufacturing/wos/new'),
                        ),
                      );
                    }
                    final top = res.data.take(5).toList();
                    return Column(
                      children: [
                        for (final wo in top)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: MfgDocListTile(
                              icon: Icons.precision_manufacturing_outlined,
                              title: wo.woNumber,
                              subtitle: wo.bomName,
                              status: wo.status,
                              meta: [
                                MfgDocMeta(
                                  icon: Icons.event_outlined,
                                  label: mfgPrettyDate(wo.scheduledFor),
                                ),
                                MfgDocMeta(
                                  icon: Icons.factory_outlined,
                                  label: wo.outputItemName,
                                ),
                                if (wo.shift != null && wo.shift!.isNotEmpty)
                                  MfgDocMeta(
                                    icon: Icons.access_time_outlined,
                                    label: wo.shift!,
                                  ),
                              ],
                              onTap: () => context.push('/manufacturing/wos/${wo.id}'),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
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

// ── Quick actions grid (2×3) ──────────────────────────────────────────────

class _QuickActionsGrid extends ConsumerWidget {
  const _QuickActionsGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draftAsync = ref.watch(
      workOrderListProvider(const WoListParams(status: 'draft')),
    );
    final draftCount = draftAsync.maybeWhen(data: (r) => r.total, orElse: () => 0);

    final tiles = <MfgQuickActionTile>[
      MfgQuickActionTile(
        icon: Icons.add_chart_outlined,
        title: 'New BOM',
        subtitle: 'Define a recipe',
        onTap: () => context.push('/manufacturing/boms/new'),
      ),
      MfgQuickActionTile(
        icon: Icons.playlist_add_rounded,
        title: 'New WO',
        subtitle: 'Schedule a run',
        badge: draftCount > 0 ? '$draftCount' : null,
        onTap: () => context.push('/manufacturing/wos/new'),
      ),
      MfgQuickActionTile(
        icon: Icons.view_list_outlined,
        title: 'Browse BOMs',
        subtitle: 'All recipes',
        onTap: () => context.push('/manufacturing/boms'),
      ),
      MfgQuickActionTile(
        icon: Icons.assignment_outlined,
        title: 'All WOs',
        subtitle: 'Browse history',
        onTap: () => context.push('/manufacturing/wos'),
      ),
      MfgQuickActionTile(
        icon: Icons.today_outlined,
        title: "Today's runs",
        subtitle: 'Scheduled today',
        onTap: () {
          final today = DateTime.now().toIso8601String().substring(0, 10);
          context.push('/manufacturing/wos?scheduledFrom=$today&scheduledTo=$today');
        },
      ),
      MfgQuickActionTile(
        icon: Icons.bar_chart_rounded,
        title: 'Reports',
        subtitle: 'WO summary & yield',
        onTap: () => context.push('/manufacturing/reports/wo-summary'),
      ),
    ];

    final rows = <Widget>[];
    for (var i = 0; i < tiles.length; i += 2) {
      if (i > 0) rows.add(const SizedBox(height: 12));
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: tiles[i]),
              const SizedBox(width: 12),
              if (i + 1 < tiles.length)
                Expanded(child: tiles[i + 1])
              else
                const Expanded(child: SizedBox()),
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(children: rows),
    );
  }
}

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
