// Inventory Home — godown-floor dashboard. Matches the Finance / HR home
// chrome: light scaffold, module switcher pinned top-left, a bell on the
// right, then a hero card holding stock-value KPIs, the Low / In / Out
// strip, and the warehouse pill. Body keeps the 2-col mini-stat row, 2x4
// quick actions grid, and a 5-row Recent activity card with a "See all"
// deep-link.

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
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
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
              ref.refresh(invWarehouseValuesProvider.future),
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
        // Today's throughput — the two numbers that change hourly.
        SliverToBoxAdapter(child: _TodayStrip(k: k)),
        // Only the exceptions that actually exist, so an empty list means
        // "nothing needs you" rather than five zeroes to read past.
        SliverToBoxAdapter(child: _NeedsAttention(k: k)),
        const SliverToBoxAdapter(child: _WarehouseValues()),
        const SliverToBoxAdapter(child: InvSectionHeader(title: 'Quick Actions')),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _QuickActions(k: k),
          ),
        ),
        // What's actually on the floor right now — goods that just came off
        // production, then the inputs left to run the next batch.
        const SliverToBoxAdapter(
          child: InvStockHighlightsCard(
            title: 'Finished Goods',
            group: 'finished',
            emptyText: 'No finished goods in stock yet — record production to '
                'see them here.',
          ),
        ),
        const SliverToBoxAdapter(
          child: InvStockHighlightsCard(
            title: 'Raw Materials Available',
            group: 'inputs',
            emptyText: 'No raw material in stock — receive a GRN to start '
                'tracking input balances.',
            showValue: false,
          ),
        ),
        const SliverToBoxAdapter(child: _RecentActivityCard()),
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

// ── Hero card (Stock value + Active SKUs + warehouse pill) ───────────────

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
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: InvHeroKpi(
                      label: 'Stock Value',
                      value: compactINR(k.totalValue),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InvHeroKpi(
                      label: 'Active SKUs',
                      value: _commaInt(k.activeRows),
                    ),
                  ),
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
                      // Out of stock leads: it is already costing sales,
                      // where "low" is still only a warning. Labelled
                      // "Stockouts" because "Out of Stock" ellipsises at
                      // four tiles across on a small phone.
                      label: 'Stockouts',
                      value: k.outOfStockCount.toString(),
                      sub: 'items',
                      alert: k.outOfStockCount > 0,
                      onTap: () => context.push('/inventory/alerts'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Low Stock',
                      value: k.lowStockCount.toString(),
                      sub: 'items',
                      alert: k.lowStockCount > 0,
                      onTap: () => context.push('/inventory/alerts'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Today In',
                      value: k.todayGrns.toString(),
                      sub: compactINR(k.todayGrnsValue),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Today Out',
                      value: k.todayDeliveries.toString(),
                      sub: compactINR(k.todayDnsValue),
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

  static String _commaInt(int n) => n.toString().replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (m) => '${m[1]},',
      );
}

class _WarehousePill extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final whAsync = ref.watch(invWarehousesProvider);
    final label = whAsync.maybeWhen(
      data: (rows) {
        if (rows.isEmpty) return 'All warehouses';
        final def = rows.firstWhere(
          (w) => w.isDefault,
          orElse: () => rows.first,
        );
        return def.name;
      },
      orElse: () => 'All warehouses',
    );
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 5, 8, 5),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
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
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 14,
              color: Colors.white.withValues(alpha: 0.7),
            ),
          ],
        ),
      ),
    );
  }
}

// Compact tinted KPI used inside the hero card. Translucent fill so it
// reads as part of the gradient; alert variant tints red for low-stock.
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
                  color: Colors.white.withValues(alpha: 0.65),
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

// ── Quick actions grid (2x4) ──────────────────────────────────────────────

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.k});
  final InvKpis k;
  @override
  Widget build(BuildContext context) {
    // Read-only views only — creating things happens on the FAB. Each tile
    // carries its live count so the grid states facts instead of listing menus.
    final tiles = <Widget>[
      InvActionTile(
        icon: Icons.visibility_outlined,
        title: 'On Hand',
        subtitle: '${k.activeRows} batches',
        onTap: () => context.push('/inventory/on-hand'),
      ),
      InvActionTile(
        icon: Icons.category_outlined,
        title: 'Items',
        subtitle: '${k.activeItems} in stock',
        onTap: () => context.push('/inventory/items'),
      ),
      InvActionTile(
        icon: Icons.swap_vert_rounded,
        title: 'Movements',
        subtitle: 'In ${_money(k.monthInValue)} · Out ${_money(k.monthOutValue)}',
        onTap: () => context.push('/inventory/moves'),
      ),
      // Replaced the Warehouses tile, which only re-opened On Hand — the same
      // screen the first tile already goes to. Adjustments are also on the FAB
      // sheet and the Moves tab; surfacing them on Home too because damage and
      // free-issue write-offs are daily floor work, not a create-time action.
      InvActionTile(
        icon: Icons.tune_rounded,
        title: 'Adjustments',
        subtitle: k.pendingAdjustments > 0
            ? '${k.pendingAdjustments} awaiting approval'
            : 'Damage, free issue, found',
        onTap: () => context.push('/inventory/adjustments'),
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
              Expanded(child: tiles[i + 1]),
            ],
          ),
        ),
      );
    }
    return Column(children: rows);
  }
}

// ── Recent activity (5 rows + See all) ────────────────────────────────────

class _RecentActivityCard extends ConsumerWidget {
  const _RecentActivityCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invRecentActivityProvider);
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InvSectionHeader(
          title: 'Recent Activity',
          action: 'See all →',
          onAction: () => context.push('/inventory/activity'),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: async.when(
            loading: () => Container(
              height: 96,
              decoration: BoxDecoration(
                color: t.surface,
                border: Border.all(color: t.hairline),
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            error: (_, __) => InvCard(
              child: Text('Could not load activity',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
            data: (rows) {
              if (rows.isEmpty) {
                return InvCard(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No movements yet — receive or dispatch stock to see entries here.',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ),
                );
              }
              final top = rows.take(5).toList();
              return InvCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                child: Column(
                  children: [
                    for (var i = 0; i < top.length; i++) ...[
                      _activityRow(context, top[i]),
                      if (i < top.length - 1)
                        Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Shared mapper from `InvActivity` → `InvActivityRow` so both Home and the
/// full-feed screen render identical chrome.
Widget _activityRow(BuildContext context, InvActivity a) {
  return InvActivityRow(
    type: a.iconKey,
    refLabel: a.itemName,
    description: _activityDescription(a),
    amount: _signedQty(a),
    time: _relativeTime(a.movedAt),
  );
}

String _activityDescription(InvActivity a) {
  final src = _sourceLabel(a.movementType);
  return '$src · ${a.warehouseName}';
}

String _sourceLabel(String movementType) {
  switch (movementType) {
    case 'grn':           return 'GRN';
    case 'dn':            return 'Delivery';
    case 'transfer_in':   return 'Transfer in';
    case 'transfer_out':  return 'Transfer out';
    case 'adjustment':    return 'Adjustment';
    case 'stock_take':    return 'Stock take';
    default:              return movementType;
  }
}

String _signedQty(InvActivity a) {
  final q = a.signedQty;
  final unit = a.itemUnit == null || a.itemUnit!.isEmpty ? '' : ' ${a.itemUnit}';
  final mag = q.abs();
  final str = mag == mag.roundToDouble() ? mag.toStringAsFixed(0)
                                         : mag.toStringAsFixed(2);
  if (q > 0) return '+$str$unit';
  if (q < 0) return '-$str$unit';
  return str + unit;
}

String _relativeTime(DateTime when) {
  final diff = DateTime.now().difference(when);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24)   return '${diff.inHours}h';
  if (diff.inDays < 7)     return '${diff.inDays}d';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return '${when.day} ${months[when.month - 1]}';
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


// ── Today's throughput ────────────────────────────────────────────────────

/// The one outstanding-work number on this screen: invoices whose goods
/// haven't shipped.
///
/// This slot used to hold a Received-today / Dispatched-today pair, but the
/// hero card above already carries both as "Today In" / "Today Out" — the
/// tiles restated them, and neither is actionable anyway. A full-width card
/// also sidesteps the ragged heights two tiles get when one label wraps.
class _TodayStrip extends ConsumerWidget {
  const _TodayStrip({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // `total`, not `rows.length` — the queue request is capped at 100 rows.
    final pending = ref.watch(invPendingDispatchProvider).valueOrNull?.total;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: InvMiniStat(
        icon: Icons.pending_actions_outlined,
        // Amber while work is outstanding, green once the queue is clear —
        // the tile should read as "nothing to do", not as a bare zero.
        iconColor: (pending ?? 0) > 0 ? InvColors.brand(context) : InvColors.success,
        value: pending == null ? '—' : '$pending',
        label: switch (pending) {
          null => 'Pending dispatch',
          0 => 'All dispatched · nothing waiting',
          1 => 'Invoice pending dispatch',
          _ => 'Invoices pending dispatch',
        },
        onTap: () => context.push('/inventory/pending-dispatch'),
      ),
    );
  }
}

// ── Needs attention ───────────────────────────────────────────────────────

/// Exceptions worth acting on, and only the ones that exist. A list of zeroes
/// trains the eye to skip the section, so an all-clear collapses to one line.
class _NeedsAttention extends StatelessWidget {
  const _NeedsAttention({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = <Widget>[
      if (k.outOfStockCount > 0)
        _AttentionRow(
          icon: Icons.remove_shopping_cart_outlined,
          color: InvColors.error,
          label: 'Out of stock',
          count: k.outOfStockCount,
          route: '/inventory/alerts',
        ),
      if (k.lowStockCount > 0)
        _AttentionRow(
          icon: Icons.warning_amber_rounded,
          color: InvColors.amberDeep,
          label: 'Below reorder level',
          count: k.lowStockCount,
          route: '/inventory/alerts',
        ),
      if (k.expiringSoon > 0)
        _AttentionRow(
          icon: Icons.schedule_rounded,
          color: InvColors.error,
          label: 'Expiring within 30 days',
          count: k.expiringSoon,
          route: '/inventory/reports/expiry',
        ),
      if (k.inTransitTransfers > 0)
        _AttentionRow(
          icon: Icons.alt_route_outlined,
          color: InvColors.info,
          label: 'Transfers in transit',
          count: k.inTransitTransfers,
          route: '/inventory/transfers',
        ),
      if (k.pendingAdjustments > 0)
        _AttentionRow(
          icon: Icons.tune_rounded,
          color: InvColors.amberDeep,
          label: 'Adjustments awaiting approval',
          count: k.pendingAdjustments,
          route: '/inventory/adjustments',
        ),
      if (k.deadStock > 0)
        _AttentionRow(
          icon: Icons.hourglass_bottom_rounded,
          color: t.muted,
          label: 'Unmoved for 90+ days',
          count: k.deadStock,
          route: '/inventory/on-hand',
        ),
    ];
    return Column(children: [
      const InvSectionHeader(title: 'Needs attention'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: InvCard(
          child: rows.isEmpty
              ? Row(children: [
                  Icon(Icons.check_circle_outline, size: 18, color: InvColors.success),
                  const SizedBox(width: 10),
                  Text('Nothing needs attention',
                      style: RunqText.body.copyWith(color: t.muted)),
                ])
              : Column(children: rows),
        ),
      ),
    ]);
  }
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.count,
    required this.route,
  });
  final IconData icon;
  final Color color;
  final String label;
  final int count;
  final String route;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: () => context.push(route),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: RunqText.body.copyWith(color: t.ink))),
          Text('$count', style: RunqText.body.copyWith(color: color, fontWeight: FontWeight.w700)),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
        ]),
      ),
    );
  }
}

// ── Stock value by warehouse ──────────────────────────────────────────────

/// Splits the hero's single stock-value figure across sites, with a share bar
/// so the dominant warehouse is obvious at a glance.
class _WarehouseValues extends ConsumerWidget {
  const _WarehouseValues();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invWarehouseValuesProvider).asData?.value ?? const [];
    final withStock = rows.where((r) => r.totalValue > 0).toList();
    if (withStock.isEmpty) return const SizedBox.shrink();
    final top = withStock.first.totalValue;
    return Column(children: [
      const InvSectionHeader(title: 'Stock by warehouse'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: InvCard(
          child: Column(children: [
            for (final w in withStock.take(5))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(
                      child: Text(w.name,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: RunqText.body.copyWith(color: t.ink)),
                    ),
                    Text('${w.itemCount} items',
                        style: RunqText.micro.copyWith(color: t.muted)),
                    const SizedBox(width: 8),
                    Text(_money(w.totalValue),
                        style: RunqText.body.copyWith(
                            color: t.ink, fontWeight: FontWeight.w700)),
                  ]),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: top > 0 ? (w.totalValue / top).clamp(0.0, 1.0) : 0,
                      minHeight: 4,
                      backgroundColor: t.hairline,
                      valueColor: AlwaysStoppedAnimation(InvColors.brand(context)),
                    ),
                  ),
                ]),
              ),
          ]),
        ),
      ),
    ]);
  }
}

/// Compact money for dashboard chrome — full precision belongs on the reports.
String _money(double v) {
  if (v >= 10000000) return '₹${(v / 10000000).toStringAsFixed(2)}Cr';
  if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(2)}L';
  if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}
