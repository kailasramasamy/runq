// Inventory Home — godown-floor dashboard. Matches the Finance / HR home
// chrome: light scaffold, module switcher pinned top-left, a bell on the
// right, then a hero card holding the two level KPIs (stock value with its
// month delta, days of cover), the Out / Low alert pair, and the warehouse
// pill. Body then runs Movement (today's flow, inbound, shrinkage), Needs
// attention, the two stock strips, and Recent activity.

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
        // Flow, not level: what came in, what went out and against what
        // baseline, what is still on its way, and what was lost outright.
        SliverToBoxAdapter(child: _Movement(k: k)),
        // The dispatch queue and every open exception, as one tile grid.
        SliverToBoxAdapter(child: _NeedsAttention(k: k)),
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

// ── Hero card (Stock value + Days of cover + alerts + warehouse pill) ────

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
                      // A bare total cannot answer the owner's actual
                      // question — is working capital piling up in the
                      // godown? The month's net movement can.
                      footnote: _monthDelta(k),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    // Replaced 'Active SKUs', which no owner ever acted on.
                    // Days of cover is the one inventory figure that drives a
                    // decision: buy sooner, or stop buying.
                    child: InvHeroKpi(
                      label: 'Days of Cover',
                      value: _coverValue(k),
                      footnote: k.daysOfCover == null
                          ? 'nothing issued in 30d'
                          : 'at 30-day burn rate',
                      // Deliberately never red. "Low cover" has no
                      // cross-industry threshold: this dairy runs at 3 days
                      // because milk turns daily, while a hardware counter at
                      // 3 days is an emergency. Without a per-tenant target
                      // any colour we pick is a false alarm for someone.
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            // Two tiles, not four. Today In / Today Out moved down to the
            // Movement section: they are flow, the hero is level, and at four
            // across nothing fit — "Out of Stock" had to be abbreviated to
            // "Stockouts" purely to survive the width.
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _HeroMiniKpi(
                      // Out of stock leads: it is already costing sales,
                      // where "low" is still only a warning.
                      label: 'Out of Stock',
                      value: k.outOfStockCount.toString(),
                      sub: k.outOfStockCount == 1 ? 'item' : 'items',
                      alert: k.outOfStockCount > 0,
                      onTap: () => context.push('/inventory/alerts'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Low Stock',
                      value: k.lowStockCount.toString(),
                      sub: k.lowStockCount == 1 ? 'item' : 'items',
                      alert: k.lowStockCount > 0,
                      onTap: () => context.push('/inventory/alerts'),
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

  /// Net stock-value movement so far this month, as a hero footnote. Left
  /// tone-neutral on purpose: stock building up is a strong order book or
  /// dead capital, and the dashboard cannot tell which.
  static String _monthDelta(InvKpis k) {
    final net = k.monthNetValue;
    // Sub-₹1000 swings are rounding, not a trend worth an arrow.
    if (net.abs() < 1000) return 'flat this month';
    final arrow = net > 0 ? '↑' : '↓';
    return '$arrow ${compactINR(net.abs())} this month';
  }

  static String _coverValue(InvKpis k) {
    final d = k.daysOfCover;
    if (d == null) return '—';
    // Past a quarter the exact figure is noise; the message is "too much".
    if (d > 99) return '99+';
    return d.round().toString();
  }
}

String _batches(int n) => n == 1 ? '1 batch' : '$n batches';

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
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
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
          onAction: () => context.push('/inventory/activity?period=7d'),
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


// ── Movement ─────────────────────────────────────────────────────────────

/// Today's throughput, what is inbound, and what was lost — the four flow
/// figures, in a 2x2 grid.
///
/// The hero above answers "what do I hold". None of that tells an owner
/// whether today is a normal day, whether more stock is on its way, or how
/// much simply went missing. Shrinkage in particular lived only in a report
/// three taps deep, which is the same as not existing.
class _Movement extends ConsumerWidget {
  const _Movement({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Tapping through to POs would bounce a user without the purchase grant
    // off the module gate in router.dart, so the tile is inert for them
    // rather than being a trapdoor.
    final canSeePurchase = ref.watch(authProvider).modules.contains('purchase');

    final tiles = <Widget>[
      InvMiniStat(
        icon: Icons.south_west_rounded,
        iconColor: InvColors.success,
        value: compactINR(k.todayInValue),
        // Keeps the document count: raw milk posts to stock at zero value
        // (the GL capitalises it at cycle lock, not receipt), so a dairy can
        // legitimately read ₹0 in on a morning that took 12 deliveries. The
        // count is what proves the stock actually moved.
        label: 'Today in · ${_docs(k.todayInCount)}',
        onTap: () => context.push(
          '/inventory/activity?direction=in&period=today',
        ),
      ),
      InvMiniStat(
        icon: Icons.north_east_rounded,
        iconColor: InvColors.amberDeep,
        value: compactINR(k.todayOutValue),
        label: _todayOutLabel(k),
        onTap: () => context.push(
          '/inventory/activity?direction=out&period=today',
        ),
      ),
      InvMiniStat(
        icon: Icons.local_shipping_outlined,
        iconColor: InvColors.info,
        value: compactINR(k.incomingValue),
        label: k.incomingDueSoon > 0
            ? 'Arriving · ${k.incomingDueSoon} due in 7d'
            : 'Arriving · on open POs',
        onTap: canSeePurchase ? () => context.push('/purchase/pos') : null,
      ),
      InvMiniStat(
        icon: Icons.delete_outline,
        // Only red once something has actually been lost — a red ₹0 trains
        // the eye to ignore the tile on the months it matters.
        iconColor:
            k.writeOffMonthValue > 0 ? InvColors.error : t.muted,
        value: compactINR(k.writeOffMonthValue),
        label: _writeOffLabel(k),
        onTap: () => context.push('/inventory/reports/write-offs'),
      ),
    ];

    return Column(children: [
      const InvSectionHeader(title: 'Movement'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(children: [
          for (var i = 0; i < tiles.length; i += 2) ...[
            if (i > 0) const SizedBox(height: 10),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: tiles[i]),
                  const SizedBox(width: 10),
                  Expanded(child: tiles[i + 1]),
                ],
              ),
            ),
          ],
        ]),
      ),
    ]);
  }

  /// Today's outward value against the 30-day daily average.
  ///
  /// Deliberately states the baseline rather than a "23% below average"
  /// verdict: today is a partial day, and at 10am every business on earth is
  /// below its own daily average. The owner knows what time it is; the
  /// dashboard does not get to call that a slump.
  static String _todayOutLabel(InvKpis k) {
    if (k.avgDailyOut <= 0) return 'Today out';
    return 'Today out · avg ${compactINR(k.avgDailyOut)}/day';
  }

  static String _writeOffLabel(InvKpis k) {
    final pct = k.writeOffPctOfOut;
    if (k.writeOffMonthValue <= 0) return 'Written off · none this month';
    // The share matters more than the rupees: ₹44K means nothing alone, but
    // 3.7% against last month's 0.9% is a conversation with the plant.
    if (pct == null) return 'Written off · this month';
    return 'Written off · ${pct.toStringAsFixed(1)}% of issues';
  }

  static String _docs(int n) => n == 1 ? '1 doc' : '$n docs';
}

// ── Needs attention ───────────────────────────────────────────────────────

/// The dispatch queue plus every open exception, in one 2-column grid.
///
/// Pending dispatch used to sit in its own full-width strip above this
/// section, which split one question — "what needs me?" — across two blocks.
/// Exceptions still appear only when they exist: a grid of zeroes trains the
/// eye to skip the section, so an all-clear collapses to a single tile.
class _NeedsAttention extends ConsumerWidget {
  const _NeedsAttention({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // `total`, not `rows.length` — the queue request is capped at 100 rows.
    final pending = ref.watch(invPendingDispatchProvider).valueOrNull?.total;
    final exceptions = <Widget>[
      if (k.outOfStockCount > 0)
        InvMiniStat(
          icon: Icons.remove_shopping_cart_outlined,
          iconColor: InvColors.error,
          label: 'Out of stock',
          value: '${k.outOfStockCount}',
          onTap: () => context.push('/inventory/alerts'),
        ),
      if (k.lowStockCount > 0)
        InvMiniStat(
          icon: Icons.warning_amber_rounded,
          iconColor: InvColors.amberDeep,
          label: 'Below reorder level',
          value: '${k.lowStockCount}',
          onTap: () => context.push('/inventory/alerts'),
        ),
      // Expiry and dead stock lead with the amount, not the batch count: both
      // are money decisions (write-off risk, locked-up cash) and "12 batches"
      // gives an owner nothing to weigh them against. Low / out-of-stock stay
      // as counts — an out-of-stock line is worth ₹0 by definition, and for a
      // low line the on-hand value is not the story either.
      if (k.expiringSoon > 0)
        InvMiniStat(
          icon: Icons.schedule_rounded,
          iconColor: InvColors.error,
          label: 'Expiring in 30d · ${_batches(k.expiringSoon)}',
          value: compactINR(k.expiringSoonValue),
          onTap: () => context.push('/inventory/reports/expiry'),
        ),
      if (k.inTransitTransfers > 0)
        InvMiniStat(
          icon: Icons.alt_route_outlined,
          iconColor: InvColors.info,
          label: 'Transfers in transit',
          value: '${k.inTransitTransfers}',
          onTap: () => context.push('/inventory/transfers'),
        ),
      if (k.pendingAdjustments > 0)
        InvMiniStat(
          icon: Icons.tune_rounded,
          iconColor: InvColors.amberDeep,
          label: 'Adjustments to approve',
          value: '${k.pendingAdjustments}',
          onTap: () => context.push('/inventory/adjustments'),
        ),
      if (k.deadStock > 0)
        InvMiniStat(
          icon: Icons.hourglass_bottom_rounded,
          iconColor: t.muted,
          label: 'Unmoved 90+ days · ${_batches(k.deadStock)}',
          value: compactINR(k.deadStockValue),
          onTap: () => context.push('/inventory/on-hand'),
        ),
    ];
    final tiles = <Widget>[
      InvMiniStat(
        icon: Icons.pending_actions_outlined,
        // Amber while work is outstanding, green once the queue is clear —
        // the tile should read as "nothing to do", not as a bare zero.
        iconColor:
            (pending ?? 0) > 0 ? InvColors.brand(context) : InvColors.success,
        value: pending == null ? '—' : '$pending',
        label: switch (pending) {
          null => 'Pending dispatch',
          0 => 'All dispatched',
          1 => 'Invoice to dispatch',
          _ => 'Invoices to dispatch',
        },
        onTap: () => context.push('/inventory/pending-dispatch'),
      ),
      ...exceptions,
      // Never leave a lone tile beside an empty half — say the all-clear.
      if (exceptions.isEmpty)
        InvMiniStat(
          icon: Icons.check_circle_outline,
          iconColor: InvColors.success,
          value: 'Clear',
          label: 'Nothing else pending',
          onTap: () => context.push('/inventory/alerts'),
        ),
    ];

    final rows = <Widget>[];
    for (var i = 0; i < tiles.length; i += 2) {
      if (i > 0) rows.add(const SizedBox(height: 10));
      rows.add(
        // Stretch both tiles to the taller of the pair, so a label that wraps
        // doesn't leave its neighbour floating in a short box.
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: tiles[i]),
              const SizedBox(width: 10),
              // An odd tile count keeps its half-width column rather than
              // stretching across and breaking the grid rhythm.
              Expanded(
                child: i + 1 < tiles.length
                    ? tiles[i + 1]
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      );
    }
    return Column(children: [
      const InvSectionHeader(title: 'Needs attention'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(children: rows),
      ),
    ]);
  }
}
