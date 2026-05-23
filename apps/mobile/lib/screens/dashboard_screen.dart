import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/app_role_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/gradient_avatar.dart';
import '../widgets/module_switcher.dart';
import '../widgets/section_head.dart';
import 'dashboard/cash_hero_card.dart';
import 'dashboard/quick_actions_row.dart';
import 'dashboard/spotlight_cards.dart';
import 'dashboard/gst_section.dart';
import 'dashboard/activity_list.dart';
import 'dashboard/recent_lists.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(dashboardSummaryProvider);
    ref.invalidate(cashTrendProvider);
    ref.invalidate(bankAccountsProvider);
    ref.invalidate(pendingApprovalsProvider);
    ref.invalidate(inboxCountProvider);
    ref.invalidate(activityProvider);
    ref.invalidate(invoicesProvider);
    await ref.read(dashboardSummaryProvider.future).catchError((_) => throw 0);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: RT(context).brand,
        onRefresh: () => _refresh(ref),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            const SliverToBoxAdapter(child: _Header()),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverToBoxAdapter(child: CashHeroCard()),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 24),
              sliver: SliverToBoxAdapter(child: QuickActionsRow()),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                child: SectionHead(
                  title: 'Needs your attention',
                  action: 'Ask agent →',
                  onAction: () => context.push('/agent'),
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SpotlightCards()),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 24, 16, 0),
              sliver: SliverToBoxAdapter(child: GstSection()),
            ),
            const SliverToBoxAdapter(child: RecentInvoicesSection()),
            const SliverToBoxAdapter(child: RecentBillsSection()),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
                child: SectionHead(
                  title: 'Activity',
                  action: 'See all',
                  onAction: () => context.push('/activity'),
                ),
              ),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 120),
              sliver: SliverToBoxAdapter(child: ActivityList(maxItems: 5)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header();

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  String _firstName(String? name, String? email) {
    final n = (name ?? '').trim();
    if (n.isNotEmpty) return n.split(' ').first;
    final e = (email ?? '').trim();
    if (e.isEmpty) return 'there';
    final local = e.split('@').first;
    return local.isEmpty ? 'there' : '${local[0].toUpperCase()}${local.substring(1)}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final user = ref.watch(authProvider).user;
    final approvals = ref.watch(pendingApprovalsProvider);
    final hasNotifications = approvals.maybeWhen(data: (l) => l.isNotEmpty, orElse: () => false);
    final role = ref.watch(appRoleProvider);

    const months = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December',
    ];
    final today = DateTime.now();
    final dateLabel = '${_weekday(today.weekday)}, ${today.day} ${months[today.month - 1]}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (role.canSwitchModule) const ModuleSwitcher(),
              const Spacer(),
              _IconButton(
                icon: Icons.search_rounded,
                onTap: () => context.push('/search'),
              ),
              const SizedBox(width: 8),
              _IconButton(
                icon: Icons.notifications_none_rounded,
                badge: hasNotifications,
                onTap: () => context.push('/approvals'),
              ),
              const SizedBox(width: 8),
              _AvatarButton(name: user?.name ?? user?.email ?? '?'),
            ],
          ),
          const SizedBox(height: 12),
          Text(dateLabel,
              style: RunqText.bodyStrong.copyWith(color: t.muted)),
          const SizedBox(height: 2),
          Text(
            '${_greeting()}, ${_firstName(user?.name, user?.email)} 👋',
            style: RunqText.h2.copyWith(color: t.ink, letterSpacing: -0.5),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
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

class _AvatarButton extends StatelessWidget {
  final String name;
  const _AvatarButton({required this.name});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/profile'),
      borderRadius: BorderRadius.circular(12),
      child: GradientAvatar(name: name, size: 40),
    );
  }
}

class _IconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool badge;
  const _IconButton({required this.icon, required this.onTap, this.badge = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 18, color: t.ink),
          ),
          if (badge)
            Positioned(
              right: 8, top: 8,
              child: Container(
                width: 8, height: 8,
                decoration: BoxDecoration(
                  color: RunqColors.redInk,
                  shape: BoxShape.circle,
                  border: Border.all(color: t.surface, width: 1.5),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

