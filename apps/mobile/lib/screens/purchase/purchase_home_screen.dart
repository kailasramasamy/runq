import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/notifications_repo.dart';
import '../../api/purchase_repo.dart';
import '../../providers/auth_provider.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/module_switcher.dart';
import '../../widgets/profile_avatar_button.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// Purchase & Procurement home screen.
///
/// Visual rhythm matches `inventory_home_screen.dart` (per /module-ui
/// skill §Step 3 "Home" archetype): top bar with switcher + bell,
/// greeting with date + first name, gradient hero with multi-KPI strip,
/// 2×3 quick-action grid, recent-orders card.
class PurchaseHomeScreen extends ConsumerWidget {
  const PurchaseHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // One list query per status bucket — cheap, returns `.total` we need
    // for the hero KPIs without a dedicated dashboard endpoint.
    final openAsync = ref.watch(
      purchaseOrderListProvider(const POListParams(status: 'sent,partially_received')),
    );
    final sentAsync = ref.watch(
      purchaseOrderListProvider(const POListParams(status: 'sent')),
    );
    final partialAsync = ref.watch(
      purchaseOrderListProvider(const POListParams(status: 'partially_received')),
    );
    final receivedAsync = ref.watch(
      purchaseOrderListProvider(const POListParams(status: 'received')),
    );
    // Recent orders — status-agnostic so drafts / closed / cancelled
    // still show up. Server orders by createdAt desc, so .take(5) is
    // the five most recent.
    final recentAsync = ref.watch(
      purchaseOrderListProvider(const POListParams()),
    );

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: PurColors.brand(context),
          onRefresh: () async {
            ref.invalidate(purchaseOrderListProvider);
            await Future<void>.delayed(const Duration(milliseconds: 200));
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.only(bottom: 120),
            children: [
              const _TopBar(),
              const _Greeting(),
              _HeroCard(
                openCount: openAsync.maybeWhen(data: (r) => r.total, orElse: () => 0),
                sentCount: sentAsync.maybeWhen(data: (r) => r.total, orElse: () => 0),
                partialCount: partialAsync.maybeWhen(data: (r) => r.total, orElse: () => 0),
                receivedCount: receivedAsync.maybeWhen(data: (r) => r.total, orElse: () => 0),
              ),
              const SizedBox(height: 16),
              PurSectionHeader(label: 'Quick actions'),
              const _QuickActionsGrid(),
              const SizedBox(height: 16),
              PurSectionHeader(
                label: 'Recent orders',
                trailing: TextButton(
                  onPressed: () => context.push('/purchase/pos'),
                  child: Text('See all →',
                      style: RunqText.caption.copyWith(color: PurColors.brand(context))),
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
                      return PurEmptyState(
                        icon: Icons.shopping_cart_outlined,
                        title: 'No orders yet',
                        description: 'Create your first PO to get started.',
                        action: PurPrimaryButton(
                          label: 'New PO',
                          icon: Icons.add_rounded,
                          onPressed: () => context.push('/purchase/pos/new'),
                        ),
                      );
                    }
                    final top = res.data.take(5).toList();
                    return Column(
                      children: [
                        for (final po in top)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: PurDocListTile(
                              icon: Icons.shopping_cart_outlined,
                              title: po.poNumber,
                              subtitle: po.vendorName,
                              status: po.status,
                              rightValue: indianINR(po.total),
                              meta: [
                                PurDocMeta(icon: Icons.event_outlined, label: prettyShortDate(po.poDate)),
                                if (po.expectedDate != null)
                                  PurDocMeta(
                                    icon: Icons.local_shipping_outlined,
                                    label: 'Exp',
                                    value: prettyShortDate(po.expectedDate!),
                                  ),
                              ],
                              onTap: () => context.push('/purchase/pos/${po.id}'),
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

// ── Top bar (switcher + bell) ────────────────────────────────────────────

class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Scope the bell to PP-prefixed notifications. Future PP notifiers
    // (PO sent ack, GRN posted, match override pending) should emit
    // ids starting with 'po_' or 'purchase_' to land here.
    final unread = ref.watch(scopedUnreadCountProvider(const ['po_', 'purchase_']));
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
      child: Row(
        children: [
          const ModuleSwitcher(),
          const Spacer(),
          _BellButton(
            unread: unread,
            onTap: () => context.push('/notifications?scope=purchase'),
          ),
          const SizedBox(width: 4),
          ProfileAvatarButton(onTap: () => context.push('/purchase/more')),
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

// ── Greeting (date + "Good morning, <name> 👋") ──────────────────────────

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

// ── Hero card (Open / Awaiting receipt + Partial / Received / Today direct) ──

class _HeroCard extends ConsumerWidget {
  final int openCount;
  final int sentCount;
  final int partialCount;
  final int receivedCount;
  const _HeroCard({
    required this.openCount,
    required this.sentCount,
    required this.partialCount,
    required this.receivedCount,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          gradient: PurColors.heroGradient,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: PurColors.violetDeep.withValues(alpha: 0.30),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: _HeroBigKpi(label: 'Open Orders', value: '$openCount')),
                  const SizedBox(width: 8),
                  Expanded(child: _HeroBigKpi(label: 'Awaiting Receipt', value: '$sentCount')),
                ],
              ),
            ),
            const SizedBox(height: 10),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Partial',
                      value: '$partialCount',
                      sub: 'in progress',
                      alert: partialCount > 0,
                      onTap: () => context.push('/purchase/pos?status=partially_received'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Received',
                      value: '$receivedCount',
                      sub: 'POs',
                      onTap: () => context.push('/purchase/pos?status=received'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: _TodayDirectKpi()),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                const Expanded(child: _TolerancePill()),
                Text(
                  _todayLabel(),
                  style: const TextStyle(fontSize: 11, color: Color(0xCCFFFFFF)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _todayLabel() {
    final d = DateTime.now();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }
}

/// Bottom-left pill on the hero, mirroring inventory's warehouse pill.
/// Shows the active match tolerance — quick orientation for the operator
/// reviewing bills against POs.
class _TolerancePill extends StatelessWidget {
  const _TolerancePill();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 5, 8, 5),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
          borderRadius: BorderRadius.circular(999),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.tune_rounded, size: 13, color: Colors.white),
            SizedBox(width: 6),
            Text(
              'Match ±2%',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Today's direct-receipt count — fetched live since direct receipts are
/// the dominant daily-ops signal for Vrindavan (milk arrivals).
class _TodayDirectKpi extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    return FutureBuilder<int>(
      future: purchaseRepo
          .listDirectReceipts(dateFrom: today, dateTo: today, limit: 100)
          .then((rows) => rows.length),
      builder: (_, snap) {
        final count = snap.data ?? 0;
        return _HeroMiniKpi(
          label: 'Today Direct',
          value: '$count',
          sub: 'receipts',
          onTap: () => context.push('/purchase/direct'),
        );
      },
    );
  }
}

// Large hero KPI matching `InvHeroKpi`'s shape but inlined for PP so it
// doesn't depend on cross-module primitives.
class _HeroBigKpi extends StatelessWidget {
  final String label;
  final String value;
  const _HeroBigKpi({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
              color: Colors.white.withValues(alpha: 0.85),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroMiniKpi extends StatelessWidget {
  const _HeroMiniKpi({
    required this.label,
    required this.value,
    required this.sub,
    this.alert = false,
    this.onTap,
  });
  final String label;
  final String value;
  final String sub;
  final bool alert;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bg = alert
        ? const Color(0xFFEF4444).withValues(alpha: 0.38)
        : Colors.black.withValues(alpha: 0.28);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                  color: Colors.white.withValues(alpha: 0.78),
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  height: 1.1,
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                sub,
                style: TextStyle(
                  fontSize: 10.5,
                  color: Colors.white.withValues(alpha: 0.65),
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Quick actions grid (2×3) ─────────────────────────────────────────────

class _QuickActionsGrid extends ConsumerWidget {
  const _QuickActionsGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Pull open-PO count so the "Receive" tile can carry a badge — same
    // pattern as inventory's "On Hand" tile flagging low-stock count.
    final openAsync = ref.watch(
      purchaseOrderListProvider(const POListParams(status: 'sent,partially_received')),
    );
    final openCount = openAsync.maybeWhen(data: (r) => r.total, orElse: () => 0);

    final tiles = <_ActionTile>[
      _ActionTile(
        icon: Icons.add_shopping_cart_outlined,
        title: 'New PO',
        subtitle: 'Commit to vendor',
        onTap: () => context.push('/purchase/pos/new'),
      ),
      _ActionTile(
        icon: Icons.local_shipping_outlined,
        title: 'Receive',
        subtitle: 'Against open PO',
        badge: openCount > 0 ? '$openCount' : null,
        onTap: () => context.push('/purchase/pos'),
      ),
      _ActionTile(
        icon: Icons.add_box_outlined,
        title: 'Direct receipt',
        subtitle: 'Memo qty entry',
        onTap: () => context.push('/purchase/direct'),
      ),
      _ActionTile(
        icon: Icons.link_rounded,
        title: 'Match bills',
        subtitle: '3-way reconcile',
        onTap: () => context.push('/purchase/match'),
      ),
      _ActionTile(
        icon: Icons.list_alt_rounded,
        title: 'All orders',
        subtitle: 'Browse history',
        onTap: () => context.push('/purchase/pos'),
      ),
      _ActionTile(
        icon: Icons.history_rounded,
        title: 'All receipts',
        subtitle: 'Direct receipts',
        onTap: () => context.push('/purchase/direct'),
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

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? badge;
  final VoidCallback onTap;
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Violet wash deepening toward the bottom-right, blended onto the surface
    // (not overlaid at alpha) so the fill stays opaque and text keeps contrast.
    final washStrength = Theme.of(context).brightness == Brightness.dark ? 0.16 : 0.09;
    final wash = Color.alphaBlend(
      PurColors.violet.withValues(alpha: washStrength),
      t.surface,
    );
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: PurColors.violet.withValues(alpha: 0.14)),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [t.surface, wash],
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          // Rounded clip, not the Stack's rectangular one — otherwise the
          // corner bloom paints over the rounded corner and squares it off.
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              children: [
                // Decorative bloom in the top-right — gives the flat wash a
                // light source without competing with the content.
                Positioned(
                  right: -26,
                  top: -30,
                  child: Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: PurColors.violet.withValues(alpha: 0.07),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            width: 36, height: 36,
                            decoration: BoxDecoration(
                              // Outlined on the surface colour — a solid tint
                              // would muddy against the washed card.
                              color: t.surface,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: PurColors.violet.withValues(alpha: 0.18),
                              ),
                            ),
                            child: Icon(icon, color: PurColors.brand(context), size: 20),
                          ),
                          if (badge != null)
                            Positioned(
                              right: -4, top: -4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                decoration: BoxDecoration(
                                  color: PurColors.brand(context),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: t.surface, width: 1.5),
                                ),
                                constraints: const BoxConstraints(minWidth: 18),
                                child: Text(
                                  badge!,
                                  textAlign: TextAlign.center,
                                  style: RunqText.micro.copyWith(
                                    color: Colors.white, fontWeight: FontWeight.w700, height: 1,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              title,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              subtitle,
                              style: RunqText.caption.copyWith(color: t.muted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
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
