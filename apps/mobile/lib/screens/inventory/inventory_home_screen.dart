// Inventory Home — godown-floor dashboard. Matches the Finance / HR home
// chrome: light scaffold, module switcher pinned top-left, a bell on the
// right, then a hero card holding the Out / Low alert pair and the warehouse
// pill — stock value and days of cover were dropped as figures no owner acted
// on. Body then runs Needs attention, the two stock strips, and Recent
// activity; today's flow figures live on the Movements screen instead.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/notifications_repo.dart';
import '../../providers/auth_provider.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/module_switcher.dart';
import '../../widgets/profile_avatar_button.dart';
import 'widgets/inv_attention.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_recent_activity_card.dart';
import 'widgets/inv_stock_highlights.dart';

class InventoryHomeScreen extends ConsumerWidget {
  const InventoryHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kpisAsync = ref.watch(invKpisProvider);
    final t = RT(context);

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: InvColors.brand(context),
          onRefresh: () async {
            // The strips render from a keyed family, so they're invalidated
            // rather than awaited — their own widgets re-fetch.
            ref.invalidate(invStockHighlightsProvider);
            // Await the real fetches. A fixed 200ms delay used to end the
            // spinner before any data arrived, so a refresh that worked was
            // indistinguishable from one that did nothing.
            // Failures surface through the providers' own error state
            // (_HomeError) — this only needs the indicator to stop.
            await Future.wait<Object?>([
              ref.refresh(invKpisProvider.future),
              ref.refresh(invRecentActivityProvider.future),
            ]).catchError((Object _) => const <Object?>[]);
          },
          child: kpisAsync.when(
            loading: () => const _HomeSkeleton(),
            error: (e, _) => _HomeError(error: '$e'),
            data: (k) => _HomeBody(k: k),
          ),
        ),
      ),
    );
  }
}

class _HomeBody extends StatelessWidget {
  const _HomeBody({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      // Without this, a quiet day — no alerts, empty warehouses, nothing in
      // stock — leaves the content shorter than the viewport, and a list that
      // can't scroll never reports the overscroll RefreshIndicator waits for.
      // Pull-to-refresh then does nothing precisely when there's least on
      // screen to tell you so.
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        const SliverToBoxAdapter(child: _TopBar()),
        const SliverToBoxAdapter(child: _Greeting()),
        SliverToBoxAdapter(child: _HeroCard(k: k)),
        // The dispatch queue and every open exception, as one tile grid.
        SliverToBoxAdapter(child: InvNeedsAttention(k: k)),
        // What's actually on the floor right now — goods that just came off
        // production, then the inputs left to run the next batch.
        const SliverToBoxAdapter(
          child: InvStockHighlightsCard(
            title: 'Finished Goods',
            group: 'finished',
            // Reached only when the item master itself is empty: the strip
            // lists the catalogue now, so a zero balance still shows a row.
            emptyText: 'No finished goods set up yet — add an item to see it '
                'here.',
          ),
        ),
        const SliverToBoxAdapter(
          child: InvStockHighlightsCard(
            title: 'Raw Materials',
            group: 'inputs',
            emptyText: 'No raw materials set up yet — add an item to start '
                'tracking input balances.',
            showValue: false,
          ),
        ),
        const SliverToBoxAdapter(child: InvRecentActivityCard()),
        // Trailing space so the bot-nav pill doesn't crop the last row.
        const SliverToBoxAdapter(child: SizedBox(height: 120)),
      ],
    );
  }
}

// ── Top bar (switcher + bell) ─────────────────────────────────────────────

/// Light-surface top bar — module switcher on the left, notification bell
/// on the right. Mirrors the HR home chrome so the three modules share one
/// visual rhythm.
class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(scopedUnreadCountProvider(const ['inv_', 'inventory_']));
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
      child: Row(
        children: [
          const ModuleSwitcher(),
          const Spacer(),
          _BellButton(
            unread: unread,
            onTap: () => context.push('/notifications?scope=inventory'),
          ),
          const SizedBox(width: 4),
          ProfileAvatarButton(onTap: () => context.push('/inventory/more')),
        ],
      ),
    );
  }
}

// ── Greeting (date + "Good morning, <name> 👋") ──────────────────────────
//
// Mirrors HR home so all three modules share one greeting rhythm. Pulls
// the display name from authProvider; falls back to 'there' before the
// session restore finishes.
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
          width: 40,
          height: 40,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Icon(Icons.notifications_outlined, color: t.ink, size: 24),
              if (unread > 0)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: unread > 9 ? 4 : 0, vertical: 0,
                    ),
                    constraints:
                        const BoxConstraints(minWidth: 16, minHeight: 16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade600,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: t.bgWarm, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      style: RunqText.micro.copyWith(
                        color: Colors.white, height: 1,
                      ),
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

/// Entry point to the analytics screen, sitting in the hero footer beside
/// the warehouse pill. Styled to match it — same translucent-on-gradient
/// treatment — so the two read as one row of controls rather than a
/// decoration and a button.
class _AnalyticsPill extends StatelessWidget {
  const _AnalyticsPill();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.18),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        // push, not go: analytics is not a bottom-nav tab, so it needs a
        // back affordance. Matches the Low Stock tile in the same card.
        onTap: () => context.push('/inventory/analytics'),
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 5, 10, 5),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.trending_up_rounded, size: 13, color: Colors.white),
              const SizedBox(width: 6),
              Text(
                'Analytics',
                style: RunqText.caption.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Hero card (Out / Low alerts + warehouse pill) ────────────────────────

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          gradient: InvColors.heroGradient,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: InvColors.amberDeep.withValues(alpha: 0.25),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Three tiles: what is on the floor, then the two ways it is
            // wrong. Today In / Today Out are flow, not level, and live on
            // the Movements screen instead.
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _HeroMiniKpi(
                      // The baseline the other two are exceptions against:
                      // 6 out of 240 items short reads very differently
                      // from 6 out of 9.
                      label: 'In Stock',
                      value: k.activeItems.toString(),
                      sub: k.activeItems == 1 ? 'item' : 'items',
                      onTap: () => context.push('/inventory/on-hand'),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: _HeroMiniKpi(
                      // Out of stock before low: it is already costing sales,
                      // where "low" is still only a warning.
                      label: 'Out of Stock',
                      value: k.outOfStockCount.toString(),
                      sub: k.outOfStockCount == 1 ? 'item' : 'items',
                      alert: k.outOfStockCount > 0,
                      // Land on the bucket the tile counts, not on "All" —
                      // the tap already said which one.
                      onTap: () => context.push('/inventory/alerts?status=out'),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Low Stock',
                      value: k.lowStockCount.toString(),
                      sub: k.lowStockCount == 1 ? 'item' : 'items',
                      alert: k.lowStockCount > 0,
                      onTap: () => context.push('/inventory/alerts?status=low'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _WarehousePill()),
                // The date used to sit here, but the greeting directly above
                // already carries it. Analytics earns the slot instead —
                // otherwise it is buried three taps deep under More.
                const _AnalyticsPill(),
              ],
            ),
          ],
        ),
      ),
    );
  }
}


/// Scope line for the hero figures, and the way into the per-warehouse split.
///
/// This used to print the *default* warehouse's name beside numbers that were
/// tenant-wide, so an owner with three godowns read "₹42L · Main Godown" and
/// believed it. It also carried a dropdown chevron and no tap handler at all.
/// The label now states the real scope, and the tap goes to the breakdown that
/// actually answers "what is sitting in Godown B" — the numbers above it are
/// still tenant-wide, by design, so nothing here is half-scoped.
class _WarehousePill extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final whAsync = ref.watch(invWarehousesProvider);
    final label = whAsync.maybeWhen(
      // One warehouse means tenant-wide and site-wide are the same number, so
      // naming it is accurate rather than misleading.
      data: (rows) => switch (rows.length) {
        0 || 1 => rows.isEmpty ? 'All warehouses' : rows.first.name,
        final n => 'All warehouses · $n',
      },
      orElse: () => 'All warehouses',
    );
    return Align(
      alignment: Alignment.centerLeft,
      child: Material(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: () => context.push('/inventory/warehouses'),
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 5, 8, 5),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.warehouse_outlined, size: 13, color: Colors.white),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: RunqText.caption.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 4),
                // Forward chevron, not a dropdown caret: this navigates, it
                // does not filter the screen you are on.
                Icon(
                  Icons.chevron_right_rounded,
                  size: 16,
                  color: Colors.white.withValues(alpha: 0.7),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// Compact tinted KPI used inside the hero card. Translucent white fill so it
// reads as part of the gradient; the alert variant goes solid red instead of
// a red wash — a tint over amber just muddies into orange and disappears.
// Padding stays tight because three of these sit across the hero on a 360px
// phone, where "Out of Stock" has about 74px of label to live in.
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
    const alertRed = Color(0xFFDC2626);
    final bg = alert ? alertRed : Colors.white.withValues(alpha: 0.14);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: Colors.white.withValues(alpha: alert ? 0.45 : 0.16),
            ),
            boxShadow: alert
                ? [
                    BoxShadow(
                      color: alertRed.withValues(alpha: 0.45),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : null,
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
                  color: Colors.white.withValues(alpha: alert ? 0.92 : 0.78),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
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
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                sub,
                style: TextStyle(
                  fontSize: 10.5,
                  color: Colors.white.withValues(alpha: alert ? 0.82 : 0.65),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Loading + error states ───────────────────────────────────────────────

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget block(double h) => Container(
          height: h,
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: BorderRadius.circular(14),
          ),
        );
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(top: 64),
      children: [
        block(56),
        block(140),
        block(80),
        block(56),
        block(180),
      ],
    );
  }
}

class _HomeError extends StatelessWidget {
  const _HomeError({required this.error});
  final String error;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Scrollable, not a bare Center: a failed load is exactly when you reach
    // for pull-to-refresh, and RefreshIndicator can't fire over a widget that
    // doesn't scroll. The ConstrainedBox keeps the message centred anyway.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Failed to load inventory: $error\n\nPull down to retry.',
                style: RunqText.caption.copyWith(color: t.muted),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
